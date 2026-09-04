import type { School } from "@/domain/school";

export function hasTrustedRouteLocation(school: School) {
  return school.operationalStatus === "active"
    && !school.possibleRelocation
    && ["confirmed", "autoMatched"].includes(school.location.matchStatus)
    && school.location.latitude !== null
    && school.location.longitude !== null
    && Number.isFinite(school.location.latitude)
    && Number.isFinite(school.location.longitude)
    && school.location.latitude >= 36 && school.location.latitude <= 36.7
    && school.location.longitude >= 127.1 && school.location.longitude <= 127.7;
}

export function canPlanRouteForSchool(school: School) {
  return school.operationalStatus === "active"
    && (hasTrustedRouteLocation(school) || Boolean(school.address.road ?? school.address.jibun));
}
