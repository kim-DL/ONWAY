import { describe, expect, it } from "vitest";

import { createPhase1Seed } from "@/seed/phase1";
import { buildKakaoDirectionsUrl } from "./kakao-directions";

describe("Kakao directions", () => {
  it("uses confirmed school coordinates for the exact destination", () => {
    const school = createPhase1Seed().schools[0]!;
    expect(buildKakaoDirectionsUrl(school)).toBe(
      "https://map.kakao.com/link/to/%EB%8C%80%EC%A0%84%EC%98%A8%EB%88%84%EB%A6%AC%EA%B3%A0%EB%93%B1%ED%95%99%EA%B5%90,36.35,127.38",
    );
  });

  it("falls back to an official-name search for unconfirmed coordinates", () => {
    const school = createPhase1Seed().schools[1]!;
    expect(buildKakaoDirectionsUrl(school)).toBe(
      "https://map.kakao.com/link/search/%EB%8C%80%EC%A0%84%ED%95%9C%EB%B0%AD%EC%A4%91%ED%95%99%EA%B5%90",
    );
  });
});
