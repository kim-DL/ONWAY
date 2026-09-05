import type { Firestore } from "firebase-admin/firestore";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_ROUTE_SCHOOLS as SERVER_MAX, optimizeSalesRouteInputSchema } from "../src/sales/sales-route-contract.js";
import { MAX_ROUTE_SCHOOLS, activeSalesRouteSchema, salesRouteResultSchema } from "../../src/features/sales-route/sales-route-contract.js";
import { parseSalesRouteFailure, routeResultMatchesRequest } from "../../src/features/sales-route/sales-route-recovery.js";
import { createEstimatedRouteMatrix, type SalesRouteNode } from "../src/sales/sales-route-optimizer.js";
import { fillRoadMetrics, SalesRouteCycleError, SalesRoutePermissionError, SalesRouteService } from "../src/sales/sales-route-service.js";

const actor = { uid: "test-sales", employeeId: "EMP-SALES" };
const nodes = (count: number): SalesRouteNode[] => Array.from({ length: count }, (_, index) => ({
  schoolId: `S-${index}`, name: index === 0 ? "대전선화초등학교" : index === 39 ? "대전외국어고등학교" : `학교 ${index}`,
  latitude: 36.31 + Math.floor(index / 10) * 0.008, longitude: 127.32 + (index % 10) * 0.01,
}));

function database(schools: SalesRouteNode[], owner = actor.employeeId, active = true) {
  const docs = new Map<string, Record<string, unknown>>([
    ["salesCycles/2026-09", { status: active ? "active" : "closed" }],
    ["appSettings/public", { currentSalesCycleId: "2026-09" }],
  ]);
  for (const school of schools) {
    docs.set(`schools/${school.schoolId}`, { ...school, operationalStatus: "active",
      address: { road: "대전광역시 중구 테스트로 1", jibun: null },
      location: { latitude: school.latitude, longitude: school.longitude, matchStatus: "confirmed" },
    });
    docs.set(`salesCycles/2026-09/assignments/${school.schoolId}`, { schoolId: school.schoolId, assigneeIds: [owner] });
  }
  const snapshot = (path: string) => ({ exists: docs.has(path), get: (key: string) => docs.get(path)?.[key], data: () => docs.get(path) });
  return { doc: (path: string) => ({ path, get: async () => snapshot(path) }),
    getAll: async (...refs: { path: string }[]) => refs.map(ref => snapshot(ref.path)),
  } as unknown as Firestore;
}

afterEach(() => vi.useRealTimers());

describe("large routes, complete callable-service responses", () => {
  it("keeps frontend/backend limits aligned and does not truncate recovery IDs", () => {
    expect(MAX_ROUTE_SCHOOLS).toBe(SERVER_MAX);
    expect(MAX_ROUTE_SCHOOLS).toBe(50);
    const schoolIds = nodes(50).map(node => node.schoolId);
    expect(parseSalesRouteFailure({ code: "functions/failed-precondition", details: {
      reason: "location-check-pending", schoolIds,
    } }).schoolIds).toEqual(schoolIds);
  });

  it.each([31, 40, 50])("includes all %i schools and every reorder pair using valid provider batches", async count => {
    const schools = nodes(count);
    const matrix = createEstimatedRouteMatrix(schools);
    const loadFrom = vi.fn(async (origin: SalesRouteNode, destinations: readonly SalesRouteNode[]) => {
      expect(destinations.length).toBeLessThanOrEqual(30);
      return new Map(destinations.map(destination => [destination.schoolId, { ...matrix.get(origin.schoolId)!.get(destination.schoolId)!, source: "road" as const }]));
    });
    const input = optimizeSalesRouteInputSchema.parse({ cycleId: "2026-09", schoolIds: schools.map(s => s.schoolId), startSchoolId: schools.at(-1)!.schoolId });
    const response = await new SalesRouteService(database(schools), { loadFrom }).optimize(input, actor);
    const result = salesRouteResultSchema.parse(response);
    expect(routeResultMatchesRequest(result, input)).toBe(true);
    expect(result.calculationMode).toBe("road");
    expect(result.orderedSchoolIds).toHaveLength(count);
    expect(result.metrics).toHaveLength(count * (count - 1));
    expect(loadFrom).toHaveBeenCalledTimes(count * Math.ceil((count - 1) / 30));
    expect(activeSalesRouteSchema.safeParse({ result, orderedSchoolIds: result.orderedSchoolIds, manuallyAdjusted: false, savedAt: 1 }).success).toBe(true);
  });

  it("supports every first school in a 40-school list without loss or duplicate stops", async () => {
    const schools = nodes(40);
    const service = new SalesRouteService(database(schools));
    for (const school of schools) {
      const input = { cycleId: "2026-09", schoolIds: schools.map(s => s.schoolId), startSchoolId: school.schoolId };
      expect(routeResultMatchesRequest(salesRouteResultSchema.parse(await service.optimize(input, actor)), input)).toBe(true);
    }
  });

  it("labels actual selected legs, not unused road pairs, to avoid rejecting a valid result", async () => {
    const schools = nodes(2);
    const matrix = createEstimatedRouteMatrix(schools);
    const loadFrom = async (origin: SalesRouteNode) => origin.schoolId === "S-1"
      ? new Map([["S-0", { ...matrix.get("S-1")!.get("S-0")!, source: "road" as const }]]) : new Map();
    const input = { cycleId: "2026-09", schoolIds: ["S-0", "S-1"], startSchoolId: "S-0" };
    const result = salesRouteResultSchema.parse(await new SalesRouteService(database(schools), { loadFrom }).optimize(input, actor));
    expect(result.calculationMode).toBe("distanceEstimate");
    expect(routeResultMatchesRequest(result, input)).toBe(true);
  });

  it("still rejects another employee's schools and closed cycles before any provider calls", async () => {
    const schools = nodes(40);
    const loadFrom = vi.fn();
    const input = { cycleId: "2026-09", schoolIds: schools.map(s => s.schoolId), startSchoolId: "S-0" };
    await expect(new SalesRouteService(database(schools, "OTHER"), { loadFrom }).optimize(input, actor)).rejects.toBeInstanceOf(SalesRoutePermissionError);
    await expect(new SalesRouteService(database(schools, actor.employeeId, false), { loadFrom }).optimize(input, actor)).rejects.toBeInstanceOf(SalesRouteCycleError);
    expect(loadFrom).not.toHaveBeenCalled();
  });

  it("bounds concurrency/time with 50 schools and retains all unavailable pairs as estimates", async () => {
    vi.useFakeTimers();
    const schools = nodes(50);
    const matrix = createEstimatedRouteMatrix(schools);
    let concurrent = 0;
    let maximum = 0;
    const loadFrom = vi.fn(async () => {
      concurrent += 1;
      maximum = Math.max(maximum, concurrent);
      await new Promise(resolve => setTimeout(resolve, 5_000));
      concurrent -= 1;
      throw new Error("Provider timeout");
    });
    const promise = fillRoadMetrics(schools, matrix, { loadFrom });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await promise).toBe(0);
    expect(loadFrom).toHaveBeenCalledTimes(16);
    expect(maximum).toBe(4);
    expect(concurrent).toBe(0);
    expect([...matrix.values()].reduce((total, row) => total + row.size, 0)).toBe(2450);
  });
});
