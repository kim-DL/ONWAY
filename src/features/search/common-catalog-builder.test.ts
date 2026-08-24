import { describe, expect, it } from "vitest";

import { commonSearchCatalogSchema } from "@/domain/catalog";
import { createPhase1Seed } from "@/seed/phase1";
import {
  buildCommonSearchCatalog,
  estimateCatalogDocumentBytes,
  MAX_COMMON_CATALOG_DOCUMENT_BYTES,
} from "./common-catalog-builder";

describe("common search catalog builder", () => {
  it("builds validated, district-scoped, deterministic catalog documents", () => {
    const seed = createPhase1Seed();
    const build = buildCommonSearchCatalog({
      schools: seed.schools,
      fieldProfiles: seed.fieldProfiles,
      photos: seed.photos,
      version: 7,
      generatedAt: new Date("2026-08-23T00:00:00.000Z"),
    });

    expect(build.itemCount).toBe(5);
    expect(build.catalogIds.every((id) => id.startsWith("common-v000007-"))).toBe(true);
    expect(build.documents.every((document) => commonSearchCatalogSchema.safeParse(document).success)).toBe(true);
    expect(build.documents.every((document) => estimateCatalogDocumentBytes(document) <= MAX_COMMON_CATALOG_DOCUMENT_BYTES)).toBe(true);
    expect(new Set(build.documents.flatMap((document) => document.items.map((item) => item.schoolId))).size).toBe(5);

    const firstSchool = build.documents.flatMap((document) => document.items)
      .find((item) => item.schoolId === "SCH-NEIS-G100000001");
    expect(firstSchool).toMatchObject({
      shortName: "온누리고",
      photoCount: 3,
      fieldInfoAvailable: true,
      addressSummary: "대전광역시 서구 온누리로 1",
    });
  });

  it("splits a district without exceeding the configured document budget", () => {
    const seed = createPhase1Seed();
    const repeatedSchools = Array.from({ length: 10 }, (_, index) => ({
      ...structuredClone(seed.schools[0]!),
      schoolId: `SCH-NEIS-G1999999${String(index).padStart(2, "0")}`,
      source: {
        ...structuredClone(seed.schools[0]!.source),
        schoolCode: `G1999999${String(index).padStart(2, "0")}`,
      },
      name: `대전카탈로그테스트${index}고등학교`,
      normalizedName: `대전카탈로그테스트${index}고등학교`,
    }));
    const build = buildCommonSearchCatalog({
      schools: repeatedSchools,
      fieldProfiles: [],
      photos: [],
      version: 2,
      generatedAt: new Date("2026-08-23T00:00:00.000Z"),
      maximumDocumentBytes: 1_500,
    });
    expect(build.documents.length).toBeGreaterThan(1);
    expect(build.documents.every((document) => estimateCatalogDocumentBytes(document) <= 1_500)).toBe(true);
    expect(build.documents.every((document) => document.chunkCount === build.documents.length)).toBe(true);
  });

  it("fails before publishing duplicate schools or an empty catalog", () => {
    const school = createPhase1Seed().schools[0]!;
    expect(() => buildCommonSearchCatalog({
      schools: [school, school],
      fieldProfiles: [],
      photos: [],
      version: 1,
      generatedAt: new Date(),
    })).toThrow(/Duplicate schoolId/);
    expect(() => buildCommonSearchCatalog({
      schools: [],
      fieldProfiles: [],
      photos: [],
      version: 1,
      generatedAt: new Date(),
    })).toThrow(/cannot be empty/);
  });
});
