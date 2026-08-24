import { z } from "zod";

import {
  cycleIdSchema,
  documentIdSchema,
  firestoreDateSchema,
  nonNegativeIntegerSchema,
  nullableDateOnlySchema,
  nullableFirestoreDateSchema,
  nullableTextSchema,
  positiveRevisionSchema,
  requiredTextSchema,
  uniqueDocumentIdsSchema,
} from "@/domain/common";

export const INTEREST_SCORES = [0, 20, 40, 60, 80, 100] as const;
export const DELIVERY_STATUSES = ["delivered", "notDelivered"] as const;
export const SALES_CYCLE_STATUSES = ["draft", "active", "closed"] as const;
export const MONTHLY_STATUSES = ["before", "completed", "followUp", "revisit", "onHold"] as const;
export const ASSIGNMENT_DELIVERY_STATUSES = ["unknown", "delivered", "notDelivered"] as const;

export const interestScoreSchema = z.union(INTEREST_SCORES.map((score) => z.literal(score)));
export const deliveryStatusSchema = z.enum(DELIVERY_STATUSES);
export const salesCycleStatusSchema = z.enum(SALES_CYCLE_STATUSES);
export const monthlyStatusSchema = z.enum(MONTHLY_STATUSES);
export const assignmentDeliveryStatusSchema = z.enum(ASSIGNMENT_DELIVERY_STATUSES);

const followUpSchema = z
  .object({
    required: z.boolean(),
    dueDate: nullableDateOnlySchema,
    summary: nullableTextSchema,
  })
  .strict();

const nextActionSchema = z
  .object({
    dueDate: nullableDateOnlySchema,
    summary: nullableTextSchema,
  })
  .strict();

const latestVisitSchema = z
  .object({
    visitId: documentIdSchema.nullable(),
    visitedAt: nullableFirestoreDateSchema,
    visitedBy: documentIdSchema.nullable(),
  })
  .strict()
  .superRefine((visit, context) => {
    const presentCount = [visit.visitId, visit.visitedAt, visit.visitedBy].filter(
      (value) => value !== null,
    ).length;

    if (presentCount !== 0 && presentCount !== 3) {
      context.addIssue({
        code: "custom",
        message: "Latest visit fields must either all exist or all be null.",
      });
    }
  });

export const salesProfileSchema = z
  .object({
    schoolId: documentIdSchema,
    interestScore: interestScoreSchema,
    interestEvaluated: z.boolean(),
    interestedProductIds: uniqueDocumentIdsSchema,
    communicationTagIds: uniqueDocumentIdsSchema,
    latestVisit: latestVisitSchema,
    followUp: followUpSchema,
    nextAction: nextActionSchema,
    salesRevision: positiveRevisionSchema,
    createdAt: firestoreDateSchema,
    updatedAt: firestoreDateSchema,
    updatedBy: documentIdSchema,
  })
  .strict()
  .superRefine((profile, context) => {
    if (!profile.interestEvaluated && profile.interestScore !== 0) {
      context.addIssue({
        code: "custom",
        message: "An unevaluated profile must retain interest score 0.",
        path: ["interestScore"],
      });
    }
  });

const assignmentSnapshotSchema = z
  .object({
    zoneId: documentIdSchema.nullable(),
    primaryAssigneeId: documentIdSchema.nullable(),
    assigneeIds: uniqueDocumentIdsSchema,
  })
  .strict()
  .superRefine((assignment, context) => {
    if (
      assignment.primaryAssigneeId !== null &&
      !assignment.assigneeIds.includes(assignment.primaryAssigneeId)
    ) {
      context.addIssue({
        code: "custom",
        message: "The primary assignee must be included in assigneeIds.",
        path: ["primaryAssigneeId"],
      });
    }
  });

const sampleItemSchema = z
  .object({
    productId: documentIdSchema,
    quantity: z.number().int().positive(),
  })
  .strict();

const sampleSchema = z
  .object({
    status: deliveryStatusSchema,
    items: z.array(sampleItemSchema).max(100),
  })
  .strict()
  .superRefine((sample, context) => {
    if (sample.status === "notDelivered" && sample.items.length > 0) {
      context.addIssue({
        code: "custom",
        message: "A not-delivered sample cannot contain delivered items.",
        path: ["items"],
      });
    }
  });

export const salesVisitSchema = z
  .object({
    visitId: documentIdSchema,
    schoolId: documentIdSchema,
    cycleId: cycleIdSchema,
    assignmentSnapshot: assignmentSnapshotSchema,
    visitedAt: firestoreDateSchema,
    visitedBy: documentIdSchema,
    recordedBy: documentIdSchema,
    brochure: z.object({ status: deliveryStatusSchema }).strict(),
    sample: sampleSchema,
    interest: z
      .object({
        score: interestScoreSchema,
        explicitlySelected: z.boolean(),
      })
      .strict(),
    activityTagIds: uniqueDocumentIdsSchema,
    summary: requiredTextSchema,
    followUp: followUpSchema,
    deleted: z.boolean(),
    deletedAt: nullableFirestoreDateSchema,
    deletedBy: documentIdSchema.nullable(),
    deleteReason: nullableTextSchema,
    revision: positiveRevisionSchema,
    createdAt: firestoreDateSchema,
    updatedAt: firestoreDateSchema,
  })
  .strict()
  .superRefine((visit, context) => {
    if (!visit.interest.explicitlySelected) {
      context.addIssue({
        code: "custom",
        message: "A completed visit requires an explicit interest selection.",
        path: ["interest", "explicitlySelected"],
      });
    }

    const deletionFields = [visit.deletedAt, visit.deletedBy, visit.deleteReason];
    const completeDeletionMetadata = deletionFields.every((value) => value !== null);
    const emptyDeletionMetadata = deletionFields.every((value) => value === null);

    if (visit.deleted && !completeDeletionMetadata) {
      context.addIssue({
        code: "custom",
        message: "Soft-deleted visits require deletedAt, deletedBy, and deleteReason.",
        path: ["deleted"],
      });
    }

    if (!visit.deleted && !emptyDeletionMetadata) {
      context.addIssue({
        code: "custom",
        message: "Active visits cannot retain deletion metadata.",
        path: ["deleted"],
      });
    }
  });

