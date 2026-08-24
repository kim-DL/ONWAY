import { z } from "zod";

import { roleScopeSchema } from "@/domain/common";

export const sessionClaimsSchema = z.object({
  employeeId: z.string().min(1).max(128),
  sessionVersion: z.number().int().nonnegative(),
  permissionsVersion: z.number().int().nonnegative(),
  roleScopes: z.array(roleScopeSchema).min(1).max(4),
  adminApproved: z.boolean().optional(),
  signInProvider: z.enum(["custom", "google.com"]).optional(),
});

export function isVerifiedAdminSession(claims: SessionClaims) {
  return claims.roleScopes.includes("admin")
    && claims.adminApproved === true
    && claims.signInProvider === "google.com";
}

export const clientAuthzSchema = z.object({
  employeeId: z.string().min(1).max(128),
  active: z.boolean(),
  sessionVersion: z.number().int().nonnegative(),
  permissionsVersion: z.number().int().nonnegative(),
});

export type SessionClaims = z.infer<typeof sessionClaimsSchema>;

export function authzMatchesSession(
  authz: z.infer<typeof clientAuthzSchema>,
  claims: SessionClaims,
) {
  return (
    authz.active &&
    authz.employeeId === claims.employeeId &&
    authz.sessionVersion === claims.sessionVersion &&
    authz.permissionsVersion === claims.permissionsVersion
  );
}
