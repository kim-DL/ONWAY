import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { PreparedDeliveryPhoto } from "./delivery-photo-preparation";
import { MAX_PENDING_PHOTOS_PER_CUSTOMER, MAX_PENDING_PHOTOS_TOTAL, type DeliveryPhotoUploadProjection } from "./delivery-photo-upload-state";
import { MAX_PENDING_PHOTO_BYTES, outboxBytes } from "./delivery-photo-outbox-size";
export { MAX_PENDING_PHOTO_BYTES, outboxBytes } from "./delivery-photo-outbox-size";

export const DELIVERY_PHOTO_OUTBOX_DATABASE = "onnuriway:private:delivery-photo-outbox:v1";
const LEASE_MS = 180_000;
export type OutboxScope = { owner: string; token: string };
export type PhotoOutboxRecord = {
  version: 1;
  owner: string;
  job: DeliveryPhotoUploadProjection;
  source: File | null;
  prepared: PreparedDeliveryPhoto | null;
  confirmed: DeliveryPhotoMetadata | null;
  approvedDay: string;
  lease: { worker: string; stage: "prepare" | "upload"; until: number } | null;
};
export interface PhotoOutboxStore {
  activate(owner: string): Promise<OutboxScope>;
  list(scope: OutboxScope): Promise<PhotoOutboxRecord[]>;
  add(scope: OutboxScope, record: PhotoOutboxRecord): Promise<void>;
  save(scope: OutboxScope, record: PhotoOutboxRecord, worker?: string): Promise<void>;
  claim(scope: OutboxScope, id: string, worker: string, stage: "prepare" | "upload", now: number, liveWorkers?: readonly string[]): Promise<PhotoOutboxRecord | null>;
  remove(scope: OutboxScope, id: string, worker?: string): Promise<void>;
  clear(scope?: OutboxScope): Promise<void>;
}

interface OutboxDatabase extends DBSchema {
  jobs: { key: string; value: PhotoOutboxRecord };
  scope: { key: string; value: OutboxScope };
}
let database: Promise<IDBPDatabase<OutboxDatabase>> | undefined;
function db() {
  if (!database) {
    database = openDB<OutboxDatabase>(DELIVERY_PHOTO_OUTBOX_DATABASE, 1, {
      upgrade(database) { database.createObjectStore("jobs"); database.createObjectStore("scope"); },
      blocking() { void database?.then((value) => value.close()); database = undefined; },
      terminated() { database = undefined; },
    }).catch((error: unknown) => { database = undefined; throw error; });
  }
  return database;
}
export function assertOutboxCapacity(records: PhotoOutboxRecord[], record: PhotoOutboxRecord) {
  const pending = records.filter((item) => item.job.status !== "completed" && item.job.jobId !== record.job.jobId);
  if (pending.length >= MAX_PENDING_PHOTOS_TOTAL
    || pending.filter((item) => item.job.customerId === record.job.customerId).length >= MAX_PENDING_PHOTOS_PER_CUSTOMER
    || pending.reduce((sum, item) => sum + outboxBytes(item), 0) + outboxBytes(record) > MAX_PENDING_PHOTO_BYTES) {
    throw Object.assign(new Error("Photo outbox capacity exceeded"), { code: "delivery-photo/outbox-full" });
  }
}
function assertScope(current: OutboxScope | undefined, expected: OutboxScope) {
  if (current?.owner !== expected.owner || current.token !== expected.token) {
    throw Object.assign(new Error("Photo outbox session changed"), { code: "delivery-photo/outbox-session" });
  }
}

