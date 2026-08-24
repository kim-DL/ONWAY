import { z } from "zod";

const documentIdSchema = z.string().trim().min(1).max(128).regex(/^[^/]+$/);
const cycleIdSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const nullableDocumentIdSchema = documentIdSchema.nullable();
const nullableDateOnlySchema = z.string().date().nullable();

export const CSV_EXPORT_KINDS = ["assignments", "visits"] as const;
export const CSV_EXPORT_SCOPES = ["own", "team", "admin"] as const;

export const csvExportFilterSchema = z.object({
  cycleId: cycleIdSchema.nullable(),
  zoneId: nullableDocumentIdSchema,
  assigneeId: nullableDocumentIdSchema,
  district: z.enum(["dong", "jung", "seo", "yuseong", "daedeok"]).nullable(),
  schoolType: z.enum(["elementary", "middle", "high", "special", "other"]).nullable(),
  monthlyStatus: z.enum(["before", "completed", "followUp", "revisit", "onHold"]).nullable(),
  interestScore: z.union([z.literal(0), z.literal(20), z.literal(40), z.literal(60), z.literal(80), z.literal(100)]).nullable(),
  followUpOnly: z.boolean(),
  tagId: nullableDocumentIdSchema,
  visitedFrom: nullableDateOnlySchema,
  visitedTo: nullableDateOnlySchema,
}).strict();

export const csvExportSelectionSchema = z.object({
  kind: z.enum(CSV_EXPORT_KINDS),
  scope: z.enum(CSV_EXPORT_SCOPES),
  filter: csvExportFilterSchema,
}).strict().superRefine((selection, context) => {
  if (selection.kind === "assignments" && selection.filter.cycleId === null) {
    context.addIssue({ code: "custom", path: ["filter", "cycleId"], message: "Monthly assignment exports require a cycle." });
  }
  if (selection.kind === "visits" && selection.filter.monthlyStatus !== null) {
    context.addIssue({ code: "custom", path: ["filter", "monthlyStatus"], message: "Visit exports do not use monthly status." });
  }
  if (selection.filter.visitedFrom && selection.filter.visitedTo && selection.filter.visitedFrom > selection.filter.visitedTo) {
    context.addIssue({ code: "custom", path: ["filter", "visitedTo"], message: "The end date must not precede the start date." });
  }
});

export const previewCsvExportInputSchema = csvExportSelectionSchema;

export const exportCsvInputSchema = csvExportSelectionSchema.extend({
  requestId: z.string().uuid(),
  appVersion: z.string().trim().min(1).max(100),
}).strict();

export const downloadCsvExportInputSchema = z.object({
  jobId: documentIdSchema,
}).strict();

export type CsvExportFilter = z.infer<typeof csvExportFilterSchema>;
export type CsvExportSelection = z.infer<typeof csvExportSelectionSchema>;
export type ExportCsvInput = z.infer<typeof exportCsvInputSchema>;
