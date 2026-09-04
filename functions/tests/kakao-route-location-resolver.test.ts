import { describe, expect, it, vi } from "vitest";

import { KakaoRouteLocationResolver } from "../src/sales/kakao-route-location-resolver.js";

const actor = { uid: "uid-sales", employeeId: "EMP-SALES" };
const candidate = {
  candidateId: "place-1",
  placeId: "place-1",
  name: "대전온누리초등학교",
  categoryName: "교육 > 학교",
  addressName: "대전 동구 자양동 1",
  roadAddress: "대전 동구 백룡로11번길 20",
  latitude: 36.35,
  longitude: 127.38,
  placeUrl: "https://place.map.kakao.com/place-1",
  score: 100,
  nameExact: true,
  roadAddressExact: true,
  districtMatched: true,
  distanceMeters: 0,
  regionValid: true,
};

describe("Kakao route location resolver", () => {
  it("returns a trusted auto-matched coordinate", async () => {
    const match = vi.fn(async () => ({
      schoolId: "SCHOOL-1",
      schoolBaseRevision: 2,
      status: "autoMatched" as const,
      reason: "HIGH_CONFIDENCE",
      candidates: [candidate],
      acceptedLocation: { latitude: 36.35, longitude: 127.38 },
      replayed: false,
    }));
    const resolver = new KakaoRouteLocationResolver({ match });
    await expect(resolver.resolve("SCHOOL-1", actor)).resolves.toEqual({
      ok: true,
      latitude: 36.35,
      longitude: 127.38,
    });
    expect(match).toHaveBeenCalledWith(expect.objectContaining({ schoolId: "SCHOOL-1" }), actor);
  });

  it("preserves the administrator-confirmed coordinate instead of a search candidate", async () => {
    const match = vi.fn(async () => ({
      schoolId: "SCHOOL-1",
      schoolBaseRevision: 2,
      status: "confirmed" as const,
      reason: "CONFIRMED_LOCATION_NEARBY",
      acceptedLocation: { latitude: 36.351, longitude: 127.381 },
      candidates: [
        { ...candidate, regionValid: false },
        { ...candidate, candidateId: "place-2", placeId: "place-2", latitude: 36.4 },
      ],
      replayed: false,
    }));
    const resolver = new KakaoRouteLocationResolver({ match });
    await expect(resolver.resolve("SCHOOL-1", actor)).resolves.toEqual({
      ok: true,
      latitude: 36.351,
      longitude: 127.381,
    });
  });

  it("distinguishes provider failures from locations that need review", async () => {
    const provider = new KakaoRouteLocationResolver({
      match: vi.fn(async () => ({
        schoolId: "SCHOOL-1",
        schoolBaseRevision: 1,
        status: "failed" as const,
        reason: "KAKAO_API_FAILURE",
        candidates: [],
        acceptedLocation: null,
        replayed: false,
      })),
    });
    const review = new KakaoRouteLocationResolver({
      match: vi.fn(async () => ({
        schoolId: "SCHOOL-1",
        schoolBaseRevision: 1,
        status: "needsReview" as const,
        reason: "LOW_CONFIDENCE",
        candidates: [candidate],
        acceptedLocation: null,
        replayed: false,
      })),
    });
    await expect(provider.resolve("SCHOOL-1", actor)).resolves.toEqual({ ok: false, reason: "provider-unavailable" });
    await expect(review.resolve("SCHOOL-1", actor)).resolves.toEqual({ ok: false, reason: "review-required" });
  });
});
