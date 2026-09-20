import { describe, expect, it } from "vitest";
import { customerSchema, type Customer } from "@/domain/customer";
import { customerDirectoryEntry, customerRegionOptions, filterCustomerDirectory } from "./customer-directory-filter";

function customer(id: string, overrides: Partial<Customer> = {}): Customer {
  return customerSchema.parse({ customerId: id, companyId: "onnuri", name: id, normalizedName: id.toLowerCase(), choseongName: id.toLowerCase(), district: "서구", administrativeDong: "둔산2동",
    officialAddress: "대전광역시 서구 둔산로 100", deliveryAddress: "대전광역시 서구 둔산로 100", accessPassword: "", accessPasswordState: "none", deliveryLocationDescription: "", deliveryPoint: null,
    contacts: [], status: "active", noticeType: "none", changeNote: "", revision: 1, createdAt: "2026-09-06T00:00:00.000Z", updatedAt: "2026-09-06T00:00:00.000Z", createdBy: "EMP", updatedBy: "EMP", ...overrides });
}
describe("customer directory regional browsing", () => {
  it("keeps duplicate district names in different cities separate", () => {
    const entries = [customer("A"), customer("B", { deliveryAddress: "부산광역시 서구 구덕로 1" })].map(customerDirectoryEntry);
    expect(customerRegionOptions(entries, "district")).toEqual([{ value: "대전광역시 서구", count: 1 }, { value: "부산광역시 서구", count: 1 }]);
    expect(filterCustomerDirectory(entries, "대전광역시 서구", "", "").map((row) => row.customerId)).toEqual(["A"]);
  });
  it("derives missing districts but never mistakes a legal dong for an administrative dong", () => {
    expect(customerDirectoryEntry(customer("A", { district: "", administrativeDong: "", deliveryAddress: "대전광역시 서구 둔산로 1 (둔산동)" }))).toMatchObject({ district: "대전광역시 서구", dong: "행정동 미확인" });
  });
  it("normalizes Kakao short province names without merging identically named districts", () => {
    expect(customerDirectoryEntry(customer("A", { deliveryAddress: "대전 서구 둔산로 1" })).district).toBe("대전광역시 서구");
    expect(customerDirectoryEntry(customer("B", { deliveryAddress: "부산 서구 구덕로 1" })).district).toBe("부산광역시 서구");
    expect(customerDirectoryEntry(customer("C", { district: "", deliveryAddress: "경기 고양시 일산서구 중앙로 1" })).district).toBe("경기도 고양시 일산서구");
  });
  it("retains customers with no region or address and counts closed customers too", () => {
    const entries = [customer("A", { district: "", administrativeDong: "", deliveryAddress: "", officialAddress: "" }), customer("B", { status: "closed" })].map(customerDirectoryEntry);
    expect(customerRegionOptions(entries, "district")).toEqual([{ value: "대전광역시 서구", count: 1 }, { value: "지역 미확인", count: 1 }]);
    expect(filterCustomerDirectory(entries, "", "", "")).toHaveLength(2);
    expect(filterCustomerDirectory(entries, "지역 미확인", "행정동 미확인", "").map((row) => row.customerId)).toEqual(["A"]);
  });
  it("uses a moved delivery address instead of stale district and dong metadata", () => {
    expect(customerDirectoryEntry(customer("MOVED", { district: "서구", administrativeDong: "둔산2동", deliveryAddress: "대전광역시 유성구 대학로 1" })))
      .toMatchObject({ district: "대전광역시 유성구", dong: "행정동 미확인" });
  });
  it("combines district, administrative dong and Korean initials without losing results", () => {
    const entries = [customer("A", { name: "온누리유통", normalizedName: "온누리유통", choseongName: "ㅇㄴㄹㅇㅌ" }), customer("B", { administrativeDong: "둔산1동" })].map(customerDirectoryEntry);
    expect(filterCustomerDirectory(entries, "대전광역시 서구", "둔산2동", "ㅇㄴ").map((row) => row.customerId)).toEqual(["A"]);
    expect(filterCustomerDirectory(entries, "대전광역시 서구", "둔산1동", "ㅇㄴ")).toHaveLength(0);
  });
  it("does not cap an entire directory at a single API page or mutate the source", () => {
    const entries = Array.from({ length: 300 }, (_, index) => customerDirectoryEntry(customer(`ID${index}`)));
    const before = entries.map((entry) => entry.customer.customerId);
    expect(filterCustomerDirectory(entries, "", "", "")).toHaveLength(300);
    expect(customerRegionOptions(entries, "district")[0]?.count).toBe(300);
    expect(entries.map((entry) => entry.customer.customerId)).toEqual(before);
  });
});
