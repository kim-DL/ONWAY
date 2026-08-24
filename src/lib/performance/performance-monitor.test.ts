import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPerformanceDiagnostics,
  getPerformanceSnapshot,
  markAppBootReady,
  recordCacheAccess,
  recordFirestoreReads,
  recordPerformanceMetric,
  startAppBootMeasurement,
} from "./performance-monitor";

describe("privacy-safe performance diagnostics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearPerformanceDiagnostics();
  });

  it("records bounded durations and aggregate data sources without identifiers", () => {
    vi.spyOn(performance, "now").mockReturnValue(145.26);
    recordPerformanceMetric("searchDuration", 100, "memory");
    recordCacheAccess("memory", true);
    recordCacheAccess("indexeddb", false);
    recordFirestoreReads("search", 3.9);

    const snapshot = getPerformanceSnapshot();
    expect(snapshot.metrics).toEqual([{
      name: "searchDuration",
      durationMs: 45.3,
      source: "memory",
      recordedAt: expect.any(Number),
    }]);
    expect(snapshot.cache.memory).toEqual({ hits: 1, misses: 0 });
    expect(snapshot.cache.indexeddb).toEqual({ hits: 0, misses: 1 });
    expect(snapshot.firestoreReads).toMatchObject({ total: 3, byArea: { search: 3 } });
    expect(JSON.stringify(snapshot)).not.toMatch(/schoolId|employeeId|query|uid/u);
  });

  it("records app boot only once per diagnostic window", () => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(610)
      .mockReturnValueOnce(900);
    clearPerformanceDiagnostics();
    startAppBootMeasurement();
    markAppBootReady("runtime");
    markAppBootReady("runtime");

    expect(getPerformanceSnapshot().metrics).toHaveLength(1);
    expect(getPerformanceSnapshot().metrics[0]).toMatchObject({
      name: "appBootDuration",
      durationMs: 600,
    });
  });

  it("keeps only the most recent bounded metric window", () => {
    vi.spyOn(performance, "now").mockReturnValue(1_000);
    for (let index = 0; index < 140; index += 1) {
      recordPerformanceMetric("searchDuration", index, "memory");
    }
    expect(getPerformanceSnapshot().metrics).toHaveLength(120);
  });
});
