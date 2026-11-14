import type { School } from "../../../src/domain/school";
import type { SalesAssignment } from "../../../src/domain/sales";
import { items } from "./school-polish-data";

const date = new Date("2026-11-14T00:00:00Z");
const schools: School[] = items.map((item, index) => ({
  schoolId: item.schoolId, name: item.name, schoolType: item.schoolType, shortName: null,
  normalizedName: item.normalizedName, initials: item.initials, aliases: [], district: index === 1 ? "yuseong" : "seo",
  address: { road: item.addressSummary, jibun: null, postalCode: null },
  source: { provider: "NEIS", schoolCode: item.schoolId, educationOfficeCode: "G10", syncedAt: date },
  phone: null, homepage: null, operationalStatus: "active", possibleRelocation: false,
  schoolBaseRevision: 1, createdAt: date, updatedAt: date,
  location: { latitude: null, longitude: null, kakaoPlaceId: null, matchStatus: "unmatched", matchMethod: null,
    matchConfidence: null, matchedName: null, matchedRoadAddress: null, matchedAt: null, confirmedBy: null, confirmedAt: null },
}));
const assignments: SalesAssignment[] = schools.map((school, index) => ({
  schoolId: school.schoolId, cycleId: "2026-11", zoneId: null, primaryAssigneeId: index === 2 ? "OTHER" : "PREVIEW",
  assigneeIds: [index === 2 ? "OTHER" : "PREVIEW"], monthlyStatus: index === 1 ? "followUp" : "before",
  latestVisitId: index === 1 ? "PREVIEW-VISIT" : null, latestVisitedAt: index === 1 ? date : null,
  brochureStatus: index === 1 ? "delivered" : "unknown", sampleStatus: "unknown", revision: 1, createdAt: date, updatedAt: date,
}));
const cycles = [{ cycleId: "2026-11", status: "active" }, { cycleId: "2026-10", status: "closed" }];
export function useSalesWorkspace(_session: unknown, cycleId: string | null) {
  const params = new URLSearchParams(location.search);
  const cycle = cycles.find(item => item.cycleId === cycleId) ?? cycles[0]!;
  return { status: params.has("loading") ? "loading" : params.has("error") ? "error" : "ready",
    workspace: params.has("loading") || params.has("error") ? null : {
      currentCycleId: "2026-11", selectedCycleId: cycle.cycleId, cycles, cycle,
      assignments: params.has("empty") ? [] : assignments, schools, zones: [],
      employees: [{ employeeId: "PREVIEW", displayName: "예시 직원" }, { employeeId: "OTHER", displayName: "예시 동료" }],
    }, refreshing: false, stale: params.has("stale"), issue: null, retry() {} };
}
