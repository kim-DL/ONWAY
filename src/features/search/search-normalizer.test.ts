import { describe, expect, it } from "vitest";

import { createPhase1Seed } from "@/seed/phase1";
import {
  deriveCatalogSearchFields,
  deriveSchoolShortName,
  getKoreanInitials,
  normalizeSearchText,
} from "./search-normalizer";

describe("school search normalization", () => {
  it("normalizes Unicode, whitespace, case, and punctuation consistently", () => {
    expect(normalizeSearchText("  ＤＡＥＪＥＯＮ · 대전 둔산-초  ")).toBe("daejeon대전둔산초");
  });

  it("creates Korean initials without dropping non-Hangul search characters", () => {
    expect(getKoreanInitials("대전둔산초등학교")).toBe("ㄷㅈㄷㅅㅊㄷㅎㄱ");
    expect(getKoreanInitials("KAIST 부설고")).toBe("kaistㅂㅅㄱ");
  });

  it("generates common Daejeon school abbreviations", () => {
    expect(deriveSchoolShortName("대전둔산초등학교", "elementary")).toBe("둔산초");
    expect(deriveSchoolShortName("대전둔산여자고등학교", "high")).toBe("둔산여고");
    expect(deriveSchoolShortName("대전한밭중학교", "middle")).toBe("한밭중");
  });

  it("preserves explicit aliases while adding safe generated aliases", () => {
    const school = createPhase1Seed().schools.find((candidate) => candidate.schoolId.endsWith("004"));
    expect(school).toBeDefined();
    if (!school) return;
    const fields = deriveCatalogSearchFields(school);
    expect(fields.aliases).toEqual(expect.arrayContaining([
      "대전구명고등학교",
      "구명고",
      "새빛고",
      "새빛고등학교",
      "대전새빛고",
    ]));
    expect(new Set(fields.aliases.map(normalizeSearchText)).size).toBe(fields.aliases.length);
  });
});
