import { describe, expect, it } from "vitest";

import { buildPhase1SeedDocuments, createPhase1Seed, PHASE1_SEED_INSTANT } from "@/seed/phase1";

describe("Phase 1 emulator seed", () => {
  it("is deterministic and uses one fixed baseline instant", () => {
    expect(createPhase1Seed()).toEqual(createPhase1Seed());
    expect(createPhase1Seed().employees[0]?.createdAt.toISOString()).toBe(PHASE1_SEED_INSTANT);
  });

  it("contains all required employee and school scenarios", () => {
    const seed = createPhase1Seed();

    expect(seed.authUsers.map((user) => user.employeeId)).toEqual([
      "EMP-DELIVERY",
      "EMP-SALES-A",
      "EMP-SALES-B",
      "EMP-SALES-C",
      "EMP-ADMIN",
      "EMP-DISABLED",
    ]);
    expect(seed.authUsers.find((user) => user.employeeId === "EMP-DISABLED")?.disabled).toBe(true);
    expect(seed.schools).toHaveLength(5);
    expect(seed.schools.some((school) => school.aliases.includes("대전구명고등학교"))).toBe(true);
    expect(seed.schools.some((school) => school.operationalStatus === "inactiveCandidate")).toBe(true);
    expect(seed.fieldProfiles.map((profile) => profile.completeness)).toEqual([100, 45]);
    expect(seed.zones.map((zone) => zone.zoneId)).toEqual(["A", "B", "C"]);
    expect(seed.commonCatalogs.flatMap((catalog) => catalog.items)).toHaveLength(5);
  });

  it("produces a unique, stable Firestore document set without placeholder PIN credentials", () => {
    const documents = buildPhase1SeedDocuments();
    const paths = documents.map((document) => document.path);

    expect(documents).toHaveLength(54);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.some((path) => path.startsWith("authCredentials/"))).toBe(false);
    expect(paths.some((path) => path.startsWith("pinIndexes/"))).toBe(false);
    expect(paths).toContain("secureSettings/adminAccess");
  });
});
