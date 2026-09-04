import { describe, expect, it, vi } from "vitest";

import { KakaoRouteClient, KakaoRouteRequestError } from "../src/sales/kakao-route-client.js";
import { optimizeSalesRouteInputSchema } from "../src/sales/sales-route-contract.js";
import {
  createEstimatedRouteMatrix,
  optimizeSalesRouteOrder,
  type SalesRouteMatrix,
  type SalesRouteNode,
} from "../src/sales/sales-route-optimizer.js";

const nodes: SalesRouteNode[] = [
  { schoolId: "A", name: "가 학교", latitude: 36.35, longitude: 127.38 },
  { schoolId: "B", name: "나 학교", latitude: 36.351, longitude: 127.39 },
  { schoolId: "C", name: "다 학교", latitude: 36.36, longitude: 127.43 },
];

function roadMatrix(): SalesRouteMatrix {
  const matrix = createEstimatedRouteMatrix(nodes);
  const durations: Record<string, number> = {
    "A-B": 600,
    "A-C": 120,
    "B-A": 600,
    "B-C": 500,
    "C-A": 120,
    "C-B": 90,
  };
  for (const [pair, durationSeconds] of Object.entries(durations)) {
    const [fromSchoolId, toSchoolId] = pair.split("-") as [string, string];
    matrix.get(fromSchoolId)!.set(toSchoolId, {
      fromSchoolId,
      toSchoolId,
      distanceMeters: durationSeconds * 10,
      durationSeconds,
      source: "road",
    });
  }
  return matrix;
}

describe("sales route contract and optimizer", () => {
  it.each([2, 9, 16, 20])("retains every one of %i schools exactly once with the chosen start", (count) => {
    const schools = Array.from({ length: count }, (_, index) => ({
      schoolId: `S-${index}`, name: `학교 ${index}`, latitude: 36.3 + index * 0.004, longitude: 127.4 + index * 0.002,
    }));
    const schoolIds = schools.map(school => school.schoolId);
    const startSchoolId = schoolIds.at(-1)!;
    expect(optimizeSalesRouteInputSchema.safeParse({ cycleId: "2026-09", schoolIds, startSchoolId }).success).toBe(true);
    const result = optimizeSalesRouteOrder(schools, startSchoolId, createEstimatedRouteMatrix(schools));
    expect(result[0]).toBe(startSchoolId);
    expect(result).toHaveLength(count);
    expect(new Set(result)).toEqual(new Set(schoolIds));
  });

  it("rejects more than twenty schools rather than silently truncating them", () => {
    expect(optimizeSalesRouteInputSchema.safeParse({
      cycleId: "2026-09", schoolIds: Array.from({ length: 21 }, (_, index) => String(index)), startSchoolId: "0",
    }).success).toBe(false);
  });
  it("requires two unique schools and keeps the selected first school fixed", () => {
    expect(optimizeSalesRouteInputSchema.safeParse({
      cycleId: "2026-09",
      schoolIds: ["A", "A"],
      startSchoolId: "A",
    }).success).toBe(false);
    expect(optimizeSalesRouteInputSchema.safeParse({
      cycleId: "2026-09",
      schoolIds: ["A", "B"],
      startSchoolId: "C",
    }).success).toBe(false);
    expect(optimizeSalesRouteOrder(nodes, "A", roadMatrix())).toEqual(["A", "C", "B"]);
  });

  it("creates deterministic non-zero estimates for every directed pair", () => {
    const matrix = createEstimatedRouteMatrix(nodes);
    expect(matrix.get("A")?.size).toBe(2);
    expect(matrix.get("A")?.get("B")).toMatchObject({
      fromSchoolId: "A",
      toSchoolId: "B",
      source: "distanceEstimate",
    });
    expect(matrix.get("A")!.get("B")!.durationSeconds).toBeGreaterThan(0);
  });
});

describe("Kakao route client", () => {
  it("does not assign malformed or unknown provider keys to another school", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ routes: ["", " ", "00", "0.0", "1e0", "-1", "99"].map(key => ({
      result_code: 0, key, summary: { distance: 1, duration: 1 },
    })) }), { status: 200 }));
    const client = new KakaoRouteClient("test-key", fetcher as typeof fetch);
    expect(await client.loadFrom(nodes[0]!, nodes.slice(1))).toEqual(new Map());
  });

  it("retains available road legs when other destinations have no driving route", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ routes: [
      { result_code: 0, key: "0", summary: { distance: 1000, duration: 120 } },
      { result_code: 104, key: "1" },
    ] }), { status: 200 }));
    const metrics = await new KakaoRouteClient("test-key", fetcher as typeof fetch).loadFrom(nodes[0]!, nodes.slice(1));
    expect(metrics.size).toBe(1);
    expect(metrics.get("B")).toMatchObject({ source: "road", durationSeconds: 120 });
    expect(metrics.has("C")).toBe(false);
  });
  it("maps successful destination summaries back to school IDs", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      trans_id: "route-test",
      routes: [{ result_code: 0, result_msg: "길찾기 성공", key: "0", summary: { distance: 1234, duration: 321 } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new KakaoRouteClient("test-key", fetcher as typeof fetch);
    const metrics = await client.loadFrom(nodes[0]!, [nodes[1]!]);
    expect(metrics.get("B")).toEqual({
      fromSchoolId: "A",
      toSchoolId: "B",
      distanceMeters: 1234,
      durationSeconds: 321,
      source: "road",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://apis-navi.kakaomobility.com/v1/destinations/directions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("opens the circuit for authorization and quota failures", async () => {
    const client = new KakaoRouteClient("test-key", vi.fn(async () => new Response("{}", { status: 429 })) as typeof fetch);
    await expect(client.loadFrom(nodes[0]!, [nodes[1]!])).rejects.toMatchObject<KakaoRouteRequestError>({
      haltFurtherRequests: true,
    });
  });
});
