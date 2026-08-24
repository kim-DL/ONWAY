import { z } from "zod";

const optionSchema = z.object({ cycleId: z.string(), label: z.string(), status: z.string() }).strict();
const idNameSchema = z.object({ zoneId: z.string(), name: z.string() }).strict();
const employeeOptionSchema = z.object({ employeeId: z.string(), displayName: z.string() }).strict();
const tagOptionSchema = z.object({ tagId: z.string(), label: z.string() }).strict();

export const csvExportFilterSchema = z.object({
  cycleId: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable(),
  zoneId: z.string().min(1).nullable(),
  assigneeId: z.string().min(1).nullable(),
  district: z.enum(["dong", "jung", "seo", "yuseong", "daedeok"]).nullable(),
  schoolType: z.enum(["elementary", "middle", "high", "special", "other"]).nullable(),
  monthlyStatus: z.enum(["before", "completed", "followUp", "revisit", "onHold"]).nullable(),
  interestScore: z.union([z.literal(0), z.literal(20), z.literal(40), z.literal(60), z.literal(80), z.literal(100)]).nullable(),
  followUpOnly: z.boolean(),
  tagId: z.string().min(1).nullable(),
  visitedFrom: z.string().date().nullable(),
  visitedTo: z.string().date().nullable(),
}).strict();

export const csvExportSelectionSchema = z.object({
  kind: z.enum(["assignments", "visits"]),
  scope: z.enum(["own", "team", "admin"]),
  filter: csvExportFilterSchema,
}).strict();

export const csvExportOptionsSchema = z.object({
  currentCycleId: z.string(),
  teamExportAllowed: z.boolean(),
  cycles: z.array(optionSchema),
  zones: z.array(idNameSchema),
  employees: z.array(employeeOptionSchema),
  communicationTags: z.array(tagOptionSchema),
  activityTags: z.array(tagOptionSchema),
}).strict();

export const csvExportPreviewSchema = z.object({
  rowCount: z.number().int().nonnegative(),
  filterSummary: z.array(z.string()),
  teamExportAllowed: z.boolean(),
}).strict();

export const csvExportResultSchema = z.object({
  jobId: z.string(), fileName: z.string(), rowCount: z.number().int().nonnegative(), expiresAt: z.string().datetime(), replayed: z.boolean(),
}).strict();

export const csvExportDownloadSchema = z.object({
  jobId: z.string(), fileName: z.string(), contentType: z.string(), fileBase64: z.string(),
}).strict();

export type CsvExportFilter = z.infer<typeof csvExportFilterSchema>;
export type CsvExportSelection = z.infer<typeof csvExportSelectionSchema>;
export type CsvExportOptions = z.infer<typeof csvExportOptionsSchema>;
export type CsvExportPreview = z.infer<typeof csvExportPreviewSchema>;
export type CsvExportResult = z.infer<typeof csvExportResultSchema>;
