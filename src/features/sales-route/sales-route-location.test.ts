import { describe, expect, it } from "vitest";

import type { School } from "@/domain/school";
import { canPlanRouteForSchool, hasTrustedRouteLocation } from "./sales-route-location";

function school(overrides: Partial<School> = {}): School {
  return {
    schoolId: "SCHOOL-1",
    source: { provider: "NEIS", schoolCode: "12345", educationOfficeCode: "G10", syncedAt: null },
    name: "대전온누리초등학교",
    shortName: null,
    normalizedName: "대전온누리초등학교",
    initials: "",
    aliases: [],
    schoolType: "elementary",
    district: "dong",
    address: { road: "대전광역시 동구 온누리로 1", jibun: null, postalCode: null },
    phone: null,
    homepage: null,
    location: {
      latitude: null,
      longitude: null,
      kakaoPlaceId: null,
      matchStatus: "unmatched",
      matchMethod: null,
      matchConfidence: null,
      matchedName: null,
      matchedRoadAddress: null,
      matchedAt: null,
      confirmedBy: null,
      confirmedAt: null,
    },
    operationalStatus: "active",
    possibleRelocation: false,
    schoolBaseRevision: 1,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

describe("sales route location eligibility", () => {
  it("allows an active NEIS school address to be resolved on demand", () => {
    expect(hasTrustedRouteLocation(school())).toBe(false);
    expect(canPlanRouteForSchool(school())).toBe(true);
  });

  it("does not allow a school without coordinates or an official address", () => {
    expect(canPlanRouteForSchool(school({ address: { road: null, jibun: null, postalCode: null } }))).toBe(false);
    expect(canPlanRouteForSchool(school({ operationalStatus: "inactive" }))).toBe(false);
  });
});
