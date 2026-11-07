import { normalizeCustomerName } from "../customer/customer-contract.js";
import type { InvoiceFields } from "./planning-contract.js";

export interface MatchCustomer { customerId: string; name: string; officialAddress: string; deliveryAddress: string }
export function splitInvoiceName(name: string) {
  const suffix = name.match(/^(.*?)\s*[(（]([^()（）]+)[)）]\s*$/u);
  return { base: suffix?.[1]?.trim() || name.trim(), regionHint: suffix?.[2]?.trim() || "" };
}
function addressCore(address: string) {
  // Compare a complete dong/road + lot/building number, including number boundaries.
  // Do not let 659-4 match 659-40 or another street with the same number.
  return address.normalize("NFC").replace(/[·ㆍ]/gu, "").replace(/\s+/gu, " ").trim()
    .match(/([가-힣A-Za-z0-9]+(?:동|읍|면|리|로|길))\s*(\d+(?:-\d+)?)(?![\d-])/u)?.slice(1).join("|") ?? "";
}
export function invoiceAddressMatches(left: string, right: string) {
  const a = addressCore(left); const b = addressCore(right);
  if (!a || a !== b) return false;
  const province = (s: string) => s.match(/(?:^|\s)(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청북|충북|충청남|충남|전라북|전북|전라남|전남|경상북|경북|경상남|경남|제주)(?:특별자치시|특별자치도|광역시|특별시|시|도)?(?=\s)/u)?.[1]
    ?.replace("충청북", "충북").replace("충청남", "충남").replace("전라북", "전북").replace("전라남", "전남").replace("경상북", "경북").replace("경상남", "경남");
  const pa = province(left); const pb = province(right);
  if (pa && pb && pa !== pb) return false;
  // Explicit municipalities on both sides must not conflict.
  const cities = (s: string): string[] => (s.match(/[가-힣]+(?:시|군|구)(?=\s)/gu) ?? []).filter((city) => !/(?:광역시|특별시|특별자치시)$/u.test(city));
  const ca = cities(left); const cb = cities(right);
  return !ca.length || !cb.length || ca.every((city) => cb.includes(city));
}
export function matchInvoice(fields: InvoiceFields, customers: MatchCustomer[], today: string) {
  const { base, regionHint } = splitInvoiceName(fields.recipientName);
  const fullName = normalizeCustomerName(fields.recipientName); const baseName = normalizeCustomerName(base);
  // Keep exact branch names first. Broaden only when the exact name has no candidate.
  const exact = customers.filter((c) => normalizeCustomerName(c.name) === fullName && fullName.length > 0);
  const candidates = exact.length ? exact : customers.filter((c) => normalizeCustomerName(c.name) === baseName && baseName.length > 0);
  const addressed = candidates.filter((c) => [c.officialAddress, c.deliveryAddress].some((address) => invoiceAddressMatches(fields.recipientAddress, address)));
  const unique = addressed.length === 1 ? addressed[0]! : null;
  const sameDate = fields.invoiceDate === today;
  const automatic = unique && sameDate && !fields.uncertain;
  return { regionHint, customerId: automatic ? unique.customerId : null, candidateIds: candidates.slice(0, 10).map((c) => c.customerId),
    reason: automatic ? "상호와 주소가 일치해 저장했어요." : !sameDate ? "명세서 날짜를 확인해주세요." : fields.uncertain ? "흐리거나 불확실한 글자가 있어요. 거래처를 확인해주세요."
      : !candidates.length ? "일치하는 거래처를 찾지 못했어요. 기존 거래처를 선택해주세요." : "상호와 주소를 함께 확인해주세요." };
}
