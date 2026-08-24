import { describe, expect, it } from "vitest";

import { interestScoreSchema, salesAssignmentSchema, salesCycleSchema, salesProfileSchema, salesVisitSchema } from "@/domain/sales";
import {
  photoSlotIdSchema,
  schoolFieldProfileSchema,
  schoolPhotoSlotsSchema,
  schoolSchema,
} from "@/domain/school";
import { createPhase1Seed } from "@/seed/phase1";

describe("Phase 1 domain contract", () => {
  it("validates complete and partial schools while rejecting inconsistent coordinates", () => {
    const seed = createPhase1Seed();

    expect(seed.schools.map((school) => schoolSchema.parse(school))).toHaveLength(5);

    const invalidSchool = structuredClone(seed.schools[0]);
    expect(invalidSchool).toBeDefined();
    if (invalidSchool === undefined) return;
    invalidSchool.location.longitude = null;

    expect(schoolSchema.safeParse(invalidSchool).success).toBe(false);
  });

  it("validates field profiles and rejects invalid completeness or inspection time", () => {
    const profile = createPhase1Seed().fieldProfiles[0];
    expect(profile).toBeDefined();
    if (profile === undefined) return;

    expect(schoolFieldProfileSchema.safeParse(profile).success).toBe(true);

    const invalidCompleteness = structuredClone(profile);
    invalidCompleteness.completeness = 101;
    expect(schoolFieldProfileSchema.safeParse(invalidCompleteness).success).toBe(false);

    const invalidTime = structuredClone(profile);
    invalidTime.inspection.startTime = "25:00";
    expect(schoolFieldProfileSchema.safeParse(invalidTime).success).toBe(false);
  });

  it("accepts only the six interest scores and preserves unevaluated versus explicit zero", () => {
    expect([0, 20, 40, 60, 80, 100].every((score) => interestScoreSchema.safeParse(score).success)).toBe(
      true,
    );
    expect(interestScoreSchema.safeParse(10).success).toBe(false);

    const unevaluated = createPhase1Seed().salesProfiles[1];
    expect(unevaluated).toBeDefined();
    if (unevaluated === undefined) return;
    expect(salesProfileSchema.safeParse(unevaluated).success).toBe(true);

    const contradictory = structuredClone(unevaluated);
    contradictory.interestScore = 20;
    expect(salesProfileSchema.safeParse(contradictory).success).toBe(false);

    const explicitZero = structuredClone(unevaluated);
    explicitZero.interestEvaluated = true;
    expect(salesProfileSchema.safeParse(explicitZero).success).toBe(true);
  });

  it("requires completed visit fields, explicit interest, and coherent soft-delete metadata", () => {
    const visit = createPhase1Seed().salesVisits[0];
    expect(visit).toBeDefined();
    if (visit === undefined) return;
    expect(salesVisitSchema.safeParse(visit).success).toBe(true);

    const withoutInterest = structuredClone(visit);
    withoutInterest.interest.explicitlySelected = false;
    expect(salesVisitSchema.safeParse(withoutInterest).success).toBe(false);

    const withoutSummary = structuredClone(visit);
    withoutSummary.summary = "  ";
    expect(salesVisitSchema.safeParse(withoutSummary).success).toBe(false);

    const incompleteDeletion = structuredClone(visit);
    incompleteDeletion.deleted = true;
    incompleteDeletion.deletedAt = new Date();
    expect(salesVisitSchema.safeParse(incompleteDeletion).success).toBe(false);
  });

  it("validates cycle ID semantics and assignment structure", () => {
    const seed = createPhase1Seed();
    const cycle = seed.cycles[0];
    const assignment = seed.assignments[0];
    expect(cycle).toBeDefined();
    expect(assignment).toBeDefined();
    if (cycle === undefined || assignment === undefined) return;

    expect(salesCycleSchema.safeParse(cycle).success).toBe(true);
    expect(salesAssignmentSchema.safeParse(assignment).success).toBe(true);

    const mismatchedCycle = structuredClone(cycle);
    mismatchedCycle.month = 9;
    expect(salesCycleSchema.safeParse(mismatchedCycle).success).toBe(false);

    const invalidAssignment = structuredClone(assignment);
    invalidAssignment.assigneeIds = ["EMP-SALES-B"];
    expect(salesAssignmentSchema.safeParse(invalidAssignment).success).toBe(false);
  });

  it("limits each school to the three canonical photo slots", () => {
    const photos = createPhase1Seed().photos;

    expect(photos.map((photo) => photo.slotId)).toEqual(["01", "02", "03"]);
    expect(schoolPhotoSlotsSchema.safeParse(photos).success).toBe(true);
    expect(photoSlotIdSchema.safeParse("04").success).toBe(false);

    const duplicateSlot = [...photos, structuredClone(photos[0])];
    expect(schoolPhotoSlotsSchema.safeParse(duplicateSlot).success).toBe(false);
  });
});
