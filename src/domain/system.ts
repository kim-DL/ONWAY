import { z } from "zod";

import {
  cycleIdSchema,
  documentIdSchema,
  firestoreDateSchema,
  nonNegativeIntegerSchema,
  nullableFirestoreDateSchema,
  nullableShortTextSchema,
  stringMapSchema,
} from "@/domain/common";

export const EXPORT_SCOPES = ["own", "team", "admin"] as const;
export const EXPORT_JOB_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
  "expired",
] as const;
export const NEIS_SYNC_STATUSES = [
  "FETCHING",
  "NORMALIZING",
  "DIFF_READY",
  "APPLYING",
  "COMPLETED",
  "FAILED",
  "SUSPICIOUS_RESULT",
] as const;
export const NEIS_CHANGE_TYPES = [
  "NEW",
  "NAME_CHANGED",
  "ADDRESS_CHANGED",
  "PHONE_CHANGED",
  "HOMEPAGE_CHANGED",
  "TYPE_CHANGED",
  "MISSING",
] as const;

export const exportScopeSchema = z.enum(EXPORT_SCOPES);
export const exportJobStatusSchema = z.enum(EXPORT_JOB_STATUSES);
export const neisSyncStatusSchema = z.enum(NEIS_SYNC_STATUSES);
export const neisChangeTypeSchema = z.enum(NEIS_CHANGE_TYPES);

export const exportJobSchema = z
  .object({
    jobId: documentIdSchema,
    requestedBy: documentIdSchema,
    cycleId: cycleIdSchema.nullable(),
    scope: exportScopeSchema,
    filter: stringMapSchema,
    rowCount: nonNegativeIntegerSchema.nullable(),
    status: exportJobStatusSchema,
    storagePath: nullableShortTextSchema,
    fileName: nullableShortTextSchema.optional(),
    expiresAt: nullableFirestoreDateSchema,
    createdAt: firestoreDateSchema,
    completedAt: nullableFirestoreDateSchema,
  })
  .strict();

export const auditLogSchema = z
  .object({
    logId: documentIdSchema,
    eventType: z.string().trim().min(1).max(100),
    actorUid: documentIdSchema.nullable(),
    actorEmployeeId: documentIdSchema.nullable(),
    targetType: z.string().trim().min(1).max(100),
    targetId: documentIdSchema.nullable(),
    schoolId: documentIdSchema.nullable(),
    cycleId: cycleIdSchema.nullable(),
    changedFields: z.array(z.string().trim().min(1).max(200)).max(100),
    changeReason: nullableShortTextSchema.optional(),
    requestId: documentIdSchema.nullable(),
    appVersion: nullableShortTextSchema,
    createdAt: firestoreDateSchema,
  })
  .strict();

export const neisSyncRunSchema = z
  .object({
    runId: documentIdSchema,
    status: neisSyncStatusSchema,
    requestedBy: documentIdSchema,
    sourceCount: nonNegativeIntegerSchema,
    newCount: nonNegativeIntegerSchema,
    changedCount: nonNegativeIntegerSchema,
    missingCount: nonNegativeIntegerSchema,
    appliedCount: nonNegativeIntegerSchema,
    errorCount: nonNegativeIntegerSchema,
    startedAt: firestoreDateSchema,
    completedAt: nullableFirestoreDateSchema,
  })
  .strict();

export const neisSyncChangeSchema = z
  .object({
    type: neisChangeTypeSchema,
    schoolId: documentIdSchema.nullable(),
    schoolCode: documentIdSchema,
    oldData: stringMapSchema.nullable(),
    newData: stringMapSchema.nullable(),
    approved: z.boolean().nullable(),
    applied: z.boolean(),
  })
  .strict();

export const publicAppSettingsSchema = z
  .object({
    minimumAppVersion: nullableShortTextSchema,
    currentSalesCycleId: cycleIdSchema,
    commonCatalogVersion: nonNegativeIntegerSchema,
    maintenanceMode: z.boolean(),
    updatedAt: firestoreDateSchema,
  })
  .strict();

export type ExportJob = z.infer<typeof exportJobSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
export type NeisSyncRun = z.infer<typeof neisSyncRunSchema>;
export type NeisSyncChange = z.infer<typeof neisSyncChangeSchema>;
export type PublicAppSettings = z.infer<typeof publicAppSettingsSchema>;
