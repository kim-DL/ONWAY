import { describe, expect, it } from "vitest";

import { mapNeisSchool } from "../src/neis/school-mapper.js";
import { decideKakaoSchoolMatch, schoolAddressQuery } from "../src/sync/kakao-school-matcher.js";
import type { KakaoPlaceCandidate } from "../src/sync/kakao-local-client.js";
import type { StoredSchool } from "../src/sync/school-sync-types.js";

const school = mapNeisSchool({
  ATPT_OFCDC_SC_CODE: "G10",
  ATPT_OFCDC_SC_NM: "대전광역시교육청",
  SD_SCHUL_CODE: "G100000001",
  SCHUL_NM: "대전온누리초등학교",
  ENG_SCHUL_NM: "",
  SCHUL_KND_SC_NM: "초등학교",
  LCTN_SC_NM: "대전광역시",
  JU_ORG_NM: "",
  FOND_SC_NM: "공립",
  ORG_RDNZC: "35200",
  ORG_RDNMA: "대전광역시 서구 온누리로 1",
  ORG_RDNDA: "",
  ORG_TELNO: "",
  HMPG_ADRES: "",
  LOAD_DTM: "",
}, { targetEducationOfficeCode: "G10", syncedAt: new Date("2026-08-24T01:00:00Z") }) as unknown as StoredSchool;

function candidate(overrides: Partial<KakaoPlaceCandidate> = {}): KakaoPlaceCandidate {
  return {
    candidateId: "12345",
    placeId: "12345",
    name: school.name,
    categoryName: "교육 > 학교 > 초등학교",
    addressName: "대전광역시 서구 온누리동 1",
    roadAddress: school.address.road!,
    latitude: 36.35,
    longitude: 127.38,
    placeUrl: "https://place.map.kakao.com/12345",
    ...overrides,
  };
}

const addressResult = {
  addressName: "대전광역시 서구 온누리동 1",
  roadAddress: school.address.road,
  latitude: 36.3501,
  longitude: 127.3801,
};

describe("Kakao school matcher", () => {
  it("auto-matches one exact Daejeon school", () => {
    const decision = decideKakaoSchoolMatch({ school, addressResult, candidates: [candidate()] });
    expect(decision).toMatchObject({ status: "autoMatched", reason: "HIGH_CONFIDENCE" });
    expect(decision.candidate?.score).toBe(100);
  });

  it("treats NEIS building details and the Daejeon city alias as the same road address", () => {
    const detailedSchool = {
      ...school,
      address: {
        ...school.address,
        road: "대전광역시 동구 백룡로11번길 20 대전온누리초등학교 (자양동,대전온누리초등학교)",
      },
      district: "dong" as const,
    };
    const decision = decideKakaoSchoolMatch({
      school: detailedSchool,
      addressResult,
      candidates: [candidate({
        roadAddress: "대전 동구 백룡로11번길 20",
        addressName: "대전 동구 자양동 1",
      })],
    });
    expect(schoolAddressQuery(detailedSchool.address.road!, detailedSchool.name))
      .toBe("대전광역시 동구 백룡로11번길 20");
    expect(decision).toMatchObject({ status: "autoMatched", reason: "HIGH_CONFIDENCE" });
  });

  it("requires review when multiple plausible candidates exist", () => {
    const decision = decideKakaoSchoolMatch({
      school,
      addressResult,
      candidates: [candidate(), candidate({ candidateId: "67890", placeId: "67890", latitude: 36.3502 })],
    });
    expect(decision).toMatchObject({ status: "needsReview", reason: "MULTIPLE_PLAUSIBLE_CANDIDATES" });
  });

  it("never auto-confirms an out-of-region namesake", () => {
    const decision = decideKakaoSchoolMatch({
      school,
      addressResult: null,
      candidates: [candidate({
        addressName: "서울특별시 서구 온누리동 1",
        roadAddress: "서울특별시 서구 온누리로 1",
        latitude: 37.56,
        longitude: 126.97,
      })],
    });
    expect(decision).toMatchObject({ status: "needsReview", reason: "OUT_OF_REGION", candidate: null });
    expect(decision.candidates[0]?.regionValid).toBe(false);
  });
});
