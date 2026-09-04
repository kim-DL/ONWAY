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

