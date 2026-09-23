import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ services: vi.fn(), call: vi.fn(), options: vi.fn() }));
vi.mock("client-only", () => ({}));
vi.mock("@/lib/firebase/client", () => ({ getFirebaseClientServices: mock.services }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_functions: unknown, name: string, options?: unknown) => {
  mock.options(name, options); return (input: unknown) => mock.call(name, input);
} }));

import { classifyDeliveryPhotoCreateError, deliveryPhotoCreateErrorMessage, deliveryPhotoCreateRepository } from "./delivery-photo-create-repository";
import { deliveryPhotoErrorKind, deliveryPhotoRepository } from "./delivery-photo-repository";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

const timestamp = "2026-09-23T01:18:00.000Z";
const route = { employeeId: "employee_1", customerIds: ["a"], revision: 2, updatedAt: timestamp, updatedByEmployeeId: "employee_1" };
const day = { deliveryDateKey: "2026-09-23", customerIds: ["a"], revision: null, isOverride: false };
const latest = { photoId: "eb12d3e0-35f3-400e-9165-32938939afc8", customerId: "a", deliveryDateKey: "2026-09-23",
  source: "camera", createdAt: timestamp, createdByEmployeeId: "employee_1", createdByName: "홍길동",
  expiresAt: "2026-09-30T01:18:00.000Z", thumbnail: { width: 240, height: 180 } };
const today = { scope: "today", deliveryDateKey: "2026-09-23", truncated: false, photos: [latest],
  customers: [{ customerId: "a", count: 1, latest }] };
const session: AuthenticatedSession = { uid: "uid_1", displayName: "홍길동",
  claims: { employeeId: "employee_1", sessionVersion: 1, permissionsVersion: 1, roleScopes: ["delivery"] } };
let auth: { currentUser: { uid: string; getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }> } | null };

beforeEach(() => {
  mock.call.mockReset();
  mock.options.mockReset();
  auth = { currentUser: { uid: "uid_1", getIdTokenResult: async () => ({ claims: session.claims }) } };
  mock.services.mockReturnValue({ auth, functions: {} });
  mock.call.mockImplementation(async (name: string) => ({ data: name === "getDeliveryPhotoRoute" || name === "saveDeliveryPhotoRoute"
    ? route : name === "getDeliveryPhotoDay" || name === "saveDeliveryPhotoDay" ? day : name === "createDeliveryPhoto" ? latest : today }));
});

describe("delivery photo authenticated repository", () => {
  it("parses route, day and today's metadata and sends the contract inputs", async () => {
    expect(await deliveryPhotoRepository.getRoute()).toEqual(route);
    expect(await deliveryPhotoRepository.getDay()).toEqual(day);
    expect(await deliveryPhotoRepository.listToday()).toEqual(today);
    expect(mock.call.mock.calls).toEqual([
      ["getDeliveryPhotoRoute", {}], ["getDeliveryPhotoDay", {}], ["listDeliveryPhotos", { scope: "today" }],
    ]);
  });

  it("saves only explicit route/day revisions with request IDs", async () => {
    const input = { requestId: "fed0b3f0-5b10-41d1-9bc3-e67d304fd283", expectedRevision: 2, customerIds: ["a"] };
    expect(await deliveryPhotoRepository.saveRoute(input)).toEqual(route);
    expect(await deliveryPhotoRepository.saveDay({ ...input, expectedRevision: null })).toEqual(day);
    expect(mock.call.mock.calls).toEqual([
      ["saveDeliveryPhotoRoute", input], ["saveDeliveryPhotoDay", { ...input, expectedRevision: null }],
    ]);
  });

  it("rejects malformed responses and late responses after auth changes", async () => {
    mock.call.mockResolvedValueOnce({ data: { ...today, customers: [{ customerId: "a", count: -1, latest }] } });
    await expect(deliveryPhotoRepository.listToday()).rejects.toThrow();
    mock.call.mockImplementationOnce(async () => {
      auth.currentUser = { uid: "other", getIdTokenResult: async () => ({ claims: session.claims }) };
      return { data: route };
    });
    await expect(deliveryPhotoRepository.getRoute()).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("classifies auth and revision conflicts", () => {
    expect(deliveryPhotoErrorKind({ code: "functions/aborted" })).toBe("conflict");
    expect(deliveryPhotoErrorKind({ code: "functions/permission-denied" })).toBe("auth");
    expect(deliveryPhotoErrorKind({ code: "functions/unavailable" })).toBe("temporary");
  });

  it("creates through the strict shared contract with a timeout beyond the server limit", async () => {
    const input = { requestId: "cb2a5278-4ca2-4737-a723-5457639413eb", customerId: "a", source: "camera" as const,
      contentType: "image/webp" as const, fileBase64: "AA==" };
    expect(await deliveryPhotoCreateRepository.create(input, session)).toEqual(latest);
    expect(mock.call).toHaveBeenCalledWith("createDeliveryPhoto", input);
    expect(mock.options).toHaveBeenCalledWith("createDeliveryPhoto", { timeout: 130_000 });
  });

  it("rejects a create response after session claims change", async () => {
    mock.call.mockImplementationOnce(async () => {
      auth.currentUser!.getIdTokenResult = async () => ({ claims: { ...session.claims, permissionsVersion: 2 } });
      return { data: latest };
    });
    await expect(deliveryPhotoCreateRepository.create({ requestId: "cb2a5278-4ca2-4737-a723-5457639413eb", customerId: "a",
      source: "album", contentType: "image/webp", fileBase64: "AA==" }, session)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("separates retry-safe transport failures from auth, input and configuration failures", () => {
    expect(classifyDeliveryPhotoCreateError({ code: "functions/unavailable" })).toBe("retryable");
    expect(classifyDeliveryPhotoCreateError({ code: "functions/deadline-exceeded" })).toBe("retryable");
    expect(classifyDeliveryPhotoCreateError({ code: "functions/aborted" })).toBe("retryable");
    expect(classifyDeliveryPhotoCreateError({ code: "functions/permission-denied" })).toBe("auth");
    expect(classifyDeliveryPhotoCreateError({ code: "functions/invalid-argument" })).toBe("input");
    expect(classifyDeliveryPhotoCreateError({ code: "functions/failed-precondition" })).toBe("permanent");
    expect(deliveryPhotoCreateErrorMessage({ code: "functions/unavailable" })).toContain("같은 사진");
  });
});
