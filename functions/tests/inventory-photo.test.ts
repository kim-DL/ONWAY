import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";

import type { getAdminPhotoBucket } from "../src/shared/firebase-admin.js";
import { verifyInventoryTransactionActor, type InventoryActor } from "../src/inventory/inventory-authorization.js";
import {
  INVENTORY_PHOTO_MAX_BYTES, INVENTORY_PRODUCT_PATH, inventoryProductDraftSchema, inventoryProductSchema,
  inventoryLocationMap, saveInventoryProductInputSchema, type InventoryProduct, type SaveInventoryProductInput,
} from "../src/inventory/inventory-contract.js";
import { InventoryPhotoService, decodeInventoryPhoto, inventoryPhotoErrorDiagnostic } from "../src/inventory/inventory-photo-service.js";
import { InventoryService } from "../src/inventory/inventory-service.js";
import { INVENTORY_PHOTO_PENDING_MS, inventoryPhotoPath, resolveInventoryPhotoChange } from "../src/inventory/inventory-photo-store.js";
import { InvalidPhotoError } from "../src/photo/photo-processor.js";

const actor: InventoryActor = { uid: "uid-inventory-staff", employeeId: "EMP-INVENTORY", roleScopes: ["delivery"], sessionVersion: 1, permissionsVersion: 1, isAdmin: false };
const draft = inventoryProductDraftSchema.parse({ name: "사진 검증 상품", manufacturer: "", specification: "", origin: "", unitLabel: "개", unitsPerBox: 10, defaultLocationId: "freezer1", note: "", urgent: false });
let jpeg: Buffer;
beforeAll(async () => { jpeg = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#729a91" } }).jpeg().toBuffer(); });

function fixture() {
  const data = new Map<string, Record<string, unknown>>([
    [`authz/${actor.uid}`, { employeeId: actor.employeeId, active: true, sessionVersion: 1, permissionsVersion: 1 }],
    [`employees/${actor.employeeId}`, { employeeId: actor.employeeId, firebaseUid: actor.uid, roleScopes: actor.roleScopes, status: "active" }],
  ]);
  const files = new Map<string, Buffer>();
  const metadata = new Map<string, unknown>();
  let saves = 0;
  let beforeSave: ((path: string) => void) | undefined;
  let afterDownload: (() => void) | undefined;
  let beforeDownload: (() => void) | undefined;
  let beforeDelete: ((path: string) => void) | undefined;
  let downloadedOptions: unknown;
  const ref = (path: string) => ({ path, id: path.split("/").at(-1)!, delete: async () => { data.delete(path); } });
  const snapshot = (reference: ReturnType<typeof ref>) => ({ exists: data.has(reference.path), id: reference.id, ref: reference,
    data: () => data.get(reference.path),
    get: (field: string) => field.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, data.get(reference.path)),
  });
  const db = {
    doc: ref,
    collection: (path: string) => ({ where: (field: string, _operator: string, boundary: Timestamp) => ({ limit: (maximum: number) => ({ get: async () => ({ docs: [...data.entries()]
      .filter(([key, value]) => key.startsWith(`${path}/`) && value[field] instanceof Timestamp && (value[field] as Timestamp).toMillis() <= boundary.toMillis())
      .slice(0, maximum).map(([key]) => snapshot(ref(key))) }) }) }) }),
    async runTransaction<T>(action: (tx: unknown) => Promise<T>) {
      const writes: Array<() => void> = [];
      const read = (reference: ReturnType<typeof ref>) => { if (writes.length) throw new Error("Firestore reads must precede writes"); return snapshot(reference); };
      const tx = {
        get: async (reference: ReturnType<typeof ref>) => read(reference),
        getAll: async (...references: Array<ReturnType<typeof ref>>) => references.map(read),
        set: (reference: ReturnType<typeof ref>, value: Record<string, unknown>) => writes.push(() => data.set(reference.path, { ...value })),
        create: (reference: ReturnType<typeof ref>, value: Record<string, unknown>) => writes.push(() => { if (data.has(reference.path)) throw new Error("exists"); data.set(reference.path, { ...value }); }),
        update: (reference: ReturnType<typeof ref>, value: Record<string, unknown>) => writes.push(() => {
          const current = data.get(reference.path)!;
          for (const [key, field] of Object.entries(value)) {
            if (field instanceof FieldValue && field.isEqual(FieldValue.delete())) delete current[key]; else current[key] = field;
          }
        }),
      };
      const result = await action(tx); writes.forEach((write) => write()); return result;
    },
  } as unknown as Firestore;
  const bucket = { file: (path: string) => ({
    save: async (buffer: Buffer, options: unknown) => { beforeSave?.(path); saves++; files.set(path, buffer); metadata.set(path, options); },
    download: async (options: unknown) => { downloadedOptions = options; beforeDownload?.(); const buffer = files.get(path); if (!buffer) throw new Error("missing"); afterDownload?.(); return [buffer]; },
    delete: async () => { beforeDelete?.(path); files.delete(path); },
  }) } as unknown as ReturnType<typeof getAdminPhotoBucket>;
  const photos = new InventoryPhotoService(db, bucket);
  const save = async (input: SaveInventoryProductInput, user = actor, now = Timestamp.now()) => db.runTransaction(async (transaction) => {
    await verifyInventoryTransactionActor(db, transaction, user, "write");
    const productId = input.productId ?? "PRODUCT-PHOTO";
    const productRef = db.doc(`${INVENTORY_PRODUCT_PATH}/${productId}`);
    const snapshot = await transaction.get(productRef);
    const current = snapshot.exists ? inventoryProductSchema.parse(snapshot.data()) : null;
    if ((current?.revision ?? null) !== input.expectedRevision) throw new Error("stale-revision");
    const change = await resolveInventoryPhotoChange(db, transaction, input, current, user, now);
    const product = inventoryProductSchema.parse({ ...(current ?? {
      productId, companyId: "onnuri", status: "active", stockRevision: 0, hasHistory: false,
      quantityByLocation: inventoryLocationMap(0), nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null),
      createdAt: now.toDate().toISOString(), createdBy: user.employeeId,
    }), ...input.draft, photo: change.photo, revision: (current?.revision ?? 0) + 1, updatedAt: now.toDate().toISOString(), updatedBy: user.employeeId });
    transaction.set(productRef, product); change.commit(productId); return product;
  });
  return { data, files, metadata, db, photos, save, saves: () => saves, downloadedOptions: () => downloadedOptions,
    beforeSave: (callback?: (path: string) => void) => { beforeSave = callback; },
    afterDownload: (callback?: () => void) => { afterDownload = callback; },
    beforeDownload: (callback?: () => void) => { beforeDownload = callback; },
    beforeDelete: (callback?: (path: string) => void) => { beforeDelete = callback; },
  };
}

