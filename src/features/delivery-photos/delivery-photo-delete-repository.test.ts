import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ services: vi.fn(), call: vi.fn(), options: vi.fn() }));
vi.mock("client-only", () => ({}));
vi.mock("@/lib/firebase/client", () => ({ getFirebaseClientServices: mock.services }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_functions: unknown, name: string, options?: unknown) => {
  mock.options(name, options); return (input: unknown) => mock.call(name, input);
} }));

import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { deliveryPhotoDeleteErrorKind, deliveryPhotoDeleteRepository } from "./delivery-photo-delete-repository";

const photoId = "10000000-0000-4000-8000-000000000001";
const requestId = "20000000-0000-4000-8000-000000000001";
const session: AuthenticatedSession = { uid: "uid_1", displayName: "홍길동",
  claims: { employeeId: "employee_1", sessionVersion: 1, permissionsVersion: 1, roleScopes: ["delivery"] } };
let auth: { currentUser: { uid: string; getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }> } | null };

beforeEach(() => {
  mock.call.mockReset().mockResolvedValue({ data: { photoId, deletedAt: "2026-09-24T02:00:00.000Z" } });
  mock.options.mockReset();
  auth = { currentUser: { uid: session.uid, getIdTokenResult: async () => ({ claims: session.claims }) } };
  mock.services.mockReturnValue({ auth, functions: {} });
});

describe("delivery photo delete repository", () => {
  it("strictly validates the shared contract and verifies the same session around the Callable", async () => {
    await expect(deliveryPhotoDeleteRepository.remove(photoId, requestId, session)).resolves.toEqual({
      photoId, deletedAt: "2026-09-24T02:00:00.000Z",
    });
    expect(mock.call).toHaveBeenCalledWith("deleteDeliveryPhoto", { photoId, requestId });
    expect(mock.options).toHaveBeenCalledWith("deleteDeliveryPhoto", { timeout: 60_000 });
    expect(auth.currentUser?.getIdTokenResult).toBeDefined();
  });

  it("discards a late success after permissionsVersion changes", async () => {
    mock.call.mockImplementationOnce(async () => {
      auth.currentUser!.getIdTokenResult = async () => ({ claims: { ...session.claims, permissionsVersion: 2 } });
      return { data: { photoId, deletedAt: "2026-09-24T02:00:00.000Z" } };
    });
    await expect(deliveryPhotoDeleteRepository.remove(photoId, requestId, session)).rejects.toMatchObject({ code: "unauthenticated" });
  });

  it("rejects a mismatched response and classifies safe user-facing cases", async () => {
    mock.call.mockResolvedValueOnce({ data: { photoId: "30000000-0000-4000-8000-000000000001", deletedAt: "2026-09-24T02:00:00.000Z" } });
    await expect(deliveryPhotoDeleteRepository.remove(photoId, requestId, session)).rejects.toMatchObject({ code: "delivery-photo/invalid-response" });
    expect(deliveryPhotoDeleteErrorKind({ code: "functions/permission-denied" })).toBe("permission");
    expect(deliveryPhotoDeleteErrorKind({ code: "functions/not-found" })).toBe("unavailable");
    expect(deliveryPhotoDeleteErrorKind({ code: "functions/unauthenticated" })).toBe("auth");
    expect(deliveryPhotoDeleteErrorKind({ code: "functions/unavailable" })).toBe("temporary");
  });
});
