import { z } from "zod";

import {
  documentIdSchema,
  firestoreDateSchema,
  nonNegativeIntegerSchema,
  nullableFirestoreDateSchema,
  roleScopeSchema,
  requiredTextSchema,
} from "@/domain/common";

export const EMPLOYEE_STATUSES = ["active", "disabled"] as const;
export const employeeStatusSchema = z.enum(EMPLOYEE_STATUSES);

export const employeeDirectorySchema = z
  .object({
    employeeId: documentIdSchema,
    displayName: requiredTextSchema.max(100),
    active: z.boolean(),
    displayOrder: nonNegativeIntegerSchema,
  })
  .strict();

export const employeeSchema = z
  .object({
    employeeId: documentIdSchema,
    firebaseUid: documentIdSchema,
    displayName: requiredTextSchema.max(100),
    roleScopes: z
      .array(roleScopeSchema)
      .min(1)
      .max(4)
      .refine((roles) => new Set(roles).size === roles.length, "Role scopes must be unique."),
    permissions: z.object({ exportTeam: z.boolean() }).strict(),
    status: employeeStatusSchema,
    sessionVersion: nonNegativeIntegerSchema,
    createdAt: firestoreDateSchema,
    updatedAt: firestoreDateSchema,
  })
  .strict();

export const authCredentialSchema = z
  .object({
    employeeId: documentIdSchema,
    lookupKey: documentIdSchema,
    pinHash: z.string().min(20).max(1_000),
    pinVersion: z.number().int().positive(),
    failedAttemptCount: nonNegativeIntegerSchema,
    lockedUntil: nullableFirestoreDateSchema,
    sessionVersion: nonNegativeIntegerSchema,
    updatedAt: firestoreDateSchema,
  })
  .strict();

export const pinIndexSchema = z
  .object({
    employeeId: documentIdSchema,
    createdAt: firestoreDateSchema,
    updatedAt: firestoreDateSchema,
  })
  .strict();

export const authzSchema = z
  .object({
    employeeId: documentIdSchema,
    active: z.boolean(),
    sessionVersion: nonNegativeIntegerSchema,
    permissionsVersion: nonNegativeIntegerSchema,
    updatedAt: firestoreDateSchema,
  })
  .strict();

export type EmployeeDirectory = z.infer<typeof employeeDirectorySchema>;
export type Employee = z.infer<typeof employeeSchema>;
export type AuthCredential = z.infer<typeof authCredentialSchema>;
export type PinIndex = z.infer<typeof pinIndexSchema>;
export type Authz = z.infer<typeof authzSchema>;
