import type { Customer } from "@/domain/customer";
import { searchCustomers } from "./customer-search";

const names = new Intl.Collator("ko-KR", { numeric: true });
const provinceAliases: Readonly<Record<string, string>> = {
  서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시", 광주: "광주광역시", 대전: "대전광역시", 울산: "울산광역시", 세종: "세종특별자치시",
  경기: "경기도", 강원: "강원특별자치도", 강원도: "강원특별자치도", 충북: "충청북도", 충남: "충청남도", 전북: "전북특별자치도", 전라북도: "전북특별자치도", 전남: "전라남도", 경북: "경상북도", 경남: "경상남도", 제주: "제주특별자치도", 제주도: "제주특별자치도",
};
export const UNKNOWN_CUSTOMER_DISTRICT = "지역 미확인";
export const UNKNOWN_CUSTOMER_DONG = "행정동 미확인";
export interface CustomerDirectoryEntry { customer: Customer; district: string; dong: string }
export interface CustomerRegionOption { value: string; count: number }

export function customerDirectoryEntry(customer: Customer): CustomerDirectoryEntry {
  const address = customer.deliveryAddress.trim() || customer.officialAddress.trim();
  const parts = address.split(/\s+/);
  // District names alone (e.g. 서구) are not unique across cities. Keep city context.
  const province = provinceAliases[parts[0] ?? ""] ?? (/(?:시|도)$/.test(parts[0] ?? "") ? parts[0]! : "");
  const addressDistrict = parts.slice(1, 3).filter((part) => /(?:시|군|구)$/.test(part)).join(" ");
  const storedDistrict = customer.district.trim();
  const district = addressDistrict || storedDistrict;
  const staleRegion = Boolean(addressDistrict && storedDistrict && storedDistrict !== addressDistrict && !storedDistrict.endsWith(` ${addressDistrict}`));
  const qualified = province && district && !district.startsWith(province) ? `${province} ${district}` : district;
  return {
    customer,
    district: qualified || province || UNKNOWN_CUSTOMER_DISTRICT,
    // A road address / 법정동 must never be presented as an administrative dong.
    dong: !staleRegion && customer.administrativeDong.trim() || UNKNOWN_CUSTOMER_DONG,
  };
}

export function customerRegionOptions(entries: readonly CustomerDirectoryEntry[], field: "district" | "dong"): CustomerRegionOption[] {
  const counts = new Map<string, number>();
  entries.forEach((entry) => counts.set(entry[field], (counts.get(entry[field]) ?? 0) + 1));
  return Array.from(counts, ([value, count]) => ({ value, count })).sort((a, b) =>
    Number(a.value.endsWith("미확인")) - Number(b.value.endsWith("미확인")) || names.compare(a.value, b.value));
}

export function filterCustomerDirectory(entries: readonly CustomerDirectoryEntry[], district: string, dong: string, query: string): Customer[] {
  const customers = entries.filter((entry) => (!district || entry.district === district) && (!dong || entry.dong === dong)).map((entry) => entry.customer);
  if (query.trim()) return searchCustomers(customers, query);
  return customers.sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed")
    || names.compare(a.name, b.name) || a.customerId.localeCompare(b.customerId));
}
