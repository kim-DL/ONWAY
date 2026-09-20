import { describe, expect, it, vi } from "vitest";
import { KakaoLocalClient, type KakaoFetcher } from "../src/sync/kakao-local-client.js";
import { reverseCustomerAddress } from "../src/customer/customer-location.js";

describe("customer administrative dong lookup", () => {
  it("uses H administrative region, not B legal dong", async () => {
    const fetcher = vi.fn<KakaoFetcher>(async () => ({ ok: true, status: 200, json: async () => ({ documents: [
      { region_type: "B", region_2depth_name: "서구", region_3depth_name: "법정동", address_name: "대전 서구 법정동" },
      { region_type: "H", region_2depth_name: "서구", region_3depth_name: "탄방동", address_name: "대전 서구 탄방동" },
    ] }) }));
    const client = new KakaoLocalClient({ restApiKey: "test-key", fetcher });
    expect(await client.reverseAdministrativeRegion({ latitude: 36.35, longitude: 127.38 })).toEqual({ district: "서구", administrativeDong: "탄방동", address: "대전 서구 탄방동" });
    const url = new URL(fetcher.mock.calls[0]![0]!);
    expect(url.pathname).toBe("/v2/local/geo/coord2regioncode.json");
    expect(url.searchParams.get("x")).toBe("127.38");
    expect(url.searchParams.get("y")).toBe("36.35");
  });
  it("returns blank editable fields when administrative region is unavailable", async () => {
    const client = new KakaoLocalClient({ restApiKey: "test-key", fetcher: async () => ({ ok: true, status: 200, json: async () => ({ documents: [
      { region_type: "B", region_2depth_name: "서구", region_3depth_name: "법정동", address_name: "대전 서구 법정동" },
    ] }) }) });
    expect(await client.reverseAdministrativeRegion({ latitude: 36.35, longitude: 127.38 })).toEqual({ district: "", administrativeDong: "", address: "" });
  });
});

describe("customer pin-confirmed delivery address", () => {
  const point = { latitude: 36.35, longitude: 127.38 };
  const region = { district: "서구", administrativeDong: "탄방동", address: "대전 서구 탄방동" };
  it("uses coord2address and prefers a road address over the parcel", async () => {
    const fetcher = vi.fn<KakaoFetcher>(async () => ({ ok: true, status: 200, json: async () => ({ documents: [{
      address: { address_name: "대전 서구 탄방동 1" }, road_address: { address_name: "대전 서구 남선로 17" },
    }] }) }));
    const client = new KakaoLocalClient({ restApiKey: "test-key", fetcher });
    expect(await reverseCustomerAddress({ reverseAddress: (location) => client.reverseAddress(location), reverseAdministrativeRegion: async () => region }, point))
      .toEqual({ district: "서구", administrativeDong: "탄방동", address: "대전 서구 남선로 17" });
    const url = new URL(fetcher.mock.calls[0]![0]);
    expect(url.pathname).toBe("/v2/local/geo/coord2address.json");
    expect(Object.fromEntries(url.searchParams)).toEqual({ x: "127.38", y: "36.35", input_coord: "WGS84" });
  });
  it("falls back to parcel address when road address does not exist", async () => {
    const client = new KakaoLocalClient({ restApiKey: "test-key", fetcher: async () => ({ ok: true, status: 200, json: async () => ({ documents: [{
      address: { address_name: "대전 서구 탄방동 1" }, road_address: null,
    }] }) }) });
    expect(await reverseCustomerAddress({ reverseAddress: (location) => client.reverseAddress(location), reverseAdministrativeRegion: async () => region }, point))
      .toMatchObject({ address: "대전 서구 탄방동 1" });
  });
  it("keeps no-address points blank instead of mistaking region names for an address", async () => {
    const client = new KakaoLocalClient({ restApiKey: "test-key", fetcher: async () => ({ ok: true, status: 200, json: async () => ({ documents: [] }) }) });
    expect(await reverseCustomerAddress({ reverseAddress: (location) => client.reverseAddress(location), reverseAdministrativeRegion: async () => region }, point))
      .toEqual({ ...region, address: "" });
  });
  it("allows a valid delivery address when optional legacy region lookup fails", async () => {
    expect(await reverseCustomerAddress({ reverseAddress: async () => ({ roadAddress: "대전 서구 남선로 17", addressName: "" }),
      reverseAdministrativeRegion: async () => { throw new Error("optional region unavailable"); } }, point))
      .toEqual({ district: "", administrativeDong: "", address: "대전 서구 남선로 17" });
  });
  it("propagates address failures instead of returning regional text as success", async () => {
    await expect(reverseCustomerAddress({ reverseAddress: async () => { throw new Error("address unavailable"); }, reverseAdministrativeRegion: async () => region }, point))
      .rejects.toThrow("address unavailable");
  });
  it.each([{ documents: [{}] }, { documents: [{ address: { address_name: 123 }, road_address: null }] }, { documents: [{ address: null, road_address: { address_name: "x".repeat(501) } }] }])
    ("rejects malformed address responses: %j", async (payload) => {
      const client = new KakaoLocalClient({ restApiKey: "test-key", fetcher: async () => ({ ok: true, status: 200, json: async () => payload }) });
      await expect(client.reverseAddress(point)).rejects.toMatchObject({ kind: "INVALID_RESPONSE" });
    });
  it("preserves quota errors without retrying a request for pin confirmation", async () => {
    const fetcher = vi.fn<KakaoFetcher>(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    const client = new KakaoLocalClient({ restApiKey: "test-key", fetcher });
    await expect(client.reverseAddress(point)).rejects.toMatchObject({ kind: "HTTP_ERROR", httpStatus: 429 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
