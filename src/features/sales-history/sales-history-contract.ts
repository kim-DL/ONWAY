import { z } from "zod";

import { cycleIdSchema, documentIdSchema, uniqueDocumentIdsSchema } from "@/domain/common";

export const salesHistoryCursorSchema = z.object({
  visitedAt: z.string().datetime({ offset: true }),
  visitId: documentIdSchema,
}).strict();

export const updateSalesProfileInputSchema = z.object({
  cycleId: cycleIdSchema,
  schoolId: documentIdSchema,
  expectedAssignmentRevision: z.number().int().positive(),
  expectedSalesRevision: z.number().int().nonnegative(),
  communicationTagIds: uniqueDocumentIdsSchema.max(20),
  requestId: z.string().uuid(),
  appVersion: z.string().trim().min(1).max(200),
}).strict();

export const updateSalesProfileResultSchema = z.object({
  salesRevision: z.number().int().positive(),
  communicationTagIds: uniqueDocumentIdsSchema.max(20),
  replayed: z.boolean(),
}).strict();

export type SalesHistoryCursor = z.infer<typeof salesHistoryCursorSchema>;
export type UpdateSalesProfileInput = z.infer<typeof updateSalesProfileInputSchema>;
export type UpdateSalesProfileResult = z.infer<typeof updateSalesProfileResultSchema>;
