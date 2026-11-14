import { z } from "zod";

const documentId = z.string().trim().min(1).max(128).regex(/^[^/]+$/u);
const mutation = {
  expectedRevision: z.number().int().nonnegative(),
  requestId: z.string().uuid(),
  appVersion: z.string().trim().min(1).max(200),
};

export const listGoogleAdminAccessInputSchema = z.object({}).strict();
export const registerGoogleAdminAccessInputSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  displayName: z.string().trim().min(2).max(100),
  ...mutation,
}).strict();
export const disableGoogleAdminAccessInputSchema = z.object({
  employeeId: documentId,
  reason: z.string().trim().min(2).max(200),
  ...mutation,
}).strict();

export type RegisterGoogleAdminAccessInput = z.infer<typeof registerGoogleAdminAccessInputSchema>;
export type DisableGoogleAdminAccessInput = z.infer<typeof disableGoogleAdminAccessInputSchema>;
