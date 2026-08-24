import { z } from "zod";

const documentIdSchema = z.string().trim().min(1).max(128).refine(
  (value) => !value.includes("/"),
  "Document IDs cannot contain '/'.",
);

export const updateSalesProfileInputSchema = z.object({
  cycleId: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  schoolId: documentIdSchema,
  expectedAssignmentRevision: z.number().int().positive(),
  expectedSalesRevision: z.number().int().nonnegative(),
  communicationTagIds: z.array(documentIdSchema).max(20).refine(
    (values) => new Set(values).size === values.length,
    "Communication tags must be unique.",
  ),
  requestId: z.string().uuid(),
  appVersion: z.string().trim().min(1).max(200),
}).strict();

export type UpdateSalesProfileInput = z.infer<typeof updateSalesProfileInputSchema>;
