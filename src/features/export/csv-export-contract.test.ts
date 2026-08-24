import { describe, expect, it } from "vitest";

import { csvExportOptionsSchema, csvExportPreviewSchema, csvExportSelectionSchema } from "./csv-export-contract";

const filter = {
  cycleId: "2026-08", zoneId: "A", assigneeId: null, district: "seo", schoolType: "high", monthlyStatus: "completed",
  interestScore: 80, followUpOnly: true, tagId: "COMM-DETAIL", visitedFrom: null, visitedTo: null,
} as const;

describe("CSV export client contract", () => {
  it("rejects unknown filter fields and accepts the documented selection", () => {
    expect(csvExportSelectionSchema.safeParse({ kind: "assignments", scope: "own", filter }).success).toBe(true);
    expect(csvExportSelectionSchema.safeParse({ kind: "assignments", scope: "own", filter: { ...filter, hidden: "all-data" } }).success).toBe(false);
  });

  it("keeps permission and row count server-authored", () => {
    expect(csvExportPreviewSchema.parse({ rowCount: 3, filterSummary: ["월별 배정", "내 담당"], teamExportAllowed: false })).toEqual({ rowCount: 3, filterSummary: ["월별 배정", "내 담당"], teamExportAllowed: false });
    expect(csvExportPreviewSchema.safeParse({ rowCount: -1, filterSummary: [], teamExportAllowed: true }).success).toBe(false);
    expect(csvExportOptionsSchema.safeParse({ currentCycleId: "2026-08", teamExportAllowed: false, cycles: [], zones: [], employees: [], communicationTags: [], activityTags: [], permissions: { exportTeam: true } }).success).toBe(false);
  });
});
