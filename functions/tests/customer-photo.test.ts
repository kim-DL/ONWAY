import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import type { getAdminPhotoBucket } from "../src/shared/firebase-admin.js";
import type { CustomerActor } from "../src/customer/customer-authorization.js";
import { customerDraftSchema, customerSchema, saveCustomerInputSchema, type SaveCustomerInput } from "../src/customer/customer-contract.js";
import { CustomerPhotoService, decodeCustomerPhoto } from "../src/customer/customer-photo-service.js";
import { customerPhotoPath } from "../src/customer/customer-photo-store.js";
import { CustomerPhotoDependencyError, customerPhotoErrorDiagnostic, customerPhotoOperation } from "../src/customer/customer-photo-errors.js";
import { InvalidPhotoError } from "../src/photo/photo-processor.js";
import { HttpsError } from "firebase-functions/v2/https";
import { CustomerService, customerResponse } from "../src/customer/customer-service.js";

const actor: CustomerActor = { uid: "uid-staff", employeeId: "EMP-STAFF", roleScopes: ["delivery"], sessionVersion: 1, permissionsVersion: 1, isAdmin: false };
const draft = customerDraftSchema.parse({ name: "사진 검증 거래처", district: "", administrativeDong: "", officialAddress: "", deliveryAddress: "", accessPassword: "", accessPasswordState: "none",
  deliveryLocationDescription: "", deliveryPoint: null, contacts: [], status: "active", noticeType: "none", changeNote: "" });
