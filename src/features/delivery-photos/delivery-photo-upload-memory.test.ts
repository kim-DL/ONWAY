import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { DeliveryPhotoUploadCoordinator, type DeliveryPhotoUploadDependencies } from "./delivery-photo-upload-memory";
import type { DeliveryPhotoCreateInput } from "./delivery-photo-create-repository";

const session: AuthenticatedSession = { uid: "uid_1", displayName: "등록자",
  claims: { employeeId: "employee_1", sessionVersion: 1, permissionsVersion: 1, roleScopes: ["delivery"] } };

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function eventually(assertion: () => void) {
  let error: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { assertion(); return; } catch (cause) { error = cause; await new Promise((resolve) => setTimeout(resolve, 0)); }
  }
  throw error;
}

function metadata(customerId: string, photoId = crypto.randomUUID()) {
  return { photoId, customerId, deliveryDateKey: "2026-09-24", source: "camera" as const,
    createdAt: "2026-09-24T01:00:00.000Z", createdByEmployeeId: "employee_1", createdByName: "등록자",
    expiresAt: "2026-10-01T01:00:00.000Z", thumbnail: { width: 640, height: 480 } };
}

function setup(overrides: Partial<DeliveryPhotoUploadDependencies> = {}) {
  let id = 0; let now = 0;
  const prepare = vi.fn(async (source: File) => ({ blob: source as Blob, contentType: "image/webp" as const, width: 10, height: 10 }));
  const create = vi.fn(async (input: DeliveryPhotoCreateInput) => metadata(input.customerId));
  const dependencies: DeliveryPhotoUploadDependencies = {
    prepare, preparationMessage: () => "prepare failed", create: create as DeliveryPhotoUploadDependencies["create"],
    encode: async (blob) => Buffer.from(await blob.arrayBuffer()).toString("base64"),
    uuid: () => `id-${++id}`, now: () => ++now, maxConcurrentRelays: 2, ...overrides,
  };
  return { coordinator: new DeliveryPhotoUploadCoordinator(session, dependencies), prepare, create, dependencies };
}

function source(value: string) { return new File([value], `${value}.webp`, { type: "image/webp" }); }

describe("delivery photo memory upload coordinator", () => {
  it("allows one active job per customer, serializes preparation and caps relay concurrency at two", async () => {
    const preparations = [deferred<ReturnType<typeof prepared>>(), deferred<ReturnType<typeof prepared>>(), deferred<ReturnType<typeof prepared>>()];
    const relays = { a: deferred<ReturnType<typeof metadata>>(), b: deferred<ReturnType<typeof metadata>>(), c: deferred<ReturnType<typeof metadata>>() };
    let preparationIndex = 0;
    const prepare = vi.fn(() => preparations[preparationIndex++]!.promise);
    const create = vi.fn((input: DeliveryPhotoCreateInput) => relays[input.customerId as keyof typeof relays].promise);
    const { coordinator } = setup({ prepare, create: create as DeliveryPhotoUploadDependencies["create"] });
    const a = coordinator.begin("a", "camera")!; coordinator.acceptSource(a.jobId, source("a"));
    expect(coordinator.begin("a", "album")).toBeNull();
    const b = coordinator.begin("b", "album")!; coordinator.acceptSource(b.jobId, source("b"));
    const c = coordinator.begin("c", "camera")!; coordinator.acceptSource(c.jobId, source("c"));
    expect(prepare).toHaveBeenCalledTimes(1);
    preparations[0]!.resolve(prepared("a")); await eventually(() => expect(prepare).toHaveBeenCalledTimes(2));
    preparations[1]!.resolve(prepared("b")); await eventually(() => expect(prepare).toHaveBeenCalledTimes(3));
    preparations[2]!.resolve(prepared("c")); await eventually(() => expect(create).toHaveBeenCalledTimes(2));
    expect(coordinator.getCustomerJob("c")?.status).toBe("queued");
    relays.a.resolve(metadata("a")); await eventually(() => expect(create).toHaveBeenCalledTimes(3));
    relays.b.resolve(metadata("b")); relays.c.resolve(metadata("c"));
    await eventually(() => expect(coordinator.getSnapshot().filter((job) => job.status === "completed")).toHaveLength(3));
  });

  it("retries a timeout with the exact request ID and processed bytes, then permits a new photo", async () => {
    let attempt = 0;
    const create = vi.fn(async (input: DeliveryPhotoCreateInput) => {
      attempt += 1;
      if (attempt === 1) throw { code: "functions/deadline-exceeded" };
      return metadata(input.customerId, "4e4f92fc-c902-4d7f-8e7c-718c8be0c866");
    });
    const { coordinator } = setup({ create: create as DeliveryPhotoUploadDependencies["create"] });
    const first = coordinator.begin("a", "camera")!; coordinator.acceptSource(first.jobId, source("same bytes"));
    await eventually(() => expect(coordinator.getCustomerJob("a")?.status).toBe("failed"));
    expect(coordinator.retry(first.jobId)).toBe(true);
    await eventually(() => expect(coordinator.getSnapshot().find((job) => job.jobId === first.jobId)?.status).toBe("completed"));
    const [initial, retry] = create.mock.calls.map((call) => call[0] as { requestId: string; fileBase64: string });
    expect(retry).toEqual(initial);
    const next = coordinator.begin("a", "album")!;
    expect(next.requestId).not.toBe(first.requestId);
  });

  it("clears every retained payload on an auth failure and ignores other late relay results", async () => {
    const a = deferred<ReturnType<typeof metadata>>(); const b = deferred<ReturnType<typeof metadata>>();
    const create = vi.fn((input: DeliveryPhotoCreateInput) => input.customerId === "a" ? a.promise : b.promise);
    const { coordinator } = setup({ create: create as DeliveryPhotoUploadDependencies["create"] });
    const first = coordinator.begin("a", "camera")!; coordinator.acceptSource(first.jobId, source("a"));
    const second = coordinator.begin("b", "album")!; coordinator.acceptSource(second.jobId, source("b"));
    await eventually(() => expect(create).toHaveBeenCalledTimes(2));
    a.reject({ code: "functions/unauthenticated" });
    await eventually(() => expect(coordinator.getSnapshot().every((job) => job.status === "failed" && job.errorCategory === "auth")).toBe(true));
    expect(coordinator.retry(first.jobId)).toBe(false);
    b.resolve(metadata("b")); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(coordinator.getSnapshot().some((job) => job.status === "completed")).toBe(false);
  });
});

function prepared(value: string) {
  return { blob: new Blob([value], { type: "image/webp" }), contentType: "image/webp" as const, width: 10, height: 10 };
}
