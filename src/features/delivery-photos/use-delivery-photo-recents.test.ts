import { describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { parseRecentCustomerIds, recentCustomerStorageKey } from "@/features/customers/recent-customer-history";
import { deliveryPhotoRecentKey, parseDeliveryPhotoRecentIds } from "./use-delivery-photo-recents";

const session: AuthenticatedSession = {
  uid: "uid_1", displayName: "납품 담당",
  claims: { employeeId: "EMP-DELIVERY", sessionVersion: 1, permissionsVersion: 1, roleScopes: ["delivery"] },
};

describe("delivery photo recent picker compatibility", () => {
  it("reads the established scoped IDs-only history without changing the wire format", () => {
    expect(deliveryPhotoRecentKey(session)).toBe(recentCustomerStorageKey(session));
    const raw = JSON.stringify(Array.from({ length: 25 }, (_, index) => `CUSTOMER-${index}`));
    expect(parseDeliveryPhotoRecentIds(raw)).toEqual(parseRecentCustomerIds(raw));
    expect(parseDeliveryPhotoRecentIds(raw)).toHaveLength(20);
    expect(parseDeliveryPhotoRecentIds('["safe","safe"]')).toEqual(["safe"]);
    expect(parseDeliveryPhotoRecentIds('["safe",{"name":"private"}]')).toEqual([]);
  });
});
