import { describe, expect, it } from "vitest";
import { customerAddress } from "./customer-address";

describe("customer address display", () => {
  it("prioritizes the actual delivery address", () => {
    expect(customerAddress({ deliveryAddress: " 대전 후면 창고 ", officialAddress: "공식 주소" })).toBe("대전 후면 창고");
  });
  it("falls back to the official address without requiring region fields", () => {
    expect(customerAddress({ deliveryAddress: "  ", officialAddress: " 대전 본점 " })).toBe("대전 본점");
  });
  it("does not fabricate an address for a legacy record without one", () => {
    expect(customerAddress({ deliveryAddress: "", officialAddress: "" })).toBe("주소 미등록");
  });
});
