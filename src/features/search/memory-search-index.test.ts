import { describe, expect, it } from "vitest";

import { schoolSearchItemSchema, type SchoolSearchItem } from "@/domain/catalog";
import { MemorySearchIndex } from "./memory-search-index";

function item(input: Partial<SchoolSearchItem> & Pick<SchoolSearchItem, "schoolId" | "name">) {
  return schoolSearchItemSchema.parse({
    shortName: null,
    normalizedName: input.name.replace(/\s/gu, ""),
    initials: "",
    aliases: [],
    schoolType: "elementary",
    district: "seo",
    addressSummary: null,
    operationalStatus: "active",
    photoCount: 0,
    fieldInfoAvailable: false,
    ...input,
  });
}

const DUNSAN = item({
  schoolId: "SCH-NEIS-G100009001",
  name: "대전둔산초등학교",
  shortName: "둔산초",
  normalizedName: "대전둔산초등학교",
  initials: "ㄷㅈㄷㅅㅊㄷㅎㄱ",
  aliases: ["대전둔산초", "옛둔산학교"],
});

describe("MemorySearchIndex", () => {
  const index = new MemorySearchIndex([
    DUNSAN,
    item({
      schoolId: "SCH-NEIS-G100009002",
      name: "대전둔산여자고등학교",
      shortName: "둔산여고",
      normalizedName: "대전둔산여자고등학교",
      initials: "ㄷㅈㄷㅅㅇㅈㄱㄷㅎㄱ",
      schoolType: "high",
    }),
    item({
      schoolId: "SCH-NEIS-G100009003",
      name: "대전둔원초등학교",
      shortName: "둔원초",
      normalizedName: "대전둔원초등학교",
      initials: "ㄷㅈㄷㅇㅊㄷㅎㄱ",
    }),
  ]);

  it.each([
    ["대전둔산초등학교", "officialExact"],
    ["둔산초", "shortExact"],
    ["옛둔산학교", "aliasExact"],
    ["ㄷㅈㄷㅅㅊ", "initialsPrefix"],
    ["둔산쵸", "fuzzy"],
  ] as const)("finds %s with the expected strongest match", (query, matchType) => {
    expect(index.search(query)[0]).toMatchObject({ item: { schoolId: DUNSAN.schoolId }, matchType });
  });

  it("never lets a fuzzy result outrank a direct result", () => {
    const exact = item({
      schoolId: "SCH-NEIS-G100009004",
      name: "둔산쵸",
      normalizedName: "둔산쵸",
      initials: "ㄷㅅㅊ",
    });
    const results = new MemorySearchIndex([DUNSAN, exact]).search("둔산쵸");
    expect(results.map((result) => result.matchType)).toEqual(["officialExact", "fuzzy"]);
  });

  it("keeps 500-school searches within the 50ms calculation budget", () => {
    const items = Array.from({ length: 500 }, (_, index) => item({
      schoolId: `SCH-NEIS-G1${String(index).padStart(8, "0")}`,
      name: `대전테스트${index}초등학교`,
      shortName: `테스트${index}초`,
      normalizedName: `대전테스트${index}초등학교`,
      initials: `ㄷㅈㅌㅅㅌ${index}ㅊㄷㅎㄱ`,
    }));
    const largeIndex = new MemorySearchIndex(items);
    const durations = Array.from({ length: 20 }, (_, index) => {
      const startedAt = performance.now();
      largeIndex.search(`테스트${index}초`);
      return performance.now() - startedAt;
    });
    expect(Math.max(...durations)).toBeLessThan(50);
  });

  it("keeps a 5,000-school direct-match catalog inside the 100ms perceived budget", () => {
    const items = Array.from({ length: 5_000 }, (_, index) => item({
      schoolId: `SCH-NEIS-LARGE${String(index).padStart(6, "0")}`,
      name: `대전성능${index}초등학교`,
      shortName: `성능${index}초`,
      normalizedName: `대전성능${index}초등학교`,
      initials: `ㄷㅈㅅㄴ${index}ㅊㄷㅎㄱ`,
    }));
    const largeIndex = new MemorySearchIndex(items);
    largeIndex.search("성능");
    const durations = Array.from({ length: 12 }, (_, index) => {
      const startedAt = performance.now();
      largeIndex.search(`성능${index}`);
      return performance.now() - startedAt;
    }).sort((left, right) => left - right);
    const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    expect(p95).toBeLessThan(100);
  });
});
