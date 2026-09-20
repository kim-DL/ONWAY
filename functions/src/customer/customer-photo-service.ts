import { createHash } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { z } from "zod";

import { getAdminFirestore, getAdminPhotoBucket } from "../shared/firebase-admin.js";
import { detectPhotoContentType, InvalidPhotoError, processSchoolPhoto } from "../photo/photo-processor.js";
import { verifyCustomerTransactionActor, type CustomerActor } from "./customer-authorization.js";
import { CUSTOMER_COLLECTION_PATH, CUSTOMER_PHOTO_MAX_BYTES, customerPhotoUploadResultSchema, type getCustomerPhotoInputSchema, type uploadCustomerPhotoInputSchema } from "./customer-contract.js";
import { customerPhotoPath, customerPhotoStageRef, customerPhotoStageSchema } from "./customer-photo-store.js";
import { customerPhotoOperation } from "./customer-photo-errors.js";

export function decodeCustomerPhoto(input: z.infer<typeof uploadCustomerPhotoInputSchema>) {
  if (input.fileBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.fileBase64)) throw new InvalidPhotoError("사진 데이터 형식을 확인해주세요.");
  const buffer = Buffer.from(input.fileBase64, "base64");
  if (buffer.length === 0 || buffer.length > CUSTOMER_PHOTO_MAX_BYTES || buffer.toString("base64") !== input.fileBase64) throw new InvalidPhotoError("사진은 10MB 이하의 올바른 파일이어야 합니다.");
  if (detectPhotoContentType(buffer) !== input.contentType) throw new InvalidPhotoError("사진 내용과 파일 형식이 일치하지 않습니다.");
  return buffer;
}

export class CustomerPhotoService {
  constructor(private readonly db: Firestore = getAdminFirestore(), private readonly bucket = getAdminPhotoBucket()) {}

