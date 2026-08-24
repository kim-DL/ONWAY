import { z } from "zod";

export const ROLE_SCOPES = ["delivery", "sales", "viewer", "admin"] as const;
export const DISTRICTS = ["dong", "jung", "seo", "yuseong", "daedeok"] as const;

export const roleScopeSchema = z.enum(ROLE_SCOPES);
export const districtSchema = z.enum(DISTRICTS);

export const documentIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine((value) => !value.includes("/"), "Document ID must not contain '/'.");

export const requiredTextSchema = z.string().trim().min(1).max(2_000);
export const nullableTextSchema = z.string().trim().max(2_000).nullable();
export const nullableShortTextSchema = z.string().trim().max(200).nullable();
export const firestoreDateSchema = z.date();
export const nullableFirestoreDateSchema = firestoreDateSchema.nullable();
export const nonNegativeIntegerSchema = z.number().int().nonnegative();
export const positiveRevisionSchema = z.number().int().positive();
export const percentageSchema = z.number().min(0).max(100);

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, "Expected a valid calendar date in YYYY-MM-DD format.");

export const nullableDateOnlySchema = dateOnlySchema.nullable();

export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected a 24-hour time in HH:mm format.");

export const nullableTimeOfDaySchema = timeOfDaySchema.nullable();

export const cycleIdSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected a cycle ID in YYYY-MM format.");

export const uniqueDocumentIdsSchema = z
  .array(documentIdSchema)
  .max(100)
  .refine((values) => new Set(values).size === values.length, "IDs must be unique.");

export const stringMapSchema = z.record(z.string(), z.unknown());

export type RoleScope = z.infer<typeof roleScopeSchema>;
export type District = z.infer<typeof districtSchema>;
