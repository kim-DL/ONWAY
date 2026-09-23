import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ services: vi.fn(), call: vi.fn(), options: vi.fn() }));
vi.mock("client-only", () => ({}));
vi.mock("@/lib/firebase/client", () => ({ getFirebaseClientServices: mock.services }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_functions: unknown, name: string, options?: unknown) => {
  mock.options(name, options); return (input: unknown) => mock.call(name, input);
} }));

import type { AuthenticatedSession } from "@/features/auth/auth-context";
import {
  deliveryPhotoDownloadBlob,
  deliveryPhotoHistoryRepository,
} from "./delivery-photo-history-repository";

const photoId = "eb12d3e0-35f3-400e-9165-32938939afc8";
const timestamp = "2026-09-24T01:42:00.000Z";
const photo = { photoId, customerId: "customer-a", deliveryDateKey: "2026-09-24", source: "camera",
  createdAt: timestamp, createdByEmployeeId: "employee_1", createdByName: "홍길동",
  expiresAt: "2026-10-01T01:42:00.000Z", thumbnail: { width: 640, height: 480 } } as const;
const history = { scope: "customer", customerId: "customer-a", fromDateKey: "2026-09-17", photos: [photo] } as const;
const bytes = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const download = { photoId, variant: "thumbnail", contentType: "image/webp", byteSize: bytes.length, fileBase64: bytes.toString("base64") } as const;
const session: AuthenticatedSession = { uid: "uid_1", displayName: "홍길동",
  claims: { employeeId: "employee_1", sessionVersion: 1, permissionsVersion: 1, roleScopes: ["delivery"] } };
let auth: { currentUser: { uid: string; getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }> } | null };

beforeEach(() => {
  mock.call.mockReset(); mock.options.mockReset();
  auth = { currentUser: { uid: session.uid, getIdTokenResult: async () => ({ claims: session.claims }) } };
  mock.services.mockReturnValue({ auth, functions: {} });
  mock.call.mockImplementation(async (name: string) => ({ data: name === "listDeliveryPhotos" ? history : download }));
});

describe("delivery photo private history repository", () => {
  it("requests the bounded customer history with an explicit limit of 30", async () => {
    await expect(deliveryPhotoHistoryRepository.list("customer-a", session)).resolves.toEqual(history);
    expect(mock.call).toHaveBeenCalledWith("listDeliveryPhotos", { scope: "customer", customerId: "customer-a", limit: 30 });
    expect(mock.options).toHaveBeenCalledWith("listDeliveryPhotos", { timeout: 60_000 });
  });

  it.each(["thumbnail", "evidence"] as const)("requests and validates the explicit %s relay variant", async (variant) => {
    mock.call.mockResolvedValueOnce({ data: { ...download, variant } });
    const blob = await deliveryPhotoHistoryRepository.load(photoId, variant, session);
    expect(blob).toMatchObject({ size: bytes.length, type: "image/webp" });
    expect(mock.call).toHaveBeenCalledWith("getDeliveryPhoto", { photoId, variant });
    expect(mock.options).toHaveBeenCalledWith("getDeliveryPhoto", { timeout: 60_000 });
  });

  it("rejects mismatched lengths, malformed base64, MIME values and non-WebP bytes", () => {
    expect(() => deliveryPhotoDownloadBlob({ ...download, byteSize: 99 }, photoId, "thumbnail")).toThrow();
    expect(() => deliveryPhotoDownloadBlob({ ...download, fileBase64: "%%%=" }, photoId, "thumbnail")).toThrow();
    expect(() => deliveryPhotoDownloadBlob({ ...download, contentType: "image/jpeg" }, photoId, "thumbnail")).toThrow();
    const wrong = Buffer.from("not-a-webp!");
    expect(() => deliveryPhotoDownloadBlob({ ...download, byteSize: wrong.length, fileBase64: wrong.toString("base64") }, photoId, "thumbnail")).toThrow();
    expect(() => deliveryPhotoDownloadBlob({ ...download, variant: "evidence" }, photoId, "thumbnail")).toThrow();
  });

  it("discards a late response after the authenticated session changes", async () => {
    mock.call.mockImplementationOnce(async () => {
      auth.currentUser!.getIdTokenResult = async () => ({ claims: { ...session.claims, permissionsVersion: 2 } });
      return { data: history };
    });
    await expect(deliveryPhotoHistoryRepository.list("customer-a", session)).rejects.toMatchObject({ code: "unauthenticated" });
  });
});
