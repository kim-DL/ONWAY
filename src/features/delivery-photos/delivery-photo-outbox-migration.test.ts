import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { openDB, type IDBPDatabase } from "idb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PhotoOutboxRecord, PhotoOutboxStore } from "./delivery-photo-outbox";

const databaseName = "onnuriway:private:delivery-photo-outbox:v1";
const owner = "verified-photo-session";
const scope = { owner, token: "original-session-token" };
const now = Date.parse("2026-11-04T01:00:00Z");
let store: PhotoOutboxStore | undefined;
let connection: IDBPDatabase | undefined;

function photo(id: string, prepared = false): PhotoOutboxRecord {
  const source = new File([`source-${id}`], `${id}.jpg`, { type: "image/jpeg" });
  return { version: 1, owner, source: prepared ? null : source,
    prepared: prepared ? { blob: new Blob([`prepared-${id}`], { type: "image/webp" }),
      preview: new Blob([`preview-${id}`], { type: "image/jpeg" }), contentType: "image/webp", width: 1200, height: 900 } : null,
    confirmed: null, approvedDay: "2026-11-04", lease: null,
    job: { jobId: id, requestId: `request-${id}`, customerId: id, source: "camera", status: prepared ? "queued" : "preparing",
      errorCategory: null, message: "", startedAt: now, updatedAt: now, attempts: 0, durable: true } };
}

async function seedVersionOne(records: PhotoOutboxRecord[]) {
  const legacy = await openDB(databaseName, 1, { upgrade(database) { database.createObjectStore("jobs"); database.createObjectStore("scope"); } });
  const transaction = legacy.transaction(["jobs", "scope"], "readwrite");
  await transaction.objectStore("scope").put(scope, "current");
  for (const record of records) await transaction.objectStore("jobs").add(record, record.job.jobId);
  await transaction.done;
  return legacy;
}

async function upgrade() {
  store = (await import("./delivery-photo-outbox")).deliveryPhotoOutbox;
  expect(await store.activate(owner)).toEqual(scope);
  connection = await openDB(databaseName, 2);
  return { store, database: connection };
}

beforeEach(() => { vi.resetModules(); vi.stubGlobal("indexedDB", new IDBFactory()); });
afterEach(async () => {
  vi.restoreAllMocks();
  await store?.clear(); connection?.close();
  store = undefined; connection = undefined; vi.unstubAllGlobals();
});

