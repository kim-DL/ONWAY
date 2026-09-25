import { describe, expect, it, vi } from "vitest";

import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import { projectDeliveryPhotoCompletion } from "./delivery-photo-domain";
import { removeDeliveryPhotoFromToday } from "./delivery-photo-delete-model";
import type { DeliveryPhotoSnapshot } from "./delivery-photo-memory";

const base = { customerId: "customer-a", deliveryDateKey: "2026-09-24", source: "camera",
  createdByEmployeeId: "employee_1", createdByName: "홍길동", expiresAt: "2026-10-01T01:42:00.000Z",
  thumbnail: { width: 640, height: 480 } } as const;
const photos: DeliveryPhotoMetadata[] = [
  { ...base, photoId: "10000000-0000-4000-8000-000000000001", createdAt: "2026-09-24T01:43:00.000Z" },
  { ...base, photoId: "10000000-0000-4000-8000-000000000002", createdAt: "2026-09-24T01:42:00.000Z" },
  { ...base, photoId: "10000000-0000-4000-8000-000000000003", createdAt: "2026-09-24T01:41:00.000Z" },
];

function snapshot(selected = photos): DeliveryPhotoSnapshot {
  return { route: null, day: { deliveryDateKey: "2026-09-24", customerIds: ["customer-a", "customer-b"], revision: 1, isOverride: false },
    today: { scope: "today", deliveryDateKey: "2026-09-24", truncated: false, photos: selected,
      customers: selected.length ? [{ customerId: "customer-a", count: selected.length, latest: selected[0]! }] : [] }, refreshedAt: 1 };
}

describe("delivery photo delete projection", () => {
  it("reconciles three photos to two and advances the latest metadata", () => {
    vi.spyOn(Date, "now").mockReturnValue(20);
    const result = removeDeliveryPhotoFromToday(photos[0]!)(snapshot());
    expect(result.today.photos).toEqual(photos.slice(1));
    expect(result.today.customers).toEqual([{ customerId: "customer-a", count: 2, latest: photos[1] }]);
    expect(result.refreshedAt).toBe(20);
    vi.restoreAllMocks();
  });

  it("removes the last summary so the customer returns to remaining", () => {
    const result = removeDeliveryPhotoFromToday(photos[0]!)(snapshot([photos[0]!]));
    expect(result.today.photos).toEqual([]);
    expect(result.today.customers).toEqual([]);
    expect(projectDeliveryPhotoCompletion(["customer-a", "customer-b"], (id) => result.today.customers.find((item) => item.customerId === id)?.count ?? 0))
      .toEqual({ remainingCustomerIds: ["customer-a", "customer-b"], completedCustomerIds: [] });
  });

  it("does not double-decrement a replay or alter a different Seoul day", () => {
    const once = removeDeliveryPhotoFromToday(photos[0]!)(snapshot());
    expect(removeDeliveryPhotoFromToday(photos[0]!)(once)).toBe(once);
    expect(removeDeliveryPhotoFromToday({ ...photos[0]!, deliveryDateKey: "2026-09-23" })(snapshot())).toEqual(snapshot());
  });
});
