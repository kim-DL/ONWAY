import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import {
  changeSalesAssignmentInputSchema,
  createSalesAssignmentsInputSchema,
  createSalesCycleInputSchema,
} from "../src/sales/sales-cycle-contract.js";
import { copyAssignment, createAssignment } from "../src/sales/sales-cycle-service.js";

const now = Timestamp.fromDate(new Date("2026-08-24T00:00:00.000Z"));
const draft = {
  schoolId: "SCH-001",
  zoneId: "A",
  primaryAssigneeId: "EMP-A",
  assigneeIds: ["EMP-A"],
};

describe("sales cycle and assignment contract", () => {
  it("creates a fresh monthly assignment with reset activity state", () => {
    const assignment = createAssignment("2026-09", draft, now);
    expect(assignment).toMatchObject({
      cycleId: "2026-09",
      monthlyStatus: "before",
      latestVisitId: null,
      brochureStatus: "unknown",
      sampleStatus: "unknown",
      revision: 1,
    });
  });

  it("copies ownership but never carries completed monthly activity", () => {
    const source = {
      ...createAssignment("2026-08", draft, now),
      monthlyStatus: "completed" as const,
      latestVisitId: "VISIT-001",
      latestVisitedAt: now,
      brochureStatus: "delivered" as const,
      sampleStatus: "delivered" as const,
      revision: 4,
    };
    const copied = copyAssignment("2026-09", source, now);
    expect(copied.primaryAssigneeId).toBe("EMP-A");
    expect(copied).toMatchObject({ monthlyStatus: "before", latestVisitId: null, brochureStatus: "unknown", sampleStatus: "unknown", revision: 1 });
  });

  it("rejects duplicate schools, invalid primary assignees, and self-copy", () => {
    const request = { requestId: "553dfe93-6b62-4ed7-8395-e3246397eaa5", appVersion: "phase9" };
    expect(createSalesCycleInputSchema.safeParse({ ...request, cycleId: "2026-09", copiedFromCycleId: "2026-09", activate: false }).success).toBe(false);
    expect(createSalesAssignmentsInputSchema.safeParse({ ...request, cycleId: "2026-09", assignments: [draft, draft] }).success).toBe(false);
    expect(changeSalesAssignmentInputSchema.safeParse({
      ...request,
      cycleId: "2026-09",
      schoolId: "SCH-001",
      expectedRevision: 1,
      zoneId: "A",
      primaryAssigneeId: "EMP-B",
      assigneeIds: ["EMP-A"],
      reason: "담당 조정",
    }).success).toBe(false);
  });
});
