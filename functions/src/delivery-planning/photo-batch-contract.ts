import { z } from "zod";
import { deliveryDateKeySchema } from "../delivery-photo/delivery-photo-contract.js";
import { analyzeInvoiceSchema, planningListsSchema } from "./planning-contract.js";

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const revision = z.number().int().positive();
export const PHOTO_BATCH_MAX_ROWS = 60;
export const photoDateSchema = z.string().regex(/^(?:\d{4}-)?\d{2}-\d{2}$/).nullable();
export const photoExtractionRowSchema = z.object({
  rawName: z.string().trim().max(120), address: z.string().trim().max(500),
  date: photoDateSchema, dateUncertain: z.boolean(), uncertain: z.boolean(),
}).strict();
export const photoExtractionSchema = z.object({
  kind: z.enum(["invoice", "customer_list", "unsupported"]),
  truncated: z.boolean(), rows: z.array(photoExtractionRowSchema).max(PHOTO_BATCH_MAX_ROWS),
}).strict();
export const photoBatchRowSchema = photoExtractionRowSchema.extend({
  rowId: id, dateStatus: z.enum(["current", "absent", "different", "uncertain"]),
  status: z.enum(["saved", "review", "skipped"]), customerId: id.nullable(),
  candidateIds: z.array(id).max(10), reason: z.string().max(200),
  matchSource: z.enum(["invoice_address", "exact", "registered_name", "alias", "manual"]).nullable(),
  aliasRevision: revision.nullable(),
});
export const photoBatchResultSchema = z.object({
  scanId: z.uuid(), revision, kind: photoExtractionSchema.shape.kind,
  rows: z.array(photoBatchRowSchema).max(PHOTO_BATCH_MAX_ROWS),
  dateConfirmed: z.boolean(), message: z.string().max(200),
  elapsedMs: z.number().nonnegative(), lists: planningListsSchema.nullable(),
}).strict();
export const analyzePhotoBatchSchema = analyzeInvoiceSchema;
export const photoBatchDecisionSchema = z.discriminatedUnion("action", [
  z.object({ rowId: id, action: z.literal("connect"), customerId: id,
    rememberAlias: z.boolean(), aliasText: z.string().trim().min(1).max(120),
    expectedAliasRevision: revision.nullable(),
  }).strict(),
  z.object({ rowId: id, action: z.literal("skip") }).strict(),
]);
export const confirmPhotoBatchSchema = z.object({
  requestId: z.uuid(), scanId: z.uuid(), deliveryDateKey: deliveryDateKeySchema,
  expectedScanRevision: revision, dateConfirmed: z.boolean(),
  decisions: z.array(photoBatchDecisionSchema).min(1).max(PHOTO_BATCH_MAX_ROWS),
}).strict().refine((v) => new Set(v.decisions.map((d) => d.rowId)).size === v.decisions.length, "Duplicate rows");
export const photoAliasSchema = z.object({
  aliasKey: z.string().regex(/^[a-f0-9]{64}$/), aliasText: z.string().trim().min(1).max(120),
  customerId: id, targetName: z.string().min(1).max(120), revision, enabled: z.boolean(),
}).strict();
export const photoAliasesSchema = z.array(photoAliasSchema).max(500);
export const updatePhotoAliasSchema = z.object({
  requestId: z.uuid(), aliasKey: photoAliasSchema.shape.aliasKey,
  expectedRevision: revision, customerId: id.nullable(),
}).strict();
export type PhotoExtraction = z.infer<typeof photoExtractionSchema>;
export type PhotoExtractionRow = z.infer<typeof photoExtractionRowSchema>;
export type PhotoBatchResult = z.infer<typeof photoBatchResultSchema>;
export type PhotoBatchRow = z.infer<typeof photoBatchRowSchema>;
export type PhotoBatchDecision = z.infer<typeof photoBatchDecisionSchema>;
export type PhotoAlias = z.infer<typeof photoAliasSchema>;
