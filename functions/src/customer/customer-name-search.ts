import { getCustomerChoseong, normalizeCustomerName } from "./customer-contract.js";

function withoutCorporateNotation(value: string) {
  return value.replace(/^\s*(?:주식회사|\(주\)|㈜)\s*/u, "").replace(/\s*(?:주식회사|\(주\)|㈜)\s*$/u, "");
}

/** Only an added business suffix may match a complete registered name; no fuzzy guesses. */
export function customerNameMatcher(query: string) {
  const normalized = normalizeCustomerName(query), initials = getCustomerChoseong(query);
  const corporate = normalizeCustomerName(withoutCorporateNotation(query));
  const root = corporate.replace(/(?:종합식품|식자재|유통|식품|푸드|상사|마트)$/u, "");
  const fallback = root !== corporate && /^[가-힣a-z0-9]{2,}$/u.test(root) ? root : null;
  return (customer: { name: string; normalizedName: string; choseongName: string }) =>
    customer.normalizedName.includes(normalized) || customer.choseongName.includes(initials)
    || corporate !== normalized && normalizeCustomerName(withoutCorporateNotation(customer.name)) === corporate
    || fallback !== null && normalizeCustomerName(withoutCorporateNotation(customer.name)) === fallback;
}
