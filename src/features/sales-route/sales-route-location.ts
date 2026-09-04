import type { School } from "@/domain/school";

export function hasTrustedRouteLocation(school: School) {
  return school.operationalStatus === "active"
    && ["confirmed", "autoMatched"].includes(school.location.matchStatus)
    && school.location.latitude !== null
    && school.location.longitude !== null
    && Number.isFinite(school.location.latitude)
    && Number.isFinite(school.location.longitude);
}

export function canPlanRouteForSchool(school: School) {
  return school.operationalStatus === "active"
    && (hasTrustedRouteLocation(school) || Boolean(school.address.road ?? school.address.jibun));
}
