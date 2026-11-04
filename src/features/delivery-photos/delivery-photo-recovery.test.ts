import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deliveryPhotoOutbox, type PhotoOutboxRecord } from "./delivery-photo-outbox";
import { DeliveryPhotoUploadCoordinator, deliveryPhotoUploadNamespace, type DeliveryPhotoUploadDependencies } from "./delivery-photo-upload-memory";
import type { AuthenticatedSession } from "../auth/auth-context";

const session: AuthenticatedSession = { uid: "recovery", displayName: "합성 직원", claims: {
  employeeId: "RECOVERY", roleScopes: ["delivery"], sessionVersion: 1, permissionsVersion: 1,
} };
const capturedAt = Date.parse("2026-11-04T03:00:00Z");
const workers: DeliveryPhotoUploadCoordinator[] = [];
function saved(overrides: Partial<PhotoOutboxRecord["job"]> = {}): PhotoOutboxRecord {
  return { version: 1, owner: deliveryPhotoUploadNamespace(session), approvedDay: "2026-11-04", lease: null,
    source: null, confirmed: null, prepared: { blob: new Blob(["same photo"]), width: 1, height: 1, contentType: "image/jpeg" },
    job: { jobId: "retained", requestId: "same-request", customerId: "customer", source: "camera", status: "failed",
      errorCategory: "retryable", message: "전송 대기", durable: true, attempts: 4, retryAt: 0,
      startedAt: capturedAt, updatedAt: capturedAt, ...overrides } };
}
function metadata() {
  return { photoId: "photo", customerId: "customer", source: "camera" as const, deliveryDateKey: "2026-11-04",
    createdAt: new Date(capturedAt).toISOString(), expiresAt: new Date(capturedAt + 86400000).toISOString(),
    createdByEmployeeId: "RECOVERY", createdByName: "합성 직원", thumbnail: { width: 1, height: 1 } };
}
async function restore(record: PhotoOutboxRecord, create: DeliveryPhotoUploadDependencies["create"], pollIntervalMs = 100_000) {
  let now = capturedAt + 60_000;
  const viewport = new EventTarget(); const page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("window", viewport); vi.stubGlobal("document", page);
  const scope = await deliveryPhotoOutbox.activate(record.owner); await deliveryPhotoOutbox.add(scope, record);
  const coordinator = new DeliveryPhotoUploadCoordinator(session, {
    store: deliveryPhotoOutbox, pollIntervalMs, now: () => now, uuid: () => crypto.randomUUID(), maxConcurrentRelays: 2,
    prepare: async () => { throw Error("prepared photos must not be recompressed"); }, preparationMessage: () => "prepare failed",
    encode: async (blob) => Buffer.from(await blob.arrayBuffer()).toString("base64"), create,
  });
  workers.push(coordinator); await coordinator.ready;
  return { coordinator, viewport, page, advance: (ms: number) => { now += ms; } };
}
afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => worker.clear()));
  await deliveryPhotoOutbox.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe("durable photo automatic recovery", () => {
  it("resumes a previously exhausted network failure on a new app session with the same request", async () => {
    const create = vi.fn(async () => metadata());
    const { coordinator } = await restore(saved(), create);
    await vi.waitFor(() => expect(coordinator.getSnapshot()[0]?.status).toBe("completed"));
    expect(create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ requestId: "same-request", fileBase64: Buffer.from("same photo").toString("base64") }), session);
  });

  it("retains an automatic retry time after repeated transient failures", async () => {
    const create = vi.fn(async () => { throw { code: "unavailable" }; });
    const { coordinator } = await restore(saved({ status: "queued", errorCategory: null }), create);
    await vi.waitFor(() => expect(coordinator.getSnapshot()[0]?.status).toBe("failed"));
    expect(coordinator.getSnapshot()[0]!.retryAt).toBeGreaterThan(capturedAt + 60_000);
    expect(coordinator.getSnapshot()[0]!.durable).toBe(true);
  });

  it("coalesces reconnect and foreground recovery without concurrent duplicate uploads", async () => {
    let finish!: (result: ReturnType<typeof metadata>) => void;
    const create = vi.fn<DeliveryPhotoUploadDependencies["create"]>(() => new Promise((resolve) => { finish = resolve; }));
    const state = await restore(saved({ updatedAt: capturedAt + 60_000, retryAt: capturedAt + 360_000 }), create);
    expect(create).not.toHaveBeenCalled();
    state.advance(3_000);
    state.viewport.dispatchEvent(new Event("online"));
    state.viewport.dispatchEvent(new Event("focus"));
    state.page.dispatchEvent(new Event("visibilitychange"));
    state.page.dispatchEvent(new Event("resume"));
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    finish(metadata());
    await vi.waitFor(() => expect(state.coordinator.getSnapshot()[0]?.status).toBe("completed"));
    expect(create).toHaveBeenCalledOnce();
  });

  it("retains a foreground signal received while a polling restore is pending", async () => {
    const create = vi.fn(async () => metadata());
    const state = await restore(saved({ updatedAt: capturedAt + 60_000, retryAt: capturedAt + 360_000 }), create, 10);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const list = deliveryPhotoOutbox.list.bind(deliveryPhotoOutbox);
    const read = vi.spyOn(deliveryPhotoOutbox, "list").mockImplementationOnce(async (scope) => { await gate; return list(scope); });
    await vi.waitFor(() => expect(read).toHaveBeenCalled());
    state.advance(3_000);
    state.viewport.dispatchEvent(new Event("focus"));
    state.page.dispatchEvent(new Event("visibilitychange"));
    release();
    await vi.waitFor(() => expect(state.coordinator.getSnapshot()[0]?.status).toBe("completed"));
    expect(create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ requestId: "same-request" }), session);
  });

  it.each(["input", "permanent", "storage", "auth"] as const)("does not automatically retry %s failures", async (errorCategory) => {
    const create = vi.fn(async () => metadata());
    const state = await restore(saved({ errorCategory }), create);
    state.viewport.dispatchEvent(new Event("online")); state.page.dispatchEvent(new Event("resume"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps previous-day photos paused for explicit date confirmation", async () => {
    const create = vi.fn(async () => metadata());
    const record = saved(); record.approvedDay = "2026-11-03";
    const state = await restore(record, create);
    state.viewport.dispatchEvent(new Event("online"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(state.coordinator.getSnapshot()[0]?.status).toBe("paused");
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps authorization failures blocked when a date change also pauses the photo", async () => {
    const create = vi.fn(async () => metadata());
    const record = saved({ errorCategory: "auth" }); record.approvedDay = "2026-11-03";
    const { coordinator } = await restore(record, create);
    expect(coordinator.getSnapshot()[0]?.status).toBe("paused");
    expect(coordinator.canRetry("retained")).toBe(false);
    expect(await coordinator.retry("retained")).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});
