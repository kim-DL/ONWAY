import { describe, expect, it } from "vitest";

import { customerSchema, getCustomerChoseong, normalizeCustomerName, type Customer } from "@/domain/customer";
import { getPrimaryCustomerContact, sanitizeCustomerPhone, searchCustomers } from "./customer-search";

function customer(name: string, customerId = "one", status: "active" | "closed" = "active"): Customer {
  return customerSchema.parse({
    customerId, companyId: "onnuri", name,
    normalizedName: normalizeCustomerName(name), choseongName: getCustomerChoseong(name),
    district: "서구", administrativeDong: "탄방동", officialAddress: "남선로 17", deliveryAddress: "뒷골목 22",
    accessPassword: "00123*", accessPasswordState: "registered", deliveryLocationDescription: "후면 셔터 옆",
    deliveryPoint: { latitude: 36.35, longitude: 127.38 },
    contacts: [{ id: "primary", name: "김담당", role: "현장 담당자", phoneNumber: "01012345678", isPrimary: true }],
    status, noticeType: "new", changeNote: "변경 안내", revision: 1,
    createdAt: "2026-09-06T00:00:00.000Z", createdBy: "ADMIN", updatedAt: "2026-09-06T00:00:00.000Z", updatedBy: "ADMIN",
  });
}

describe("customer name-only search", () => {
  const data = [customer("강은유통", "one"), customer("가온유통", "two"), customer("강은식품", "three")];
  it.each(["강은유통", "강은", "강 은", "강-은", "(강은)"])("finds company names for %s", (query) => {
    expect(searchCustomers(data, query).map((item) => item.name)).toContain("강은유통");
  });
  it("supports Korean initials, lowercase Latin, punctuation, and composed Hangul", () => {
    expect(searchCustomers(data, "ㄱㅇㅇㅌ").map((item) => item.name)).toEqual(["가온유통", "강은유통"]);
    expect(normalizeCustomerName(" A.B.C 식품 ")).toBe("abc식품");
    expect(normalizeCustomerName("강은".normalize("NFD"))).toBe("강은");
    expect(getCustomerChoseong("강은 유통")).toBe("ㄱㅇㅇㅌ");
  });
  it("ranks exact, prefix, substring, then initials", () => {
    const values = [customer("대전강은", "a"), customer("강은식품", "b"), customer("강은", "c")];
    expect(searchCustomers(values, "강은").map((item) => item.customerId)).toEqual(["c", "b", "a"]);
  });
  it("places active before closed at the same rank, then Korean alphabetical order", () => {
    expect(searchCustomers([customer("가온유통", "a", "closed"), customer("강은유통", "b"), customer("가은유통", "c")], "ㄱㅇㅇㅌ").map((item) => item.customerId)).toEqual(["c", "b", "a"]);
  });
  it.each(["서구", "탄방동", "남선로", "뒷골목", "01012345678", "00123", "후면", "김담당", "변경 안내", "", " * "])("never searches private non-name fields: %s", (query) => {
    expect(searchCustomers(data, query)).toEqual([]);
  });
  it("keeps password/phone leading zeros and chooses the primary contact", () => {
    expect(data[0]!.accessPassword).toBe("00123*");
    expect(getPrimaryCustomerContact(data[0]!)?.phoneNumber).toBe("01012345678");
    expect(sanitizeCustomerPhone("010-1234-5678")).toBe("01012345678");
    expect(sanitizeCustomerPhone(" +82 (10) 1234-5678 ")).toBe("+821012345678");
    expect(sanitizeCustomerPhone("javascript:alert(1)")).toBe("");
    expect(sanitizeCustomerPhone("0101234;123")).toBe("");
  });
});
