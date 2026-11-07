import { HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { customerPointSchema } from "../customer/customer-contract.js";
import type { ProviderFetch, RouteStop } from "./planning-providers.js";

export interface RegisteredDestination { customerId: string; name: string; address: string }
type Point = z.infer<typeof customerPointSchema>;
export type AddressResolver = (address: string) => Promise<Point | null>;

export function registeredAddressQuery(address: string) {
  // Floor/room and parenthetical building descriptions are not route destinations.
  return address.normalize("NFC").replace(/\([^)]*\)/gu, " ").split(",")[0]!
    .replace(/\s+(?:지하\s*)?\d+(?:층|호).*$/u, "").replace(/\s+/gu, " ").trim();
}

export function registeredCustomerAddress(address: string, district: string) {
  const query = registeredAddressQuery(address);
  const region = district.trim();
  // Only supplement abbreviated addresses with their saved municipality; never assume a city.
  return query && /^[가-힣\s]+(?:시|군|구)$/u.test(region) && !/(?:^|\s)[가-힣]+(?:시|군|구)(?:\s|$)/u.test(query)
    ? `${region} ${query}` : query;
}

const coordinate = z.union([z.number(), z.string().trim().min(1).pipe(z.coerce.number())]);
const responseSchema = z.object({
  meta: z.object({ total_count: z.number().int().nonnegative() }),
  documents: z.array(z.object({ address_type: z.string(), x: coordinate.pipe(z.number().finite().min(-180).max(180)),
    y: coordinate.pipe(z.number().finite().min(-90).max(90)) })).max(30),
});

export function createRegisteredAddressResolver(key: () => string, fetcher: ProviderFetch = fetch): AddressResolver {
  // Server RAM only. Exact address changes use a different key; no customer/location writes.
  const cache = new Map<string, { point: Point; expiresAt: number }>();
  return async (address) => {
    const query = registeredAddressQuery(address);
    if (!query) return null;
    const cached = cache.get(query);
    if (cached && cached.expiresAt > Date.now()) return { ...cached.point };
    cache.delete(query);
    const apiKey = key().trim();
    if (!apiKey) throw new HttpsError("failed-precondition", "등록 주소 검색 설정이 필요합니다. 관리자에게 알려주세요.");
    try {
      const search = new URLSearchParams({ query, analyze_type: "exact", size: "30" });
      const response = await fetcher(`https://dapi.kakao.com/v2/local/search/address.json?${search}`, {
        method: "GET", headers: { Authorization: `KakaoAK ${apiKey}` }, signal: AbortSignal.timeout(6_000),
      });
      if (!response.ok) throw new HttpsError(response.status === 429 ? "resource-exhausted" : "unavailable", "주소 검색에 연결하지 못했어요. 잠시 후 다시 시도해주세요.");
      const result = responseSchema.parse(await response.json());
      const document = result.documents[0];
      // Never silently select the first ambiguous address or an entire district.
      if (result.meta.total_count !== 1 || result.documents.length !== 1 || !document || !["ROAD_ADDR", "REGION_ADDR"].includes(document.address_type)) return null;
      const point = customerPointSchema.parse({ latitude: document.y, longitude: document.x });
      if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
      cache.set(query, { point, expiresAt: Date.now() + 24 * 60 * 60_000 });
      return { ...point };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("unavailable", "주소 검색 응답을 확인하지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  };
}

export async function resolveRegisteredStops(destinations: RegisteredDestination[], resolve: AddressResolver): Promise<RouteStop[]> {
  const queries = [...new Set(destinations.map((d) => registeredAddressQuery(d.address)))];
  const points = new Map<string, Point | null>();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, queries.length) }, async () => {
    while (next < queries.length) {
      const query = queries[next++]!;
      points.set(query, query ? await resolve(query) : null);
    }
  }));
  const missing = destinations.filter((d) => !points.get(registeredAddressQuery(d.address)));
  if (missing.length) throw new HttpsError("failed-precondition", `등록 주소를 확인해주세요: ${missing.slice(0, 3).map((d) => d.name).join(", ")}${missing.length > 3 ? ` 외 ${missing.length - 3}곳` : ""}`);
  return destinations.map((d) => ({ customerId: d.customerId, ...customerPointSchema.parse(points.get(registeredAddressQuery(d.address))) }));
}
