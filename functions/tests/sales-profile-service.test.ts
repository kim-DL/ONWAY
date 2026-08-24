import { describe, expect, it } from "vitest";

import { updateSalesProfileInputSchema } from "../src/sales/sales-profile-contract.js";

const request = {
  cycleId: "2026-08",
  schoolId: "SCH-001",
  expectedAssignmentRevision: 1,
  expectedSalesRevision: 0,
  communicationTagIds: ["COMM-DETAIL", "COMM-TEXT"],
  requestId: "553dfe93-6b62-4ed7-8395-e3246397eaa5",
  appVersion: "phase11-test",
};

describe("sales profile update contract", () => {
  it("supports the first profile update and persistent communication tags", () => {
    const parsed = updateSalesProfileInputSchema.parse(request);
    expect(parsed.expectedSalesRevision).toBe(0);
    expect(parsed.communicationTagIds).toEqual(["COMM-DETAIL", "COMM-TEXT"]);
  });

  it("rejects duplicate tags, malformed IDs, and unknown fields", () => {
    expect(updateSalesProfileInputSchema.safeParse({
      ...request,
      communicationTagIds: ["COMM-TEXT", "COMM-TEXT"],
    }).success).toBe(false);
    expect(updateSalesProfileInputSchema.safeParse({ ...request, schoolId: "schools/SCH-001" }).success).toBe(false);
    expect(updateSalesProfileInputSchema.safeParse({ ...request, overwriteVisit: true }).success).toBe(false);
  });
});
