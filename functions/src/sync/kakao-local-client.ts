import { z } from "zod";

const KAKAO_LOCAL_ENDPOINT = "https://dapi.kakao.com/v2/local";

const addressDocumentSchema = z.object({
  address_name: z.string(),
  x: z.coerce.number(),
  y: z.coerce.number(),
  road_address: z.object({ address_name: z.string() }).nullable().optional(),
}).passthrough();

const keywordDocumentSchema = z.object({
  id: z.string().trim().min(1).max(100),
  place_name: z.string().trim().min(1).max(300),
  category_name: z.string().trim().max(500),
  address_name: z.string().trim().max(500),
  road_address_name: z.string().trim().max(500),
  x: z.coerce.number(),
  y: z.coerce.number(),
  place_url: z.string().url(),
}).passthrough();

const addressResponseSchema = z.object({ documents: z.array(addressDocumentSchema).max(30) });
const keywordResponseSchema = z.object({ documents: z.array(keywordDocumentSchema).max(30) });

export interface KakaoAddressResult {
  addressName: string;
  roadAddress: string | null;
  latitude: number;
  longitude: number;
}

export interface KakaoPlaceCandidate {
  candidateId: string;
  placeId: string;
  name: string;
  categoryName: string;
  addressName: string;
  roadAddress: string;
  latitude: number;
  longitude: number;
  placeUrl: string;
}

export type KakaoFetcher = (url: string, init: { headers: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export class KakaoLocalClientError extends Error {
  constructor(readonly kind: "HTTP_ERROR" | "INVALID_RESPONSE", message: string) {
    super(message);
    this.name = "KakaoLocalClientError";
  }
}

async function wait(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class KakaoLocalClient {
  private readonly fetcher: KakaoFetcher;

  constructor(private readonly options: {
    restApiKey: string;
    fetcher?: KakaoFetcher;
    retryDelaysMs?: readonly number[];
  }) {
    if (!options.restApiKey.trim()) throw new Error("KAKAO_REST_API_KEY is required.");
    this.fetcher = options.fetcher ?? ((url, init) => fetch(url, init));
  }

  private async request(path: string, search: URLSearchParams) {
    const url = `${KAKAO_LOCAL_ENDPOINT}/${path}?${search.toString()}`;
    const delays = this.options.retryDelaysMs ?? [0, 180, 540];
    let lastStatus = 0;
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      const delay = delays[attempt] ?? 0;
      if (delay > 0) await wait(delay);
      try {
        const response = await this.fetcher(url, {
          headers: { Authorization: `KakaoAK ${this.options.restApiKey}` },
        });
        lastStatus = response.status;
        if (response.ok) return await response.json();
        if (response.status < 500 && response.status !== 429) break;
      } catch {
        lastStatus = 0;
      }
    }
    throw new KakaoLocalClientError("HTTP_ERROR", `Kakao Local request failed (${lastStatus || "network"}).`);
  }

  async searchAddress(address: string): Promise<KakaoAddressResult | null> {
    const payload = await this.request("search/address.json", new URLSearchParams({ query: address }));
    const parsed = addressResponseSchema.safeParse(payload);
    if (!parsed.success) throw new KakaoLocalClientError("INVALID_RESPONSE", "Kakao address response is invalid.");
    const first = parsed.data.documents[0];
    if (!first) return null;
    return {
      addressName: first.address_name,
      roadAddress: first.road_address?.address_name ?? null,
      latitude: first.y,
      longitude: first.x,
    };
  }

  async searchKeyword(input: {
    query: string;
    origin?: { latitude: number; longitude: number } | null;
  }): Promise<KakaoPlaceCandidate[]> {
    const search = new URLSearchParams({ query: input.query, size: "15", sort: "accuracy" });
    if (input.origin) {
      search.set("x", String(input.origin.longitude));
      search.set("y", String(input.origin.latitude));
      search.set("radius", "20000");
    }
    const payload = await this.request("search/keyword.json", search);
    const parsed = keywordResponseSchema.safeParse(payload);
    if (!parsed.success) throw new KakaoLocalClientError("INVALID_RESPONSE", "Kakao keyword response is invalid.");
    return parsed.data.documents.map((document) => ({
      candidateId: document.id,
      placeId: document.id,
      name: document.place_name,
      categoryName: document.category_name,
      addressName: document.address_name,
      roadAddress: document.road_address_name,
      latitude: document.y,
      longitude: document.x,
      placeUrl: document.place_url,
    }));
  }
}
