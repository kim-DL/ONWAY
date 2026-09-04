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

  it("matches a NEIS road address ending in the school's local name", () => {
    const localNameSchool = {
      ...school,
      name: "대전가오초등학교",
      district: "dong" as const,
      address: { ...school.address, road: "대전광역시 동구 신기로 112 가오초등학교 (가오동)" },
    };
    expect(schoolAddressQuery(localNameSchool.address.road, localNameSchool.name))
      .toBe("대전광역시 동구 신기로 112");
    expect(decideKakaoSchoolMatch({
      school: localNameSchool,
      addressResult,
      candidates: [candidate({
        name: localNameSchool.name,
        roadAddress: "대전 동구 신기로 112",
        addressName: "대전 동구 가오동 1",
      })],
    })).toMatchObject({ status: "autoMatched", reason: "HIGH_CONFIDENCE", candidate: { score: 100 } });
    expect(schoolAddressQuery("대전광역시 동구 신기로 112 다른초등학교", localNameSchool.name))
      .toBe("대전광역시 동구 신기로 112 다른초등학교");
  });

  it("keeps a unique exact school match when Kakao also lists its facilities", () => {
    const facilities = [
      ["교무실", "교육,학문 > 학교부속시설"],
      ["행정실", "교육,학문 > 학교부속시설"],
      ["정무관", "교육,학문 > 학교부속시설"],
      ["정문", "교통,수송 > 입출구"],
      ["후문", "교통,수송 > 입출구"],
      ["전기차충전소", "교통,수송 > 자동차 > 전기차 충전소"],
      ["병설유치원 (휴원)", "교육,학문 > 유아교육 > 유치원"],
    ].map(([suffix, categoryName], index) => candidate({
      candidateId: `facility-${index}`,
      placeId: `facility-${index}`,
      name: `${school.name} ${suffix}`,
      categoryName,
    }));
    const decision = decideKakaoSchoolMatch({ school, addressResult, candidates: [...facilities, candidate()] });
    expect(decision).toMatchObject({
      status: "autoMatched", reason: "HIGH_CONFIDENCE", candidate: { name: school.name, score: 100 },
    });
    // Keep all evidence available to the administrator, including excluded facilities.
    expect(decision.candidates).toHaveLength(8);
  });

  it.each([
    ["대전다른초등학교", "교육,학문 > 학교 > 초등학교"],
    [`${school.name} 제2캠퍼스`, "교육,학문 > 학교 > 초등학교"],
    [`${school.name} 분교장`, "교육,학문 > 학교부속시설"],
    [`${school.name} 새교육관`, "교육,학문 > 학교 > 초등학교"],
    [`${school.name}육원`, "교육,학문 > 학교부속시설"],
  ])("retains genuine or uncertain school candidates for review: %s", (name, categoryName) => {
    const decision = decideKakaoSchoolMatch({
      school,
      addressResult,
      candidates: [candidate(), candidate({ candidateId: "other", placeId: "other", name, categoryName })],
    });
    expect(decision).toMatchObject({ status: "needsReview", reason: "MULTIPLE_PLAUSIBLE_CANDIDATES" });
  });

  it.each([
    ["온누리초등학교(급속) 전기차충전소", "교통,수송 > 자동차 > 전기차 충전소"],
    ["온누리초등학교(대전) 전기차충전소", "교통,수송 > 자동차 > 전기차 충전소"],
    ["온누리초등학교 전기차충전소", "교통,수송 > 자동차 > 전기차 충전소"],
    ["온누리초등학교 매점", "가정,생활 > 슈퍼마켓"],
    ["온누리초등학교 정문", "교통,수송 > 입출구"],
    ["대전온누리초등학교 체육관", "스포츠,레저 > 스포츠시설 > 체육관"],
  ])("recognizes same-address campus facilities with local school names: %s", (name, categoryName) => {
    expect(decideKakaoSchoolMatch({
      school, addressResult,
      candidates: [candidate({ candidateId: "facility", placeId: "facility", name, categoryName }), candidate()],
    })).toMatchObject({ status: "autoMatched", candidate: { name: school.name, score: 100 } });
  });

  it.each([
    ["온누리초등학교(이전) 전기차충전소", "교통,수송 > 자동차 > 전기차 충전소"],
    ["온누리초등학교 제2캠퍼스 체육관", "스포츠,레저 > 스포츠시설 > 체육관"],
    ["온누리초등학교 매점", "교육,학문 > 학교 > 초등학교"],
    ["온누리초등학교앞 매점", "가정,생활 > 슈퍼마켓"],
    ["다른초등학교 체육관", "스포츠,레저 > 스포츠시설 > 체육관"],
  ])("does not hide uncertain aliases or mismatched facility categories: %s", (name, categoryName) => {
    expect(decideKakaoSchoolMatch({
      school, addressResult,
      candidates: [candidate(), candidate({ candidateId: "other", placeId: "other", name, categoryName })],
    })).toMatchObject({ status: "needsReview", reason: "MULTIPLE_PLAUSIBLE_CANDIDATES" });
  });

  it("keeps a distant facility with a falsely matching road address for review", () => {
    expect(decideKakaoSchoolMatch({
      school, addressResult: { ...addressResult, latitude: 36.353, longitude: 127.38 },
      candidates: [candidate(), candidate({
        candidateId: "distant", placeId: "distant", name: `${school.name} 체육관`,
        categoryName: "스포츠,레저 > 스포츠시설 > 체육관", latitude: 36.356,
      })],
    })).toMatchObject({ status: "needsReview", reason: "MULTIPLE_PLAUSIBLE_CANDIDATES" });
  });

  it("does not substitute a school office when the school itself is missing", () => {
    const decision = decideKakaoSchoolMatch({
      school,
      addressResult,
      candidates: [candidate({ name: `${school.name} 행정실`, categoryName: "교육,학문 > 학교부속시설" })],
    });
    expect(decision).toMatchObject({ status: "needsReview", reason: "LOW_CONFIDENCE" });
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
