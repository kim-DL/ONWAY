import { describe, expect, it } from "vitest";

import { adminEmployeeSchema, adminWorkspaceSchema, neisPreviewSchema } from "./admin-contract";

const employee = {
  employeeId: "EMP-SALES-A",
  displayName: "영업 A",
  roleScopes: ["sales"],
  exportTeam: false,
  status: "active",
  sessionVersion: 1,
  permissionsVersion: 1,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
};

describe("Phase 15 admin client contracts", () => {
  it("accepts a safe employee DTO and rejects credential-like fields", () => {
    expect(adminEmployeeSchema.safeParse(employee).success).toBe(true);
    expect(adminEmployeeSchema.safeParse({ ...employee, pinHash: "must-not-cross-boundary" }).success).toBe(false);
  });

  it("requires every workspace section used by the desktop", () => {
    const base = {
      generatedAt: "2026-08-24T00:00:00.000Z",
      selectedCycleId: "2026-08",
      employees: [employee],
      schools: [],
      cycles: [],
      zones: [],
      assignments: [],
      settings: {
        minimumAppVersion: null,
        currentSalesCycleId: "2026-08",
        commonCatalogVersion: 1,
        maintenanceMode: false,
        updatedAt: "2026-08-24T00:00:00.000Z",
      },
      syncRuns: [],
      kakaoReviews: [],
      audits: [],
    };
    expect(adminWorkspaceSchema.safeParse(base).success).toBe(true);
    expect(adminWorkspaceSchema.safeParse({ ...base, audits: undefined }).success).toBe(false);
  });

  it("keeps NEIS selection tied to opaque change IDs", () => {
    const preview = {
      runId: "run-1",
      status: "DIFF_READY",
      sourceCount: 1,
      newCount: 1,
      changedCount: 0,
      missingCount: 0,
      appliedCount: 0,
      errorCount: 0,
      suspiciousReasons: [],
      changes: [{
        changeId: "change-1",
        type: "NEW",
        schoolId: null,
        schoolCode: "G100000010",
        oldData: null,
        newData: { name: "대전테스트초등학교" },
        approved: null,
        applied: false,
      }],
      replayed: false,
    };
    expect(neisPreviewSchema.parse(preview).changes[0]?.changeId).toBe("change-1");
  });
});
