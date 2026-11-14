import { describe, expect, it } from "vitest";

import { readCustomerNavigationContext } from "./customer-photo-entry";

describe("customer photo navigation context", () => {
  it("restores the customer only in the matching customer destination", () => {
    expect(readCustomerNavigationContext({ kind: "detail", customerId: "CUSTOMER-1" }, "customer", "schools"))
      .toEqual({ kind: "detail", customerId: "CUSTOMER-1" });
    expect(readCustomerNavigationContext({ kind: "photo-record", customerId: "CUSTOMER-2" }, "customer", "activity"))
      .toEqual({ kind: "photo-record", customerId: "CUSTOMER-2" });
  });

  it("ignores foreign modes and mismatched destinations", () => {
    const detail = { kind: "detail", customerId: "CUSTOMER-1" };
    expect(readCustomerNavigationContext(detail, "inventory", "schools")).toBeNull();
    expect(readCustomerNavigationContext(detail, "customer", "activity")).toBeNull();
    expect(readCustomerNavigationContext(detail, "customer", "settings")).toBeNull();
    expect(readCustomerNavigationContext({ ...detail, kind: "photo-record" }, "customer", "schools")).toBeNull();
  });

  it.each([null, undefined, [], "CUSTOMER-1", {}, { kind: "unknown", customerId: "CUSTOMER-1" },
    { kind: "detail", customerId: "" }, { kind: "detail", customerId: "../customer" },
    { kind: "detail", customerId: "c".repeat(129) }, { kind: "detail", customerId: 1 }])("rejects invalid history input %j", (value) => {
    expect(readCustomerNavigationContext(value, "customer", "schools")).toBeNull();
  });
});
