import { z } from "zod";

const documentIdSchema = z.string().trim().min(1).max(128).refine(
  (value) => !value.includes("/"),
  "Document IDs cannot contain '/'.",
);
const cycleIdSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const requestFields = {
  requestId: z.string().uuid(),
  appVersion: z.string().trim().min(1).max(200),
};

export const assignmentDraftSchema = z.object({
  schoolId: documentIdSchema,
  zoneId: documentIdSchema,
  primaryAssigneeId: documentIdSchema,
  assigneeIds: z.array(documentIdSchema).min(1).max(10).refine(
    (values) => new Set(values).size === values.length,
    "Assignees must be unique.",
  ),
}).strict().superRefine((assignment, context) => {
  if (!assignment.assigneeIds.includes(assignment.primaryAssigneeId)) {
    context.addIssue({
      code: "custom",
      message: "The primary assignee must be included in assigneeIds.",
      path: ["primaryAssigneeId"],
    });
  }
});

export const createSalesCycleInputSchema = z.object({
  cycleId: cycleIdSchema,
  copiedFromCycleId: cycleIdSchema.nullable(),
  activate: z.boolean(),
  ...requestFields,
}).strict().superRefine((input, context) => {
  if (input.copiedFromCycleId === input.cycleId) {
    context.addIssue({ code: "custom", message: "A cycle cannot copy itself.", path: ["copiedFromCycleId"] });
  }
});

export const createSalesAssignmentsInputSchema = z.object({
  cycleId: cycleIdSchema,
  assignments: z.array(assignmentDraftSchema).min(1).max(50),
  ...requestFields,
}).strict().superRefine((input, context) => {
  const schoolIds = input.assignments.map((assignment) => assignment.schoolId);
  if (new Set(schoolIds).size !== schoolIds.length) {
    context.addIssue({ code: "custom", message: "A school can only be assigned once per request.", path: ["assignments"] });
  }
});

export const changeSalesAssignmentInputSchema = z.object({
  cycleId: cycleIdSchema,
  schoolId: documentIdSchema,
  expectedRevision: z.number().int().positive(),
  zoneId: documentIdSchema,
  primaryAssigneeId: documentIdSchema,
  assigneeIds: z.array(documentIdSchema).min(1).max(10).refine(
    (values) => new Set(values).size === values.length,
    "Assignees must be unique.",
  ),
  reason: z.string().trim().min(2).max(200),
  ...requestFields,
}).strict().superRefine((input, context) => {
  if (!input.assigneeIds.includes(input.primaryAssigneeId)) {
    context.addIssue({
      code: "custom",
      message: "The primary assignee must be included in assigneeIds.",
      path: ["primaryAssigneeId"],
    });
  }
});

export type AssignmentDraft = z.infer<typeof assignmentDraftSchema>;
export type CreateSalesCycleInput = z.infer<typeof createSalesCycleInputSchema>;
export type CreateSalesAssignmentsInput = z.infer<typeof createSalesAssignmentsInputSchema>;
export type ChangeSalesAssignmentInput = z.infer<typeof changeSalesAssignmentInputSchema>;