let jpeg: Buffer;
beforeAll(async () => { jpeg = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#5988a4" } }).jpeg().toBuffer(); });

function fixture() {
  const data = new Map<string, Record<string, unknown>>([
    [`authz/${actor.uid}`, { employeeId: actor.employeeId, active: true, sessionVersion: 1, permissionsVersion: 1 }],
    [`employees/${actor.employeeId}`, { employeeId: actor.employeeId, firebaseUid: actor.uid, roleScopes: actor.roleScopes, status: "active" }],
  ]);
  const files = new Map<string, Buffer>(); const metadata = new Map<string, unknown>(); let saves = 0; let id = 0;
  let afterDownload: (() => void) | undefined;
  let beforeSave: ((path: string) => void) | undefined;
  let beforeDownload: (() => void) | undefined;
  const ref = (path: string) => ({ path, id: path.split("/").at(-1)!, delete: async () => { data.delete(path); } });
  const snapshot = (reference: ReturnType<typeof ref>) => ({ exists: data.has(reference.path), id: reference.id, ref: reference, data: () => data.get(reference.path),
    get: (field: string) => field.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, data.get(reference.path)),
  });
  const db = {
    doc: ref,
    collection(path: string) { return {
      doc: () => ref(`${path}/customer-${++id}`),
      where: (field: string, _operator: string, boundary: Timestamp) => ({ limit: (maximum: number) => ({ get: async () => ({ docs: [...data.entries()]
        .filter(([key, value]) => key.startsWith(`${path}/`) && value[field] instanceof Timestamp && (value[field] as Timestamp).toMillis() <= boundary.toMillis())
        .slice(0, maximum).map(([key]) => snapshot(ref(key))) }) }) }),
    }; },
    async runTransaction<T>(action: (tx: unknown) => Promise<T>) {
      const writes: Array<() => void> = [];
      const tx = {
        get: async (reference: ReturnType<typeof ref>) => snapshot(reference),
        getAll: async (...references: Array<ReturnType<typeof ref>>) => references.map(snapshot),
        set: (reference: ReturnType<typeof ref>, value: Record<string, unknown>) => writes.push(() => data.set(reference.path, value)),
        create: (reference: ReturnType<typeof ref>, value: Record<string, unknown>) => writes.push(() => { if (data.has(reference.path)) throw new Error("exists"); data.set(reference.path, value); }),
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
    download: async () => { beforeDownload?.(); const buffer = files.get(path); if (!buffer) throw new Error("missing"); afterDownload?.(); return [buffer]; },
    delete: async () => { files.delete(path); },
  }) } as unknown as ReturnType<typeof getAdminPhotoBucket>;
  return { data, files, metadata, db, photos: new CustomerPhotoService(db, bucket), customers: new CustomerService(db), saves: () => saves,
    afterDownload: (callback: () => void) => { afterDownload = callback; },
    beforeSave: (callback?: (path: string) => void) => { beforeSave = callback; },
    beforeDownload: (callback?: () => void) => { beforeDownload = callback; } };
}
function upload(uploadId = randomUUID()) { return { uploadId, contentType: "image/jpeg" as const, fileBase64: jpeg.toString("base64") }; }
function save(uploadId?: string): SaveCustomerInput { return { requestId: randomUUID(), customerId: null, expectedRevision: null, draft, clearNotice: false,
  ...(uploadId ? { photoChange: { action: "replace", uploadId } } : {}) }; }

describe("private customer photo lifecycle", () => {
  it("stages private processed variants once and rejects cross-user/file replay", async () => {
    const state = fixture(); const request = upload();
    const staged = await state.photos.upload(request, actor);
    expect(staged).toMatchObject({ uploadId: request.uploadId, width: 80, height: 60 });
    expect(await state.photos.upload(request, actor)).toEqual(staged); expect(state.saves()).toBe(2);
    for (const [path, bytes] of state.files) {
      expect(path).toMatch(/^companies\/onnuri\/customerPhotos\/[a-f0-9-]+\/(thumbnail|preview)\.webp$/);
      expect((await sharp(bytes).metadata()).format).toBe("webp");
      expect(state.metadata.get(path)).toMatchObject({ metadata: { cacheControl: "private, no-store, max-age=0", contentType: "image/webp" } });
      expect(JSON.stringify(state.metadata.get(path))).not.toContain("downloadTokens");
    }
    state.data.get(`customerPhotoUploads/${request.uploadId}`)!.actorUid = "other";
    await expect(state.photos.upload(request, actor)).rejects.toMatchObject({ code: "already-exists" });
  });
  it("attaches only during customer save, preserves on legacy edits and replays without duplicate customers/audits", async () => {
    const state = fixture(); const file = upload(); await state.photos.upload(file, actor);
    const request = save(file.uploadId);
    const customer = await state.customers.save(request, actor);
    expect(customer.overviewPhoto).toEqual({ photoId: file.uploadId, width: 80, height: 60 });
    expect(customer.noticeType).toBe("none");
    expect(await state.customers.save({ ...request, includeOverviewPhoto: true }, actor)).toEqual(customer);
    expect([...state.data.keys()].filter((key) => key.startsWith("companies/"))).toHaveLength(1);
    expect([...state.data.keys()].filter((key) => key.startsWith("auditLogs/"))).toHaveLength(1);
    expect(state.data.get(`customerPhotoUploads/${file.uploadId}`)).not.toHaveProperty("expiresAt");
    const legacyEdit = await state.customers.save({ ...save(), customerId: customer.customerId, expectedRevision: 1 }, actor);
    expect(legacyEdit.overviewPhoto).toEqual(customer.overviewPhoto);
    expect(customerResponse(legacyEdit)).not.toHaveProperty("overviewPhoto");
    expect(customerResponse(legacyEdit, true).overviewPhoto).toEqual(customer.overviewPhoto);
    const photo = await state.photos.get({ customerId: customer.customerId, photoId: file.uploadId, variant: "preview" }, actor);
    expect(Buffer.from(photo.fileBase64, "base64").length).toBe(photo.byteSize);
    expect(JSON.stringify(customer)).not.toMatch(/fileBase64|storagePath|https:/);
  });
  it("atomically removes/replaces, blocks former image reads and retires only old attachments", async () => {
    const state = fixture(); const first = upload(); await state.photos.upload(first, actor);
    const customer = await state.customers.save(save(first.uploadId), actor);
    const second = upload(); await state.photos.upload(second, actor);
    await state.customers.save({ ...save(second.uploadId), customerId: customer.customerId, expectedRevision: 1 }, actor);
    expect(state.data.get(`customerPhotoUploads/${first.uploadId}`)).toMatchObject({ state: "retired" });
    await expect(state.photos.get({ customerId: customer.customerId, photoId: first.uploadId, variant: "thumbnail" }, actor)).rejects.toMatchObject({ code: "not-found" });
    const removed = await state.customers.save({ ...save(), customerId: customer.customerId, expectedRevision: 2, photoChange: { action: "remove" } }, actor);
    expect(removed.overviewPhoto).toBeNull();
    await expect(state.photos.get({ customerId: customer.customerId, photoId: second.uploadId, variant: "preview" }, actor)).rejects.toMatchObject({ code: "not-found" });
    expect(state.files.size).toBe(4); // no destructive removal during save
  });
  it("never consumes another actor's, expired, or already attached stage", async () => {
    for (const mutation of [{ actorUid: "other" }, { expiresAt: Timestamp.fromMillis(0) }, { state: "attached", customerId: "other" }]) {
      const state = fixture(); const file = upload(); await state.photos.upload(file, actor);
      Object.assign(state.data.get(`customerPhotoUploads/${file.uploadId}`)!, mutation);
      await expect(state.customers.save(save(file.uploadId), actor)).rejects.toMatchObject({ code: "failed-precondition", details: { reason: "customer-photo-stage" } });
      expect([...state.data.keys()].filter((key) => key.startsWith("companies/") || key.startsWith("auditLogs/"))).toHaveLength(0);
    }
  });
  it("tags a missing upload stage without misclassifying revoked employee sessions", async () => {
    const state = fixture();
    await expect(state.customers.save(save(randomUUID()), actor)).rejects.toMatchObject({ code: "failed-precondition", details: { reason: "customer-photo-stage" } });
    state.data.get(`authz/${actor.uid}`)!.active = false;
    await expect(state.customers.save(save(randomUUID()), actor)).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("leaves stage usable after stale revision and blocks revoked sessions after download", async () => {
    const state = fixture(); const customer = await state.customers.save(save(), actor);
    const file = upload(); await state.photos.upload(file, actor);
    await expect(state.customers.save({ ...save(file.uploadId), customerId: customer.customerId, expectedRevision: 9 }, actor)).rejects.toBeInstanceOf(Error);
    expect(state.data.get(`customerPhotoUploads/${file.uploadId}`)?.state).toBe("uploaded");
    await state.customers.save({ ...save(file.uploadId), customerId: customer.customerId, expectedRevision: 1 }, actor);
    state.afterDownload(() => { state.data.get(`authz/${actor.uid}`)!.active = false; });
    await expect(state.photos.get({ customerId: customer.customerId, photoId: file.uploadId, variant: "preview" }, actor)).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("cleans expired unattached stages and retains attached photos", async () => {
    const state = fixture(); const pending = upload(); const attached = upload();
    await state.photos.upload(pending, actor); await state.photos.upload(attached, actor);
    await state.customers.save(save(attached.uploadId), actor);
    state.data.get(`customerPhotoUploads/${pending.uploadId}`)!.expiresAt = Timestamp.fromMillis(0);
    expect(await state.photos.expire()).toBe(1);
    expect(state.files.has(customerPhotoPath(pending.uploadId, "preview"))).toBe(false);
    expect(state.files.has(customerPhotoPath(attached.uploadId, "preview"))).toBe(true);
  });
  it("bounds upload rate without charging exact retries again", async () => {
    const state = fixture(); const file = upload(); await state.photos.upload(file, actor);
    state.data.get(`customerPhotoUploadRates/${actor.uid}`)!.count = 30;
    expect(await state.photos.upload(file, actor)).toMatchObject({ uploadId: file.uploadId });
    await expect(state.photos.upload(upload(), actor)).rejects.toMatchObject({ code: "resource-exhausted" });
  });
  it("retries partial Storage upload without consuming the stage, duplicating a customer or charging twice", async () => {
    const state = fixture(); const file = upload();
    state.beforeSave((path) => { if (path.endsWith("/preview.webp")) throw Object.assign(new Error("private object path"), { code: 503 }); });
    await expect(state.photos.upload(file, actor)).rejects.toMatchObject({ stage: "storage-write", upstreamCode: 503 });
    expect(state.data.get(`customerPhotoUploads/${file.uploadId}`)?.state).toBe("prepared");
    expect(state.files.size).toBe(1);
    await expect(state.customers.save(save(file.uploadId), actor)).rejects.toMatchObject({ code: "failed-precondition", details: { reason: "customer-photo-stage" } });
    expect([...state.data.keys()].filter((key) => key.startsWith("companies/") || key.startsWith("auditLogs/"))).toHaveLength(0);
    state.beforeSave();
    const result = await state.photos.upload(file, actor);
    expect(result.uploadId).toBe(file.uploadId);
    expect(state.files.size).toBe(2);
    expect(state.data.get(`customerPhotoUploadRates/${actor.uid}`)?.count).toBe(1);
    expect((await state.customers.save(save(file.uploadId), actor)).overviewPhoto?.photoId).toBe(file.uploadId);
  });
  it("preserves attached metadata on transient reads and successfully serves the same request on retry", async () => {
    const state = fixture(); const file = upload(); await state.photos.upload(file, actor);
    const customer = await state.customers.save(save(file.uploadId), actor);
    const request = { customerId: customer.customerId, photoId: file.uploadId, variant: "preview" as const };
    state.beforeDownload(() => { throw Object.assign(new Error("private URL"), { code: 503 }); });
    await expect(state.photos.get(request, actor)).rejects.toMatchObject({ stage: "storage-read", upstreamCode: 503 });
    expect(state.data.get(`customerPhotoUploads/${file.uploadId}`)?.state).toBe("attached");
    state.beforeDownload();
    expect((await state.photos.get(request, actor)).byteSize).toBeGreaterThan(0);
  });
  it("cannot publish an upload if staff permissions are revoked during Storage writes", async () => {
    const state = fixture(); const file = upload();
    state.beforeSave(() => { state.data.get(`authz/${actor.uid}`)!.active = false; });
    await expect(state.photos.upload(file, actor)).rejects.toMatchObject({ code: "permission-denied" });
    expect(state.data.get(`customerPhotoUploads/${file.uploadId}`)?.state).toBe("prepared");
    await expect(state.customers.save(save(file.uploadId), actor)).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("normalizes mobile JPEG orientation and stores only metadata in Firestore", async () => {
    const state = fixture();
    const rotated = await sharp({ create: { width: 120, height: 80, channels: 3, background: "#548fb0" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const file = { ...upload(), fileBase64: rotated.toString("base64") };
    const result = await state.photos.upload(file, actor);
    expect(result).toMatchObject({ width: 80, height: 120 });
    for (const bytes of state.files.values()) expect((await sharp(bytes).metadata()).exif).toBeUndefined();
    const document = state.data.get(`customerPhotoUploads/${file.uploadId}`)!;
    expect(JSON.stringify(document)).not.toMatch(/fileBase64|storagePath|https:/);
    expect(Object.values(document).some((value) => Buffer.isBuffer(value))).toBe(false);
  });
  it("rejects unsafe bytes and caller-controlled asset fields while accepting old records", () => {
    expect(() => decodeCustomerPhoto({ ...upload(), contentType: "image/png" })).toThrow();
    expect(() => decodeCustomerPhoto({ ...upload(), fileBase64: "not base64!" })).toThrow();
    expect(() => decodeCustomerPhoto({ ...upload(), fileBase64: Buffer.from("<svg>bad</svg>").toString("base64") })).toThrow();
    expect(saveCustomerInputSchema.safeParse({ ...save(), photoChange: { action: "replace", uploadId: randomUUID(), storagePath: "elsewhere" } }).success).toBe(false);
    expect(customerSchema.safeParse({ ...draft, customerId: "old", companyId: "onnuri", normalizedName: "old", choseongName: "old", revision: 1,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: "EMP", updatedBy: "EMP" }).success).toBe(true);
  });
});

describe("private photo diagnostics", () => {
  it("reports an allowlisted dependency stage and code without copying private error data", async () => {
    const raw = Object.assign(new Error("customer name, address, https://private-image.example/image.webp?token=secret"), { code: 403, request: { headers: { authorization: "secret" } } });
    const error = new CustomerPhotoDependencyError("storage-write", raw);
    expect(customerPhotoErrorDiagnostic(error, "upload")).toEqual({ operation: "upload", stage: "storage-write", category: "dependency-permission", upstreamCode: 403 });
    expect(JSON.stringify(error)).not.toMatch(/secret|address|private-image|authorization/);
    expect(customerPhotoErrorDiagnostic({ code: "private-object-path", message: "secret" }, "download")).toEqual({ operation: "download", stage: "request", category: "internal" });
    await expect(customerPhotoOperation("storage-read", async () => { throw raw; })).rejects.toMatchObject({ stage: "storage-read", upstreamCode: 403 });
  });
  it("preserves explicit session/stage rejection and safe image validation errors", async () => {
    const sessionError = new HttpsError("permission-denied", "Revoked");
    await expect(customerPhotoOperation("storage-write", async () => { throw sessionError; })).rejects.toBe(sessionError);
    const imageError = new InvalidPhotoError("Unsupported image");
    await expect(customerPhotoOperation("image-processing", async () => { throw imageError; })).rejects.toBe(imageError);
    expect(customerPhotoErrorDiagnostic(imageError, "upload")).toEqual({ operation: "upload", stage: "image-processing", category: "invalid-image" });
  });
});
