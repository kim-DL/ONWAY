import type { SalesRouteResult } from "./sales-route-contract";

export type SalesRouteRequest = {
  cycleId: string;
  schoolIds: string[];
  startSchoolId: string;
};

export type SalesRouteFailure = {
  kind: "review" | "provider" | "pending" | "general";
  message: string;
  schoolIds: string[];
};

const fallbackMessage = "동선을 계산하지 못했어요. 연결을 확인한 뒤 다시 시도해주세요.";

export function parseSalesRouteFailure(error: unknown): SalesRouteFailure {
  const failure = (message: string): SalesRouteFailure => ({ kind: "general", message, schoolIds: [] });
  if (!error || typeof error !== "object" || !("code" in error)) return failure(fallbackMessage);
  const code = error.code;
  if (code === "functions/failed-precondition") {
    const details = "details" in error ? error.details : null;
    if (details && typeof details === "object" && "reason" in details) {
      const schoolIds = "schoolIds" in details && Array.isArray(details.schoolIds)
        ? [...new Set(details.schoolIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 128))].slice(0, 20)
        : [];
      if (details.reason === "location-provider-unavailable") {
        return { kind: "provider", message: "위치 확인 서비스가 잠시 응답하지 않아요. 선택한 학교는 그대로 유지됩니다.", schoolIds };
      }
      if (details.reason === "location-check-pending") {
        return { kind: "pending", message: "일부 학교의 위치 확인에 시간이 더 필요해요. 다시 시도하면 확인된 위치에 이어서 계산합니다.", schoolIds };
      }
      if (details.reason === "location-review-required" && schoolIds.length > 0) {
        return { kind: "review", message: "아래 학교는 공식 주소와 지도 위치를 한 번 더 확인해야 해요. 학교를 제외하지 않고 선택을 유지했어요.", schoolIds };
      }
    }
    return failure("현재 운영 중인 월과 학교 정보를 다시 확인해주세요. 문제가 계속되면 관리자에게 알려주세요.");
  }
  if (code === "functions/permission-denied") return failure("내 담당 학교만 방문 동선에 포함할 수 있어요.");
  if (code === "functions/not-found") return failure("담당 학교 정보가 변경됐어요. 목록을 새로 확인해주세요.");
  if (code === "functions/resource-exhausted") return failure("요청이 많아 잠시 쉬고 있어요. 잠시 후 다시 계산해주세요.");
  if (code === "functions/deadline-exceeded" || code === "functions/unavailable") {
    return failure("응답이 지연되고 있어요. 선택은 유지했으니 잠시 후 다시 계산해주세요.");
  }
  return failure(fallbackMessage);
}

export function routeLocationRecovery(failure: SalesRouteFailure | null, selectedIds: readonly string[], startSchoolId: string) {
  const unresolved = new Set(failure?.schoolIds ?? []);
  const excludedIds = selectedIds.filter((schoolId) => unresolved.has(schoolId));
  const remainingIds = selectedIds.filter((schoolId) => !unresolved.has(schoolId));
  return {
    excludedIds,
    remainingIds,
    canUseRemainder: failure?.kind === "review" && excludedIds.length > 0 && remainingIds.length >= 2,
    requiresNewStart: excludedIds.includes(startSchoolId),
  };
}

export function routeRequestKey(input: SalesRouteRequest) {
  return JSON.stringify([input.cycleId, input.startSchoolId, [...input.schoolIds].sort()]);
}

// A successful response must account for every requested school exactly once.
// Never present a partial route as though all selected schools were included.
export function routeResultMatchesRequest(result: SalesRouteResult, input: SalesRouteRequest) {
  const requested = new Set(input.schoolIds);
  const hasRequestedSchools = result.cycleId === input.cycleId
    && result.orderedSchoolIds[0] === input.startSchoolId
    && result.orderedSchoolIds.length === requested.size
    && new Set(result.orderedSchoolIds).size === requested.size
    && result.orderedSchoolIds.every((id) => requested.has(id))
    && result.stops.length === requested.size
    && new Set(result.stops.map((stop) => stop.schoolId)).size === requested.size
    && result.stops.every((stop) => requested.has(stop.schoolId));
  if (!hasRequestedSchools) return false;

  // Manual reordering needs every directed pair, not just the initial legs.
  // Reject missing/duplicate pairs before showing a seemingly usable route.
  const pairKey = (from: string, to: string) => JSON.stringify([from, to]);
  const metrics = new Map(result.metrics.map((metric) => [pairKey(metric.fromSchoolId, metric.toSchoolId), metric]));
  if (result.metrics.length !== requested.size * (requested.size - 1)
    || metrics.size !== result.metrics.length
    || result.metrics.some((metric) => metric.fromSchoolId === metric.toSchoolId
      || !requested.has(metric.fromSchoolId) || !requested.has(metric.toSchoolId))) return false;

  let distance = 0;
  let duration = 0;
  let roadLegs = 0;
  for (const [index, stop] of result.stops.entries()) {
    if (stop.schoolId !== result.orderedSchoolIds[index] || stop.position !== index + 1) return false;
    if (index === 0) {
      if (stop.fromPrevious !== null) return false;
      continue;
    }
    const leg = metrics.get(pairKey(result.orderedSchoolIds[index - 1]!, stop.schoolId));
    const reported = stop.fromPrevious;
    if (!leg || !reported || reported.fromSchoolId !== leg.fromSchoolId || reported.toSchoolId !== leg.toSchoolId
      || reported.distanceMeters !== leg.distanceMeters || reported.durationSeconds !== leg.durationSeconds
      || reported.source !== leg.source) return false;
    distance += leg.distanceMeters;
    duration += leg.durationSeconds;
    roadLegs += Number(leg.source === "road");
  }
  const mode = roadLegs === 0 ? "distanceEstimate" : roadLegs === requested.size - 1 ? "road" : "hybrid";
  return result.totalDistanceMeters === distance && result.totalDurationSeconds === duration && result.calculationMode === mode;
}