  async upload(input: z.infer<typeof uploadCustomerPhotoInputSchema>, actor: CustomerActor, now = Timestamp.now()) {
    const source = decodeCustomerPhoto(input);
    const inputHash = createHash("sha256").update(source).update(input.contentType).digest("hex");
    const stageRef = customerPhotoStageRef(this.db, input.uploadId);
    const rateRef = this.db.doc(`customerPhotoUploadRates/${actor.uid}`);
    const replay = await this.db.runTransaction(async (transaction) => {
      await verifyCustomerTransactionActor(this.db, transaction, actor);
      const [snapshot, rateSnapshot] = await transaction.getAll(stageRef, rateRef);
      if (snapshot!.exists) {
        const stage = customerPhotoStageSchema.parse(snapshot!.data());
        if (stage.actorUid !== actor.uid || stage.actorEmployeeId !== actor.employeeId || stage.inputHash !== inputHash) throw new HttpsError("already-exists", "사진 요청 식별자가 이미 사용되었습니다.");
        if (stage.state === "retired" || stage.state === "deleting" || (stage.expiresAt && stage.expiresAt.toMillis() <= now.toMillis())) throw new HttpsError("failed-precondition", "사진 업로드가 만료되었습니다. 사진을 다시 선택해주세요.");
        if (stage.state === "uploaded" || stage.state === "attached") return customerPhotoUploadResultSchema.parse({ uploadId: stage.uploadId, width: stage.width, height: stage.height });
        return null;
      }
      const window = Math.floor(now.toMillis() / 3_600_000);
      const rate = rateSnapshot!.data();
      const count = rate?.window === window && typeof rate.count === "number" ? rate.count : 0;
      if (count >= 30) throw new HttpsError("resource-exhausted", "사진 업로드가 많습니다. 잠시 후 다시 시도해주세요.");
      transaction.set(rateRef, { window, count: count + 1 });
      transaction.create(stageRef, { uploadId: input.uploadId, actorUid: actor.uid, actorEmployeeId: actor.employeeId,
        inputHash, contentType: input.contentType, state: "prepared", createdAt: now,
        expiresAt: Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000) });
      return null;
    });
    if (replay) return replay;
    // Reuse the existing bounded Sharp decoder; metadata/EXIF are stripped.
    const processed = await customerPhotoOperation("image-processing", () => processSchoolPhoto(source));
    await customerPhotoOperation("storage-write", () => Promise.all((["thumbnail", "preview"] as const).map((variant) => this.bucket.file(customerPhotoPath(input.uploadId, variant))
      .save(processed[variant].buffer, { resumable: false, metadata: { contentType: "image/webp", cacheControl: "private, no-store, max-age=0" } }))));
    return this.db.runTransaction(async (transaction) => {
      await verifyCustomerTransactionActor(this.db, transaction, actor);
      const snapshot = await transaction.get(stageRef);
      const stage = customerPhotoStageSchema.parse(snapshot.data());
      if (stage.actorUid !== actor.uid || stage.inputHash !== inputHash || !["prepared", "uploaded", "attached"].includes(stage.state)) throw new HttpsError("failed-precondition", "사진 업로드를 다시 확인해주세요.");
      const result = customerPhotoUploadResultSchema.parse({ uploadId: input.uploadId, width: processed.preview.width, height: processed.preview.height });
      if (stage.state === "prepared") transaction.update(stageRef, { state: "uploaded", width: result.width, height: result.height });
      return result;
    });
  }

  async get(input: z.infer<typeof getCustomerPhotoInputSchema>, actor: CustomerActor) {
    const check = async () => this.db.runTransaction(async (transaction) => {
      await verifyCustomerTransactionActor(this.db, transaction, actor);
      const [customer, stage] = await transaction.getAll(this.db.doc(`${CUSTOMER_COLLECTION_PATH}/${input.customerId}`), customerPhotoStageRef(this.db, input.photoId));
      if (!customer!.exists || customer!.get("overviewPhoto.photoId") !== input.photoId
        || !stage!.exists || stage!.get("state") !== "attached" || stage!.get("customerId") !== input.customerId) throw new HttpsError("not-found", "현재 거래처 사진을 찾을 수 없습니다.");
    });
    await check();
    const [buffer] = await customerPhotoOperation("storage-read", () => this.bucket.file(customerPhotoPath(input.photoId, input.variant)).download());
    if (buffer.length === 0 || buffer.length > CUSTOMER_PHOTO_MAX_BYTES || detectPhotoContentType(buffer) !== "image/webp") throw new HttpsError("failed-precondition", "저장된 사진을 확인할 수 없습니다.");
    await check(); // Revoked sessions and concurrently replaced photos cannot leak.
    return { contentType: "image/webp" as const, byteSize: buffer.length, fileBase64: buffer.toString("base64") };
  }

  async expire(now = Timestamp.now()) {
    // A single-field bounded query needs no new composite index. Attached
    // assets have no expiresAt, so cancellation cleanup cannot remove them.
    const candidates = await this.db.collection("customerPhotoUploads").where("expiresAt", "<=", now).limit(100).get();
    let removed = 0;
    let failures = 0;
    for (const candidate of candidates.docs) {
      try {
      const claimed = await this.db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(candidate.ref);
        if (!snapshot.exists) return false;
        const stage = customerPhotoStageSchema.parse(snapshot.data());
        if (stage.state === "attached" || !stage.expiresAt || stage.expiresAt.toMillis() > now.toMillis()) return false;
        transaction.update(candidate.ref, { state: "deleting" });
        return true;
      });
      if (!claimed) continue;
      await Promise.all((["thumbnail", "preview"] as const).map((variant) => this.bucket.file(customerPhotoPath(candidate.id, variant)).delete({ ignoreNotFound: true })));
      await candidate.ref.delete();
      removed += 1;
      } catch { failures += 1; }
    }
    if (failures) throw new Error(`Customer photo cleanup incomplete (${failures} stages).`);
    return removed;
  }
}
