import { z } from "zod";
import { getCustomerChoseong, normalizeCustomerName } from "./customer-contract.js";

export const customerNameMatchSchema = z.object({
  matchType: z.enum(["exact", "prefix", "substring", "initials", "corporate_exact", "business_suffix", "id"]),
  matchedField: z.enum(["name", "aliases", "customerId"]),
  matchedValue: z.string(),
  searchMode: z.enum(["name", "initials", "id"]),
  eligibleForAutoSelection: z.boolean(),
  blockedReason: z.enum(["common_term", "short_query", "weak_match"]).nullable(),
}).strict();
export type CustomerNameMatch = z.infer<typeof customerNameMatchSchema>;
type NamedCustomer = { name: string; aliases?: string[] | undefined };
const initialQuery = /^[ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ]+$/u;
// Generic industry/location words (including concatenations) are discovery queries, not identities.
const commonQuery = /^(?:주식회사|종합|식자재|유통|식품|푸드|foods?|상사|마트|회사|업체|거래처|급식|초등학교|중학교|고등학교|학교|센터|본점|지점|서울|경기|인천|부산|대구|대전|광주|울산|세종|충남|충북|전남|전북|경남|경북|강원|제주)+$/u;
function withoutCorporateNotation(value: string) {
  return value.replace(/^\s*(?:주식회사|\(주\)|㈜)\s*/u, "").replace(/\s*(?:주식회사|\(주\)|㈜)\s*$/u, "");
}
export function customerSearchMode(query: string): "name" | "initials" {
  return initialQuery.test(normalizeCustomerName(query)) ? "initials" : "name";
}
/** Evidence comes only from the registered name or explicitly stored aliases, never fuzzy guesses. */
export function customerNameMatch(query: string, customer: NamedCustomer): CustomerNameMatch | null {
  const normalized = normalizeCustomerName(query);
  if (!normalized) return null;
  const mode = customerSearchMode(query);
  const corporate = normalizeCustomerName(withoutCorporateNotation(query));
  const root = corporate.replace(/(?:종합식품|식자재|유통|식품|푸드|상사|마트)$/u, "");
  const values = [{ field: "name" as const, value: customer.name },
    ...(customer.aliases ?? []).map((value) => ({ field: "aliases" as const, value }))];
  const found: Array<{ rank: number; match: CustomerNameMatch }> = [];
  for (const { field, value } of values) {
    const name = normalizeCustomerName(value);
    let type: CustomerNameMatch["matchType"] | null = null;
    if (mode === "initials") {
      if (getCustomerChoseong(value).includes(normalized)) type = "initials";
    } else if (name === normalized) type = "exact";
    else if (name.startsWith(normalized)) type = "prefix";
    else if (corporate && (corporate !== normalized || withoutCorporateNotation(value) !== value)
      && normalizeCustomerName(withoutCorporateNotation(value)) === corporate) type = "corporate_exact";
    else if (name.includes(normalized)) type = "substring";
    else if (root !== corporate && /^[가-힣a-z0-9]{2,}$/u.test(root)
      && normalizeCustomerName(withoutCorporateNotation(value)) === root) type = "business_suffix";
    if (!type) continue;
    const identityQuery = type === "business_suffix" ? root : corporate;
    const blockedReason = type === "exact" && field === "name" ? null
      : mode === "initials" || type === "substring" ? "weak_match" as const
        : commonQuery.test(identityQuery) ? "common_term" as const
          : Array.from(identityQuery).length < 2 ? "short_query" as const : null;
    const rank = type === "exact" ? field === "name" ? 0 : 1
      : type === "corporate_exact" ? 2 : type === "prefix" ? 3 : type === "business_suffix" ? 4 : 5;
    found.push({ rank, match: { matchType: type, matchedField: field,
      matchedValue: value, searchMode: mode,
      eligibleForAutoSelection: blockedReason === null, blockedReason } });
  }
  return found.sort((a, b) => a.rank - b.rank)[0]?.match ?? null;
}
export function customerNameMatcher(query: string) {
  return (customer: NamedCustomer) => customerNameMatch(query, customer) !== null;
}
/** Full registered names win. All other automatic choices must be strong and collision-free. */
export function selectCustomerCandidate<T extends NamedCustomer>(query: string, candidates: T[],
  page: { complete: boolean; startedFromBeginning: boolean }): T | null {
  if (!page.complete || !page.startedFromBeginning) return null;
  const normalized = normalizeCustomerName(query);
  if (!normalized || customerSearchMode(query) === "initials") return null;
  const exact = candidates.filter((customer) => normalizeCustomerName(customer.name) === normalized);
  if (exact.length) return exact.length === 1 ? exact[0]! : null;
  return candidates.length === 1 && customerNameMatch(query, candidates[0]!)?.eligibleForAutoSelection ? candidates[0]! : null;
}
export function customerIdMatch(customerId: string): CustomerNameMatch {
  return { matchType: "id", matchedField: "customerId", matchedValue: customerId, searchMode: "id",
    eligibleForAutoSelection: true, blockedReason: null };
}
