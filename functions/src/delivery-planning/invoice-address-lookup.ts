import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizeCustomerName } from "../customer/customer-contract.js";
import { invoiceAddressCore, invoiceAddressKey, invoiceAddressMatches, invoiceAddressRegionsConflict, invoiceAddressRelation,
  type AddressIdentity, type AddressIdentityResolver, type InvoiceAddressEvidence } from "./invoice-address.js";
import { invoiceNameCandidates } from "./invoice-names.js";
import type { MatchCustomer } from "./invoice-matching.js";
import type { PhotoAlias, PhotoExtractionRow } from "./photo-batch-contract.js";
import type { ProviderFetch } from "./planning-providers.js";

const address = z.object({ address_name: z.string().trim().min(1).max(500) }).nullable().optional();
const responseSchema = z.object({ meta: z.object({ total_count: z.number().int().nonnegative() }),
  documents: z.array(z.object({ address_type: z.string(), address, road_address: address })).max(30) });

/** Canonical address strings, never map-pin proximity. Failures remain reviewable. */
export function createInvoiceAddressResolver(key: () => string, fetcher: ProviderFetch = fetch): AddressIdentityResolver {
  const cache = new Map<string, { value: AddressIdentity; expiresAt: number }>();
  return async (input) => {
    const query = invoiceAddressKey(input);
    if (!invoiceAddressCore(query)) return null;
    const cached = cache.get(query);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    cache.delete(query);
    const secret = key().trim(); if (!secret) return null;
    try {
      const params = new URLSearchParams({ query, analyze_type: "exact", size: "30" });
      const response = await fetcher(`https://dapi.kakao.com/v2/local/search/address.json?${params}`, {
        method: "GET", headers: { Authorization: `KakaoAK ${secret}` }, signal: AbortSignal.timeout(2_000),
      });
      if (!response.ok) return null;
      const result = responseSchema.parse(await response.json()); const document = result.documents[0];
      let value: AddressIdentity;
      if (result.meta.total_count === 0 && result.documents.length === 0) value = { status: "missing" };
      else {
        if (result.meta.total_count !== 1 || result.documents.length !== 1 || !document
          || !["ROAD_ADDR", "REGION_ADDR"].includes(document.address_type)) return null;
        const addresses = [...new Set([document.address?.address_name, document.road_address?.address_name].filter((a): a is string => Boolean(a)))];
        const source = invoiceAddressCore(query)!;
        if (!addresses.length || addresses.some((a) => !invoiceAddressCore(a) || invoiceAddressRegionsConflict(query, a))
          || !addresses.some((a) => { const core = invoiceAddressCore(a)!; return core.road === source.road && core.number === source.number; })) return null;
        value = { status: "found", addresses };
      }
      if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
      cache.set(query, { value, expiresAt: Date.now() + (value.status === "found" ? 86400_000 : 300_000) });
      return value;
    } catch { return null; }
  };
}

/** External lookups run once outside Firestore transactions. Keys bind evidence
 * to the exact current address; no customer, alias or photo is written here. */
export async function prepareInvoiceAddressEvidence(rows: readonly PhotoExtractionRow[], customers: readonly MatchCustomer[],
  aliases: readonly PhotoAlias[], resolve: AddressIdentityResolver): Promise<InvoiceAddressEvidence> {
  const evidence = new Map<string, AddressIdentity | null>();
  const checks = rows.filter((r) => !r.uncertain && invoiceAddressCore(r.address)).map((row) => {
    const candidates = invoiceNameCandidates(row.rawName, customers);
    if (!candidates.length) {
      const key = createHash("sha256").update(normalizeCustomerName(row.rawName)).digest("hex");
      const alias = aliases.find((a) => a.aliasKey === key && a.enabled);
      const target = alias && customers.find((c) => c.customerId === alias.customerId && normalizeCustomerName(c.name) === normalizeCustomerName(alias.targetName));
      if (target) candidates.push(target);
    }
    return { row, candidates: candidates.length <= 6 ? candidates : [] };
  });
  const deadline = Date.now() + 8_000; let used = 0;
  const lookup = async (addresses: string[]) => {
    const queries = [...new Set(addresses.map(invoiceAddressKey))].filter((q) => !evidence.has(q) && invoiceAddressCore(q)); let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, queries.length) }, async () => {
      while (next < queries.length && used < 24 && Date.now() < deadline) {
        const query = queries[next++]!; used++;
        try { evidence.set(query, await resolve(query)); } catch { evidence.set(query, null); }
      }
    }));
  };
  await lookup(checks.flatMap(({ row, candidates }) => candidates.flatMap((c) => [c.officialAddress, c.deliveryAddress]
    .filter((a) => a.trim() && !invoiceAddressMatches(row.address, a) && !invoiceAddressRegionsConflict(row.address, a)))));
  await lookup(checks.filter(({ row, candidates }) => candidates.length && !candidates.some((c) => [c.officialAddress, c.deliveryAddress]
    .some((a) => invoiceAddressRelation(row.address, a, evidence) === "match"))).map(({ row }) => row.address));
  return evidence;
}
