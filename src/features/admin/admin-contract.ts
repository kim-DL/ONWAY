import { z } from "zod";

export const adminRoleSchema = z.enum(["delivery", "sales", "viewer", "admin"]);
export type AdminRole = z.infer<typeof adminRoleSchema>;

export const adminEmployeeSchema = z.object({
  employeeId: z.string(),
  displayName: z.string(),
  roleScopes: z.array(adminRoleSchema),
  exportTeam: z.boolean(),
  status: z.enum(["active", "disabled"]),
  sessionVersion: z.number().int(),
  permissionsVersion: z.number().int(),
  createdAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
}).strict();

export const adminSchoolSchema = z.object({
  schoolId: z.string(),
  name: z.string(),
  district: z.string(),
  schoolType: z.string(),
  roadAddress: z.string().nullable(),
  locationStatus: z.string(),
  possibleRelocation: z.boolean(),
  schoolBaseRevision: z.number().int(),
}).strict();

export const adminCycleSchema = z.object({
  cycleId: z.string(),
  status: z.string(),
  copiedFromCycleId: z.string().nullable(),
  createdAt: z.string().datetime().nullable(),
}).strict();

export const adminZoneSchema = z.object({
  zoneId: z.string(),
  name: z.string(),
  active: z.boolean(),
}).strict();

export const adminAssignmentSchema = z.object({
  schoolId: z.string(),
  zoneId: z.string(),
  primaryAssigneeId: z.string(),
  assigneeIds: z.array(z.string()),
  monthlyStatus: z.string(),
  revision: z.number().int(),
}).strict();

const kakaoCandidateSchema = z.object({
  candidateId: z.string(),
  name: z.string(),
  roadAddress: z.string(),
  addressName: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  score: z.number(),
  placeUrl: z.string(),
}).strict();

export const kakaoReviewSchema = z.object({
  schoolId: z.string(),
  schoolBaseRevision: z.number().int(),
  neisName: z.string(),
  neisRoadAddress: z.string().nullable(),
  status: z.string(),
  reason: z.string(),
  candidates: z.array(kakaoCandidateSchema),
  generatedAt: z.string().datetime().nullable(),
}).strict();

export const adminAuditSchema = z.object({
  logId: z.string(),
  eventType: z.string(),
  actorEmployeeId: z.string().nullable(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  changedFields: z.array(z.string()),
  changeReason: z.string().nullable(),
  createdAt: z.string().datetime().nullable(),
}).strict();

const syncRunSchema = z.object({
  runId: z.string(),
  status: z.string(),
  sourceCount: z.number().int(),
  newCount: z.number().int(),
  changedCount: z.number().int(),
  missingCount: z.number().int(),
  appliedCount: z.number().int(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
}).strict();

const settingsSchema = z.object({
  minimumAppVersion: z.string().nullable(),
  currentSalesCycleId: z.string().nullable(),
  commonCatalogVersion: z.number().int(),
  maintenanceMode: z.boolean(),
  updatedAt: z.string().datetime().nullable(),
}).strict();

export const adminWorkspaceSchema = z.object({
  generatedAt: z.string().datetime(),
  selectedCycleId: z.string().nullable(),
  employees: z.array(adminEmployeeSchema),
  schools: z.array(adminSchoolSchema),
  cycles: z.array(adminCycleSchema),
  zones: z.array(adminZoneSchema),
  assignments: z.array(adminAssignmentSchema),
  settings: settingsSchema,
  syncRuns: z.array(syncRunSchema),
  kakaoReviews: z.array(kakaoReviewSchema),
  audits: z.array(adminAuditSchema),
}).strict();

const neisChangeSchema = z.object({
  changeId: z.string(),
  type: z.enum(["NEW", "NAME_CHANGED", "ADDRESS_CHANGED", "PHONE_CHANGED", "HOMEPAGE_CHANGED", "TYPE_CHANGED", "MISSING"]),
  schoolId: z.string().nullable(),
  schoolCode: z.string(),
  oldData: z.record(z.string(), z.unknown()).nullable(),
  newData: z.record(z.string(), z.unknown()).nullable(),
  approved: z.boolean().nullable(),
  applied: z.boolean(),
}).passthrough();

export const neisPreviewSchema = z.object({
  runId: z.string(),
  status: z.string(),
  sourceCount: z.number().int(),
  newCount: z.number().int(),
  changedCount: z.number().int(),
  missingCount: z.number().int(),
  appliedCount: z.number().int(),
  errorCount: z.number().int(),
  suspiciousReasons: z.array(z.string()),
  changes: z.array(neisChangeSchema),
  replayed: z.boolean(),
}).passthrough();

export const pinReservationSchema = z.object({
  reservationId: z.string(),
  pin: z.string().regex(/^\d{6}$/u),
  expiresAt: z.string().datetime(),
}).strict();

export const rotatedPinSchema = z.object({
  employeeId: z.string(),
  pin: z.string().regex(/^\d{6}$/u),
  sessionRevoked: z.boolean(),
}).strict();

export type AdminEmployee = z.infer<typeof adminEmployeeSchema>;
export type AdminSchool = z.infer<typeof adminSchoolSchema>;
export type AdminCycle = z.infer<typeof adminCycleSchema>;
export type AdminZone = z.infer<typeof adminZoneSchema>;
export type AdminAssignment = z.infer<typeof adminAssignmentSchema>;
export type KakaoReview = z.infer<typeof kakaoReviewSchema>;
export type AdminAudit = z.infer<typeof adminAuditSchema>;
export type AdminWorkspaceData = z.infer<typeof adminWorkspaceSchema>;
export type NeisPreview = z.infer<typeof neisPreviewSchema>;
export type PinReservation = z.infer<typeof pinReservationSchema>;
