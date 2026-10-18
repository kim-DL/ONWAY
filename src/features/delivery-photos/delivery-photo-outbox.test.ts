import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { DeliveryPhotoUploadCoordinator, deliveryPhotoUploadNamespace, clearDeliveryPhotoUploadMemory, getDeliveryPhotoUploadCoordinator, type DeliveryPhotoUploadDependencies } from "./delivery-photo-upload-memory";
import { assertOutboxCapacity, clearDeliveryPhotoOutbox, deliveryPhotoOutbox, MAX_PENDING_PHOTO_BYTES,
  type PhotoOutboxRecord, type PhotoOutboxStore } from "./delivery-photo-outbox";

const session: AuthenticatedSession = { uid: "photo-test", displayName: "합성 직원", claims: {
  employeeId: "PHOTO-TEST", roleScopes: ["delivery"], sessionVersion: 1, permissionsVersion: 1,
} };
const owner = deliveryPhotoUploadNamespace(session);
const now = Date.parse("2026-10-18T02:00:00Z");
const workers: DeliveryPhotoUploadCoordinator[] = [];
function record(id: string, customer = "customer", prepared = true): PhotoOutboxRecord {
  const blob = new File([id], "synthetic.jpg", { type: "image/jpeg" });
  return { version: 1, owner, approvedDay: "2026-10-18", lease: null, confirmed: null,
    source: prepared ? null : blob,
    prepared: prepared ? { blob, preview: new Blob([id], { type: "image/jpeg" }), contentType: "image/jpeg", width: 8, height: 8 } : null,
    job: { jobId: id, requestId: `request-${id}`, customerId: customer, source: "camera", status: prepared ? "queued" : "preparing",
      errorCategory: null, message: "", startedAt: now, updatedAt: now, durable: true, attempts: 0 } };
}
function metadata(customerId: string) {
  return { photoId: crypto.randomUUID(), customerId, deliveryDateKey: "2026-10-18", source: "camera" as const,
    createdAt: "2026-10-18T02:00:00Z", expiresAt: "2026-10-25T02:00:00Z", createdByEmployeeId: "PHOTO-TEST", createdByName: "합성 직원", thumbnail: { width: 8, height: 8 } };
}
function worker(overrides: Partial<DeliveryPhotoUploadDependencies> = {}) {
  const deps: DeliveryPhotoUploadDependencies = { store: deliveryPhotoOutbox, pollIntervalMs: 15, now: () => now, uuid: () => crypto.randomUUID(),
    maxConcurrentRelays: 2, prepare: async (source) => ({ blob: source, contentType: "image/jpeg", width: 8, height: 8 }),
    preparationMessage: () => "prepare failed", encode: async (blob) => Buffer.from(await blob.arrayBuffer()).toString("base64"),
    create: async (input) => metadata(input.customerId), ...overrides };
  const coordinator = new DeliveryPhotoUploadCoordinator(session, deps); workers.push(coordinator);
  return coordinator;
}
async function until(check: () => void) { await vi.waitFor(check, { timeout: 2_000, interval: 10 }); }
afterEach(async () => { await Promise.all(workers.splice(0).map((worker) => worker.clear())); await clearDeliveryPhotoOutbox(); });

