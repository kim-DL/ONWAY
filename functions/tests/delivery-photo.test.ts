import { randomUUID } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { CustomerActor } from "../src/customer/customer-authorization.js";
import { DeliveryPhotoBucketConfigurationError, getAdminDeliveryPhotoBucket } from "../src/shared/firebase-admin.js";
import {
  createDeliveryPhotoInputSchema,
  deliveryPhotoDaySchema,
  deliveryPhotoRouteSchema,
} from "../src/delivery-photo/delivery-photo-contract.js";
import { decodeDeliveryPhoto, processDeliveryPhoto } from "../src/delivery-photo/delivery-photo-processor.js";
import { DeliveryPhotoRequestCollision, DeliveryPhotoRevisionConflict, DeliveryPhotoService, deliveryDateKeyInSeoul } from "../src/delivery-photo/delivery-photo-service.js";
import {
  deliveryPhotoPath,
  isDeliveryPhotoManagedPath,
  DeliveryPhotoUploadOwnershipError,
  GoogleDeliveryPhotoStorage,
  type DeliveryPhotoStorage,
} from "../src/delivery-photo/delivery-photo-store.js";

const actor: CustomerActor = { uid: "uid-staff", employeeId: "EMP-STAFF", roleScopes: ["delivery"], sessionVersion: 1, permissionsVersion: 1, isAdmin: false };
const admin: CustomerActor = { uid: "uid-admin", employeeId: "EMP-ADMIN", roleScopes: ["admin"], sessionVersion: 1, permissionsVersion: 1, isAdmin: true };
const sales: CustomerActor = { uid: "uid-sales", employeeId: "EMP-SALES", roleScopes: ["sales"], sessionVersion: 1, permissionsVersion: 1, isAdmin: false };
const viewer: CustomerActor = { uid: "uid-viewer", employeeId: "EMP-VIEWER", roleScopes: ["viewer"], sessionVersion: 1, permissionsVersion: 1, isAdmin: false };
const now = Timestamp.fromDate(new Date("2026-09-22T00:00:00.000Z"));
let jpeg: Buffer;

