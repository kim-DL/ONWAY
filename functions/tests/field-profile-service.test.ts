import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import {
  EMPTY_FIELD_PROFILE,
  updateFieldProfileInputSchema,
} from "../src/field/profile-contract.js";
import {
  calculateFieldProfileCompleteness,
  mergeFieldProfile,
} from "../src/field/profile-service.js";

const now = Timestamp.fromDate(new Date("2026-08-23T00:00:00.000Z"));

describe("school field profile mutation contract", () => {
  it("creates revision one and derives completeness on the server", () => {
    const profile = mergeFieldProfile(null, {
      schoolId: "SCH-001",
      employeeId: "EMP-DELIVERY",
      now,
      patch: {
        cafeteria: {
          building: "본관",
          floor: "1층",
          locationDescription: "뒤편",
          entranceDescription: "전용 출입구",
          routeDescription: "정문 우회전",
        },
      },
    });

    expect(profile.revision).toBe(1);
    expect(profile.createdBy).toBe("EMP-DELIVERY");
    expect(profile.updatedBy).toBe("EMP-DELIVERY");
    expect(profile.completeness).toBe(38);
    expect(profile.reviewRequired).toBe(true);
  });

  it("preserves untouched sections and increments the current revision", () => {
    const current = mergeFieldProfile(null, {
      schoolId: "SCH-001",
      employeeId: "EMP-A",
      now,
      patch: { fieldNotes: "첫 기록" },
    });
    const next = mergeFieldProfile(current, {
      schoolId: "SCH-001",
      employeeId: "EMP-B",
      now: Timestamp.fromMillis(now.toMillis() + 1_000),
      patch: { equipment: { cartRequired: "required", elevator: "available", stairsRequired: "notRequired" } },
    });

    expect(next.revision).toBe(2);
    expect(next.fieldNotes).toBe("첫 기록");
    expect(next.equipment.cartRequired).toBe("required");
    expect(next.updatedBy).toBe("EMP-B");
  });

  it("stores school contact numbers without changing operational completeness", () => {
    const profile = mergeFieldProfile(null, {
      schoolId: "SCH-001",
      employeeId: "EMP-SALES",
      now,
      patch: { contacts: { dietitianPhone: "010-1234-5678", cafeteriaPhone: "042-123-4567" } },
    });
    expect(profile.contacts).toEqual({ dietitianPhone: "010-1234-5678", cafeteriaPhone: "042-123-4567" });
    expect(profile.completeness).toBe(0);
    expect(updateFieldProfileInputSchema.safeParse({
      schoolId: "SCH-001",
      expectedRevision: 1,
      requestId: "37d6694b-a0c0-40d7-b2e5-d92d1ae10a41",
      appVersion: "school-contacts",
      patch: { contacts: { dietitianPhone: "javascript:alert(1)", cafeteriaPhone: null } },
    }).success).toBe(false);
  });

  it("scores a complete operational profile at one hundred percent", () => {
    const completeness = calculateFieldProfileCompleteness({
      ...EMPTY_FIELD_PROFILE,
      cafeteria: { building: "본관", floor: "1층", locationDescription: "뒤편", entranceDescription: "후문", routeDescription: "우회전" },
      inspection: { startTime: "07:30", endTime: "08:10", note: null },
      equipment: { cartRequired: "required", elevator: "available", stairsRequired: "notRequired" },
      vehicle: { access: "available", unloadingLocation: "하역장", parking: "limited", note: null },
    });
    expect(completeness).toBe(100);
  });

  it("rejects invalid times, extra fields, and empty patches", () => {
    const base = {
      schoolId: "SCH-001",
      expectedRevision: 1,
      requestId: "37d6694b-a0c0-40d7-b2e5-d92d1ae10a41",
      appVersion: "phase7",
    };
    expect(updateFieldProfileInputSchema.safeParse({ ...base, patch: {} }).success).toBe(false);
    expect(updateFieldProfileInputSchema.safeParse({
      ...base,
      patch: { inspection: { startTime: "09:00", endTime: "08:00", note: null } },
    }).success).toBe(false);
    expect(updateFieldProfileInputSchema.safeParse({
      ...base,
      patch: { fieldNotes: null, injectedRole: "admin" },
    }).success).toBe(false);
  });
});
