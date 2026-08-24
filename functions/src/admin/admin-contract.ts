import { z } from "zod";

const documentIdSchema = z.string().trim().min(1).max(128).regex(/^[^/]+$/u);
const requestIdSchema = z.string().uuid();
const appVersionSchema = z.string().trim().min(1).max(200);
const cycleIdSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u);
const roleScopeSchema = z.enum(["delivery", "sales", "viewer", "admin"]);

const uniqueRolesSchema = z.array(roleScopeSchema).min(1).max(4).refine(
  (roles) => new Set(roles).size === roles.length,
  "Role scopes must be unique.",
);

export const activateAdminSessionInputSchema = z.object({
  appVersion: appVersionSchema,
}).strict();

export const reserveEmployeePinInputSchema = z.object({
  requestId: requestIdSchema,
}).strict();

export const createEmployeeInputSchema = z.object({
  reservationId: documentIdSchema,
  displayName: z.string().trim().min(2).max(100),
  roleScopes: uniqueRolesSchema,
  exportTeam: z.boolean(),
  requestId: requestIdSchema,
  appVersion: appVersionSchema,
}).strict();

export const updateEmployeeInputSchema = z.object({
  employeeId: documentIdSchema,
  displayName: z.string().trim().min(2).max(100),
  roleScopes: uniqueRolesSchema,
  exportTeam: z.boolean(),
  status: z.enum(["active", "disabled"]),
  revokeSessions: z.boolean(),
  reason: z.string().trim().min(2).max(200),
  requestId: requestIdSchema,
  appVersion: appVersionSchema,
}).strict();

export const rotateEmployeePinInputSchema = z.object({
  employeeId: documentIdSchema,
  revokeSessions: z.boolean(),
  reason: z.string().trim().min(2).max(200),
  requestId: requestIdSchema,
  appVersion: appVersionSchema,
}).strict();

export const revokeEmployeeSessionsInputSchema = z.object({
  employeeId: documentIdSchema,
  reason: z.string().trim().min(2).max(200),
  requestId: requestIdSchema,
  appVersion: appVersionSchema,
}).strict();

export const getAdminWorkspaceInputSchema = z.object({
  cycleId: cycleIdSchema.nullable(),
}).strict();

export const listAdminAuditLogsInputSchema = z.object({
  limit: z.number().int().min(20).max(200),
}).strict();

export const updatePublicAppSettingsInputSchema = z.object({
  minimumAppVersion: z.string().trim().min(1).max(100).nullable(),
  maintenanceMode: z.boolean(),
  requestId: requestIdSchema,
  appVersion: appVersionSchema,
}).strict();

export type CreateEmployeeInput = z.infer<typeof createEmployeeInputSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeInputSchema>;
export type RotateEmployeePinInput = z.infer<typeof rotateEmployeePinInputSchema>;
export type RevokeEmployeeSessionsInput = z.infer<typeof revokeEmployeeSessionsInputSchema>;
export type UpdatePublicAppSettingsInput = z.infer<typeof updatePublicAppSettingsInputSchema>;