beforeAll(async () => {
  jpeg = await sharp({ create: { width: 120, height: 80, channels: 3, background: "#5b8da8" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
});

type Value = Record<string, unknown>;
type Ref = { path: string; id: string; delete(): Promise<void>; update(value: Value): Promise<void> };

function fixture() {
  const data = new Map<string, Value>([
    [`authz/${actor.uid}`, { employeeId: actor.employeeId, active: true, sessionVersion: 1, permissionsVersion: 1 }],
    [`employees/${actor.employeeId}`, { employeeId: actor.employeeId, firebaseUid: actor.uid, displayName: "배송 담당", roleScopes: actor.roleScopes, status: "active" }],
    [`authz/${admin.uid}`, { employeeId: admin.employeeId, active: true, sessionVersion: 1, permissionsVersion: 1 }],
    [`employees/${admin.employeeId}`, { employeeId: admin.employeeId, firebaseUid: admin.uid, displayName: "관리 담당", roleScopes: admin.roleScopes, status: "active" }],
    [`authz/${sales.uid}`, { employeeId: sales.employeeId, active: true, sessionVersion: 1, permissionsVersion: 1 }],
    [`employees/${sales.employeeId}`, { employeeId: sales.employeeId, firebaseUid: sales.uid, displayName: "영업 담당", roleScopes: sales.roleScopes, status: "active" }],
    [`authz/${viewer.uid}`, { employeeId: viewer.employeeId, active: true, sessionVersion: 1, permissionsVersion: 1 }],
    [`employees/${viewer.employeeId}`, { employeeId: viewer.employeeId, firebaseUid: viewer.uid, displayName: "조회 담당", roleScopes: viewer.roleScopes, status: "active" }],
    ["companies/onnuri/customers/customer-a", { customerId: "customer-a", companyId: "onnuri", status: "active", name: "가 거래처" }],
    ["companies/onnuri/customers/customer-b", { customerId: "customer-b", companyId: "onnuri", status: "active", name: "나 거래처" }],
    ["companies/onnuri/customers/customer-closed", { customerId: "customer-closed", companyId: "onnuri", status: "closed", name: "폐업 거래처" }],
  ]);
  const applyUpdate = (target: Value, value: Value) => {
    for (const [key, field] of Object.entries(value)) {
      if (field?.constructor.name === "DeleteTransform") delete target[key];
      else target[key] = field;
    }
  };
  const ref = (path: string): Ref => ({
    path, id: path.split("/").at(-1)!,
    delete: async () => { data.delete(path); },
    update: async (value) => { applyUpdate(data.get(path)!, value); },
  });
  const valueAt = (value: Value | undefined, field: string) => field.split(".").reduce<unknown>((current, key) =>
    current && typeof current === "object" ? (current as Value)[key] : undefined, value);
  const snapshot = (reference: Ref) => ({
    exists: data.has(reference.path), id: reference.id, ref: reference,
    data: () => data.get(reference.path), get: (field: string) => valueAt(data.get(reference.path), field),
  });
  const compare = (left: unknown, right: unknown) => {
    const a = left instanceof Timestamp ? left.toMillis() : left;
    const b = right instanceof Timestamp ? right.toMillis() : right;
    return a === b ? 0 : (a as number | string) < (b as number | string) ? -1 : 1;
  };
  type Snapshot = ReturnType<typeof snapshot>;
  type FakeQuery = {
    where(field: string, operator: string, boundary: unknown): FakeQuery;
    orderBy(field: string, direction?: "asc" | "desc"): FakeQuery;
    limit(limit: number): FakeQuery;
    get(): Promise<{ docs: Snapshot[]; size: number }>;
  };
  type FakeTransaction = {
    get(reference: Ref): Promise<Snapshot>;
    getAll(...references: Ref[]): Promise<Snapshot[]>;
    set(reference: Ref, value: Value): void;
    create(reference: Ref, value: Value): void;
    update(reference: Ref, value: Value): void;
    delete(reference: Ref): void;
  };
  const makeQuery = (path: string, filters: Array<[string, string, unknown]> = [], order?: [string, "asc" | "desc"], maximum = Number.POSITIVE_INFINITY): FakeQuery => ({
    where: (field: string, operator: string, boundary: unknown) => makeQuery(path, [...filters, [field, operator, boundary]], order, maximum),
    orderBy: (field: string, direction: "asc" | "desc" = "asc") => makeQuery(path, filters, [field, direction], maximum),
    limit: (limit: number) => makeQuery(path, filters, order, limit),
    get: async () => {
      let entries = [...data.entries()].filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/"));
      entries = entries.filter(([, value]) => filters.every(([field, operator, boundary]) => {
        const comparison = compare(valueAt(value, field), boundary);
        return operator === "==" ? comparison === 0 : operator === ">=" ? comparison >= 0 : operator === "<=" ? comparison <= 0 : false;
      }));
      if (order) entries.sort(([, left], [, right]) => compare(valueAt(left, order[0]), valueAt(right, order[0])) * (order[1] === "desc" ? -1 : 1));
      const docs = entries.slice(0, maximum).map(([key]) => snapshot(ref(key)));
      return { docs, size: docs.length };
    },
  });
  let transactionQueue = Promise.resolve();
  let failAfterCommit: (() => boolean) | undefined;
  const db = {
    doc: ref,
    collection: (path: string) => ({ ...makeQuery(path), doc: () => ref(`${path}/${randomUUID()}`) }),
    runTransaction<T>(action: (transaction: FakeTransaction) => Promise<T>): Promise<T> {
      const run = transactionQueue.then(async () => {
        const writes: Array<() => void> = [];
        const transaction = {
          get: async (reference: Ref) => snapshot(reference),
          getAll: async (...references: Ref[]) => references.map(snapshot),
          set: (reference: Ref, value: Value) => writes.push(() => data.set(reference.path, value)),
          create: (reference: Ref, value: Value) => writes.push(() => { if (data.has(reference.path)) throw new Error("exists"); data.set(reference.path, value); }),
          update: (reference: Ref, value: Value) => writes.push(() => applyUpdate(data.get(reference.path)!, value)),
          delete: (reference: Ref) => writes.push(() => { data.delete(reference.path); }),
        };
        const result = await action(transaction);
        writes.forEach((write) => write());
        if (failAfterCommit?.()) {
          failAfterCommit = undefined;
          throw new Error("simulated commit acknowledgement loss");
        }
        return result;
      });
      transactionQueue = run.then(() => undefined, () => undefined);
      return run;
    },
  } as unknown as Firestore;

  const files = new Map<string, { bytes: Buffer; generation: string; width: number; height: number; uploadAttemptToken?: string }>();
  let generation = 0;
  let clock = now;
  let failSave: ((path: string) => void | Promise<void>) | undefined;
  let failDelete: ((path: string) => void | Promise<void>) | undefined;
  let beforeInspect: ((path: string) => void | Promise<void>) | undefined;
  let afterInspect: ((path: string, object: { objectPath: string; generation: string; uploadAttemptToken?: string } | null) => void | Promise<void>) | undefined;
  let afterSave: ((path: string) => void | Promise<void>) | undefined;
  let beforeDownload: (() => void | Promise<void>) | undefined;
  let beforeDelete: ((path: string) => void) | undefined;
  const storage: DeliveryPhotoStorage = {
    async save(path, bytes, dimensions, uploadAttemptToken) {
      await failSave?.(path);
      if (files.has(path)) throw new Error("precondition");
      const stored = { bytes, generation: String(++generation), ...dimensions, uploadAttemptToken };
      files.set(path, stored);
      await afterSave?.(path);
      return { objectPath: path, generation: stored.generation, uploadAttemptToken, contentType: "image/webp", byteSize: bytes.length, ...dimensions };
    },
    async download(object) {
      await beforeDownload?.();
      const stored = files.get(object.objectPath);
      if (!stored || stored.generation !== object.generation || stored.uploadAttemptToken !== object.uploadAttemptToken) throw new Error("missing");
      return stored.bytes;
    },
    async inspect(path) {
      await beforeInspect?.(path);
      const stored = files.get(path);
      const object = stored ? {
        objectPath: path, generation: stored.generation,
        ...(stored.uploadAttemptToken ? { uploadAttemptToken: stored.uploadAttemptToken } : {}),
      } : null;
      await afterInspect?.(path, object);
      return object;
    },
    async delete(object) {
      await failDelete?.(object.objectPath);
      const stored = files.get(object.objectPath);
      beforeDelete?.(object.objectPath);
      beforeDelete = undefined;
      const current = files.get(object.objectPath);
      if (current && stored && current.generation !== stored.generation) throw new Error("precondition");
      if (stored && stored.generation !== object.generation) throw new Error("precondition");
      if (current) files.delete(object.objectPath);
    },
  };
  const service = new DeliveryPhotoService(db, storage, () => clock);
  return {
    data, files, db, service, storage,
    setClock(value: Timestamp) { clock = value; },
    setStorage(value: DeliveryPhotoStorage) {
      (service as unknown as { storageInstance: DeliveryPhotoStorage }).storageInstance = value;
    },
    failSave(callback?: (path: string) => void | Promise<void>) { failSave = callback; },
    failDelete(callback?: (path: string) => void | Promise<void>) { failDelete = callback; },
    beforeInspect(callback?: (path: string) => void | Promise<void>) { beforeInspect = callback; },
    afterInspect(callback?: (path: string, object: { objectPath: string; generation: string; uploadAttemptToken?: string } | null) => void | Promise<void>) { afterInspect = callback; },
    afterSave(callback?: (path: string) => void | Promise<void>) { afterSave = callback; },
    beforeDownload(callback?: () => void | Promise<void>) { beforeDownload = callback; },
    failCompleteCommitAck() {
      failAfterCommit = () => [...data.entries()].some(([key, value]) => key.startsWith("requestLocks/delivery-photo-create-") && value.state === "complete");
    },
    putFile(path: string, uploadAttemptToken?: string) {
      files.set(path, {
        bytes: Buffer.from("orphan"), generation: String(++generation), width: 1, height: 1,
        ...(uploadAttemptToken ? { uploadAttemptToken } : {}),
      });
    },
    replaceDuringNextDelete(path: string) {
      beforeDelete = (deletedPath) => {
        if (deletedPath === path) files.set(path, { bytes: Buffer.from("replacement"), generation: String(++generation), width: 1, height: 1 });
      };
    },
  };
}

function upload(requestId = randomUUID(), customerId = "customer-a") {
  return createDeliveryPhotoInputSchema.parse({ requestId, customerId, source: "camera", contentType: "image/jpeg", fileBase64: jpeg.toString("base64") });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function staleAttemptsBeforeWinner(count: number) {
  const state = fixture();
  const request = upload();
  const started = Array.from({ length: count }, () => deferred());
  const releaseUpload = Array.from({ length: count }, () => deferred());
  const published = Array.from({ length: count }, () => deferred());
  const vanishedWorker = new Promise<void>(() => {});
  const stalePaths: string[] = [];
  let startedCount = 0;
  state.failSave(async (path) => {
    if (path.endsWith("thumbnail.webp")) throw new Error("partial upload");
    const index = startedCount++;
    started[index]!.resolve();
    await releaseUpload[index]!.promise;
  });
  for (let index = 0; index < count; index += 1) {
    void state.service.create(request, actor, stateTime(index)).catch(() => {});
    await started[index]!.promise;
    const receipt = state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)!;
    stalePaths.push(String(receipt.evidencePath));
    const terminal = stateTime(index + 1);
    state.setClock(terminal);
    expect(await state.service.expire(terminal)).toMatchObject({ failures: 0 });
    expect(receipt.state).toBe("failed");
    expect(receipt.recoveryUntil).toBeUndefined();
  }
  state.failSave();
  const winningAt = Timestamp.fromMillis(stateTime(count).toMillis() + 60_000);
  state.setClock(winningAt);
  const winner = await state.service.create(request, actor, winningAt);
  const receipt = state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)!;
  const photo = state.data.get(`companies/onnuri/deliveryPhotos/${winner.photoId}`)!;
  state.afterSave(async (path) => {
    const index = stalePaths.indexOf(path);
    if (index < 0) return;
    published[index]!.resolve();
    await vanishedWorker;
  });
  releaseUpload.forEach((gate) => gate.resolve());
  await Promise.all(published.map((gate) => gate.promise));
  return { state, request, winner, winningAt, receipt, photo, stalePaths };
}

function stateTime(index: number) {
  return Timestamp.fromMillis(now.toMillis() + index * (2 * 60 * 60 * 1000 + 60_000));
}

describe("delivery photo contracts and processing", () => {
  it("bounds route/day inputs and rejects caller-owned fields", () => {
    const timestamp = now.toDate().toISOString();
    expect(deliveryPhotoRouteSchema.safeParse({ employeeId: "EMP", customerIds: Array.from({ length: 101 }, (_, index) => `c${index}`), revision: 1, updatedAt: timestamp, updatedByEmployeeId: "EMP" }).success).toBe(false);
    expect(deliveryPhotoDaySchema.safeParse({ employeeId: "EMP", deliveryDateKey: "2026-02-30", customerIds: [], revision: 1, updatedAt: timestamp, updatedByEmployeeId: "EMP", expiresAt: timestamp }).success).toBe(false);
    expect(createDeliveryPhotoInputSchema.safeParse({ ...upload(), photoId: randomUUID(), objectPath: "attacker/path" }).success).toBe(false);
    expect(createDeliveryPhotoInputSchema.safeParse({ ...upload(), fileBase64: "A".repeat(Math.ceil(10 * 1024 * 1024 * 4 / 3) + 9) }).success).toBe(false);
  });

  it("normalizes orientation, strips metadata, and creates uncropped non-upscaled WebP variants", async () => {
    const decoded = decodeDeliveryPhoto(upload());
    const result = await processDeliveryPhoto(decoded);
    expect(result.evidence).toMatchObject({ width: 80, height: 120 });
    expect(result.thumbnail).toMatchObject({ width: 80, height: 120 });
    for (const output of [result.evidence, result.thumbnail]) {
      const metadata = await sharp(output.buffer).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.exif).toBeUndefined();
    }
    expect(() => decodeDeliveryPhoto({ ...upload(), contentType: "image/png" })).toThrow();
    expect(() => decodeDeliveryPhoto({ ...upload(), fileBase64: "not-base64" })).toThrow();
  });

  it("derives the authoritative Seoul date at the UTC boundary", () => {
    expect(deliveryDateKeyInSeoul(new Date("2026-09-21T15:00:00.000Z"))).toBe("2026-09-22");
  });

  it("fails closed when the dedicated bucket is not configured", () => {
    const original = process.env.DELIVERY_PHOTO_BUCKET;
    const originalConfig = process.env.FIREBASE_CONFIG;
    delete process.env.DELIVERY_PHOTO_BUCKET;
    expect(() => getAdminDeliveryPhotoBucket()).toThrow(DeliveryPhotoBucketConfigurationError);
    process.env.FIREBASE_CONFIG = JSON.stringify({ storageBucket: "demo-onnuriway.appspot.com" });
    process.env.DELIVERY_PHOTO_BUCKET = "demo-onnuriway.appspot.com";
    expect(() => getAdminDeliveryPhotoBucket()).toThrow(DeliveryPhotoBucketConfigurationError);
    process.env.DELIVERY_PHOTO_BUCKET = "demo-onnuriway-delivery-photos.appspot.com";
    expect(() => getAdminDeliveryPhotoBucket()).not.toThrow();
    if (original === undefined) delete process.env.DELIVERY_PHOTO_BUCKET;
    else process.env.DELIVERY_PHOTO_BUCKET = original;
    if (originalConfig === undefined) delete process.env.FIREBASE_CONFIG;
    else process.env.FIREBASE_CONFIG = originalConfig;
  });

  it("uses GCS generation preconditions for create-only upload and deletion", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const getMetadata = vi.fn().mockResolvedValue([{
      generation: "42", contentType: "image/webp", metadata: { deliveryPhotoUploadAttempt: "upload-token" },
    }]);
    const remove = vi.fn().mockResolvedValue([{}]);
    const file = {
      save, getMetadata, delete: remove,
      metadata: { generation: "42", contentType: "image/webp", metadata: { deliveryPhotoUploadAttempt: "upload-token" } },
    };
    const storage = new GoogleDeliveryPhotoStorage({ file: vi.fn(() => file) } as never);
    const token = randomUUID();
    const path = deliveryPhotoPath("2026-09-22", randomUUID(), token, "evidence");
    file.metadata.metadata.deliveryPhotoUploadAttempt = token;
    const object = await storage.save(path, Buffer.from("webp"), { width: 1, height: 1 }, token);
    expect(save).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: expect.objectContaining({ metadata: { deliveryPhotoUploadAttempt: token } }),
    }));
    expect(getMetadata).not.toHaveBeenCalled();
    getMetadata.mockResolvedValueOnce([{ generation: "42", contentType: "image/webp", metadata: { deliveryPhotoUploadAttempt: token } }]);
    expect(await storage.inspect(path)).toMatchObject({
      objectPath: path, generation: "42", uploadAttemptToken: token,
    });
    expect(getMetadata).toHaveBeenCalledOnce();
    await storage.delete(object);
    expect(remove).toHaveBeenCalledWith({ ignoreNotFound: true, ifGenerationMatch: "42" });

    file.metadata = { generation: "43", contentType: "image/webp", metadata: { deliveryPhotoUploadAttempt: randomUUID() } };
    await expect(storage.save(
      path, Buffer.from("webp"), { width: 1, height: 1 }, token,
    )).rejects.toBeInstanceOf(DeliveryPhotoUploadOwnershipError);
    await expect(storage.save(path, Buffer.from("webp"), { width: 1, height: 1 }, randomUUID()))
      .rejects.toBeInstanceOf(DeliveryPhotoUploadOwnershipError);
  });
});