describe("photo outbox upgrade and immutable payloads", () => {
  it("upgrades version one without rewriting either raw or prepared photo bytes", async () => {
    const legacy = await seedVersionOne([photo("raw"), photo("ready", true)]);
    const versionChange = vi.fn(() => legacy.close()); legacy.addEventListener("versionchange", versionChange);
    const { store, database } = await upgrade();
    expect(versionChange).toHaveBeenCalledOnce();
    expect(database.version).toBe(2);
    expect([...database.objectStoreNames]).toEqual(["jobs", "prepared", "scope", "states"]);
    const records = await store.list(scope);
    expect(records.map((record) => record.job.requestId)).toEqual(["request-raw", "request-ready"]);
    expect(await records[0]!.source?.text()).toBe("source-raw");
    expect(await records[1]!.prepared?.blob.text()).toBe("prepared-ready");
    expect(await records[1]!.prepared?.preview?.text()).toBe("preview-ready");
    expect(await database.count("states")).toBe(0); expect(await database.count("prepared")).toBe(0);
    await expect(openDB(databaseName, 1)).rejects.toMatchObject({ name: "VersionError" });
  });

  it("keeps legacy payload rows unchanged while claims and retry state change", async () => {
    const legacy = await seedVersionOne([photo("raw"), photo("ready", true)]); legacy.close();
    const { store, database } = await upgrade();
    for (const [id, stage] of [["raw", "prepare"], ["ready", "upload"]] as const) {
      const claimed = (await store.claim(scope, id, "worker", stage, now))!;
      await store.save(scope, { ...claimed, lease: null,
        job: { ...claimed.job, status: "failed", errorCategory: "retryable", attempts: 2, retryAt: now + 2000 } }, "worker");
      const restored = (await store.list(scope)).find((record) => record.job.jobId === id)!;
      expect(restored.job).toMatchObject({ status: "failed", attempts: 2, retryAt: now + 2000 });
      expect(restored.lease).toBeNull();
      const original = await database.get("jobs", id) as PhotoOutboxRecord;
      expect(original.lease).toBeNull(); expect(original.job.attempts).toBe(0);
      expect(original.job.status).toBe(id === "raw" ? "preparing" : "queued");
      expect(await (id === "raw" ? original.source : original.prepared?.blob)?.text()).toBe(`${id === "raw" ? "source" : "prepared"}-${id}`);
    }
    expect(await database.count("prepared")).toBe(0);
  });

  it.each(["prepared", "jobs"] as const)("keeps the raw source and lease atomic when writing %s fails", async (failedStore) => {
    const legacy = await seedVersionOne([photo("raw")]); legacy.close();
    const { store, database } = await upgrade();
    const claimed = (await store.claim(scope, "raw", "worker", "prepare", now))!;
    const prepared = photo("raw", true).prepared!;
    const next: PhotoOutboxRecord = { ...claimed, source: null, prepared, lease: null, job: { ...claimed.job, status: "queued" } };
    const operation = failedStore === "prepared" ? "add" : "put";
    const write = IDBObjectStore.prototype[operation];
    const denied = vi.spyOn(IDBObjectStore.prototype, operation).mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === failedStore) throw new DOMException("Fixture storage full", "QuotaExceededError");
      return write.call(this, value, key);
    });
    await expect(store.save(scope, next, "worker")).rejects.toMatchObject({ name: "QuotaExceededError" });
    denied.mockRestore();
    const retained = (await store.list(scope))[0]!;
    expect(await retained.source?.text()).toBe("source-raw"); expect(retained.prepared).toBeNull();
    expect(retained.lease).toEqual(claimed.lease); expect(retained.job).toEqual(claimed.job);
    expect(await database.count("prepared")).toBe(0);
    await store.save(scope, next, "worker");
    expect(await (await store.list(scope))[0]!.prepared?.blob.text()).toBe("prepared-raw");
    const original = await database.get("jobs", "raw") as PhotoOutboxRecord;
    expect(original.source).toBeNull(); expect(original.prepared).toBeNull();
    expect(await database.count("prepared")).toBe(1);
  });

  it("retries prepared bytes without rewriting them and releases every payload after confirmation", async () => {
    const legacy = await seedVersionOne([photo("raw")]); legacy.close();
    const { store, database } = await upgrade();
    const initial = (await store.claim(scope, "raw", "worker", "prepare", now))!;
    await store.save(scope, { ...initial, source: null, prepared: photo("raw", true).prepared, lease: null,
      job: { ...initial.job, status: "queued" } }, "worker");
    const payloadWrites: string[] = [];
    const put = IDBObjectStore.prototype.put;
    const observeWrites = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === "jobs" || this.name === "prepared") payloadWrites.push(this.name);
      return put.call(this, value, key);
    });
    const claimed = (await store.claim(scope, "raw", "worker", "upload", now))!;
    const storedPayload = await database.get("prepared", "raw");
    await store.save(scope, { ...claimed, job: { ...claimed.job, status: "uploading", attempts: 1 } }, "worker");
    expect(await database.get("prepared", "raw")).toEqual(storedPayload);
    expect(payloadWrites).toEqual([]); observeWrites.mockRestore();
    const metadata = { photoId: "server-photo", customerId: "raw", source: "camera" as const, deliveryDateKey: "2026-11-04",
      createdAt: "2026-11-04T01:00:00Z", expiresAt: "2026-11-11T01:00:00Z", createdByEmployeeId: "fixture", createdByName: "합성 직원",
      thumbnail: { width: 160, height: 120 } };
    await store.save(scope, { ...claimed, source: null, prepared: null, confirmed: metadata, lease: null,
      job: { ...claimed.job, status: "completed" } }, "worker");
    expect((await store.list(scope))[0]).toMatchObject({ source: null, prepared: null, confirmed: metadata });
    expect(await database.count("states")).toBe(0); expect(await database.count("prepared")).toBe(0);
    await store.remove(scope, "raw"); expect(await database.count("jobs")).toBe(0);
  });

  it.each(["remove", "clear", "owner"] as const)("cleans every store atomically on %s", async (action) => {
    const legacy = await seedVersionOne([photo("raw")]); legacy.close();
    const { store, database } = await upgrade();
    const claimed = (await store.claim(scope, "raw", "worker", "prepare", now))!;
    await store.save(scope, { ...claimed, source: null, prepared: photo("raw", true).prepared, lease: null,
      job: { ...claimed.job, status: "queued" } }, "worker");
    expect(await database.count("prepared")).toBe(1);
    if (action === "remove") await store.remove(scope, "raw");
    else if (action === "clear") await store.clear(scope);
    else await store.activate("another-session");
    expect(await database.count("jobs")).toBe(0);
    expect(await database.count("states")).toBe(0); expect(await database.count("prepared")).toBe(0);
    if (action !== "remove") await expect(store.add(scope, photo("late"))).rejects.toMatchObject({ code: "delivery-photo/outbox-session" });
  });
});
