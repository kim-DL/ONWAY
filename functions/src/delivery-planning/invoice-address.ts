import { registeredAddressQuery } from "./registered-address.js";

const provinces = /(?:^|\s)(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청북|충북|충청남|충남|전라북|전북|전라남|전남|경상북|경북|경상남|경남|제주)(?:특별자치시|특별자치도|광역시|특별시|시|도)?(?=\s|$)/u;
function addressRegions(address: string) {
  const text = address.normalize("NFKC").replace(/[·ㆍ]/gu, "");
  const province = text.match(provinces)?.[1]?.replace("충청북", "충북").replace("충청남", "충남")
    .replace("전라북", "전북").replace("전라남", "전남").replace("경상북", "경북").replace("경상남", "경남");
  const rest = text.replace(provinces, " ");
  const units: string[] = rest.match(/[가-힣]+(?:시|군|구|읍|면)(?=\s|$)/gu) ?? [];
  return { province, units };
}
export function invoiceAddressRegionsConflict(left: string, right: string) {
  const a = addressRegions(left), b = addressRegions(right);
  return Boolean(a.province && b.province && a.province !== b.province)
    || a.units.some((unit) => b.units.some((other) => other.at(-1) === unit.at(-1)) && !b.units.includes(unit));
}
export function invoiceAddressCore(address: string) {
  const text = registeredAddressQuery(address.normalize("NFKC")).replace(provinces, " ")
    .replace(/(?:^|\s)[가-힣]+(?:시|군|구|읍|면)(?=\s)/gu, " ").replace(/\s+/gu, "");
  const match = text.match(/^([가-힣A-Za-z0-9]+(?:동|읍|면|리|로|길))(산?)(\d+(?:-\d+)?)(?![\d-])/u);
  return match ? { street: match[1]!, number: `${match[2]}${match[3]}`, road: /(?:로|길)$/u.test(match[1]!) } : null;
}
export function invoiceAddressMatches(left: string, right: string) {
  const a = invoiceAddressCore(left), b = invoiceAddressCore(right);
  return Boolean(a && b && a.street === b.street && a.number === b.number && !invoiceAddressRegionsConflict(left, right));
}

export type AddressIdentity = { status: "found"; addresses: string[] } | { status: "missing" };
export type AddressIdentityResolver = (address: string) => Promise<AddressIdentity | null>;
export type InvoiceAddressEvidence = ReadonlyMap<string, AddressIdentity | null>;
export const invoiceAddressKey = (address: string) => registeredAddressQuery(address.normalize("NFKC"));

function corroboratedStreetTypo(left: string, right: string, identity: AddressIdentity) {
  if (identity.status !== "found") return false;
  const source = invoiceAddressCore(left), regions = addressRegions(left);
  if (!source?.road || !regions.province || !regions.units.length) return false;
  // Require a printed neighborhood as an independent check, in addition to a
  // unique exact company name, full region and unchanged building number.
  const dongs = [...left.matchAll(/\(([^)]*)\)/gu)].flatMap((m) => m[1]!.match(/[가-힣]+동/gu) ?? []);
  return identity.addresses.some((address) => {
    const target = invoiceAddressCore(address);
    return target?.road && target.number === source.number && source.street.length >= 5
      && source.street.length === target.street.length && source.street.at(-1) === target.street.at(-1)
      && [...source.street].filter((letter, i) => letter !== target.street[i]).length === 1
      && [...source.street].every((letter, i) => letter === target.street[i] || (/[가-힣]/u.test(letter) && /[가-힣]/u.test(target.street[i]!)))
      && identity.addresses.some((lot) => dongs.some((dong) => invoiceAddressCore(lot)?.street === dong))
      && !invoiceAddressRegionsConflict(left, address) && !invoiceAddressRegionsConflict(left, right);
  });
}
export function invoiceAddressRelation(left: string, right: string, evidence: InvoiceAddressEvidence = new Map(), allowStreetTypo = false): "match" | "conflict" | "unknown" {
  if (!left.trim() || !right.trim()) return "unknown";
  if (invoiceAddressRegionsConflict(left, right)) return "conflict";
  if (invoiceAddressMatches(left, right)) return "match";
  const a = evidence.get(invoiceAddressKey(left)), b = evidence.get(invoiceAddressKey(right));
  const leftAddresses = [left, ...(a?.status === "found" ? a.addresses : [])];
  const rightAddresses = [right, ...(b?.status === "found" ? b.addresses : [])];
  if (leftAddresses.some((l) => rightAddresses.some((r) => invoiceAddressMatches(l, r)))) return "match";
  // An existing different address, an ambiguous result or a failed lookup never
  // qualifies as a typo. Only a confirmed zero-result query may take this path.
  if (allowStreetTypo && a?.status === "missing" && b && corroboratedStreetTypo(left, right, b)) return "match";
  const ca = invoiceAddressCore(left), cb = invoiceAddressCore(right);
  if (ca && cb && ca.road === cb.road) return "conflict";
  if (a?.status === "found" && b?.status === "found") return "conflict";
  return "unknown";
}