export const salesCycleSchema = z
  .object({
    cycleId: cycleIdSchema,
    year: z.number().int().min(2000).max(9999),
    month: z.number().int().min(1).max(12),
    status: salesCycleStatusSchema,
    copiedFromCycleId: cycleIdSchema.nullable(),
    createdAt: firestoreDateSchema,
    createdBy: documentIdSchema,
    activatedAt: nullableFirestoreDateSchema,
    closedAt: nullableFirestoreDateSchema,
  })
  .strict()
  .superRefine((cycle, context) => {
    const expectedCycleId = `${cycle.year}-${String(cycle.month).padStart(2, "0")}`;
    if (cycle.cycleId !== expectedCycleId) {
      context.addIssue({
        code: "custom",
        message: "cycleId must match the year and month fields.",
        path: ["cycleId"],
      });
    }

    if (cycle.copiedFromCycleId === cycle.cycleId) {
      context.addIssue({
        code: "custom",
        message: "A cycle cannot copy itself.",
        path: ["copiedFromCycleId"],
      });
    }

    if (cycle.status === "draft" && (cycle.activatedAt !== null || cycle.closedAt !== null)) {
      context.addIssue({
        code: "custom",
        message: "A draft cycle cannot be activated or closed.",
        path: ["status"],
      });
    }

    if (cycle.status === "active" && (cycle.activatedAt === null || cycle.closedAt !== null)) {
      context.addIssue({
        code: "custom",
        message: "An active cycle requires activatedAt and no closedAt.",
        path: ["status"],
      });
    }

    if (cycle.status === "closed" && (cycle.activatedAt === null || cycle.closedAt === null)) {
      context.addIssue({
        code: "custom",
        message: "A closed cycle requires activatedAt and closedAt.",
        path: ["status"],
      });
    }
  });

export const salesAssignmentSchema = z
  .object({
    schoolId: documentIdSchema,
    cycleId: cycleIdSchema,
    zoneId: documentIdSchema,
    primaryAssigneeId: documentIdSchema,
    assigneeIds: uniqueDocumentIdsSchema.min(1),
    monthlyStatus: monthlyStatusSchema,
    latestVisitId: documentIdSchema.nullable(),
    latestVisitedAt: nullableFirestoreDateSchema,
    brochureStatus: assignmentDeliveryStatusSchema,
    sampleStatus: assignmentDeliveryStatusSchema,
    revision: positiveRevisionSchema,
    createdAt: firestoreDateSchema,
    updatedAt: firestoreDateSchema,
  })
  .strict()
  .superRefine((assignment, context) => {
    if (!assignment.assigneeIds.includes(assignment.primaryAssigneeId)) {
      context.addIssue({
        code: "custom",
        message: "The primary assignee must be included in assigneeIds.",
        path: ["primaryAssigneeId"],
      });
    }

    if ((assignment.latestVisitId === null) !== (assignment.latestVisitedAt === null)) {
      context.addIssue({
        code: "custom",
        message: "latestVisitId and latestVisitedAt must be set together.",
        path: [assignment.latestVisitId === null ? "latestVisitId" : "latestVisitedAt"],
      });
    }
  });

export const salesZoneSchema = z
  .object({
    zoneId: documentIdSchema,
    name: requiredTextSchema.max(100),
    displayOrder: nonNegativeIntegerSchema,
    active: z.boolean(),
    createdAt: firestoreDateSchema,
    updatedAt: firestoreDateSchema,
  })
  .strict();

export const employeeCycleStatsSchema = z
  .object({
    employeeId: documentIdSchema,
    assignedSchoolCount: nonNegativeIntegerSchema,
    completedCount: nonNegativeIntegerSchema,
    beforeCount: nonNegativeIntegerSchema,
    followUpCount: nonNegativeIntegerSchema,
    revisitCount: nonNegativeIntegerSchema,
    onHoldCount: nonNegativeIntegerSchema,
    updatedAt: firestoreDateSchema,
  })
  .strict();

export const teamCycleStatsSchema = z
  .object({
    totalSchoolCount: nonNegativeIntegerSchema,
    completedCount: nonNegativeIntegerSchema,
    beforeCount: nonNegativeIntegerSchema,
    followUpCount: nonNegativeIntegerSchema,
    revisitCount: nonNegativeIntegerSchema,
    onHoldCount: nonNegativeIntegerSchema,
    updatedAt: firestoreDateSchema,
  })
  .strict();

export type InterestScore = z.infer<typeof interestScoreSchema>;
export type MonthlyStatus = z.infer<typeof monthlyStatusSchema>;
export type SalesProfile = z.infer<typeof salesProfileSchema>;
export type SalesVisit = z.infer<typeof salesVisitSchema>;
export type SalesCycle = z.infer<typeof salesCycleSchema>;
export type SalesAssignment = z.infer<typeof salesAssignmentSchema>;
export type SalesZone = z.infer<typeof salesZoneSchema>;
export type EmployeeCycleStats = z.infer<typeof employeeCycleStatsSchema>;
export type TeamCycleStats = z.infer<typeof teamCycleStatsSchema>;
