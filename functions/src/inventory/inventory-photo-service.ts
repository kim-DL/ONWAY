import { createHash } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { z } from "zod";

import { getAdminFirestore, getAdminPhotoBucket } from "../shared/firebase-admin.js";
import { detectPhotoContentType, InvalidPhotoError, processInventoryPhoto } from "../photo/photo-processor.js";
import { verifyInventoryTransactionActor, type InventoryActor } from "./inventory-authorization.js";
import {
  INVENTORY_PHOTO_MAX_BYTES, INVENTORY_PRODUCT_PATH, getInventoryPhotoInputSchema,
  inventoryPhotoDownloadSchema, inventoryPhotoUploadResultSchema, uploadInventoryPhotoInputSchema, inventoryProductSchema,
} from "./inventory-contract.js";
import {
  INVENTORY_PHOTO_PENDING_MS, INVENTORY_PHOTO_RATE_PATH, INVENTORY_PHOTO_UPLOAD_PATH,
  inventoryPhotoPath, inventoryPhotoStageRef, inventoryPhotoStageSchema,
} from "./inventory-photo-store.js";

import { observeRead } from "../shared/read-observation.js";

const photoProductSchema = inventoryProductSchema.pick({ productId: true, name: true, manufacturer: true, specification: true, status: true, photo: true });
const currentPhotoInputSchema = getInventoryPhotoInputSchema.extend({ photoId: getInventoryPhotoInputSchema.shape.photoId.optional() });

type PhotoStage = "image-processing" | "storage-write" | "storage-read";
const dependencyCodes = new Set([3, 4, 5, 7, 8, 9, 10, 13, 14, 16, 400, 401, 403, 404, 409, 412, 413, 429, 500, 502, 503, 504]);

export class InventoryPhotoDependencyError extends Error {
  readonly upstreamCode: number | undefined;
  constructor(readonly stage: PhotoStage, error: unknown) {
    super("Inventory photo dependency failed.");
    this.upstreamCode = error && typeof error === "object" && "code" in error && typeof error.code === "number" && dependencyCodes.has(error.code) ? error.code : undefined;
  }
}

async function photoOperation<T>(stage: PhotoStage, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    if (error instanceof HttpsError || error instanceof InvalidPhotoError) throw error;
    // Do not propagate Storage paths, signed URLs, headers or SDK error details.
    throw new InventoryPhotoDependencyError(stage, error);
  }
}

export function inventoryPhotoErrorDiagnostic(error: unknown) {
  return error instanceof InventoryPhotoDependencyError
    ? { stage: error.stage, ...(error.upstreamCode === undefined ? {} : { upstreamCode: error.upstreamCode }) }
    : { stage: error instanceof InvalidPhotoError ? "image-processing" : "request" };
}

export function decodeInventoryPhoto(input: z.infer<typeof uploadInventoryPhotoInputSchema>) {
  const parsed = uploadInventoryPhotoInputSchema.safeParse(input);
  if (!parsed.success || input.fileBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.fileBase64))
    throw new InvalidPhotoError("사진 데이터 형식을 확인해주세요.");
  const buffer = Buffer.from(input.fileBase64, "base64");
  if (buffer.length === 0 || buffer.length > INVENTORY_PHOTO_MAX_BYTES || buffer.toString("base64") !== input.fileBase64)
    throw new InvalidPhotoError("사진은 10MB 이하의 올바른 파일이어야 합니다.");
  if (detectPhotoContentType(buffer) !== input.contentType) throw new InvalidPhotoError("사진 내용과 파일 형식이 일치하지 않습니다.");
  return buffer;
}

export class InventoryPhotoService {
  constructor(private readonly db: Firestore = getAdminFirestore(), private readonly bucket = getAdminPhotoBucket()) {}

