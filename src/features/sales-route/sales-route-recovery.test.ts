import { describe, expect, it } from "vitest";

import { parseSalesRouteFailure, routeLocationRecovery, routeRequestKey, routeResultMatchesRequest } from "./sales-route-recovery";
import type { SalesRouteResult } from "./sales-route-contract";

const ids = Array.from({ length: 16 }, (_, index) => `SCHOOL-${index + 1}`);
const error = (reason: string, schoolIds: unknown = [ids[15]]) => ({
  code: "functions/failed-precondition", message: "HTTP 400 internal detail", details: { reason, schoolIds },
});

describe("route failure recovery", () => {
  it("identifies only unresolved schools among sixteen without changing selection or start", () => {
    const failure = parseSalesRouteFailure(error("location-review-required", [ids[9], ids[15]]));
    expect(routeLocationRecovery(failure, ids, ids[0]!)).toEqual({
      excludedIds: [ids[9], ids[15]], remainingIds: ids.filter((_, index) => index !== 9 && index !== 15),
      canUseRemainder: true, requiresNewStart: false,
    });
    expect(ids).toHaveLength(16);
    expect(failure.message).not.toContain("400");
  });

  it("requires a deliberately chosen first school when the original first is unresolved", () => {
    const failure = parseSalesRouteFailure(error("location-review-required", [ids[0]]));
    expect(routeLocationRecovery(failure, ids, ids[0]!)).toMatchObject({ requiresNewStart: true, canUseRemainder: true });
  });

  it("never offers a route with fewer than two remaining schools", () => {
    for (const unresolved of [ids, ids.slice(1)]) {
      const failure = parseSalesRouteFailure(error("location-review-required", unresolved));
      expect(routeLocationRecovery(failure, ids, ids[0]!).canUseRemainder).toBe(false);
    }
  });

  it("does not propose exclusion during a provider outage or unfinished location check", () => {
    for (const reason of ["location-provider-unavailable", "location-check-pending"]) {
      const failure = parseSalesRouteFailure(error(reason));
      expect(routeLocationRecovery(failure, ids, ids[0]!).canUseRemainder).toBe(false);
      expect(failure.message).not.toContain("400");
    }
  });

  it("ignores foreign IDs and malformed details rather than excluding arbitrary schools", () => {
    const failure = parseSalesRouteFailure(error("location-review-required", ["FOREIGN", null, 42, ids[15], ids[15]]));
    expect(routeLocationRecovery(failure, ids, ids[0]!).excludedIds).toEqual([ids[15]]);
    expect(parseSalesRouteFailure(error("location-review-required", null)).kind).toBe("general");
    expect(parseSalesRouteFailure(error("unknown", ids)).kind).toBe("general");
  });

  it("never exposes raw HTTP or implementation errors", () => {
    for (const value of [new Error("HTTP 400"), { code: "functions/internal", message: "400" }, { code: "functions/failed-precondition", message: "400" }]) {
      expect(parseSalesRouteFailure(value).message).not.toContain("400");
    }
  });

  it("distinguishes a stale request when the cycle, selection or first school changes", () => {
    const original = { cycleId: "2026-09", schoolIds: ids, startSchoolId: ids[0]! };
    const key = routeRequestKey(original);
    expect(routeRequestKey({ ...original, schoolIds: [...ids].reverse() })).toBe(key);
    expect(routeRequestKey({ ...original, schoolIds: ids.slice(1) })).not.toBe(key);
    expect(routeRequestKey({ ...original, startSchoolId: ids[1]! })).not.toBe(key);
    expect(routeRequestKey({ ...original, cycleId: "2026-10" })).not.toBe(key);
  });
});

describe("route response integrity", () => {
  const input = { cycleId: "2026-09", schoolIds: ids, startSchoolId: ids[0]! };
  const metrics = ids.flatMap((fromSchoolId) => ids.filter((id) => id !== fromSchoolId).map((toSchoolId) => ({
    fromSchoolId, toSchoolId, distanceMeters: 1000, durationSeconds: 120, source: "distanceEstimate" as const,
  })));
  const result: SalesRouteResult = {
    cycleId: input.cycleId, orderedSchoolIds: ids, calculationMode: "distanceEstimate", metrics,
    totalDistanceMeters: 15_000, totalDurationSeconds: 1800, warning: null,
    stops: ids.map((schoolId, index) => ({ schoolId, name: schoolId, latitude: 36.3, longitude: 127.4, position: index + 1,
      fromPrevious: index === 0 ? null : metrics.find((metric) => metric.fromSchoolId === ids[index - 1] && metric.toSchoolId === schoolId)!,
    })),
  };

  it("accepts every requested school once with the fixed first school", () => {
    expect(routeResultMatchesRequest(result, input)).toBe(true);
  });

  it("rejects a success payload silently omitting, duplicating or substituting schools", () => {
    expect(routeResultMatchesRequest({ ...result, orderedSchoolIds: ids.slice(0, 15) }, input)).toBe(false);
    expect(routeResultMatchesRequest({ ...result, orderedSchoolIds: [...ids.slice(0, 15), ids[0]!] }, input)).toBe(false);
    expect(routeResultMatchesRequest({ ...result, orderedSchoolIds: [...ids].reverse() }, input)).toBe(false);
    expect(routeResultMatchesRequest({ ...result, stops: result.stops.slice(1) }, input)).toBe(false);
    expect(routeResultMatchesRequest({ ...result, cycleId: "2026-10" }, input)).toBe(false);
  });

  it("rejects incomplete, duplicate, self or foreign metric pairs required for reordering", () => {
    for (const invalid of [
      metrics.slice(1), [...metrics.slice(1), metrics[1]!],
      [{ ...metrics[0]!, toSchoolId: metrics[0]!.fromSchoolId }, ...metrics.slice(1)],
      [{ ...metrics[0]!, toSchoolId: "FOREIGN" }, ...metrics.slice(1)],
    ]) expect(routeResultMatchesRequest({ ...result, metrics: invalid }, input)).toBe(false);
  });

  it("rejects inconsistent stop order, leg details, totals or road labels", () => {
    expect(routeResultMatchesRequest({ ...result, stops: [...result.stops].reverse() }, input)).toBe(false);
    expect(routeResultMatchesRequest({ ...result, stops: result.stops.map((stop, index) => index === 1 ? { ...stop, fromPrevious: null } : stop) }, input)).toBe(false);
    expect(routeResultMatchesRequest({ ...result, totalDurationSeconds: 0 }, input)).toBe(false);
    expect(routeResultMatchesRequest({ ...result, totalDistanceMeters: 0 }, input)).toBe(false);
    expect(routeResultMatchesRequest({ ...result, calculationMode: "road" }, input)).toBe(false);
  });
});
