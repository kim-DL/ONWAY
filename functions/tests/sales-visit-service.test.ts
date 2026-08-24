import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import { recordSalesVisitInputSchema } from "../src/sales/sales-visit-contract.js";
import { calculateCycleStats } from "../src/sales/sales-visit-service.js";

const request = {
  cycleId: "2026-08",
  schoolId: "SCH-001",
  expectedAssignmentRevision: 1,
  visitedAt: "2026-08-24T03:00:00.000Z",
  visitedBy: "EMP-SALES-A",
  brochureStatus: "delivered" as const,
  sample: { status: "delivered" as const, items: [{ productId: "PROD-001", quantity: 2 }] },
  interestScore: 60 as const,
  activityTagIds: ["ACT-SAMPLE"],
  summary: "샘플 사용 후 단가를 다시 안내하기로 함",
  followUp: { required: true, dueDate: "2026-08-30", summary: "단가 자료 전달" },
  requestId: "553dfe93-6b62-4ed7-8395-e3246397eaa5",
  appVersion: "phase10-test",
};

describe("sales visit contract", () => {
  it("accepts explicit zero interest and a complete non-delivery visit", () => {
    expect(recordSalesVisitInputSchema.safeParse({
      ...request,
      brochureStatus: "notDelivered",
      sample: { status: "notDelivered", items: [] },
      interestScore: 0,
      followUp: { required: false, dueDate: null, summary: null },
    }).success).toBe(true);
  });

  it("rejects missing interest, invalid sample items, and incomplete follow-up", () => {
    expect(recordSalesVisitInputSchema.safeParse({ ...request, interestScore: undefined }).success).toBe(false);
    expect(recordSalesVisitInputSchema.safeParse({ ...request, sample: { status: "delivered", items: [] } }).success).toBe(false);
    expect(recordSalesVisitInputSchema.safeParse({
      ...request,
      followUp: { required: true, dueDate: null, summary: null },
    }).success).toBe(false);
  });

  it("rejects impossible dates, duplicate products, and unsupported scores", () => {
    expect(recordSalesVisitInputSchema.safeParse({
      ...request,
      followUp: { required: true, dueDate: "2026-02-31", summary: "연락" },
    }).success).toBe(false);
    expect(recordSalesVisitInputSchema.safeParse({
      ...request,
      sample: { status: "delivered", items: [request.sample.items[0], request.sample.items[0]] },
    }).success).toBe(false);
    expect(recordSalesVisitInputSchema.safeParse({ ...request, interestScore: 73 }).success).toBe(false);
  });
});

describe("sales cycle stats", () => {
  it("recomputes team and joint-assignee counts from assignment truth", () => {
    const now = Timestamp.fromDate(new Date("2026-08-24T03:00:00.000Z"));
    const base = {
      cycleId: "2026-08",
      zoneId: "A",
      primaryAssigneeId: "EMP-A",
      latestVisitId: null,
      latestVisitedAt: null,
      brochureStatus: "unknown" as const,
      sampleStatus: "unknown" as const,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    const stats = calculateCycleStats([
      { ...base, schoolId: "SCH-001", assigneeIds: ["EMP-A", "EMP-B"], monthlyStatus: "completed" },
      { ...base, schoolId: "SCH-002", assigneeIds: ["EMP-B"], primaryAssigneeId: "EMP-B", monthlyStatus: "followUp" },
    ], now);
    expect(stats.team).toMatchObject({ totalSchoolCount: 2, completedCount: 1, followUpCount: 1 });
    expect(stats.employees.get("EMP-A")).toMatchObject({ assignedSchoolCount: 1, completedCount: 1 });
    expect(stats.employees.get("EMP-B")).toMatchObject({ assignedSchoolCount: 2, completedCount: 1, followUpCount: 1 });
  });
});
