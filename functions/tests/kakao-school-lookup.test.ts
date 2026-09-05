import { describe, expect, it, vi } from "vitest";
import { KakaoLocalClientError, type KakaoPlaceCandidate } from "../src/sync/kakao-local-client.js";
import { lookupKakaoSchool } from "../src/sync/kakao-school-lookup.js";
import type { StoredSchool } from "../src/sync/school-sync-types.js";

const school = {
  name: "대전괴정중학교", schoolType: "middle", district: "seo",
  address: { road: "대전광역시 서구 가장로 15 (괴정동,대전괴정중학교)", jibun: null },
} as StoredSchool;
const candidate: KakaoPlaceCandidate = {
  candidateId: "10234433", placeId: "10234433", name: school.name,
  categoryName: "교육,학문 > 학교 > 중학교", roadAddress: "대전 서구 가장로 15", addressName: "대전 서구 괴정동 120",
  latitude: 36.3403928736948, longitude: 127.378814458223, placeUrl: "http://place.map.kakao.com/10234433",
};
const address = { addressName: candidate.addressName, roadAddress: candidate.roadAddress, latitude: candidate.latitude, longitude: candidate.longitude };

describe("independent address and school-place lookup", () => {
  it("normalizes the address and retains geographic ranking on the normal path", async () => {
    const searchAddress = vi.fn(async () => address);
    const searchKeyword = vi.fn(async () => [candidate]);
    const result = await lookupKakaoSchool(school, { searchAddress, searchKeyword });
    expect(searchAddress).toHaveBeenCalledExactlyOnceWith("대전광역시 서구 가장로 15");
    expect(searchKeyword).toHaveBeenCalledExactlyOnceWith({ query: "대전괴정중학교 대전", origin: address });
    expect(result).toMatchObject({ status: "autoMatched", candidate: { score: 100 } });
  });

  it.each([
    new KakaoLocalClientError("TIMEOUT", "timeout"),
    new KakaoLocalClientError("INVALID_RESPONSE", "invalid"),
    new KakaoLocalClientError("HTTP_ERROR", "network", 0),
    new KakaoLocalClientError("HTTP_ERROR", "server", 503),
    new KakaoLocalClientError("HTTP_ERROR", "address", 400),
  ])("recovers an address-only failure without lowering identity requirements: %s", async (error) => {
    const searchKeyword = vi.fn(async () => [candidate]);
    const result = await lookupKakaoSchool(school, {
      searchAddress: async () => { throw error; }, searchKeyword,
    });
    expect(searchKeyword).toHaveBeenCalledExactlyOnceWith({ query: "대전괴정중학교 대전", origin: null });
    expect(result).toMatchObject({ status: "autoMatched", candidate: { score: 90, distanceMeters: null } });
  });

  it.each([401, 403, 429])("does not issue another endpoint request on shared authorization/quota failure %i", async (status) => {
    const error = new KakaoLocalClientError("HTTP_ERROR", "provider denied", status);
    const searchKeyword = vi.fn();
    await expect(lookupKakaoSchool(school, {
      searchAddress: async () => { throw error; }, searchKeyword,
    })).rejects.toBe(error);
    expect(searchKeyword).not.toHaveBeenCalled();
  });

  it("does not hide unknown programming or provider errors", async () => {
    const error = new Error("unknown");
    const searchKeyword = vi.fn();
    await expect(lookupKakaoSchool(school, {
      searchAddress: async () => { throw error; }, searchKeyword,
    })).rejects.toBe(error);
    expect(searchKeyword).not.toHaveBeenCalled();
  });

  it.each([
    { name: "대전괴정고등학교" },
    { roadAddress: "대전 서구 가장로 150" },
    { name: "대전괴정중학교 행정실", categoryName: "교육 > 학교부속시설" },
    { latitude: 37.5, longitude: 126.9, roadAddress: "서울 서구 가장로 15", addressName: "서울 서구" },
  ])("never accepts an inexact school merely because its address endpoint failed: %j", async (change) => {
    const result = await lookupKakaoSchool(school, {
      searchAddress: async () => { throw new KakaoLocalClientError("TIMEOUT", "timeout"); },
      searchKeyword: async () => [{ ...candidate, ...change }],
    });
    expect(result.status).toBe("needsReview");
  });

  it("preserves genuine ambiguity and an empty keyword result", async () => {
    const client = { searchAddress: async () => null, searchKeyword: async () => [candidate, { ...candidate, placeId: "duplicate", candidateId: "duplicate" }] };
    expect(await lookupKakaoSchool(school, client)).toMatchObject({ status: "needsReview" });
    expect(await lookupKakaoSchool(school, { ...client, searchKeyword: async () => [] })).toMatchObject({ status: "failed", reason: "NO_CANDIDATE" });
  });
});
