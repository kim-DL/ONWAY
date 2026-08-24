import { describe, expect, it } from "vitest";

import type { NeisSchoolRow } from "../src/neis/contract.js";
import { mapNeisSchool } from "../src/neis/school-mapper.js";
import { buildNeisDiffPlan } from "../src/sync/neis-diff-engine.js";
import type { StoredSchool } from "../src/sync/school-sync-types.js";

const now = new Date("2026-08-24T01:00:00.000Z");

function row(code: string, name: string, address: string, overrides: Partial<NeisSchoolRow> = {}): NeisSchoolRow {
  return {
    ATPT_OFCDC_SC_CODE: "G10",
    ATPT_OFCDC_SC_NM: "대전광역시교육청",
    SD_SCHUL_CODE: code,
    SCHUL_NM: name,
    ENG_SCHUL_NM: "",
    SCHUL_KND_SC_NM: "초등학교",
    LCTN_SC_NM: "대전광역시",
    JU_ORG_NM: "",
    FOND_SC_NM: "공립",
    ORG_RDNZC: "35200",
    ORG_RDNMA: address,
    ORG_RDNDA: "",
    ORG_TELNO: "042-000-0000",
    HMPG_ADRES: "https://school.example",
    LOAD_DTM: "20260824",
    ...overrides,
  };
}

function stored(sourceRow: NeisSchoolRow): StoredSchool {
  const imported = mapNeisSchool(sourceRow, { targetEducationOfficeCode: "G10", syncedAt: now });
  return imported as unknown as StoredSchool;
}

describe("NEIS incremental diff", () => {
  it("detects changes by stable school code and keeps previous identity", () => {
    const first = stored(row("G100000001", "대전온누리초등학교", "대전광역시 서구 온누리로 1"));
    const missing = stored(row("G100000002", "대전한밭초등학교", "대전광역시 중구 한밭로 2"));
    const changed = mapNeisSchool(row(
      "G100000001",
      "대전온누리새봄초등학교",
      "대전광역시 유성구 새봄로 11",
      { ORG_TELNO: "042-111-2222", HMPG_ADRES: "https://new.example" },
    ), { targetEducationOfficeCode: "G10", syncedAt: now });
    const added = mapNeisSchool(row("G100000003", "대전신규초등학교", "대전광역시 동구 신규로 3"), {
      targetEducationOfficeCode: "G10",
      syncedAt: now,
    });

    const plan = buildNeisDiffPlan({
      currentSchools: [first, missing],
      sourceSchools: [changed, added],
      targetEducationOfficeCode: "G10",
    });

    expect(plan.changes.map((change) => change.type)).toEqual([
      "NAME_CHANGED",
      "ADDRESS_CHANGED",
      "PHONE_CHANGED",
      "HOMEPAGE_CHANGED",
      "MISSING",
      "NEW",
    ]);
    expect(plan.changes[0]).toMatchObject({ schoolId: first.schoolId, schoolCode: "G100000001" });
    expect(plan).toMatchObject({ sourceCount: 2, newCount: 1, changedCount: 4, missingCount: 1, suspicious: false });
  });

  it("does not classify out-of-scope special schools as missing", () => {
    const special = {
      ...stored(row("G100000010", "대전푸른초등학교", "대전광역시 대덕구 푸른로 10")),
      schoolType: "special" as const,
    };
    const active = stored(row("G100000011", "대전계속초등학교", "대전광역시 서구 계속로 11"));
    const source = mapNeisSchool(row("G100000011", "대전계속초등학교", "대전광역시 서구 계속로 11"), {
      targetEducationOfficeCode: "G10",
      syncedAt: now,
    });
    const plan = buildNeisDiffPlan({
      currentSchools: [special, active],
      sourceSchools: [source],
      targetEducationOfficeCode: "G10",
    });
    expect(plan.changes).toEqual([]);
    expect(plan.existingTargetCount).toBe(1);
  });

  it("blocks a mass-missing response at the configured safety threshold", () => {
    const currentSchools = Array.from({ length: 10 }, (_, index) => stored(row(
      `G1000001${String(index).padStart(2, "0")}`,
      `대전안전${index}초등학교`,
      `대전광역시 서구 안전로 ${index + 1}`,
    )));
    const sourceSchools = currentSchools.slice(0, 2).map((school) => mapNeisSchool(row(
      school.source.schoolCode,
      school.name,
      school.address.road!,
    ), { targetEducationOfficeCode: "G10", syncedAt: now }));
    const plan = buildNeisDiffPlan({
      currentSchools,
      sourceSchools,
      targetEducationOfficeCode: "G10",
      suspiciousMissingRatio: 0.5,
    });
    expect(plan.suspicious).toBe(true);
    expect(plan.missingCount).toBe(8);
    expect(plan.suspiciousReasons[0]).toContain("10곳 중 8곳");
  });
});