export const deliveryPhotoOutbox: PhotoOutboxStore = {
  async activate(owner) {
    const transaction = (await db()).transaction(["scope", "jobs"], "readwrite");
    let scope = await transaction.objectStore("scope").get("current");
    if (scope?.owner !== owner) {
      scope = { owner, token: crypto.randomUUID() };
      await transaction.objectStore("jobs").clear();
      await transaction.objectStore("scope").put(scope, "current");
    }
    await transaction.done;
    return scope;
  },
  async list(scope) {
    const transaction = (await db()).transaction(["scope", "jobs"]);
    assertScope(await transaction.objectStore("scope").get("current"), scope);
    const records = await transaction.objectStore("jobs").getAll();
    await transaction.done;
    return records.filter((record) => record.version === 1 && record.owner === scope.owner);
  },
  async add(scope, record) {
    const transaction = (await db()).transaction(["scope", "jobs"], "readwrite");
    try {
      assertScope(await transaction.objectStore("scope").get("current"), scope);
      const jobs = transaction.objectStore("jobs");
      assertOutboxCapacity(await jobs.getAll(), record);
      await jobs.add(record, record.job.jobId);
      await transaction.done;
    } catch (error) { try { transaction.abort(); } catch { /* Already aborted by the browser. */ } await transaction.done.catch(() => undefined); throw error; }
  },
  async save(scope, record, worker) {
    const transaction = (await db()).transaction(["scope", "jobs"], "readwrite");
    try {
      assertScope(await transaction.objectStore("scope").get("current"), scope);
      const jobs = transaction.objectStore("jobs");
      const current = await jobs.get(record.job.jobId);
      if (!current || current.owner !== scope.owner || (worker ? current.lease?.worker !== worker : !!current.lease)) {
        throw new Error("Photo outbox ownership changed");
      }
      if (record.job.status !== "completed") assertOutboxCapacity(await jobs.getAll(), record);
      await jobs.put(record, record.job.jobId);
      await transaction.done;
    } catch (error) { try { transaction.abort(); } catch { /* Already aborted by the browser. */ } await transaction.done.catch(() => undefined); throw error; }
  },
  async claim(scope, id, worker, stage, now, liveWorkers) {
    const transaction = (await db()).transaction(["scope", "jobs"], "readwrite");
    try {
      assertScope(await transaction.objectStore("scope").get("current"), scope);
      const jobs = transaction.objectStore("jobs");
      const records = await jobs.getAll();
      const record = records.find((item) => item.job.jobId === id);
      const alive = (lease: NonNullable<PhotoOutboxRecord["lease"]>) => lease.until > now && (!liveWorkers || liveWorkers.includes(lease.worker));
      const active = records.filter((item) => item.job.jobId !== id && item.lease?.stage === stage && alive(item.lease));
      if (!record || record.job.status === "completed" || record.lease && record.lease.worker !== worker && alive(record.lease)
        || active.length >= (stage === "prepare" ? 1 : 2)) { await transaction.done; return null; }
      record.lease = { worker, stage, until: now + LEASE_MS };
      await jobs.put(record, id); await transaction.done;
      return record;
    } catch (error) { try { transaction.abort(); } catch { /* Already aborted by the browser. */ } await transaction.done.catch(() => undefined); throw error; }
  },
  async remove(scope, id, worker) {
    const transaction = (await db()).transaction(["scope", "jobs"], "readwrite");
    try {
      assertScope(await transaction.objectStore("scope").get("current"), scope);
      const jobs = transaction.objectStore("jobs"); const record = await jobs.get(id);
      if (record && (!record.lease || record.lease.worker === worker)) await jobs.delete(id);
      await transaction.done;
    } catch (error) { try { transaction.abort(); } catch { /* Already aborted by the browser. */ } await transaction.done.catch(() => undefined); throw error; }
  },
  async clear(scope) {
    if (typeof indexedDB === "undefined") return;
    const transaction = (await db()).transaction(["scope", "jobs"], "readwrite");
    const current = await transaction.objectStore("scope").get("current");
    if (!scope || current?.owner === scope.owner && current.token === scope.token) {
      await transaction.objectStore("jobs").clear(); await transaction.objectStore("scope").clear();
    }
    await transaction.done;
  },
};

// Imported explicitly by private-client-state too: logout must clear a durable
// outbox even when this feature has not been mounted since the last app launch.
export function clearDeliveryPhotoOutbox() { return deliveryPhotoOutbox.clear(); }
