import type { CallableRequest } from "firebase-functions/v2/https";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  authorize: vi.fn(), create: vi.fn(), list: vi.fn(), get: vi.fn(), delete: vi.fn(),
  getRoute: vi.fn(), saveRoute: vi.fn(), getDay: vi.fn(), saveDay: vi.fn(),
}));
vi.mock("../src/customer/customer-authorization.js", () => ({ requireCustomerActor: fixture.authorize }));
vi.mock("../src/delivery-photo/delivery-photo-service.js", () => ({
  DeliveryPhotoRequestCollision: class extends Error {},
  DeliveryPhotoRevisionConflict: class extends Error {},
  DeliveryPhotoService: class {
    create = fixture.create; list = fixture.list; get = fixture.get; delete = fixture.delete;
    getRoute = fixture.getRoute; saveRoute = fixture.saveRoute; getDay = fixture.getDay; saveDay = fixture.saveDay;
  },
}));

import { createDeliveryPhoto, deliveryPhotoCallableOptions, deliveryPhotoCreateCallableOptions, getDeliveryPhoto, listDeliveryPhotos } from "../src/delivery-photo/delivery-photo-callables.js";

const actor = { uid: "uid-staff", employeeId: "EMP-STAFF", roleScopes: ["delivery"], sessionVersion: 1, permissionsVersion: 1, isAdmin: false };
const photoId = "00000000-0000-4000-8000-000000000000";
const requestId = "10000000-0000-4000-8000-000000000000";
function request(data: unknown) {
  const headers = vi.fn();
  return { headers, value: { data, rawRequest: { res: { setHeader: headers } } } as unknown as CallableRequest<unknown> };
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.authorize.mockResolvedValue(actor);
});

describe("delivery photo Callable boundary", () => {
  it("enforces App Check outside the local Functions emulator", () => {
    expect(deliveryPhotoCallableOptions(false).enforceAppCheck).toBe(true);
    expect(deliveryPhotoCallableOptions(true).enforceAppCheck).toBe(false);
    expect(deliveryPhotoCreateCallableOptions(false)).toMatchObject({ concurrency: 1, memory: "1GiB", maxInstances: 4, timeoutSeconds: 120 });
  });

  it("authorizes, strictly validates relay input, and emits private no-store headers", async () => {
    const result = { photoId, customerId: "customer-a", deliveryDateKey: "2026-09-22", source: "camera",
      createdAt: "2026-09-22T00:00:00.000Z", createdByEmployeeId: actor.employeeId, createdByName: "배송 담당",
      expiresAt: "2026-09-29T00:00:00.000Z", thumbnail: { width: 80, height: 120 } };
    fixture.create.mockResolvedValue(result);
    const input = { requestId, customerId: "customer-a", source: "camera", contentType: "image/jpeg", fileBase64: "/9j/" };
    const call = request(input);
    expect(await createDeliveryPhoto.run(call.value)).toEqual(result);
    expect(fixture.authorize).toHaveBeenCalledOnce();
    expect(fixture.create).toHaveBeenCalledWith(input, actor);
    expect(call.headers).toHaveBeenCalledWith("Cache-Control", "private, no-store, max-age=0");
    expect(call.headers).toHaveBeenCalledWith("Pragma", "no-cache");

    await expect(createDeliveryPhoto.run(request({ ...input, objectPath: "attacker/path" }).value)).rejects.toMatchObject({ code: "invalid-argument" });
    expect(fixture.create).toHaveBeenCalledOnce();
  });

  it("keeps list metadata-only and get relay responses private", async () => {
    fixture.list.mockResolvedValue({ scope: "today", deliveryDateKey: "2026-09-22", truncated: false, photos: [], customers: [] });
    fixture.get.mockResolvedValue({ photoId, variant: "thumbnail", contentType: "image/webp", byteSize: 4, fileBase64: "AAAA" });
    const listCall = request({ scope: "today" });
    expect(await listDeliveryPhotos.run(listCall.value)).toMatchObject({ photos: [] });
    const getCall = request({ photoId, variant: "thumbnail" });
    expect(await getDeliveryPhoto.run(getCall.value)).toMatchObject({ fileBase64: "AAAA" });
    for (const headers of [listCall.headers, getCall.headers]) {
      expect(headers).toHaveBeenCalledWith("Cache-Control", "private, no-store, max-age=0");
    }
  });

  it("does not enter the service after authentication/session rejection", async () => {
    const { HttpsError } = await import("firebase-functions/v2/https");
    fixture.authorize.mockRejectedValueOnce(new HttpsError("failed-precondition", "세션 만료"));
    await expect(listDeliveryPhotos.run(request({ scope: "today" }).value)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(fixture.list).not.toHaveBeenCalled();
  });
});
