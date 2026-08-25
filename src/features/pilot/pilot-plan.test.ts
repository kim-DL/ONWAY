import { describe, expect, it } from "vitest";

import { assessPhase18PilotReadiness } from "./pilot-plan";

const validPlan = {
  schemaVersion: 1,
  pilotId: "phase18-2026-09-01",
  environment: {
    kind: "staging",
    url: "https://pilot.onnuriway.test",
    firebaseProjectId: "onnuriway-staging",
    dataMode: "sanitized",
  },
  window: {
    startsAt: "2026-09-01T09:00:00+09:00",
    endsAt: "2026-09-04T18:00:00+09:00",
  },
  participants: {
    delivery: [{ participantId: "PILOT-DEL-01", devicePlatform: "android" }],
    sales: [{ participantId: "PILOT-SAL-01", devicePlatform: "ios" }],
    admin: [{ participantId: "PILOT-ADM-01", devicePlatform: "windows" }],
  },
  operations: {
    supportOwnerParticipantId: "PILOT-ADM-01",
    rollbackOwnerParticipantId: "PILOT-ADM-01",
    incidentChannel: "internal-pilot-support",
  },
  approvals: {
    privacyNoticeAcknowledged: true,
    pilotOwnerApproved: true,
  },
  acceptanceReportPath: "output/acceptance/phase17-report.json",
} as const;

const validAcceptance = {
  status: "passed",
  p0Defects: 0,
  p1Defects: 0,
  generatedAt: "2026-08-28T09:00:00+09:00",
};

describe("Phase 18 Pilot readiness", () => {
  it("accepts a privacy-safe staging cohort backed by a fresh acceptance report", () => {
    expect(assessPhase18PilotReadiness({ plan: validPlan, acceptanceReport: validAcceptance })).toEqual({
      ready: true,
      issues: [],
    });
  });

  it("fails closed for demo projects, undersized cohorts, short windows, and stale acceptance", () => {
    const result = assessPhase18PilotReadiness({
      plan: {
        ...validPlan,
        environment: { ...validPlan.environment, firebaseProjectId: "demo-onnuriway" },
        window: { ...validPlan.window, endsAt: "2026-09-02T09:00:00+09:00" },
        participants: { ...validPlan.participants, delivery: [] },
      },
      acceptanceReport: { ...validAcceptance, generatedAt: "2026-08-01T09:00:00+09:00" },
    });

    expect(result.ready).toBe(false);
    expect(result.issues.join("\n")).toMatch(/Demo Firebase|at least 1|72 hours|within 7 days/iu);
  });

  it("rejects a failed or incomplete Phase 17 report", () => {
    const result = assessPhase18PilotReadiness({
      plan: validPlan,
      acceptanceReport: { status: "failed", p0Defects: 1, p1Defects: 0 },
    });
    expect(result.ready).toBe(false);
    expect(result.issues.join("\n")).toMatch(/acceptance/iu);
  });
});
