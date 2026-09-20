import { FieldValue, Timestamp, type DocumentReference, type Firestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";

import type { CustomerActor } from "./customer-authorization.js";
import { customerOverviewPhotoSchema, type Customer, type SaveCustomerInput } from "./customer-contract.js";

export const customerPhotoStageSchema = z.object({
  uploadId: z.uuid(), actorUid: z.string().min(1), actorEmployeeId: z.string().min(1),
  inputHash: z.string().length(64), contentType: z.string(),
  state: z.enum(["prepared", "uploaded", "attached", "retired", "deleting"]),
  createdAt: z.custom<Timestamp>((value) => value instanceof Timestamp),
  expiresAt: z.custom<Timestamp>((value) => value instanceof Timestamp).optional(),
  width: z.number().int().positive().optional(), height: z.number().int().positive().optional(),
  customerId: z.string().optional(), attachedRequestId: z.uuid().optional(),
}).strict();
export function customerPhotoPath(photoId: string, variant: "thumbnail" | "preview") {
  return `companies/onnuri/customerPhotos/${photoId}/${variant}.webp`;
}
export function customerPhotoStageRef(db: Firestore, uploadId: string) {
  return db.doc(`customerPhotoUploads/${uploadId}`);
}

export async function resolveCustomerPhotoChange(db: Firestore, transaction: Transaction, input: SaveCustomerInput, current: Customer | null, actor: CustomerActor, now: Timestamp) {
  let next = current?.overviewPhoto;
  let attached: DocumentReference | undefined;
  let retired: DocumentReference | undefined;
  if (input.photoChange?.action === "replace") {
    const ref = customerPhotoStageRef(db, input.photoChange.uploadId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("failed-precondition", "사진 업로드를 다시 확인해주세요.", { reason: "customer-photo-stage" });
    const stage = customerPhotoStageSchema.parse(snapshot.data());
    if (stage.actorUid !== actor.uid || stage.actorEmployeeId !== actor.employeeId || stage.state !== "uploaded"
      || !stage.expiresAt || stage.expiresAt.toMillis() <= now.toMillis()) {
      throw new HttpsError("failed-precondition", "사진 업로드가 만료되었거나 사용할 수 없습니다.", { reason: "customer-photo-stage" });
    }
    next = customerOverviewPhotoSchema.parse({ photoId: stage.uploadId, width: stage.width, height: stage.height });
    attached = ref;
  } else if (input.photoChange?.action === "remove") next = null;
  if (input.photoChange && current?.overviewPhoto && current.overviewPhoto.photoId !== next?.photoId) {
    const ref = customerPhotoStageRef(db, current.overviewPhoto.photoId);
    const old = await transaction.get(ref);
    // Only retire this customer's own former attachment, never an arbitrary path.
    if (old.exists && old.get("state") === "attached" && old.get("customerId") === current.customerId) retired = ref;
  }
  return {
    overviewPhoto: next,
    commit(customerId: string) {
      if (attached) transaction.update(attached, { state: "attached", customerId, attachedRequestId: input.requestId, expiresAt: FieldValue.delete() });
      // Recovery grace period; old images are immediately unreadable by clients.
      if (retired) transaction.update(retired, { state: "retired", expiresAt: Timestamp.fromMillis(now.toMillis() + 30 * 24 * 60 * 60 * 1000) });
    },
  };
}
