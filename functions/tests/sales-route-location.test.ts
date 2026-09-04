import { afterEach, describe, expect, it, vi } from "vitest";

import { KakaoRouteRequestError } from "../src/sales/kakao-route-client.js";
import { createEstimatedRouteMatrix, type SalesRouteMetric, type SalesRouteNode } from "../src/sales/sales-route-optimizer.js";
import {
  fillRoadMetrics,
  resolveRouteNodes,
  SalesRouteLocationError,
  type RouteSchool,
} from "../src/sales/sales-route-service.js";

const actor = { uid: "uid-sales", employeeId: "EMP-SALES" };

afterEach(() => vi.useRealTimers());

function school(input: {
  schoolId: string;
  trusted?: boolean;
  address?: string | null;
}): RouteSchool {
  return {
    schoolId: input.schoolId,
    name: `${input.schoolId} 학교`,
    operationalStatus: "active",
    address: { road: input.address === undefined ? `대전광역시 동구 ${input.schoolId}로 1` : input.address, jibun: null },
    location: {
      latitude: input.trusted ? 36.35 : null,
      longitude: input.trusted ? 127.38 : null,
      matchStatus: input.trusted ? "confirmed" : "unmatched",
    },
  };
}

describe("sales route on-demand location resolution", () => {
  it("keeps trusted coordinates and resolves an address-backed school", async () => {
    const resolve = vi.fn(async () => ({ ok: true as const, latitude: 36.36, longitude: 127.4 }));
    await expect(resolveRouteNodes([
      school({ schoolId: "A", trusted: true }),
      school({ schoolId: "B" }),
    ], actor, { resolve })).resolves.toEqual([
      { schoolId: "A", name: "A 학교", latitude: 36.35, longitude: 127.38 },
      { schoolId: "B", name: "B 학교", latitude: 36.36, longitude: 127.4 },
    ]);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith("B", actor);
  });

  it("reports a provider outage separately and never resolves a missing address", async () => {
    const resolve = vi.fn(async () => ({ ok: false as const, reason: "provider-unavailable" as const }));
    try {
      await resolveRouteNodes([
        school({ schoolId: "A" }),
        school({ schoolId: "B", address: null }),
      ], actor, { resolve });
      throw new Error("Expected route location resolution to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(SalesRouteLocationError);
      expect(error).toMatchObject({ reason: "provider-unavailable" });
      expect(new Set((error as SalesRouteLocationError).schoolIds)).toEqual(new Set(["A", "B"]));
    }
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("stops new geocoding after a provider outage while preserving completed in-flight locations", async () => {
    vi.useFakeTimers();
    const schools = Array.from({ length: 10 }, (_, index) => school({ schoolId: String(index) }));
    const resolve = vi.fn(async (schoolId: string) => {
      await new Promise((done) => setTimeout(done, 100));
      return schoolId === "0"
        ? { ok: false as const, reason: "provider-unavailable" as const }
        : { ok: true as const, latitude: 36.36, longitude: 127.4 };
    });
    const result = expect(resolveRouteNodes(schools, actor, { resolve })).rejects.toMatchObject({
      reason: "provider-unavailable",
      schoolIds: ["0", "3", "4", "5", "6", "7", "8", "9"],
    });

    expect(resolve).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(100);
    await result;
    expect(resolve).toHaveBeenCalledTimes(3);
  });

  it("caps geocoding concurrency and stops scheduling when the location phase budget expires", async () => {
    vi.useFakeTimers();
    const schools = Array.from({ length: 20 }, (_, index) => school({ schoolId: String(index) }));
    let active = 0;
    let maxActive = 0;
    const resolve = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((done) => setTimeout(done, 7_000));
      active -= 1;
      return { ok: true as const, latitude: 36.36, longitude: 127.4 };
    });
    const result = expect(resolveRouteNodes(schools, actor, { resolve })).rejects.toMatchObject({
      reason: "provider-unavailable",
      schoolIds: schools.slice(6).map((item) => item.schoolId),
    });

    await vi.advanceTimersByTimeAsync(14_000);
    await result;
    expect(resolve).toHaveBeenCalledTimes(6);
    expect(maxActive).toBe(3);
    expect(active).toBe(0);
  });
});

describe("sales road matrix request budget", () => {
  const nodes: SalesRouteNode[] = Array.from({ length: 20 }, (_, index) => ({
    schoolId: String(index), name: `${index} 학교`, latitude: 36.35 + index / 1_000, longitude: 127.4,
  }));

  it("caps road concurrency and preserves estimates for rows beyond the scheduling deadline", async () => {
    vi.useFakeTimers();
    const matrix = createEstimatedRouteMatrix(nodes);
    let active = 0;
    let maxActive = 0;
    const loadFrom = vi.fn(async (origin: SalesRouteNode, destinations: readonly SalesRouteNode[]) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((done) => setTimeout(done, 5_000));
      active -= 1;
      return new Map(destinations.map((destination): [string, SalesRouteMetric] => [destination.schoolId, {
        fromSchoolId: origin.schoolId, toSchoolId: destination.schoolId,
        distanceMeters: 1_000, durationSeconds: 200, source: "road",
      }]));
    });
    const result = fillRoadMetrics(nodes, matrix, { loadFrom });

    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toBe(16 * 19);
    expect(loadFrom).toHaveBeenCalledTimes(16);
    expect(maxActive).toBe(4);
    expect(active).toBe(0);
    expect(matrix.get("0")!.get("1")!.source).toBe("road");
    expect(matrix.get("19")!.get("0")!.source).toBe("distanceEstimate");
  });

  it("stops scheduling road rows after an authorization or quota failure", async () => {
    vi.useFakeTimers();
    const matrix = createEstimatedRouteMatrix(nodes);
    const loadFrom = vi.fn(async () => {
      await new Promise((done) => setTimeout(done, 100));
      throw new KakaoRouteRequestError("Provider unavailable", true);
    });
    const result = fillRoadMetrics(nodes, matrix, { loadFrom });

    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toBe(0);
    expect(loadFrom).toHaveBeenCalledTimes(4);
    expect(matrix.get("0")!.get("1")!.source).toBe("distanceEstimate");
  });
});
