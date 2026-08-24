import type { School } from "@/domain/school";

const KAKAO_MAP_BASE = "https://map.kakao.com/link";

function finiteCoordinate(value: number | null) {
  return value !== null && Number.isFinite(value);
}

export function buildKakaoDirectionsUrl(school: School) {
  const trustedLocation = school.location.matchStatus === "confirmed"
    || school.location.matchStatus === "autoMatched";
  if (
    trustedLocation
    && finiteCoordinate(school.location.latitude)
    && finiteCoordinate(school.location.longitude)
  ) {
    return `${KAKAO_MAP_BASE}/to/${encodeURIComponent(school.name)},${school.location.latitude},${school.location.longitude}`;
  }
  return `${KAKAO_MAP_BASE}/search/${encodeURIComponent(school.name)}`;
}
