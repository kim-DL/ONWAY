import { describe, expect, it } from "vitest";

import { salesVisitSchema, type SalesVisit } from "@/domain/sales";
import { salesHistoryCursorSchema, updateSalesProfileInputSchema } from "./sales-history-contract";
import { mergeVisitPages } from "./sales-history-pages";

function visit(visitId: string, visitedAt: string): SalesVisit {
  const timestamp = new Date(visitedAt);
  return salesVisitSchema.parse({
    visitId,
    schoolId: "SCH-001",
    cycleId: "2026-08",
    assignmentSnapshot: {
      zoneId: "A",
      primaryAssigneeId: "EMP-SALES-A",
      assigneeIds: ["EMP-SALES-A"],
    },
    visitedAt: timestamp,
    visitedBy: "EMP-SALES-A",
    recordedBy: "EMP-SALES-A",
    brochure: { status: "delivered" },
    sample: { status: "notDelivered", items: [] },
    interest: { score: 60, explicitlySelected: true },
    activityTagIds: [],
    summary: `방문 기록 ${visitId}`,
    followUp: { required: false, dueDate: null, summary: null },
    deleted: false,
    deletedAt: null,
    deletedBy: null,
    deleteReason: null,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

describe("sales history contracts", () => {
  it("accepts a stable date-and-document cursor", () => {
    expect(salesHistoryCursorSchema.parse({
      visitedAt: "2026-08-20T03:00:00.000Z",
      visitId: "VISIT-002",
    })).toEqual({ visitedAt: "2026-08-20T03:00:00.000Z", visitId: "VISIT-002" });
  });

  it("keeps pages newest-first and replaces duplicate visit IDs", () => {
    const merged = mergeVisitPages(
      [visit("VISIT-003", "2026-08-23T03:00:00.000Z"), visit("VISIT-002", "2026-08-22T03:00:00.000Z")],
      [visit("VISIT-002", "2026-08-24T03:00:00.000Z"), visit("VISIT-001", "2026-08-21T03:00:00.000Z")],
    );
    expect(merged.map((item) => item.visitId)).toEqual(["VISIT-002", "VISIT-003", "VISIT-001"]);
    expect(new Set(merged.map((item) => item.visitId)).size).toBe(3);
  });

  it("does not permit duplicate communication tags", () => {
    expect(updateSalesProfileInputSchema.safeParse({
      cycleId: "2026-08",
      schoolId: "SCH-001",
      expectedAssignmentRevision: 1,
      expectedSalesRevision: 1,
      communicationTagIds: ["COMM-TEXT", "COMM-TEXT"],
      requestId: "553dfe93-6b62-4ed7-8395-e3246397eaa5",
      appVersion: "phase11-test",
    }).success).toBe(false);
  });
});