  async upload(input: z.infer<typeof uploadInventoryPhotoInputSchema>, actor: InventoryActor, now = Timestamp.now()) {
    const source = decodeInventoryPhoto(input);
    const inputHash = createHash("sha256").update(source).update(input.contentType).digest("hex");
    const stageRef = inventoryPhotoStageRef(this.db, input.uploadId);
    const rateRef = this.db.doc(`${INVENTORY_PHOTO_RATE_PATH}/${actor.uid}`);
    const replay = await this.db.runTransaction(async (transaction) => {
      await verifyInventoryTransactionActor(this.db, transaction, actor, "write");
      const [snapshot, rateSnapshot] = await transaction.getAll(stageRef, rateRef);
      if (snapshot!.exists) {
        const stage = inventoryPhotoStageSchema.parse(snapshot!.data());
        if (stage.uploadId !== input.uploadId || stage.actorUid !== actor.uid || stage.actorEmployeeId !== actor.employeeId || stage.inputHash !== inputHash)
          throw new HttpsError("already-exists", "다른 사진에 사용된 업로드 요청입니다. 사진을 다시 선택해주세요.");
        if (stage.state === "retired" || stage.state === "deleting" || (stage.expiresAt && stage.expiresAt.toMillis() <= now.toMillis())
          || (stage.state !== "attached" && !stage.expiresAt))
          throw new HttpsError("failed-precondition", "사진 업로드가 만료되었습니다. 사진을 다시 선택해주세요.");
        if (stage.state === "uploaded" || stage.state === "attached")
          return inventoryPhotoUploadResultSchema.parse({ uploadId: stage.uploadId, width: stage.width, height: stage.height });
        // A retry near the expiry boundary receives a fresh processing lease.
        // Cleanup rechecks it transactionally, so it cannot delete in-flight files.
        transaction.update(stageRef, { expiresAt: Timestamp.fromMillis(now.toMillis() + INVENTORY_PHOTO_PENDING_MS) });
        return null;
      }
      const window = Math.floor(now.toMillis() / 3_600_000);
      const rate = rateSnapshot!.data();
      const count = rate?.window === window && Number.isInteger(rate.count) && rate.count >= 0 ? rate.count as number : 0;
      if (count >= 30) throw new HttpsError("resource-exhausted", "사진 업로드가 많습니다. 잠시 후 다시 시도해주세요.");
      transaction.set(rateRef, { window, count: count + 1 });
      transaction.create(stageRef, { uploadId: input.uploadId, actorUid: actor.uid, actorEmployeeId: actor.employeeId,
        inputHash, contentType: input.contentType, state: "prepared", createdAt: now,
        expiresAt: Timestamp.fromMillis(now.toMillis() + INVENTORY_PHOTO_PENDING_MS) });
      return null;
    });
    if (replay) return replay;

    // Reuse the bounded, orientation-aware decoder used by school/customer photos.
    // No source file, EXIF, public download token or original metadata is retained.
    const processed = await photoOperation("image-processing", () => processInventoryPhoto(source));
    await photoOperation("storage-write", () => Promise.all((["thumbnail", "preview"] as const).map((variant) =>
      this.bucket.file(inventoryPhotoPath(input.uploadId, variant)).save(processed[variant].buffer, {
        resumable: false, metadata: { contentType: "image/webp", cacheControl: "private, no-store, max-age=0" },
      }))));
    return this.db.runTransaction(async (transaction) => {
      await verifyInventoryTransactionActor(this.db, transaction, actor, "write");
      const snapshot = await transaction.get(stageRef);
      const parsed = inventoryPhotoStageSchema.safeParse(snapshot.data());
      if (!snapshot.exists || !parsed.success) throw new HttpsError("failed-precondition", "사진 업로드를 다시 확인해주세요.");
      const stage = parsed.data;
      if (stage.uploadId !== input.uploadId || stage.actorUid !== actor.uid || stage.actorEmployeeId !== actor.employeeId || stage.inputHash !== inputHash
        || !["prepared", "uploaded", "attached"].includes(stage.state)
        || (stage.state !== "attached" && (!stage.expiresAt || stage.expiresAt.toMillis() <= now.toMillis())))
        throw new HttpsError("failed-precondition", "사진 업로드가 만료되었거나 변경되었습니다. 다시 선택해주세요.");
      const result = inventoryPhotoUploadResultSchema.parse({ uploadId: input.uploadId, width: processed.preview.width, height: processed.preview.height });
      if (stage.state === "prepared") transaction.update(stageRef, { state: "uploaded", width: result.width, height: result.height });
      return result;
    });
  }

  async get(input: z.infer<typeof getInventoryPhotoInputSchema>, actor: InventoryActor) {
    getInventoryPhotoInputSchema.parse(input);
    const result = await this.getWithMetadata(input, actor);
    if (!result.photo) throw new HttpsError("not-found", "현재 상품 사진을 찾을 수 없습니다.");
    // Preserve the existing strict Callable/PWA download contract.
    return inventoryPhotoDownloadSchema.parse({ contentType: result.photo.contentType,
      byteSize: result.photo.byteSize, fileBase64: result.photo.fileBase64 });
  }