describe("delivery route and day persistence", () => {
  it("saves, audits, replays and revision-checks an own route", async () => {
    const state = fixture();
    const request = { requestId: randomUUID(), expectedRevision: null, customerIds: ["customer-a", "customer-b"] };
    const first = await state.service.saveRoute(request, actor, now);
    expect(first).toMatchObject({ employeeId: actor.employeeId, revision: 1, customerIds: request.customerIds });
    expect(await state.service.getRoute(actor)).toEqual(first);
    expect(await state.service.saveRoute(request, actor, now)).toEqual(first);
    expect([...state.data.keys()].filter((key) => key.startsWith("auditLogs/"))).toHaveLength(1);
    await expect(state.service.saveRoute({ ...request, requestId: randomUUID(), expectedRevision: null }, actor, now)).rejects.toBeInstanceOf(DeliveryPhotoRevisionConflict);
    await expect(state.service.saveRoute({ ...request, requestId: randomUUID(), expectedRevision: 1, customerIds: ["customer-closed"] }, actor, now)).rejects.toMatchObject({ code: "failed-precondition" });
    await expect(state.service.saveRoute({ ...request, customerIds: ["customer-b"] }, actor, now)).rejects.toBeInstanceOf(DeliveryPhotoRequestCollision);
    await state.service.saveRoute({ requestId: randomUUID(), expectedRevision: 1, customerIds: ["customer-b"] }, actor, now);
    expect(await state.service.saveRoute(request, actor, now)).toEqual(first);
    const empty = await state.service.saveRoute({ requestId: randomUUID(), expectedRevision: 2, customerIds: [] }, actor, now);
    expect(empty).toMatchObject({ revision: 3, customerIds: [] });
  });

  it("stores only a changed day override and clears it when it equals the route", async () => {
    const state = fixture();
    await state.service.saveRoute({ requestId: randomUUID(), expectedRevision: null, customerIds: ["customer-a", "customer-b"] }, actor, now);
    expect(await state.service.getDay(actor, now)).toMatchObject({ isOverride: false, revision: null, customerIds: ["customer-a", "customer-b"] });
    const request = { requestId: randomUUID(), expectedRevision: null, customerIds: ["customer-b"] };
    const changed = await state.service.saveDay(request, actor, now);
    expect(changed).toMatchObject({ isOverride: true, revision: 1, customerIds: ["customer-b"] });
    expect(await state.service.saveDay(request, actor, now)).toEqual(changed);
    await expect(state.service.saveDay({ ...request, customerIds: ["customer-a"] }, actor, now)).rejects.toBeInstanceOf(DeliveryPhotoRequestCollision);
    expect(await state.service.getDay(actor, now)).toEqual(changed);
    const cleared = await state.service.saveDay({ requestId: randomUUID(), expectedRevision: 1, customerIds: ["customer-a", "customer-b"] }, actor, now);
    expect(cleared).toMatchObject({ isOverride: false, revision: 2 });
    expect(state.data.get("companies/onnuri/deliveryPhotoDays/EMP-STAFF_2026-09-22")).toMatchObject({ hasOverride: false, revision: 2 });
    await expect(state.service.saveDay({ requestId: randomUUID(), expectedRevision: 1, customerIds: [] }, actor, now))
      .rejects.toBeInstanceOf(DeliveryPhotoRevisionConflict);
    const emptyOverride = await state.service.saveDay({ requestId: randomUUID(), expectedRevision: 2, customerIds: [] }, actor, now);
    expect(emptyOverride).toMatchObject({ isOverride: true, revision: 3, customerIds: [] });
  });
});