describe("durable unsent-photo outbox", () => {
  it("allows a fresh session coordinator even if clearing the old storage fails", async () => {
    const first = getDeliveryPhotoUploadCoordinator(session); await first.ready;
    const clear = vi.spyOn(first, "clear").mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(clearDeliveryPhotoUploadMemory()).rejects.toThrow("storage unavailable");
    clear.mockRestore(); await first.clear();
    const second = getDeliveryPhotoUploadCoordinator(session);
    expect(second).not.toBe(first); await second.ready;
    await clearDeliveryPhotoUploadMemory();
  });
  it("shows a retryable storage status if claiming fails and keeps the durable source", async () => {
    const claim = vi.fn(deliveryPhotoOutbox.claim).mockRejectedValueOnce(new Error("storage unavailable"));
    const create = vi.fn(async () => metadata("customer"));
    const coordinator = worker({ store: { ...deliveryPhotoOutbox, claim }, create });
    await coordinator.ready;
    const job = coordinator.begin("customer", "camera")!;
    await coordinator.acceptSource(job.jobId, new File(["source"], "synthetic.jpg", { type: "image/jpeg" }));
    await until(() => expect(coordinator.getSnapshot()[0]).toMatchObject({ status: "failed", errorCategory: "storage", durable: true }));
    const scope = await deliveryPhotoOutbox.activate(owner);
    expect((await deliveryPhotoOutbox.list(scope))[0]?.source?.size).toBe(6);
    expect(create).not.toHaveBeenCalled();
    expect(await coordinator.retry(job.jobId)).toBe(true);
    await until(() => expect(coordinator.getSnapshot()[0]?.status).toBe("completed"));
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("atomically enforces same-customer and total capacity across racing tabs", async () => {
    const scope = await deliveryPhotoOutbox.activate(owner);
    const results = await Promise.allSettled(Array.from({ length: 4 }, (_, i) => deliveryPhotoOutbox.add(scope, record(`a-${i}`))));
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(3);
    expect(await deliveryPhotoOutbox.list(scope)).toHaveLength(3);
    for (let i = 0; i < 5; i++) await deliveryPhotoOutbox.add(scope, record(`b-${i}`, `other-${i}`));
    await expect(deliveryPhotoOutbox.add(scope, record("overflow", "last"))).rejects.toMatchObject({ code: "delivery-photo/outbox-full" });
  });
  it("counts raw files, transport and local previews toward the byte budget", () => {
    const large = record("large");
    large.prepared!.blob = { size: MAX_PENDING_PHOTO_BYTES } as Blob;
    expect(() => assertOutboxCapacity([], large)).toThrow("capacity");
  });
  it("preserves the original storage failure after the browser has already aborted a duplicate insert", async () => {
    const scope = await deliveryPhotoOutbox.activate(owner); await deliveryPhotoOutbox.add(scope, record("same"));
    await expect(deliveryPhotoOutbox.add(scope, record("same"))).rejects.toMatchObject({ name: "ConstraintError" });
    expect(await deliveryPhotoOutbox.list(scope)).toHaveLength(1);
  });
  it("caps upload leases at two and preprocessing at one across workers", async () => {
    const scope = await deliveryPhotoOutbox.activate(owner);
    for (let i = 0; i < 3; i++) await deliveryPhotoOutbox.add(scope, record(String(i)));
    expect(await deliveryPhotoOutbox.claim(scope, "0", "a", "upload", now)).not.toBeNull();
    expect(await deliveryPhotoOutbox.claim(scope, "1", "b", "upload", now)).not.toBeNull();
    expect(await deliveryPhotoOutbox.claim(scope, "2", "c", "upload", now)).toBeNull();
    expect(await deliveryPhotoOutbox.claim(scope, "0", "b", "upload", now)).toBeNull();
    expect(await deliveryPhotoOutbox.claim(scope, "0", "b", "upload", now + 180_001)).not.toBeNull();
    await deliveryPhotoOutbox.clear(scope);
    const next = await deliveryPhotoOutbox.activate(owner);
    await deliveryPhotoOutbox.add(next, record("p1")); await deliveryPhotoOutbox.add(next, record("p2"));
    expect(await deliveryPhotoOutbox.claim(next, "p1", "a", "prepare", now)).not.toBeNull();
    expect(await deliveryPhotoOutbox.claim(next, "p2", "b", "prepare", now)).toBeNull();
  });
  it("invalidates old writes after logout and clears another session's files before activation", async () => {
    const scope = await deliveryPhotoOutbox.activate(owner);
    await deliveryPhotoOutbox.add(scope, record("private")); await clearDeliveryPhotoOutbox();
    await expect(deliveryPhotoOutbox.add(scope, record("late"))).rejects.toMatchObject({ code: "delivery-photo/outbox-session" });
    const next = await deliveryPhotoOutbox.activate("another-verified-session");
    expect(await deliveryPhotoOutbox.list(next)).toEqual([]);
    await expect(deliveryPhotoOutbox.list(scope)).rejects.toMatchObject({ code: "delivery-photo/outbox-session" });
  });
  it("recovers a copied source after relaunch and releases bytes only after server confirmation", async () => {
    const scope = await deliveryPhotoOutbox.activate(owner);
    await deliveryPhotoOutbox.add(scope, record("source", "customer", false));
    let finish!: (value: ReturnType<typeof metadata>) => void;
    const create = vi.fn(() => new Promise<ReturnType<typeof metadata>>((resolve) => { finish = resolve; }));
    const coordinator = worker({ create }); await coordinator.ready;
    await until(() => expect(create).toHaveBeenCalledOnce());
    expect((await deliveryPhotoOutbox.list(scope))[0]?.prepared?.blob.size).toBeGreaterThan(0);
    expect(coordinator.getSnapshot()[0]?.status).toBe("uploading");
    expect(coordinator.getPreview("source")?.full).toMatch(/^blob:/);
    finish(metadata("customer"));
    await until(() => expect(coordinator.getSnapshot()[0]?.status).toBe("completed"));
    const saved = (await deliveryPhotoOutbox.list(scope))[0]!;
    expect(saved.prepared).toBeNull(); expect(saved.source).toBeNull(); expect(saved.confirmed?.photoId).toBeTruthy();
    coordinator.markConfirmedMerged("source");
    await until(async () => expect(await deliveryPhotoOutbox.list(scope)).toEqual([]));
  });
  it("keeps previous-day files paused until the explicit date-confirmed retry", async () => {
    const scope = await deliveryPhotoOutbox.activate(owner); const previous = record("yesterday"); previous.approvedDay = "2026-10-17";
    await deliveryPhotoOutbox.add(scope, previous);
    const create = vi.fn(async () => metadata("customer")); const coordinator = worker({ create }); await coordinator.ready;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(create).not.toHaveBeenCalled(); expect(coordinator.getSnapshot()[0]?.status).toBe("paused");
    expect(await coordinator.retry("yesterday")).toBe(true);
    await until(() => expect(create).toHaveBeenCalledOnce());
  });
  it("does not send or claim a durable save before the source transaction commits", async () => {
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const store: PhotoOutboxStore = { ...deliveryPhotoOutbox, add: async (...args) => { await gate; return deliveryPhotoOutbox.add(...args); } };
    const create = vi.fn(async () => metadata("customer")); const coordinator = worker({ store, create }); await coordinator.ready;
    const job = coordinator.begin("customer", "camera")!;
    const accepted = coordinator.acceptSource(job.jobId, new File(["capture"], "capture.jpg", { type: "image/jpeg" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(coordinator.getSnapshot()[0]).toMatchObject({ status: "persisting", durable: false }); expect(create).not.toHaveBeenCalled();
    release(); await accepted; await until(() => expect(create).toHaveBeenCalledOnce());
  });
  it("retains a failed source in memory for storage retry instead of silently falling back to upload", async () => {
    let fail = true;
    const store: PhotoOutboxStore = { ...deliveryPhotoOutbox, add: async (...args) => { if (fail) throw new Error("quota"); return deliveryPhotoOutbox.add(...args); } };
    const create = vi.fn(async () => metadata("customer")); const coordinator = worker({ store, create }); await coordinator.ready;
    const job = coordinator.begin("customer", "camera")!;
    await coordinator.acceptSource(job.jobId, new File(["capture"], "capture.jpg", { type: "image/jpeg" }));
    expect(coordinator.getSnapshot()[0]).toMatchObject({ status: "failed", durable: false, errorCategory: "storage" });
    expect(create).not.toHaveBeenCalled(); expect(coordinator.canBegin("other")).toBe(false);
    fail = false; await coordinator.retry(job.jobId); await until(() => expect(create).toHaveBeenCalledOnce());
  });
  it("uses identical persisted bytes and request ID after a lost response and retry", async () => {
    const scope = await deliveryPhotoOutbox.activate(owner); await deliveryPhotoOutbox.add(scope, record("retry"));
    let attempt = 0; const create = vi.fn(async () => { if (++attempt === 1) throw { code: "functions/deadline-exceeded" }; return metadata("customer"); });
    const coordinator = worker({ create }); await coordinator.ready;
    await until(() => expect(coordinator.getSnapshot()[0]?.status).toBe("failed"));
    const retained = (await deliveryPhotoOutbox.list(scope))[0]!;
    expect(retained.prepared?.blob.size).toBeGreaterThan(0);
    await coordinator.retry("retry"); await until(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1]).toEqual(create.mock.calls[0]);
  });
  it("does not mark a different customer's valid-shaped response as saved", async () => {
    const scope = await deliveryPhotoOutbox.activate(owner); await deliveryPhotoOutbox.add(scope, record("association"));
    const coordinator = worker({ create: async () => metadata("another-customer") }); await coordinator.ready;
    await until(() => expect(coordinator.getSnapshot()[0]?.status).toBe("failed"));
    expect(coordinator.peekConfirmed("association")).toBeUndefined();
    expect((await deliveryPhotoOutbox.list(scope))[0]?.prepared?.blob.size).toBeGreaterThan(0);
  });
  it("prevents a new write when logout happens while Base64 encoding is pending", async () => {
    const scope = await deliveryPhotoOutbox.activate(owner); await deliveryPhotoOutbox.add(scope, record("logout"));
    let finish!: (value: string) => void; const encode = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
    const create = vi.fn(async () => metadata("customer")); const coordinator = worker({ encode, create }); await coordinator.ready;
    await until(() => expect(encode).toHaveBeenCalledOnce()); await coordinator.clear(); finish("encoded");
    await new Promise((resolve) => setTimeout(resolve, 20)); expect(create).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot()).toEqual([]);
  });
  it("aborts a native provider read on logout before it can persist or upload", async () => {
    let finish!: (value: ArrayBuffer) => void;
    const native = new File([new Uint8Array([255, 216, 255, 224])], "pending.jpg", { type: "image/jpeg" });
    const read = vi.spyOn(native, "arrayBuffer").mockImplementation(() => new Promise<ArrayBuffer>((resolve) => { finish = resolve; }));
    const create = vi.fn(async () => metadata("customer")); const coordinator = worker({ create }); await coordinator.ready;
    const job = coordinator.begin("customer", "camera")!; const accepting = coordinator.acceptNativeSource(job.jobId, native);
    await until(() => expect(read).toHaveBeenCalled());
    expect(coordinator.canBegin("another-customer")).toBe(false);
    await coordinator.clear();
    finish(new Uint8Array([255, 216, 255, 224]).buffer); await accepting;
    expect(create).not.toHaveBeenCalled(); expect(coordinator.getSnapshot()).toEqual([]);
  });
  it("releases confirmed previews on leaving the workspace while retaining pending files", async () => {
    const scope = await deliveryPhotoOutbox.activate(owner); await deliveryPhotoOutbox.add(scope, record("done"));
    const coordinator = worker(); await coordinator.ready;
    await until(() => expect(coordinator.getSnapshot()[0]?.status).toBe("completed"));
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    coordinator.markConfirmedMerged("done"); coordinator.releaseCompletedPreviews();
    expect(coordinator.getPreview("done")).toBeUndefined(); expect(revoke).toHaveBeenCalled(); revoke.mockRestore();
    expect(coordinator.getSnapshot()).toEqual([]);
  });
});