function upload(uploadId = randomUUID()) { return { uploadId, contentType: "image/jpeg" as const, fileBase64: jpeg.toString("base64") }; }
function saveInput(uploadId?: string, product?: InventoryProduct): SaveInventoryProductInput {
  return { requestId: randomUUID(), productId: product?.productId ?? null, expectedRevision: product?.revision ?? null, draft,
    ...(uploadId ? { photoChange: { action: "replace", uploadId } as const } : {}) };
}
function photoInput(product: InventoryProduct) { return { productId: product.productId, photoId: product.photo!.photoId, variant: "preview" as const }; }

describe("private inventory photo lifecycle", () => {
  it("stores only two private, bounded WebP variants and makes exact retries idempotent", async () => {
    const state = fixture(); const input = upload();
    expect(await state.photos.upload(input, actor)).toMatchObject({ uploadId: input.uploadId, width: 80, height: 60 });
    await state.photos.upload(input, actor);
    expect(state.saves()).toBe(2);
    for (const [path, bytes] of state.files) {
      expect(path).toMatch(/^companies\/onnuri\/inventoryPhotos\/[a-f0-9-]+\/(thumbnail|preview)\.webp$/);
      const image = await sharp(bytes).metadata();
      expect(image.format).toBe("webp"); expect(image.exif).toBeUndefined();
      expect(Math.max(image.width!, image.height!)).toBeLessThanOrEqual(2560);
      expect(state.metadata.get(path)).toMatchObject({ metadata: { cacheControl: "private, no-store, max-age=0", contentType: "image/webp" } });
      expect(JSON.stringify(state.metadata.get(path))).not.toMatch(/downloadTokens|storagePath/);
    }
    expect(JSON.stringify(state.data.get(`inventoryPhotoUploads/${input.uploadId}`))).not.toMatch(/fileBase64|storagePath|https:/);
    state.data.get(`inventoryPhotoUploads/${input.uploadId}`)!.inputHash = "0".repeat(64);
    await expect(state.photos.upload(input, actor)).rejects.toMatchObject({ code: "already-exists" });
  });

  it("publishes only through a product transaction and retains the photo on ordinary edits", async () => {
    const state = fixture(); const input = upload(); await state.photos.upload(input, actor);
    await expect(state.photos.get({ productId: "PRODUCT-PHOTO", photoId: input.uploadId, variant: "preview" }, actor)).rejects.toMatchObject({ code: "not-found" });
    const product = await state.save(saveInput(input.uploadId));
    expect(product.photo).toEqual({ photoId: input.uploadId, width: 80, height: 60 });
    expect(state.data.get(`inventoryPhotoUploads/${input.uploadId}`)).not.toHaveProperty("expiresAt");
    const updated = await state.save(saveInput(undefined, product));
    expect(updated.photo).toEqual(product.photo);
    const photo = await state.photos.get(photoInput(updated), actor);
    expect(Buffer.from(photo.fileBase64, "base64").length).toBe(photo.byteSize);
    expect(state.downloadedOptions()).toEqual({ start: 0, end: INVENTORY_PHOTO_MAX_BYTES });
  });

  it("replaces/removes transactionally, instantly blocking the old image without deleting it", async () => {
    const state = fixture(); const first = upload(); await state.photos.upload(first, actor);
    const product = await state.save(saveInput(first.uploadId));
    const second = upload(); await state.photos.upload(second, actor);
    const updated = await state.save(saveInput(second.uploadId, product));
    expect(state.data.get(`inventoryPhotoUploads/${first.uploadId}`)?.state).toBe("retired");
    await expect(state.photos.get(photoInput(product), actor)).rejects.toMatchObject({ code: "not-found" });
    const removed = await state.save({ ...saveInput(undefined, updated), photoChange: { action: "remove" } });
    expect(removed.photo).toBeNull(); expect(state.files.size).toBe(4);
    await expect(state.photos.get(photoInput(updated), actor)).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects another user's, expired, prepared, or attached upload with no partial product write", async () => {
    for (const mutation of [{ actorUid: "other" }, { actorEmployeeId: "EMP-OTHER" }, { expiresAt: Timestamp.fromMillis(0) }, { state: "prepared" }, { state: "attached", productId: "OTHER" }]) {
      const state = fixture(); const input = upload(); await state.photos.upload(input, actor);
      Object.assign(state.data.get(`inventoryPhotoUploads/${input.uploadId}`)!, mutation);
      await expect(state.save(saveInput(input.uploadId))).rejects.toMatchObject({ code: "failed-precondition", details: { reason: "inventory-photo-stage" } });
      expect(state.data.has(`${INVENTORY_PRODUCT_PATH}/PRODUCT-PHOTO`)).toBe(false);
    }
  });

  it("a stale product revision leaves its staged photo usable for a fresh retry", async () => {
    const state = fixture(); const product = await state.save(saveInput()); const input = upload(); await state.photos.upload(input, actor);
    await expect(state.save({ ...saveInput(input.uploadId, product), expectedRevision: 99 })).rejects.toThrow("stale-revision");
    expect(state.data.get(`inventoryPhotoUploads/${input.uploadId}`)?.state).toBe("uploaded");
    expect((await state.save(saveInput(input.uploadId, product))).photo?.photoId).toBe(input.uploadId);
  });

  it("allows active viewers to read but denies uploads and observes permission revocation during download", async () => {
    const state = fixture(); const input = upload(); await state.photos.upload(input, actor); const product = await state.save(saveInput(input.uploadId));
    const viewer = { ...actor, roleScopes: ["viewer"] };
    state.data.get(`employees/${actor.employeeId}`)!.roleScopes = viewer.roleScopes;
    expect((await state.photos.get(photoInput(product), viewer)).byteSize).toBeGreaterThan(0);
    await expect(state.photos.upload(upload(), viewer)).rejects.toMatchObject({ code: "permission-denied" });
    state.afterDownload(() => { state.data.get(`authz/${actor.uid}`)!.sessionVersion = 2; });
    await expect(state.photos.get(photoInput(product), viewer)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("does not release in-flight photos after product deletion or replacement", async () => {
    for (const mutation of [{ status: "deleted" }, { photo: { photoId: randomUUID(), width: 80, height: 60 } }]) {
      const state = fixture(); const input = upload(); await state.photos.upload(input, actor); const product = await state.save(saveInput(input.uploadId));
      state.afterDownload(() => Object.assign(state.data.get(`${INVENTORY_PRODUCT_PATH}/${product.productId}`)!, mutation));
      await expect(state.photos.get(photoInput(product), actor)).rejects.toMatchObject({ code: "not-found" });
    }
  });

  it("preserves attached tombstone images indefinitely while denying fresh and in-flight reads of a deleted product", async () => {
    const state = fixture(); const input = upload(); await state.photos.upload(input, actor);
    const product = await state.save(saveInput(input.uploadId));
    const service = new InventoryService(state.db);
    const deleted = await service.status({ requestId: randomUUID(), productId: product.productId,
      expectedRevision: product.revision, reason: "중복 품목" }, actor, true);
    expect(deleted.photo).toEqual(product.photo);
    const stage = state.data.get(`inventoryPhotoUploads/${input.uploadId}`)!;
    expect(stage).toMatchObject({ state: "attached", productId: product.productId });
    expect(stage).not.toHaveProperty("expiresAt");
    await expect(state.photos.get(photoInput(product), actor)).rejects.toMatchObject({ code: "not-found" });
    expect(state.downloadedOptions()).toBeUndefined();
    expect(await state.photos.expire(Timestamp.fromMillis(Date.now() + 366 * 86_400_000))).toBe(0);
    // Defensive retention also covers historical malformed expiry metadata.
    stage.expiresAt = Timestamp.fromMillis(0);
    expect(await state.photos.expire()).toBe(0);
    expect(state.files.has(inventoryPhotoPath(input.uploadId, "thumbnail"))).toBe(true);
    expect(state.files.has(inventoryPhotoPath(input.uploadId, "preview"))).toBe(true);
    expect(stage.state).toBe("attached");
  });

  it("rate-limits new uploads but not exact retries; renews a failed upload's processing lease", async () => {
    const state = fixture(); const input = upload();
    state.beforeSave(() => { throw Object.assign(new Error("secret bucket path"), { code: 503 }); });
    await expect(state.photos.upload(input, actor)).rejects.toMatchObject({ stage: "storage-write", upstreamCode: 503 });
    const stage = state.data.get(`inventoryPhotoUploads/${input.uploadId}`)!;
    stage.expiresAt = Timestamp.fromMillis(Date.now() + 10);
    state.data.get(`inventoryPhotoUploadRates/${actor.uid}`)!.count = 30;
    state.beforeSave(); const now = Timestamp.now();
    await state.photos.upload(input, actor, now);
    expect((stage.expiresAt as Timestamp).toMillis()).toBe(now.toMillis() + INVENTORY_PHOTO_PENDING_MS);
    expect(state.data.get(`inventoryPhotoUploadRates/${actor.uid}`)?.count).toBe(30);
    await expect(state.photos.upload(upload(), actor)).rejects.toMatchObject({ code: "resource-exhausted" });
  });

  it("recovers partial Storage writes without publishing or leaking dependency diagnostics", async () => {
    const state = fixture(); const input = upload();
    state.beforeSave((path) => { if (path.endsWith("preview.webp")) throw Object.assign(new Error("https://private/path?token=secret"), { code: 503, request: { authorization: "secret" } }); });
    let failure: unknown;
    try { await state.photos.upload(input, actor); } catch (error) { failure = error; }
    expect(inventoryPhotoErrorDiagnostic(failure)).toEqual({ stage: "storage-write", upstreamCode: 503 });
    expect(JSON.stringify(failure)).not.toMatch(/secret|private\/path|authorization/);
    expect(state.files.size).toBe(1); expect(state.data.get(`inventoryPhotoUploads/${input.uploadId}`)?.state).toBe("prepared");
    await expect(state.save(saveInput(input.uploadId))).rejects.toMatchObject({ code: "failed-precondition" });
    state.beforeSave(); await state.photos.upload(input, actor);
    expect(state.files.size).toBe(2); expect(state.data.get(`inventoryPhotoUploadRates/${actor.uid}`)?.count).toBe(1);
    expect((await state.save(saveInput(input.uploadId))).photo?.photoId).toBe(input.uploadId);
  });

  it("cannot publish when its session is revoked during Storage writes", async () => {
    const state = fixture(); const input = upload();
    state.beforeSave(() => { state.data.get(`authz/${actor.uid}`)!.active = false; });
    await expect(state.photos.upload(input, actor)).rejects.toMatchObject({ code: "permission-denied" });
    expect(state.data.get(`inventoryPhotoUploads/${input.uploadId}`)?.state).toBe("prepared");
  });

  it("cleans only expired unattached/retired images and retries partial deletion", async () => {
    const state = fixture(); const pending = upload(); const attached = upload();
    await state.photos.upload(pending, actor); await state.photos.upload(attached, actor); await state.save(saveInput(attached.uploadId));
    state.data.get(`inventoryPhotoUploads/${pending.uploadId}`)!.expiresAt = Timestamp.fromMillis(0);
    // Even a malformed expiry on an attached record must not delete its photo.
    state.data.get(`inventoryPhotoUploads/${attached.uploadId}`)!.expiresAt = Timestamp.fromMillis(0);
    state.beforeDelete((path) => { if (path.endsWith("preview.webp")) throw new Error("unavailable"); });
    await expect(state.photos.expire()).rejects.toThrow("cleanup incomplete");
    expect(state.data.get(`inventoryPhotoUploads/${pending.uploadId}`)?.state).toBe("deleting");
    state.beforeDelete(); expect(await state.photos.expire()).toBe(1);
    expect(state.files.has(inventoryPhotoPath(pending.uploadId, "preview"))).toBe(false);
    expect(state.files.has(inventoryPhotoPath(attached.uploadId, "preview"))).toBe(true);
  });

  it("preserves attached metadata across transient reads and normalizes mobile orientation", async () => {
    const state = fixture();
    const bytes = await sharp({ create: { width: 120, height: 80, channels: 3, background: "#729a91" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const input = { ...upload(), fileBase64: bytes.toString("base64") };
    expect(await state.photos.upload(input, actor)).toMatchObject({ width: 80, height: 120 });
    const product = await state.save(saveInput(input.uploadId));
    state.beforeDownload(() => { throw Object.assign(new Error("private image URL"), { code: 503 }); });
    await expect(state.photos.get(photoInput(product), actor)).rejects.toMatchObject({ stage: "storage-read", upstreamCode: 503 });
    expect(state.data.get(`inventoryPhotoUploads/${input.uploadId}`)?.state).toBe("attached");
    state.beforeDownload(); expect((await state.photos.get(photoInput(product), actor)).byteSize).toBeGreaterThan(0);
  });

  it("rejects spoofed MIME/base64, oversized bytes, arbitrary paths and a pixel-bomb declaration", async () => {
    expect(() => decodeInventoryPhoto({ ...upload(), contentType: "image/png" })).toThrow(InvalidPhotoError);
    for (const fileBase64 of ["not base64!", "====", Buffer.from("<svg>bad</svg>").toString("base64"), Buffer.alloc(INVENTORY_PHOTO_MAX_BYTES + 1).toString("base64")])
      expect(() => decodeInventoryPhoto({ ...upload(), fileBase64 })).toThrow(InvalidPhotoError);
    expect(() => inventoryPhotoPath("../customerPhotos/secret", "preview")).toThrow();
    expect(saveInventoryProductInputSchema.safeParse({ ...saveInput(), photoChange: { action: "replace", uploadId: randomUUID(), storagePath: "elsewhere" } }).success).toBe(false);
    const bomb = Buffer.from(jpeg);
    const sof = bomb.indexOf(Buffer.from([0xff, 0xc0]));
    expect(sof).toBeGreaterThan(0);
    bomb.writeUInt16BE(30_000, sof + 5); bomb.writeUInt16BE(30_000, sof + 7);
    const state = fixture();
    await expect(state.photos.upload({ ...upload(), fileBase64: bomb.toString("base64") }, actor)).rejects.toBeInstanceOf(InvalidPhotoError);
    expect(state.files.size).toBe(0);
  });
});