describe("private delivery photo lifecycle", () => {
  it.each([actor, sales, viewer, admin])("permits active $roleScopes role metadata/create access", async (member) => {
    const state = fixture();
    const created = await state.service.create(upload(randomUUID(), "customer-a"), member, now);
    expect(created.createdByEmployeeId).toBe(member.employeeId);
    expect((await state.service.list({ scope: "customer", customerId: "customer-a", limit: 10 }, member, now)).photos).toHaveLength(1);
  });

  it("creates server-owned objects/metadata, replays once, lists aggregates, and relays bytes", async () => {
    const state = fixture(); const request = upload();
    const created = await state.service.create(request, actor, now);
    const receipt = state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)!;
    const attemptToken = String(receipt.uploadAttemptToken);
    expect(created).toMatchObject({ customerId: "customer-a", deliveryDateKey: "2026-09-22", createdByName: "배송 담당" });
    expect(new Date(created.expiresAt).valueOf() - new Date(created.createdAt).valueOf()).toBe(168 * 60 * 60 * 1000);
    expect([...state.files.keys()].sort()).toEqual([
      deliveryPhotoPath("2026-09-22", created.photoId, attemptToken, "evidence"),
      deliveryPhotoPath("2026-09-22", created.photoId, attemptToken, "thumbnail"),
    ]);
    expect(await state.service.create(request, actor, now)).toEqual(created);
    expect([...state.data.keys()].filter((key) => key.startsWith("companies/onnuri/deliveryPhotos/"))).toHaveLength(1);
    expect([...state.data.keys()].filter((key) => key.startsWith("auditLogs/") && state.data.get(key)?.eventType === "DELIVERY_PHOTO_CREATED")).toHaveLength(1);
    const today = await state.service.list({ scope: "today" }, actor, now);
    expect(today).toMatchObject({ scope: "today", customers: [{ customerId: "customer-a", count: 1 }] });
    expect(JSON.stringify(today)).not.toMatch(/objectPath|generation|fileBase64/);
    const recent = await state.service.list({ scope: "customer", customerId: "customer-a", limit: 30 }, actor, now);
    expect(recent.photos).toHaveLength(1);
    expect((await state.service.list({ scope: "customer", customerId: "customer-a", limit: 30 }, sales, now)).photos).toHaveLength(1);
    const download = await state.service.get({ photoId: created.photoId, variant: "evidence" }, actor, now);
    expect(Buffer.from(download.fileBase64, "base64")).toEqual(state.files.get(deliveryPhotoPath("2026-09-22", created.photoId, attemptToken, "evidence"))!.bytes);
    expect(state.data.get("companies/onnuri/customers/customer-a")).toEqual({ customerId: "customer-a", companyId: "onnuri", status: "active", name: "가 거래처" });
    expect(JSON.stringify(state.data.get(`companies/onnuri/deliveryPhotos/${created.photoId}`))).not.toMatch(/completion|fileBase64|Buffer/);
  });

  it("preserves a complete photo when the metadata commit acknowledgement is lost", async () => {
    const state = fixture(); const request = upload();
    state.failCompleteCommitAck();
    const created = await state.service.create(request, actor, now);
    expect(state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)).toMatchObject({ state: "complete", photoId: created.photoId });
    expect(state.data.get(`companies/onnuri/deliveryPhotos/${created.photoId}`)).toMatchObject({ status: "active" });
    expect(state.files.size).toBe(2);
    expect(await state.service.create(request, actor, now)).toEqual(created);
    expect(state.files.size).toBe(2);
  });

  it("waits for every upload to settle before compensating a partial failure", async () => {
    const state = fixture(); const request = upload(); const evidence = deferred(); const thumbnailAttempted = deferred();
    state.failSave(async (path) => {
      if (path.endsWith("evidence.webp")) await evidence.promise;
      if (path.endsWith("thumbnail.webp")) {
        thumbnailAttempted.resolve();
        throw new Error("thumbnail failed");
      }
    });
    const operation = state.service.create(request, actor, now);
    let settled = false;
    void operation.then(() => { settled = true; }, () => { settled = true; });
    await thumbnailAttempted.promise;
    expect(settled).toBe(false);
    evidence.resolve();
    await expect(operation).rejects.toThrow("thumbnail failed");
    expect(state.files.size).toBe(0);
    expect(state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)).toMatchObject({
      state: "failed", deliveryDateKey: "2026-09-22",
      evidencePath: expect.stringContaining("/evidence.webp"), thumbnailPath: expect.stringContaining("/thumbnail.webp"),
    });
  });

  it("does not let a worker that lost its lease delete the new owner's objects", async () => {
    const state = fixture(); const request = upload(); const uploadsStarted = deferred(); const continueUploads = deferred();
    let attempts = 0;
    state.failSave(async () => {
      attempts += 1;
      if (attempts === 2) uploadsStarted.resolve();
      await continueUploads.promise;
    });
    const staleWorker = state.service.create(request, actor, now);
    await uploadsStarted.promise;
    const receipt = state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)!;
    receipt.leaseToken = "replacement-worker";
    receipt.leaseExpiresAt = Timestamp.fromMillis(now.toMillis() + 60_000);
    state.putFile(String(receipt.evidencePath));
    state.putFile(String(receipt.thumbnailPath));
    continueUploads.resolve();
    await expect(staleWorker).rejects.toThrow("precondition");
    expect(state.files.size).toBe(2);
    expect(receipt).toMatchObject({ state: "processing", leaseToken: "replacement-worker" });
  });

  it("rejects inactive customers and session revocation without publishing", async () => {
    const state = fixture();
    await expect(state.service.create(upload(randomUUID(), "customer-closed"), actor, now)).rejects.toMatchObject({ code: "failed-precondition" });
    await expect(state.service.create(upload(randomUUID(), "customer-missing"), actor, now)).rejects.toMatchObject({ code: "failed-precondition" });
    state.data.get(`authz/${actor.uid}`)!.active = false;
    await expect(state.service.create(upload(), actor, now)).rejects.toMatchObject({ code: "permission-denied" });
    expect(state.files.size).toBe(0);
  });

  it("compensates a partial Storage failure and permits the exact retry without another rate charge", async () => {
    const state = fixture(); const request = upload();
    state.failSave((path) => { if (path.endsWith("thumbnail.webp")) throw new Error("private storage detail"); });
    await expect(state.service.create(request, actor, now)).rejects.toThrow();
    expect(state.files.size).toBe(0);
    expect(state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)?.state).toBe("failed");
    expect(state.data.get(`deliveryPhotoUploadRates/${actor.uid}`)?.count).toBe(1);
    state.failSave();
    const created = await state.service.create(request, actor, now);
    expect(created.photoId).toBe(state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)?.photoId);
    expect(state.data.get(`deliveryPhotoUploadRates/${actor.uid}`)?.count).toBe(1);
  });

  it("serializes concurrent duplicate requests without duplicate photos", async () => {
    const state = fixture(); const request = upload();
    const settled = await Promise.allSettled([state.service.create(request, actor, now), state.service.create(request, actor, now)]);
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect([...state.data.keys()].filter((key) => key.startsWith("companies/onnuri/deliveryPhotos/"))).toHaveLength(1);
  });

  it("compensates Storage-success/metadata-failure and safely retries", async () => {
    const state = fixture(); const request = upload();
    state.failSave((path) => { if (path.endsWith("thumbnail.webp")) state.data.get(`authz/${actor.uid}`)!.active = false; });
    await expect(state.service.create(request, actor, now)).rejects.toMatchObject({ code: "permission-denied" });
    expect(state.files.size).toBe(0);
    expect([...state.data.keys()].filter((key) => key.startsWith("companies/onnuri/deliveryPhotos/"))).toHaveLength(0);
    state.data.get(`authz/${actor.uid}`)!.active = true;
    state.failSave();
    expect((await state.service.create(request, actor, now)).customerId).toBe("customer-a");
  });

  it("fences retry from concurrent orphan cleanup and recovers a stale processing lease", async () => {
    const state = fixture(); const request = upload();
    state.failSave((path) => { if (path.endsWith("thumbnail.webp")) throw new Error("seed failed operation"); });
    await expect(state.service.create(request, actor, now)).rejects.toThrow();
    state.failSave();
    const receipt = state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)!;
    receipt.state = "processing";
    receipt.leaseToken = "stale-worker";
    receipt.uploadAttemptToken = randomUUID();
    receipt.evidencePath = deliveryPhotoPath(String(receipt.deliveryDateKey), String(receipt.photoId), String(receipt.uploadAttemptToken), "evidence");
    receipt.thumbnailPath = deliveryPhotoPath(String(receipt.deliveryDateKey), String(receipt.photoId), String(receipt.uploadAttemptToken), "thumbnail");
    receipt.leaseExpiresAt = Timestamp.fromMillis(now.toMillis() - 120_001);
    receipt.recoveryUntil = now;
    const paths = [String(receipt.evidencePath), String(receipt.thumbnailPath)];
    paths.forEach((path) => state.putFile(path, String(receipt.uploadAttemptToken)));

    const enteredDelete = deferred(); const continueDelete = deferred(); let announced = false;
    state.failDelete(async () => {
      if (!announced) {
        announced = true;
        enteredDelete.resolve();
        await continueDelete.promise;
      }
    });
    const cleanup = state.service.expire(now);
    await enteredDelete.promise;
    expect(receipt.cleanupTargets).toHaveLength(2);
    await expect(state.service.create(request, actor, now)).rejects.toMatchObject({ code: "aborted" });
    continueDelete.resolve();
    expect(await cleanup).toMatchObject({ failures: 0 });
    expect(state.files.size).toBe(0);
    expect(receipt.state).toBe("failed");
    state.failDelete();
    const created = await state.service.create(request, actor, now);
    expect(state.files.size).toBe(2);
    expect(state.data.get(`companies/onnuri/deliveryPhotos/${created.photoId}`)).toMatchObject({ status: "active" });
  });

  it("Race G: prevents an expired cleanup owner from pinning retry generations", async () => {
    const state = fixture(); const request = upload();
    state.failSave((path) => { if (path.endsWith("thumbnail.webp")) throw new Error("seed failure"); });
    await expect(state.service.create(request, actor, now)).rejects.toThrow();
    state.failSave();
    const receipt = state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)!;
    receipt.state = "processing";
    receipt.leaseToken = "old-owner";
    receipt.uploadAttemptToken = randomUUID();
    receipt.evidencePath = deliveryPhotoPath(String(receipt.deliveryDateKey), String(receipt.photoId), String(receipt.uploadAttemptToken), "evidence");
    receipt.thumbnailPath = deliveryPhotoPath(String(receipt.deliveryDateKey), String(receipt.photoId), String(receipt.uploadAttemptToken), "thumbnail");
    receipt.leaseExpiresAt = Timestamp.fromMillis(now.toMillis() - 120_001);
    receipt.recoveryUntil = now;
    const paths = [String(receipt.evidencePath), String(receipt.thumbnailPath)];
    paths.forEach((path) => state.putFile(path, String(receipt.uploadAttemptToken)));

    const inspectEntered = deferred(); const continueInspect = deferred(); let paused = false;
    state.beforeInspect(async () => {
      if (paused) return;
      paused = true;
      inspectEntered.resolve();
      await continueInspect.promise;
    });
    const cleanupA = state.service.expire(now);
    await inspectEntered.promise;
    state.beforeInspect();

    const reclaimedAt = Timestamp.fromMillis(now.toMillis() + 5 * 60 * 1000 + 1);
    state.setClock(reclaimedAt);
    expect(await state.service.expire(reclaimedAt)).toMatchObject({ failures: 0 });
    expect(receipt.state).toBe("failed");
    const created = await state.service.create(request, actor, reclaimedAt);
    const active = state.data.get(`companies/onnuri/deliveryPhotos/${created.photoId}`)!;
    const retryGenerations = [active.evidence.generation, active.thumbnail.generation];
    expect([active.evidence.objectPath, active.thumbnail.objectPath]).not.toEqual(paths);

    continueInspect.resolve();
    expect(await cleanupA).toMatchObject({ failures: 0 });
    expect([active.evidence, active.thumbnail].map((object: { objectPath: string }) => state.files.get(object.objectPath)?.generation)).toEqual(retryGenerations);
    expect(state.data.get(`companies/onnuri/deliveryPhotos/${created.photoId}`)).toMatchObject({ status: "active" });
    expect(await state.service.create(request, actor, reclaimedAt)).toEqual(created);
  });

  it("Race H: removes an upload that completes after stale-processing recovery", async () => {
    const state = fixture(); const request = upload(); const evidenceRelease = deferred(); const thumbnailAttempted = deferred();
    state.failSave(async (path) => {
      if (path.endsWith("evidence.webp")) await evidenceRelease.promise;
      else {
        thumbnailAttempted.resolve();
        throw new Error("late thumbnail failure");
      }
    });
    const operation = state.service.create(request, actor, now);
    await thumbnailAttempted.promise;
    const schedulerAt = Timestamp.fromMillis(now.toMillis() + 5 * 60 * 1000 + 1);
    state.setClock(schedulerAt);
    expect(await state.service.expire(schedulerAt)).toMatchObject({ failures: 0 });
    expect(state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)).toMatchObject({ state: "cleaning" });

    evidenceRelease.resolve();
    await expect(operation).rejects.toThrow("late thumbnail failure");
    expect(state.files.size).toBe(0);

    const recoveryEnd = Timestamp.fromMillis(now.toMillis() + 2 * 60 * 60 * 1000 + 1);
    state.setClock(recoveryEnd);
    expect(await state.service.expire(recoveryEnd)).toMatchObject({ failures: 0 });
    expect(state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)).toMatchObject({ state: "failed" });
  });

  it("Race I: retries exact late-upload cleanup and preserves a different generation", async () => {
    const state = fixture(); const request = upload(); const uploadsStarted = deferred(); const uploadsRelease = deferred();
    let uploadAttempts = 0;
    state.failSave(async () => {
      uploadAttempts += 1;
      if (uploadAttempts === 2) uploadsStarted.resolve();
      await uploadsRelease.promise;
    });
    const operation = state.service.create(request, actor, now);
    await uploadsStarted.promise;
    const schedulerAt = Timestamp.fromMillis(now.toMillis() + 5 * 60 * 1000 + 1);
    state.setClock(schedulerAt);
    expect(await state.service.expire(schedulerAt)).toMatchObject({ failures: 0 });

    state.failDelete(() => { throw new Error("transient cleanup failure"); });
    uploadsRelease.resolve();
    await expect(operation).rejects.toMatchObject({ code: "aborted" });
    const receipt = state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)!;
    expect(receipt.orphanTargets).toHaveLength(2);

    const evidencePath = String(receipt.evidencePath);
    const staleGeneration = state.files.get(evidencePath)!.generation;
    state.files.delete(evidencePath);
    state.putFile(evidencePath, "unrelated-owner");
    const replacementGeneration = state.files.get(evidencePath)!.generation;
    expect(replacementGeneration).not.toBe(staleGeneration);
    state.failDelete();

    expect(await state.service.expire(schedulerAt)).toMatchObject({ failures: 0 });
    expect(state.files.get(evidencePath)?.generation).toBe(replacementGeneration);
    expect(state.files.size).toBe(1);
    expect(receipt).not.toHaveProperty("orphanTargets");
    expect(receipt).not.toHaveProperty("orphanCleanupAfter");
  });

  it("Race J: deletes only a pinned generation after cleanup ownership expires", async () => {
    const state = fixture(); const request = upload();
    state.failSave((path) => { if (path.endsWith("thumbnail.webp")) throw new Error("seed failure"); });
    await expect(state.service.create(request, actor, now)).rejects.toThrow();
    state.failSave();
    const receipt = state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)!;
    receipt.state = "processing";
    receipt.leaseToken = "old-owner";
    receipt.uploadAttemptToken = randomUUID();
    receipt.evidencePath = deliveryPhotoPath(String(receipt.deliveryDateKey), String(receipt.photoId), String(receipt.uploadAttemptToken), "evidence");
    receipt.thumbnailPath = deliveryPhotoPath(String(receipt.deliveryDateKey), String(receipt.photoId), String(receipt.uploadAttemptToken), "thumbnail");
    receipt.leaseExpiresAt = Timestamp.fromMillis(now.toMillis() - 120_001);
    receipt.recoveryUntil = now;
    const paths = [String(receipt.evidencePath), String(receipt.thumbnailPath)];
    paths.forEach((path) => state.putFile(path, String(receipt.uploadAttemptToken)));
    const oldGenerations = paths.map((path) => state.files.get(path)!.generation);

    const deleteEntered = deferred(); const continueDelete = deferred(); let paused = false;
    state.failDelete(async () => {
      if (paused) return;
      paused = true;
      deleteEntered.resolve();
      await continueDelete.promise;
    });
    const cleanupA = state.service.expire(now);
    await deleteEntered.promise;
    expect((receipt.cleanupTargets as Array<{ generation: string }>).map((target) => target.generation).sort()).toEqual([...oldGenerations].sort());

    const reclaimedAt = Timestamp.fromMillis(now.toMillis() + 5 * 60 * 1000 + 1);
    state.setClock(reclaimedAt);
    expect(await state.service.expire(reclaimedAt)).toMatchObject({ failures: 0 });
    state.failDelete();
    const created = await state.service.create(request, actor, reclaimedAt);
    const active = state.data.get(`companies/onnuri/deliveryPhotos/${created.photoId}`)!;
    const retryGenerations = [active.evidence.generation, active.thumbnail.generation];
    expect([active.evidence.objectPath, active.thumbnail.objectPath]).not.toEqual(paths);

    continueDelete.resolve();
    expect(await cleanupA).toMatchObject({ failures: 0 });
    expect([active.evidence, active.thumbnail].map((object: { objectPath: string }) => state.files.get(object.objectPath)?.generation)).toEqual(retryGenerations);
    expect(retryGenerations).not.toEqual(oldGenerations);
    expect(state.data.get(`companies/onnuri/deliveryPhotos/${created.photoId}`)).toMatchObject({ status: "active" });
  });

  it("Race K: keeps a delayed upload response bound to its own attempt generation", async () => {
    const state = fixture(); const request = upload();
    const oldUploadsReady = deferred(); const releaseOldResponses = deferred();
    let oldAttemptToken: string | undefined; let oldUploadCount = 0;
    const bucket = {
      file: (path: string) => {
        let responseMetadata: {
          generation?: string;
          contentType?: string;
          metadata?: Record<string, string>;
        } = {};
        return {
          get metadata() { return responseMetadata; },
          async save(bytes: Buffer, options: { metadata: { metadata: { deliveryPhotoUploadAttempt: string } }; preconditionOpts: { ifGenerationMatch: number } }) {
            expect(options.preconditionOpts).toEqual({ ifGenerationMatch: 0 });
            const token = options.metadata.metadata.deliveryPhotoUploadAttempt;
            oldAttemptToken ??= token;
            const owned = await state.storage.save(path, bytes, { width: 1, height: 1 }, token);
            responseMetadata = {
              generation: owned.generation, contentType: "image/webp",
              metadata: { deliveryPhotoUploadAttempt: token },
            };
            if (token === oldAttemptToken) {
              oldUploadCount += 1;
              if (oldUploadCount === 2) oldUploadsReady.resolve();
              await releaseOldResponses.promise;
            }
          },
          async getMetadata() {
            const current = await state.storage.inspect(path);
            if (!current) throw Object.assign(new Error("missing"), { code: 404 });
            return [{
              generation: current.generation, contentType: "image/webp",
              metadata: { deliveryPhotoUploadAttempt: current.uploadAttemptToken },
            }];
          },
          async delete(options: { ifGenerationMatch: string }) {
            await state.storage.delete({ objectPath: path, generation: String(options.ifGenerationMatch) });
          },
        };
      },
    };
    state.setStorage(new GoogleDeliveryPhotoStorage(bucket as never));

    const staleWorker = state.service.create(request, actor, now);
    await oldUploadsReady.promise;
    const receipt = state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)!;
    const oldGenerations = [...state.files.values()].map((file) => file.generation);
    const oldPaths = [String(receipt.evidencePath), String(receipt.thumbnailPath)];

    const recoveryEnd = Timestamp.fromMillis(now.toMillis() + 2 * 60 * 60 * 1000 + 1);
    state.setClock(recoveryEnd);
    expect(await state.service.expire(recoveryEnd)).toMatchObject({ failures: 0 });
    expect(state.files.size).toBe(0);
    const created = await state.service.create(request, actor, recoveryEnd);
    const newGenerations = [...state.files.values()].map((file) => file.generation);

    releaseOldResponses.resolve();
    expect(await staleWorker).toEqual(created);
    const photo = state.data.get(`companies/onnuri/deliveryPhotos/${created.photoId}`)!;
    expect(receipt.state).toBe("complete");
    expect(photo.status).toBe("active");
    expect(state.files.size).toBe(2);
    expect([photo.evidence.generation, photo.thumbnail.generation]).toEqual(newGenerations);
    expect([photo.evidence.objectPath, photo.thumbnail.objectPath]).not.toEqual(oldPaths);
    expect(photo.evidence.uploadAttemptToken).toBe(receipt.uploadAttemptToken);
    expect(photo.thumbnail.uploadAttemptToken).toBe(receipt.uploadAttemptToken);
    expect(newGenerations).not.toEqual(oldGenerations);
    expect(receipt.orphanTargets).toBeUndefined();

    receipt.orphanTargets = [photo.evidence, photo.thumbnail].map((object: { objectPath: string; generation: string }) => ({
      objectPath: object.objectPath,
      generation: object.generation,
      uploadAttemptToken: receipt.uploadAttemptToken,
    }));
    receipt.orphanCleanupAfter = recoveryEnd;
    expect(await state.service.expire(recoveryEnd)).toMatchObject({ failures: 0 });
    expect(state.files.size).toBe(2);
    expect(receipt.orphanTargets).toBeUndefined();
    expect(await state.service.create(request, actor, recoveryEnd)).toEqual(created);
  });

  it("Race L: keeps recovery active after a stale absence observation", async () => {
    const state = fixture(); const request = upload();
    const releaseUpload = deferred(); const thumbnailAttempted = deferred();
    const objectPublished = deferred(); const releaseWorker = deferred();
    state.failSave(async (path) => {
      if (path.endsWith("evidence.webp")) await releaseUpload.promise;
      else {
        thumbnailAttempted.resolve();
        throw new Error("thumbnail failed");
      }
    });
    state.afterSave(async (path) => {
      if (path.endsWith("evidence.webp")) {
        objectPublished.resolve();
        await releaseWorker.promise;
      }
    });
    const operation = state.service.create(request, actor, now);
    await thumbnailAttempted.promise;

    const absenceObserved = deferred(); const releaseObservation = deferred(); let reads = 0;
    state.afterInspect(async (_path, object) => {
      if (object !== null) return;
      reads += 1;
      if (reads === 2) absenceObserved.resolve();
      await releaseObservation.promise;
    });
    const firstSweepAt = Timestamp.fromMillis(now.toMillis() + 5 * 60 * 1000 + 1);
    state.setClock(firstSweepAt);
    const firstSweep = state.service.expire(firstSweepAt);
    await absenceObserved.promise;

    state.setClock(Timestamp.fromMillis(now.toMillis() + 6 * 60 * 1000));
    releaseUpload.resolve();
    await objectPublished.promise;
    state.afterInspect();
    releaseObservation.resolve();
    expect(await firstSweep).toMatchObject({ failures: 0 });
    const receipt = state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)!;
    expect(receipt.state).toBe("cleaning");
    expect(receipt.cleanupAfter).toBeInstanceOf(Timestamp);
    expect(state.files.size).toBe(1);

    const nextSweepAt = Timestamp.fromMillis(now.toMillis() + 66 * 60 * 1000);
    state.setClock(nextSweepAt);
    expect(await state.service.expire(nextSweepAt)).toMatchObject({ failures: 0 });
    expect(state.files.size).toBe(0);
    releaseWorker.resolve();
    await expect(operation).rejects.toThrow("thumbnail failed");
  });

  it("Race M: fresh-inspects before terminal recovery after an earlier absence", async () => {
    const state = fixture(); const request = upload();
    const releaseUpload = deferred(); const thumbnailAttempted = deferred();
    const objectPublished = deferred(); const releaseWorker = deferred();
    state.failSave(async (path) => {
      if (path.endsWith("evidence.webp")) await releaseUpload.promise;
      else {
        thumbnailAttempted.resolve();
        throw new Error("thumbnail failed");
      }
    });
    state.afterSave(async (path) => {
      if (path.endsWith("evidence.webp")) {
        objectPublished.resolve();
        await releaseWorker.promise;
      }
    });
    const operation = state.service.create(request, actor, now);
    await thumbnailAttempted.promise;

    const absenceObserved = deferred(); const releaseObservation = deferred(); let reads = 0;
    state.afterInspect(async (_path, object) => {
      if (object !== null) return;
      reads += 1;
      if (reads === 2) absenceObserved.resolve();
      await releaseObservation.promise;
    });
    const beforeRecoveryEnd = Timestamp.fromMillis(now.toMillis() + 119 * 60 * 1000);
    state.setClock(beforeRecoveryEnd);
    const finalSweep = state.service.expire(beforeRecoveryEnd);
    await absenceObserved.promise;

    state.setClock(Timestamp.fromMillis(now.toMillis() + 119 * 60 * 1000 + 30_000));
    releaseUpload.resolve();
    await objectPublished.promise;
    state.afterInspect();
    state.setClock(Timestamp.fromMillis(now.toMillis() + 2 * 60 * 60 * 1000 + 1));
    releaseObservation.resolve();
    expect(await finalSweep).toMatchObject({ failures: 0 });
    const receipt = state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)!;
    expect(state.files.size).toBe(0);
    expect(receipt.state).toBe("failed");
    expect(receipt.cleanupAfter).toBeUndefined();
    releaseWorker.resolve();
    await expect(operation).rejects.toThrow("thumbnail failed");
  });

  it("Race N: refuses to replace an orphan target with another attempt's object", async () => {
    const state = fixture(); const request = upload();
    state.failSave((path) => { if (path.endsWith("thumbnail.webp")) throw new Error("seed failure"); });
    await expect(state.service.create(request, actor, now)).rejects.toThrow();
    state.failSave();
    const receipt = state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)!;
    const objectPath = String(receipt.evidencePath);
    const attemptA = String(receipt.uploadAttemptToken);
    const attemptB = randomUUID();
    state.putFile(objectPath, attemptA);
    const generationA = state.files.get(objectPath)!.generation;
    state.files.delete(objectPath);
    state.putFile(objectPath, attemptB);
    const generationB = state.files.get(objectPath)!.generation;
    receipt.orphanTargets = [{ objectPath, generation: generationA, uploadAttemptToken: attemptA }];
    receipt.orphanCleanupAfter = now;
    let deleteAttempts = 0;
    state.failDelete(() => { deleteAttempts += 1; });

    expect(await state.service.expire(now)).toMatchObject({ failures: 0 });
    expect(state.files.get(objectPath)?.generation).toBe(generationB);
    expect(state.files.get(objectPath)?.uploadAttemptToken).toBe(attemptB);
    expect(deleteAttempts).toBe(0);
    expect(receipt.orphanTargets).toBeUndefined();
    expect(receipt.orphanCleanupAfter).toBeUndefined();
  });

  it("Race O: an upload published after terminal recovery cannot affect the winning attempt", async () => {
    const { state, request, winner, receipt, photo, stalePaths } = await staleAttemptsBeforeWinner(1);
    const winningPaths = [photo.evidence.objectPath, photo.thumbnail.objectPath];
    expect(receipt).toMatchObject({ state: "complete", photoId: winner.photoId });
    expect(photo).toMatchObject({ status: "active" });
    expect(stalePaths[0]).not.toBe(winningPaths[0]);
    expect(state.files.size).toBe(3);
    expect(winningPaths.every((path: string) => state.files.has(path))).toBe(true);
    expect(stalePaths.every((path) => isDeliveryPhotoManagedPath(path))).toBe(true);
    expect([...state.files.keys()].every(isDeliveryPhotoManagedPath)).toBe(true);
    expect([photo.evidence, photo.thumbnail].every((object: { objectPath: string; generation: string; uploadAttemptToken: string }) =>
      state.files.get(object.objectPath)?.generation === object.generation
      && state.files.get(object.objectPath)?.uploadAttemptToken === object.uploadAttemptToken)).toBe(true);
    expect(state.data.get(`companies/onnuri/deliveryPhotos/${winner.photoId}`)!.evidence.objectPath).not.toBe(stalePaths[0]);
    expect(await state.service.create(request, actor, stateTime(1))).toEqual(winner);
  });

  it("Race P: multiple late attempts stay invisible and cannot overwrite the winning photo", async () => {
    const { state, winner, winningAt, receipt, photo, stalePaths } = await staleAttemptsBeforeWinner(2);
    const winningPaths = [photo.evidence.objectPath, photo.thumbnail.objectPath];
    expect(new Set([...stalePaths, ...winningPaths]).size).toBe(4);
    expect(state.files.size).toBe(4);
    expect(stalePaths.every((path) => isDeliveryPhotoManagedPath(path))).toBe(true);
    expect(receipt.state).toBe("complete");
    expect(photo.status).toBe("active");
    expect(winningPaths.every((path: string) => state.files.has(path))).toBe(true);
    expect([photo.evidence, photo.thumbnail].every((object: { objectPath: string; generation: string; uploadAttemptToken: string }) =>
      state.files.get(object.objectPath)?.generation === object.generation
      && state.files.get(object.objectPath)?.uploadAttemptToken === object.uploadAttemptToken)).toBe(true);
    const listed = await state.service.list({ scope: "customer", customerId: "customer-a", limit: 30 }, actor, winningAt);
    expect(listed.photos.map((item) => item.photoId)).toEqual([winner.photoId]);
    expect((await state.service.get({ photoId: winner.photoId, variant: "evidence" }, actor, winningAt, () => winningAt)).photoId).toBe(winner.photoId);
  });

  it("Race Q: deleting the winner removes only its attempt objects", async () => {
    const { state, winner, winningAt, photo, stalePaths } = await staleAttemptsBeforeWinner(2);
    const winningPaths = [photo.evidence.objectPath, photo.thumbnail.objectPath];
    await state.service.delete({ requestId: randomUUID(), photoId: winner.photoId }, actor, winningAt);
    expect(winningPaths.every((path: string) => !state.files.has(path))).toBe(true);
    expect(stalePaths.every((path) => state.files.has(path) && isDeliveryPhotoManagedPath(path))).toBe(true);
    expect(state.files.size).toBe(2);
    expect((await state.service.list({ scope: "customer", customerId: "customer-a", limit: 30 }, actor, winningAt)).photos).toHaveLength(0);
    await expect(state.service.get({ photoId: winner.photoId, variant: "evidence" }, actor, winningAt)).rejects.toMatchObject({ code: "not-found" });
  });

  it("persists and later cleans an old attempt's exact targets after a newer attempt wins", async () => {
    const state = fixture(); const request = upload();
    const started = deferred(); const release = deferred(); let uploads = 0;
    state.failSave(async () => { if (++uploads === 2) started.resolve(); await release.promise; });
    const staleWorker = state.service.create(request, actor, now);
    await started.promise;
    const receipt = state.data.get(`requestLocks/delivery-photo-create-${request.requestId}`)!;
    const oldPaths = [String(receipt.evidencePath), String(receipt.thumbnailPath)];
    const retryAt = stateTime(1);
    state.setClock(retryAt);
    expect(await state.service.expire(retryAt)).toMatchObject({ failures: 0 });
    expect(receipt.state).toBe("failed");
    state.failSave();
    const winner = await state.service.create(request, actor, retryAt);
    const photo = state.data.get(`companies/onnuri/deliveryPhotos/${winner.photoId}`)!;
    state.failDelete((path) => { if (oldPaths.includes(path)) throw new Error("transient stale cleanup failure"); });
    release.resolve();
    expect(await staleWorker).toEqual(winner);
    expect(receipt.orphanTargets).toHaveLength(2);
    expect((receipt.orphanTargets as Array<{ objectPath: string }>).map((target) => target.objectPath).sort()).toEqual(oldPaths.sort());
    expect(state.files.size).toBe(4);
    state.failDelete();
    expect(await state.service.expire(retryAt)).toMatchObject({ failures: 0 });
    expect(receipt.orphanTargets).toBeUndefined();
    expect(state.files.size).toBe(2);
    expect([photo.evidence, photo.thumbnail].every((object: { objectPath: string; generation: string }) =>
      state.files.get(object.objectPath)?.generation === object.generation)).toBe(true);
  });

  it("does not delete a replacement generation through a stale cleanup descriptor", async () => {
    const state = fixture(); const created = await state.service.create(upload(), actor, now);
    const evidencePath = String(state.data.get(`companies/onnuri/deliveryPhotos/${created.photoId}`)!.evidence.objectPath);
    state.data.get(`companies/onnuri/deliveryPhotos/${created.photoId}`)!.expiresAt = Timestamp.fromMillis(0);
    state.replaceDuringNextDelete(evidencePath);
    expect(await state.service.expire(now)).toEqual({ removed: 0, failures: 1 });
    expect(state.files.get(evidencePath)?.bytes.toString()).toBe("replacement");
    expect(state.data.has(`companies/onnuri/deliveryPhotos/${created.photoId}`)).toBe(true);
  });

  it("keeps retained photos accessible after the customer becomes inactive", async () => {
    const state = fixture(); const created = await state.service.create(upload(), actor, now);
    state.data.get("companies/onnuri/customers/customer-a")!.status = "closed";
    expect((await state.service.list({ scope: "customer", customerId: "customer-a", limit: 10 }, viewer, now)).photos).toHaveLength(1);
    expect((await state.service.get({ photoId: created.photoId, variant: "thumbnail" }, actor, now)).photoId).toBe(created.photoId);
    expect((await state.service.delete({ requestId: randomUUID(), photoId: created.photoId }, actor, now)).photoId).toBe(created.photoId);
  });

  it("uses the exact retention window for recent photos and rechecks expiry after download", async () => {
    const state = fixture();
    const recentAt = Timestamp.fromMillis(now.toMillis() - 167 * 60 * 60 * 1000);
    const oldAt = Timestamp.fromMillis(now.toMillis() - 169 * 60 * 60 * 1000);
    state.setClock(recentAt);
    const recent = await state.service.create(upload(), actor, recentAt);
    state.setClock(oldAt);
    await state.service.create(upload(), actor, oldAt);
    state.setClock(now);
    expect((await state.service.list({ scope: "customer", customerId: "customer-a", limit: 10 }, actor, now)).photos.map((photo) => photo.photoId)).toEqual([recent.photoId]);
    await expect(state.service.get(
      { photoId: recent.photoId, variant: "evidence" }, actor, recentAt,
      () => Timestamp.fromMillis(recentAt.toMillis() + 168 * 60 * 60 * 1000),
    )).rejects.toMatchObject({ code: "not-found" });
  });

  it.each([101, 160, 500])("returns a bounded today aggregate for %i distinct customers", async (count) => {
    const state = fixture(); const seed = await state.service.create(upload(), actor, now);
    const original = state.data.get(`companies/onnuri/deliveryPhotos/${seed.photoId}`)!;
    state.data.delete(`companies/onnuri/deliveryPhotos/${seed.photoId}`);
    for (let index = 0; index < count; index += 1) {
      const photoId = randomUUID();
      const token = original.evidence.uploadAttemptToken;
      state.data.set(`companies/onnuri/deliveryPhotos/${photoId}`, {
        ...original, photoId, customerId: `customer-${index}`,
        evidence: { ...original.evidence, objectPath: deliveryPhotoPath("2026-09-22", photoId, token, "evidence") },
        thumbnail: { ...original.thumbnail, objectPath: deliveryPhotoPath("2026-09-22", photoId, token, "thumbnail") },
      });
    }
    const result = await state.service.list({ scope: "today" }, actor, now);
    expect(result.photos).toHaveLength(count);
    expect(result.customers).toHaveLength(count);
    expect(result.truncated).toBe(false);
    expect(result.customers.every((customer) => customer.count === 1)).toBe(true);
  });

  it.each([501, 650])("marks a bounded today aggregate as truncated for %i records", async (count) => {
    const state = fixture(); const seed = await state.service.create(upload(), actor, now);
    const original = state.data.get(`companies/onnuri/deliveryPhotos/${seed.photoId}`)!;
    state.data.delete(`companies/onnuri/deliveryPhotos/${seed.photoId}`);
    for (let index = 0; index < count; index += 1) {
      const photoId = randomUUID();
      const token = original.evidence.uploadAttemptToken;
      state.data.set(`companies/onnuri/deliveryPhotos/${photoId}`, {
        ...original, photoId, customerId: `customer-${index}`,
        evidence: { ...original.evidence, objectPath: deliveryPhotoPath("2026-09-22", photoId, token, "evidence") },
        thumbnail: { ...original.thumbnail, objectPath: deliveryPhotoPath("2026-09-22", photoId, token, "thumbnail") },
      });
    }
    const result = await state.service.list({ scope: "today" }, actor, now);
    expect(result.photos).toHaveLength(500);
    expect(result.customers).toHaveLength(500);
    expect(result.truncated).toBe(true);
  });

  it("allows same-day owner delete, blocks late/non-owner delete, and permits verified admin in retention", async () => {
    const state = fixture(); const own = await state.service.create(upload(), actor, now);
    const late = Timestamp.fromDate(new Date("2026-09-23T00:00:00.000Z"));
    await expect(state.service.delete({ requestId: randomUUID(), photoId: own.photoId }, actor, late)).rejects.toMatchObject({ code: "permission-denied" });
    const deleted = await state.service.delete({ requestId: randomUUID(), photoId: own.photoId }, admin, late);
    expect(deleted.photoId).toBe(own.photoId);
    expect(state.files.size).toBe(0);
    expect((await state.service.list({ scope: "today" }, actor, now)).photos).toHaveLength(0);

    const second = await state.service.create(upload(), actor, now);
    await expect(state.service.delete({ requestId: randomUUID(), photoId: second.photoId }, sales, now)).rejects.toMatchObject({ code: "permission-denied" });
    state.files.delete(String(state.data.get(`companies/onnuri/deliveryPhotos/${second.photoId}`)!.thumbnail.objectPath));
    const requestId = randomUUID();
    const firstDelete = await state.service.delete({ requestId, photoId: second.photoId }, actor, now);
    expect(await state.service.delete({ requestId, photoId: second.photoId }, actor, now)).toEqual(firstDelete);
    expect([...state.data.values()].some((value) => value.eventType === "DELIVERY_PHOTO_DELETED" && value.targetId === second.photoId)).toBe(true);
  });

  it("marks a failed user deletion for prompt scheduler cleanup", async () => {
    const state = fixture(); const created = await state.service.create(upload(), actor, now);
    state.failDelete((path) => { if (path.endsWith("evidence.webp")) throw new Error("temporary delete failure"); });
    await state.service.delete({ requestId: randomUUID(), photoId: created.photoId }, actor, now);
    expect(state.data.get(`companies/onnuri/deliveryPhotos/${created.photoId}`)).toMatchObject({ status: "deleted", cleanupAfter: now });
    expect(state.files.size).toBe(1);
    state.failDelete();
    expect(await state.service.expire(now)).toMatchObject({ failures: 0 });
    expect(state.files.size).toBe(0);
    expect(state.data.get(`companies/onnuri/deliveryPhotos/${created.photoId}`)).not.toHaveProperty("cleanupAfter");
  });

  it("expires bounded records, tolerates missing objects, and isolates deletion failures", async () => {
    const state = fixture(); const first = await state.service.create(upload(), actor, now); const second = await state.service.create(upload(), actor, now);
    for (const id of [first.photoId, second.photoId]) state.data.get(`companies/onnuri/deliveryPhotos/${id}`)!.expiresAt = Timestamp.fromMillis(0);
    state.files.delete(String(state.data.get(`companies/onnuri/deliveryPhotos/${first.photoId}`)!.evidence.objectPath));
    state.failDelete((path) => { if (path.includes(second.photoId)) throw new Error("retry"); });
    const result = await state.service.expire(now, 100);
    expect(result).toEqual({ removed: 1, failures: 1 });
    expect(state.data.has(`companies/onnuri/deliveryPhotos/${first.photoId}`)).toBe(false);
    expect(state.data.has(`companies/onnuri/deliveryPhotos/${second.photoId}`)).toBe(true);
  });

  it("preserves nonexpired photos and makes overlapping cleanup idempotent", async () => {
    const state = fixture();
    const expired = await state.service.create(upload(), actor, now);
    const retained = await state.service.create(upload(), actor, Timestamp.fromMillis(now.toMillis() + 48 * 60 * 60 * 1000));
    state.data.get(`companies/onnuri/deliveryPhotos/${expired.photoId}`)!.expiresAt = now;
    expect((await state.service.list({ scope: "customer", customerId: "customer-a", limit: 30 }, actor, now)).photos.map((photo) => photo.photoId)).not.toContain(expired.photoId);
    const results = await Promise.all([state.service.expire(now), state.service.expire(now)]);
    expect(results.reduce((sum, result) => sum + result.removed, 0)).toBe(1);
    expect((await state.service.expire(now)).removed).toBe(0);
    expect(state.data.has(`companies/onnuri/deliveryPhotos/${retained.photoId}`)).toBe(true);
    expect([...state.data.values()].filter((value) => value.eventType === "DELIVERY_PHOTO_EXPIRED" && value.targetId === expired.photoId)).toHaveLength(1);
  });
});
