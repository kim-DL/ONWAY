import { FieldValue, Timestamp, type DocumentReference, type Firestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";

import type { InventoryActor } from "./inventory-authorization.js";
import { INVENTORY_PHOTO_CONTENT_TYPES, inventoryIdSchema, inventoryPhotoSchema, type InventoryProduct, type SaveInventoryProductInput } from "./inventory-contract.js";

export const INVENTORY_PHOTO_UPLOAD_PATH = "inventoryPhotoUploads";
export const INVENTORY_PHOTO_RATE_PATH = "inventoryPhotoUploadRates";
export const INVENTORY_PHOTO_PENDING_MS = 24 * 60 * 60 * 1000;
export const INVENTORY_PHOTO_RECOVERY_MS = 30 * 24 * 60 * 60 * 1000;

export const inventoryPhotoStageSchema = z.object({
  uploadId: z.uuid(), actorUid: z.string().min(1).max(128), actorEmployeeId: inventoryIdSchema,
  inputHash: z.string().regex(/^[a-f0-9]{64}$/), contentType: z.enum(INVENTORY_PHOTO_CONTENT_TYPES),
  state: z.enum(["prepared", "uploaded", "attached", "retired", "deleting"]),
  createdAt: z.custom<Timestamp>((value) => value instanceof Timestamp),
  expiresAt: z.custom<Timestamp>((value) => value instanceof Timestamp).optional(),
  width: z.number().int().positive().max(2560).optional(), height: z.number().int().positive().max(2560).optional(),
  productId: inventoryIdSchema.optional(), attachedRequestId: z.uuid().optional(),
}).strict();

export function inventoryPhotoPath(photoId: string, variant: "thumbnail" | "preview") {
  return `companies/onnuri/inventoryPhotos/${z.uuid().parse(photoId)}/${z.enum(["thumbnail", "preview"]).parse(variant)}.webp`;
}

export function inventoryPhotoStageRef(db: Firestore, uploadId: string) {
  return db.doc(`${INVENTORY_PHOTO_UPLOAD_PATH}/${z.uuid().parse(uploadId)}`);
}

function unavailableStage() {
  return new HttpsError("failed-precondition", "상품 사진 업로드가 만료되었거나 사용할 수 없습니다. 다시 선택해주세요.", { reason: "inventory-photo-stage" });
}

// The caller verifies the actor and product revision in this same transaction.
// This helper performs reads only; commit() is called after ALL transaction reads.
export async function resolveInventoryPhotoChange(
  db: Firestore, transaction: Transaction, input: Pick<SaveInventoryProductInput, "requestId" | "photoChange">,
  current: InventoryProduct | null, actor: InventoryActor, now: Timestamp,
) {
  let next = current?.photo ?? null;
  let attached: DocumentReference | undefined;
  let retired: DocumentReference | undefined;
  if (input.photoChange?.action === "replace") {
    const ref = inventoryPhotoStageRef(db, input.photoChange.uploadId);
    const snapshot = await transaction.get(ref);
    const parsed = inventoryPhotoStageSchema.safeParse(snapshot.data());
    if (!snapshot.exists || !parsed.success) throw unavailableStage();
    const stage = parsed.data;
    if (stage.uploadId !== input.photoChange.uploadId || stage.actorUid !== actor.uid || stage.actorEmployeeId !== actor.employeeId
      || stage.state !== "uploaded" || !stage.expiresAt || stage.expiresAt.toMillis() <= now.toMillis()) throw unavailableStage();
    const photo = inventoryPhotoSchema.safeParse({ photoId: stage.uploadId, width: stage.width, height: stage.height });
    if (!photo.success) throw unavailableStage();
    next = photo.data;
    attached = ref;
  } else if (input.photoChange?.action === "remove") next = null;

  if (input.photoChange && current?.photo && current.photo.photoId !== next?.photoId) {
    const ref = inventoryPhotoStageRef(db, current.photo.photoId);
    const old = await transaction.get(ref);
    // A corrupt/stale product reference cannot retire another product's photo.
    if (old.exists && old.get("state") === "attached" && old.get("productId") === current.productId) retired = ref;
  }
  return {
    photo: next,
    commit(productId: string) {
      inventoryIdSchema.parse(productId);
      if (attached) transaction.update(attached, { state: "attached", productId, attachedRequestId: input.requestId, expiresAt: FieldValue.delete() });
      // Old images become unreadable immediately but have a recovery grace period.
      if (retired) transaction.update(retired, { state: "retired", expiresAt: Timestamp.fromMillis(now.toMillis() + INVENTORY_PHOTO_RECOVERY_MS) });
    },
  };
}