  /** Reads the current attachment without loading lots/history or disclosing Storage URLs. */
  async getWithMetadata(input: z.infer<typeof currentPhotoInputSchema>, actor: InventoryActor) {
    currentPhotoInputSchema.parse(input);
    let photoId = input.photoId;
    const check = async () => this.db.runTransaction(async (transaction) => {
      await verifyInventoryTransactionActor(this.db, transaction, actor, "read");
      const productRef = this.db.doc(`${INVENTORY_PRODUCT_PATH}/${input.productId}`);
      // A known photo ID can fetch product and attachment in one round trip.
      const [product, knownStage] = photoId
        ? await observeRead("firestore", () => transaction.getAll(productRef, inventoryPhotoStageRef(this.db, photoId!)), (value) => value.length)
        : [await observeRead("firestore", () => transaction.get(productRef)), undefined];
      if (!product?.exists || product.get("companyId") !== "onnuri" || product.get("productId") !== input.productId
        || !["active", "inactive"].includes(product.get("status")))
        throw new HttpsError("not-found", "현재 상품을 찾을 수 없습니다.");
      const parsed = photoProductSchema.parse(Object.fromEntries(Object.keys(photoProductSchema.shape)
        .map((field) => [field, product.get(field)])));
      if (!parsed.photo && !photoId) return parsed;
      if (!parsed.photo || photoId && parsed.photo.photoId !== photoId)
        throw new HttpsError("not-found", "현재 상품 사진을 찾을 수 없습니다.");
      const stage = knownStage ?? await observeRead("firestore", () => transaction.get(inventoryPhotoStageRef(this.db, parsed.photo!.photoId)));
      if (!stage.exists || stage.get("uploadId") !== parsed.photo.photoId || stage.get("state") !== "attached"
        || stage.get("productId") !== input.productId)
        throw new HttpsError("not-found", "현재 상품 사진을 찾을 수 없습니다.");
      return parsed;
    });
    const first = await check();
    const { photo: attachment, ...product } = first;
    if (!attachment) return { product, photo: null };
    photoId = attachment.photoId;
    const buffer = await observeRead("storage", async () => {
      const [bytes] = await photoOperation("storage-read", () => this.bucket.file(inventoryPhotoPath(photoId!, input.variant))
        .download({ start: 0, end: INVENTORY_PHOTO_MAX_BYTES }));
      return bytes;
    }, (value) => value.length);
    if (buffer.length === 0 || buffer.length > INVENTORY_PHOTO_MAX_BYTES || detectPhotoContentType(buffer) !== "image/webp")
      throw new HttpsError("failed-precondition", "저장된 상품 사진을 확인할 수 없습니다.");
    const { photo: latestPhoto, ...latestProduct } = await check(); // Fresh membership, product and attachment checks after I/O.
    return { product: latestProduct, photo: { ...latestPhoto!, variant: input.variant,
      ...inventoryPhotoDownloadSchema.parse({ contentType: "image/webp", byteSize: buffer.length, fileBase64: buffer.toString("base64") }) } };
  }

  async expire(now = Timestamp.now()) {
    const candidates = await this.db.collection(INVENTORY_PHOTO_UPLOAD_PATH).where("expiresAt", "<=", now).limit(100).get();
    let removed = 0;
    let failures = 0;
    for (const candidate of candidates.docs) {
      try {
        const claimed = await this.db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(candidate.ref);
          if (!snapshot.exists) return false;
          const stage = inventoryPhotoStageSchema.parse(snapshot.data());
          if (stage.uploadId !== candidate.id || stage.state === "attached" || !stage.expiresAt || stage.expiresAt.toMillis() > now.toMillis()) return false;
          transaction.update(candidate.ref, { state: "deleting" });
          return true;
        });
        if (!claimed) continue;
        await Promise.all((["thumbnail", "preview"] as const).map((variant) =>
          this.bucket.file(inventoryPhotoPath(candidate.id, variant)).delete({ ignoreNotFound: true })));
        await candidate.ref.delete();
        removed += 1;
      } catch { failures += 1; }
    }
    if (failures) throw new Error(`Inventory photo cleanup incomplete (${failures} stages).`);
    return removed;
  }
}
