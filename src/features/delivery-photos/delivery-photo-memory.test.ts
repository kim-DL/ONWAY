import { afterEach, describe, expect, it } from "vitest";

import { acceptDeliveryPhotoWrite, beginDeliveryPhotoRead, clearDeliveryPhotoSnapshot,
  commitDeliveryPhotoRead, deliveryPhotoDateKey, mergeConfirmedDeliveryPhoto, readDeliveryPhotoSnapshot } from "./delivery-photo-memory";

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

  it("merges confirmed metadata by photo ID without double-counting a replay", () => {
    const photo = { photoId: "eb12d3e0-35f3-400e-9165-32938939afc8", customerId: "a", deliveryDateKey: "2026-09-23",
      source: "camera" as const, createdAt: "2026-09-23T01:18:00.000Z", createdByEmployeeId: "employee_1", createdByName: "등록자",
      expiresAt: "2026-09-30T01:18:00.000Z", thumbnail: { width: 640, height: 480 } };
    const once = mergeConfirmedDeliveryPhoto(snapshot, photo, "2026-09-23");
    const replay = mergeConfirmedDeliveryPhoto(once, photo, "2026-09-23");
    expect(once.today.photos).toEqual([photo]);
    expect(replay.today.customers).toEqual([{ customerId: "a", count: 1, latest: photo }]);
  });

  it("does not merge a server-confirmed photo into a different Seoul day", () => {
    const photo = { photoId: "eb12d3e0-35f3-400e-9165-32938939afc8", customerId: "a", deliveryDateKey: "2026-09-24",
      source: "album" as const, createdAt: "2026-09-23T15:00:00.000Z", createdByEmployeeId: "employee_1", createdByName: "등록자",
      expiresAt: "2026-09-30T15:00:00.000Z", thumbnail: { width: 480, height: 640 } };
    expect(mergeConfirmedDeliveryPhoto(snapshot, photo, "2026-09-24")).toBe(snapshot);
  });
});
