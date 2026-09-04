import { afterEach, describe, expect, it, vi } from "vitest";

import { KakaoRouteRequestError } from "../src/sales/kakao-route-client.js";
import { createEstimatedRouteMatrix, optimizeSalesRouteOrder, type SalesRouteMetric, type SalesRouteNode } from "../src/sales/sales-route-optimizer.js";
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
  it("rechecks stored coordinates when the official address indicates relocation", async () => {
    const resolve = vi.fn(async () => ({ ok: false as const, reason: "review-required" as const }));
    await expect(resolveRouteNodes([
      { ...school({ schoolId: "A", trusted: true }), possibleRelocation: true },
      school({ schoolId: "B", trusted: true }),
    ], actor, { resolve })).rejects.toMatchObject({ schoolIds: ["A"], reason: "review-required" });
    expect(resolve).toHaveBeenCalledTimes(1);
  });
  it.each([
    { count: 16, trusted: 0 }, { count: 16, trusted: 9 },
    { count: 20, trusted: 0 }, { count: 20, trusted: 9 },
  ])("resolves a $count-school route with $trusted cached locations", async ({ count, trusted }) => {
    const schools = Array.from({ length: count }, (_, index) => school({
      schoolId: String(index),
      trusted: index < trusted,
    }));
    const resolve = vi.fn(async () => ({ ok: true as const, latitude: 36.36, longitude: 127.4 }));
    const nodes = await resolveRouteNodes(schools, actor, { resolve });

    expect(nodes.map((node) => node.schoolId)).toEqual(schools.map((item) => item.schoolId));
    expect(resolve).toHaveBeenCalledTimes(count - trusted);
    expect(new Set(nodes.map((node) => node.schoolId)).size).toBe(count);
    const matrix = createEstimatedRouteMatrix(nodes);
    expect([...matrix.values()].reduce((total, row) => total + row.size, 0)).toBe(count * (count - 1));
    const order = optimizeSalesRouteOrder(nodes, "8", matrix);
    expect(order[0]).toBe("8");
    expect(new Set(order)).toEqual(new Set(schools.map((item) => item.schoolId)));
  });

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

  it("identifies only the three unresolved schools in a 16-school selection", async () => {
    const unresolved = new Set(["9", "12", "15"]);
    const schools = Array.from({ length: 16 }, (_, index) => school({ schoolId: String(index), trusted: index < 9 }));
    const resolve = vi.fn(async (schoolId: string) => unresolved.has(schoolId)
      ? { ok: false as const, reason: "review-required" as const }
      : { ok: true as const, latitude: 36.36, longitude: 127.4 });

    await expect(resolveRouteNodes(schools, actor, { resolve })).rejects.toMatchObject({
      reason: "review-required",
      schoolIds: ["9", "12", "15"],
    });
    expect(resolve).toHaveBeenCalledTimes(7);
  });

  it.each([
    { latitude: Number.NaN, longitude: 127.4 },
    { latitude: 36.35, longitude: Number.POSITIVE_INFINITY },
    { latitude: 0, longitude: 0 },
    { latitude: 37.56, longitude: 126.97 },
  ])("never turns an invalid resolver coordinate into a route stop: %j", async (coordinate) => {
    const resolve = vi.fn(async () => ({ ok: true as const, ...coordinate }));
    await expect(resolveRouteNodes([
      school({ schoolId: "A", trusted: true }),
      school({ schoolId: "B" }),
    ], actor, { resolve })).rejects.toMatchObject({ reason: "review-required", schoolIds: ["B"] });
  });

  it("rechecks a persisted trusted status if its coordinate is an invalid placeholder", async () => {
    const invalid = school({ schoolId: "A", trusted: true });
    invalid.location.latitude = 0;
    invalid.location.longitude = 0;
    const resolve = vi.fn(async () => ({ ok: true as const, latitude: 36.36, longitude: 127.4 }));

    await expect(resolveRouteNodes([invalid], actor, { resolve })).resolves.toEqual([
      { schoolId: "A", name: "A 학교", latitude: 36.36, longitude: 127.4 },
    ]);
    expect(resolve).toHaveBeenCalledWith("A", actor);
  });

  it("does not geocode inactive schools even when an address is present", async () => {
    const inactive = school({ schoolId: "A", trusted: true });
    inactive.operationalStatus = "closed";
    const resolve = vi.fn(async () => ({ ok: true as const, latitude: 36.36, longitude: 127.4 }));

    await expect(resolveRouteNodes([inactive], actor, { resolve })).rejects.toMatchObject({
      reason: "review-required", schoolIds: ["A"],
    });
    expect(resolve).not.toHaveBeenCalled();
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
      reason: "check-pending",
      schoolIds: schools.slice(6).map((item) => item.schoolId),
    });

    await vi.advanceTimersByTimeAsync(14_000);
    await result;
    expect(resolve).toHaveBeenCalledTimes(6);
    expect(maxActive).toBe(3);
    expect(active).toBe(0);
  });

  it("continues a 20-school check on retry without repeating persisted successes", async () => {
    vi.useFakeTimers();
    const schools = Array.from({ length: 20 }, (_, index) => school({ schoolId: String(index), trusted: index < 9 }));
    const resolve = vi.fn(async (schoolId: string) => {
      await new Promise((done) => setTimeout(done, 7_000));
      // The real resolver persists these coordinates before returning success.
      const current = schools.find((item) => item.schoolId === schoolId)!;
      current.location = { matchStatus: "autoMatched", latitude: 36.36, longitude: 127.4 };
      return { ok: true as const, latitude: 36.36, longitude: 127.4 };
    });
    const first = expect(resolveRouteNodes(schools, actor, { resolve })).rejects.toMatchObject({
      reason: "check-pending", schoolIds: ["15", "16", "17", "18", "19"],
    });
    await vi.advanceTimersByTimeAsync(14_000);
    await first;
    expect(resolve).toHaveBeenCalledTimes(6);

    const retry = resolveRouteNodes(schools, actor, { resolve });
    await vi.advanceTimersByTimeAsync(14_000);
    expect(await retry).toHaveLength(20);
    expect(resolve).toHaveBeenCalledTimes(11);
    expect(new Set(resolve.mock.calls.map(([schoolId]) => schoolId)).size).toBe(11);
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
