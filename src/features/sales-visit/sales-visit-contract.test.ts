import { describe, expect, it } from "vitest";

import { recordSalesVisitInputSchema, todayInSeoul, visitTimestampFromDate } from "./sales-visit-contract";

describe("sales visit client contract", () => {
  it("keeps the current visit time and uses noon in Seoul for a past date", () => {
    const now = new Date("2026-08-24T05:30:00.000Z");
    expect(todayInSeoul(now)).toBe("2026-08-24");
    expect(visitTimestampFromDate("2026-08-24", now)).toBe(now.toISOString());
    expect(visitTimestampFromDate("2026-08-20", now)).toBe("2026-08-20T03:00:00.000Z");
  });

  it("accepts an explicitly selected zero interest score", () => {
    expect(recordSalesVisitInputSchema.safeParse({
      cycleId: "2026-08",
      schoolId: "SCH-001",
      expectedAssignmentRevision: 1,
      visitedAt: "2026-08-24T05:30:00.000Z",
      visitedBy: "EMP-SALES-A",
      brochureStatus: "notDelivered",
      sample: { status: "notDelivered", items: [] },
      interestScore: 0,
      activityTagIds: [],
      summary: "담당자 부재로 자료를 전달하지 못함",
      followUp: { required: false, dueDate: null, summary: null },
      requestId: "553dfe93-6b62-4ed7-8395-e3246397eaa5",
      appVersion: "phase10-test",
    }).success).toBe(true);
  });

  it("accepts a free-text sample product name without a quantity", () => {
    expect(recordSalesVisitInputSchema.safeParse({
      cycleId: "2026-08",
      schoolId: "SCH-001",
      expectedAssignmentRevision: 1,
      visitedAt: "2026-08-24T05:30:00.000Z",
      visitedBy: "EMP-SALES-A",
      brochureStatus: "delivered",
      sample: { status: "delivered", items: [{ productName: "우리쌀 떡볶이 순한맛" }] },
      interestScore: 60,
      activityTagIds: ["ACT-SAMPLE"],
      summary: "샘플 전달 후 반응을 확인하기로 함",
      followUp: { required: false, dueDate: null, summary: null },
      requestId: "553dfe93-6b62-4ed7-8395-e3246397eaa6",
      appVersion: "phase10-test",
    }).success).toBe(true);
  });
});
