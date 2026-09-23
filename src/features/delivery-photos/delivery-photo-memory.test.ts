import { afterEach, describe, expect, it } from "vitest";

import { acceptDeliveryPhotoWrite, beginDeliveryPhotoRead, clearDeliveryPhotoSnapshot,
  commitDeliveryPhotoRead, deliveryPhotoDateKey, readDeliveryPhotoSnapshot } from "./delivery-photo-memory";

afterEach(() => clearDeliveryPhotoSnapshot());

describe("delivery photo memory snapshot", () => {
  const snapshot = { route: null, day: { deliveryDateKey: "2026-09-23", customerIds: [], revision: null, isOverride: false },
    today: { scope: "today" as const, deliveryDateKey: "2026-09-23", truncated: false, photos: [], customers: [] }, refreshedAt: 10 };

  it("uses the Seoul day and isolates employee sessions", () => {
    expect(deliveryPhotoDateKey(new Date("2026-09-22T16:00:00.000Z"))).toBe("2026-09-23");
    const generation = beginDeliveryPhotoRead("employee-a:2026-09-23");
    expect(commitDeliveryPhotoRead("employee-a:2026-09-23", generation, snapshot)).toEqual(snapshot);
    expect(readDeliveryPhotoSnapshot("employee-b:2026-09-23")).toBeNull();
  });

  it("does not let an in-flight read overwrite a successful save", () => {
    const key = "employee-a:2026-09-23";
    const generation = beginDeliveryPhotoRead(key);
    commitDeliveryPhotoRead(key, generation, snapshot);
    acceptDeliveryPhotoWrite(key, (current) => ({ ...current, refreshedAt: 20 }));
    expect(commitDeliveryPhotoRead(key, generation, snapshot)?.refreshedAt).toBe(20);
  });
});
