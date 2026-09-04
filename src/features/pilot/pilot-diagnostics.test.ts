import { describe, expect, it } from "vitest";

import { APP_METADATA } from "@/lib/app-metadata";
import {
  createPilotDeviceDiagnostics,
  serializePilotDeviceDiagnostics,
} from "./pilot-diagnostics";

describe("pilot device diagnostics", () => {
  it("exports only bounded, non-identifying operational evidence", () => {
    const diagnostics = createPilotDeviceDiagnostics({
      online: false,
      installed: true,
      capturedAt: new Date("2026-08-25T00:00:00.000Z"),
      performance: {
        metrics: [{
          name: "searchDuration",
          durationMs: 42.5,
          source: "memory",
          recordedAt: 1_777_081_600_000,
        }],
        cache: {
          memory: { hits: 2, misses: 0 },
          indexeddb: { hits: 1, misses: 0 },
          "image-cache": { hits: 0, misses: 1 },
        },
        firestoreReads: {
          total: 1,
          byArea: { auth: 0, shell: 0, search: 1, detail: 0, sales: 0, history: 0 },
        },
        vitals: { cumulativeLayoutShift: 0, longTaskCount: 0, longTaskDurationMs: 0 },
      },
    });

    expect(diagnostics).toMatchObject({
      schemaVersion: 1,
      appVersion: APP_METADATA.buildVersion,
      capturedAt: "2026-08-25T00:00:00.000Z",
      deviceState: { online: false, installed: true },
    });
    const serialized = serializePilotDeviceDiagnostics(diagnostics);
    expect(serialized).toContain('"searchDuration"');
    expect(serialized).not.toMatch(/employee|school|query|uid|email|phone|userAgent/iu);
  });
});
