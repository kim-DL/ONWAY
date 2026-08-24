import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

const documentIdSchema = z.string().trim().min(1).max(128).refine((value) => !value.includes("/"));
const nullableShortTextSchema = z.string().trim().max(200).nullable();
const nullableTextSchema = z.string().trim().max(2_000).nullable();
const nullableTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable();
const timestampSchema = z.custom<Timestamp>((value) => value instanceof Timestamp, "Expected Timestamp.");
const requirementSchema = z.enum(["required", "notRequired", "unknown"]);
const availabilitySchema = z.enum(["available", "unavailable", "unknown"]);
const accessSchema = z.enum(["available", "limited", "unavailable", "unknown"]);

export const cafeteriaSchema = z.object({
  building: nullableShortTextSchema,
  floor: nullableShortTextSchema,
  locationDescription: nullableTextSchema,
  entranceDescription: nullableTextSchema,
  routeDescription: nullableTextSchema,
}).strict();

export const inspectionSchema = z.object({
  startTime: nullableTimeSchema,
  endTime: nullableTimeSchema,
  note: nullableTextSchema,
}).strict().superRefine((inspection, context) => {
  if (inspection.startTime && inspection.endTime && inspection.startTime >= inspection.endTime) {
    context.addIssue({ code: "custom", message: "Inspection end must follow start.", path: ["endTime"] });
  }
});

export const equipmentSchema = z.object({
  cartRequired: requirementSchema,
  elevator: availabilitySchema,
  stairsRequired: requirementSchema,
}).strict();

export const vehicleSchema = z.object({
  access: accessSchema,
  unloadingLocation: nullableTextSchema,
  parking: accessSchema,
  note: nullableTextSchema,
}).strict();

export const fieldProfilePatchSchema = z.object({
  cafeteria: cafeteriaSchema.optional(),
  inspection: inspectionSchema.optional(),
  equipment: equipmentSchema.optional(),
  vehicle: vehicleSchema.optional(),
  fieldNotes: nullableTextSchema.optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, "At least one field section is required.");

export const updateFieldProfileInputSchema = z.object({
  schoolId: documentIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  requestId: z.string().uuid(),
  appVersion: z.string().trim().min(1).max(50),
  patch: fieldProfilePatchSchema,
}).strict();

export const fieldProfileSchema = z.object({
  schoolId: documentIdSchema,
  cafeteria: cafeteriaSchema,
  inspection: inspectionSchema,
  equipment: equipmentSchema,
  vehicle: vehicleSchema,
  fieldNotes: nullableTextSchema,
  completeness: z.number().min(0).max(100),
  reviewRequired: z.boolean(),
  revision: z.number().int().positive(),
  createdAt: timestampSchema,
  createdBy: documentIdSchema,
  updatedAt: timestampSchema,
  updatedBy: documentIdSchema,
}).strict();

export type FieldProfile = z.infer<typeof fieldProfileSchema>;
export type FieldProfilePatch = z.infer<typeof fieldProfilePatchSchema>;
export type UpdateFieldProfileInput = z.infer<typeof updateFieldProfileInputSchema>;

export const EMPTY_FIELD_PROFILE = {
  cafeteria: {
    building: null,
    floor: null,
    locationDescription: null,
    entranceDescription: null,
    routeDescription: null,
  },
  inspection: { startTime: null, endTime: null, note: null },
  equipment: { cartRequired: "unknown", elevator: "unknown", stairsRequired: "unknown" },
  vehicle: { access: "unknown", unloadingLocation: null, parking: "unknown", note: null },
  fieldNotes: null,
} as const;
