import { describe, expect, it } from "vitest";

import {
  DELIVERY_PHOTO_RETENTION_HOURS,
  deleteDeliveryPhotoInputSchema,
  deleteDeliveryPhotoResultSchema,
  deliveryPhotoDaySchema,
  deliveryPhotoRouteSchema,
  deliveryPhotoSchema,
} from "./delivery-photo";

const timestamp = "2026-09-22T00:00:00.000Z";

describe("delivery photo shared contract", () => {
  it("accepts unique route/day customer order and rejects duplicates", () => {
    expect(deliveryPhotoRouteSchema.parse({ employeeId: "employee_1", customerIds: ["a", "b"], revision: 1, updatedAt: timestamp, updatedByEmployeeId: "employee_1" }).customerIds).toEqual(["a", "b"]);
    expect(deliveryPhotoDaySchema.safeParse({ employeeId: "employee_1", deliveryDateKey: "2026-09-22", customerIds: ["a", "a"], revision: 1, updatedAt: timestamp, updatedByEmployeeId: "employee_1", expiresAt: timestamp }).success).toBe(false);
    expect(deliveryPhotoDaySchema.safeParse({ employeeId: "employee_1", deliveryDateKey: "2026-02-30", customerIds: ["a"], revision: 1, updatedAt: timestamp, updatedByEmployeeId: "employee_1", expiresAt: timestamp }).success).toBe(false);
  });

  it("models server-owned actor snapshots, private objects, and consistent deletion metadata", () => {
    const photoId = "00000000-0000-4000-8000-000000000000";
    const uploadAttemptToken = "00000000-0000-4000-8000-000000000001";
    const prefix = `delivery-photos/2026-09-22/${photoId}/attempts/${uploadAttemptToken}/`;
    const object = { generation: "123", uploadAttemptToken, contentType: "image/webp", byteSize: 100, width: 640, height: 480 } as const;
    const active = { photoId, customerId: "customer_1", deliveryDateKey: "2026-09-22", source: "camera", status: "active", createdAt: timestamp, createdByUid: "uid_1", createdByEmployeeId: "employee_1", createdByName: "홍길동", expiresAt: "2026-09-29T00:00:00.000Z", evidence: { ...object, objectPath: `${prefix}evidence.webp` }, thumbnail: { ...object, objectPath: `${prefix}thumbnail.webp` } } as const;
    expect(deliveryPhotoSchema.parse(active).createdByName).toBe("홍길동");
    expect(deliveryPhotoSchema.safeParse({ ...active, thumbnail: { ...active.thumbnail, uploadAttemptToken: "00000000-0000-4000-8000-000000000002" } }).success).toBe(false);
    expect(deliveryPhotoSchema.safeParse({ ...active, status: "deleted" }).success).toBe(false);
    expect(DELIVERY_PHOTO_RETENTION_HOURS).toBe(168);
  });

  it("shares the strict requestId/photoId delete contract with the client", () => {
    const request = { requestId: "10000000-0000-4000-8000-000000000001", photoId: "20000000-0000-4000-8000-000000000001" };
    expect(deleteDeliveryPhotoInputSchema.parse(request)).toEqual(request);
    expect(deleteDeliveryPhotoInputSchema.safeParse({ ...request, customerId: "customer-a" }).success).toBe(false);
    expect(deleteDeliveryPhotoResultSchema.parse({ photoId: request.photoId, deletedAt: timestamp })).toEqual({ photoId: request.photoId, deletedAt: timestamp });
  });
});
