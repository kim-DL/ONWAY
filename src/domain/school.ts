import { z } from "zod";

import {
  districtSchema,
  documentIdSchema,
  firestoreDateSchema,
  nullableFirestoreDateSchema,
  nullableShortTextSchema,
  nullableTextSchema,
  nullableTimeOfDaySchema,
  percentageSchema,
  positiveRevisionSchema,
  requiredTextSchema,
} from "@/domain/common";

export const SCHOOL_TYPES = ["elementary", "middle", "high", "special", "other"] as const;
export const LOCATION_MATCH_STATUSES = [
  "unmatched",
  "autoMatched",
  "needsReview",
  "confirmed",
  "failed",
] as const;
export const LOCATION_MATCH_METHODS = ["address", "keyword", "address+keyword", "manual"] as const;
export const SCHOOL_OPERATIONAL_STATUSES = [
  "active",
  "inactiveCandidate",
  "inactive",
  "closed",
  "merged",
] as const;
export const REQUIREMENT_STATUSES = ["required", "notRequired", "unknown"] as const;
export const AVAILABILITY_STATUSES = ["available", "unavailable", "unknown"] as const;
export const ACCESS_STATUSES = ["available", "limited", "unavailable", "unknown"] as const;
export const PHOTO_SLOT_IDS = ["01", "02", "03"] as const;
export const PHOTO_STATUSES = ["active", "deleted"] as const;

export const schoolTypeSchema = z.enum(SCHOOL_TYPES);
export const locationMatchStatusSchema = z.enum(LOCATION_MATCH_STATUSES);
export const locationMatchMethodSchema = z.enum(LOCATION_MATCH_METHODS);
export const schoolOperationalStatusSchema = z.enum(SCHOOL_OPERATIONAL_STATUSES);
export const requirementStatusSchema = z.enum(REQUIREMENT_STATUSES);
export const availabilityStatusSchema = z.enum(AVAILABILITY_STATUSES);
export const accessStatusSchema = z.enum(ACCESS_STATUSES);
export const photoSlotIdSchema = z.enum(PHOTO_SLOT_IDS);
export const photoStatusSchema = z.enum(PHOTO_STATUSES);

const schoolSourceSchema = z
  .object({
    provider: z.literal("NEIS"),
    schoolCode: documentIdSchema,
    educationOfficeCode: documentIdSchema,
    syncedAt: nullableFirestoreDateSchema,
  })
  .strict();

const schoolAddressSchema = z
  .object({
    road: nullableShortTextSchema,
    jibun: nullableShortTextSchema,
    postalCode: nullableShortTextSchema,
  })
  .strict();

const schoolLocationSchema = z
  .object({
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    kakaoPlaceId: nullableShortTextSchema,
    matchStatus: locationMatchStatusSchema,
    matchMethod: locationMatchMethodSchema.nullable(),
    matchConfidence: z.number().min(0).max(1).nullable(),
    matchedName: nullableShortTextSchema,
    matchedRoadAddress: nullableShortTextSchema,
    matchedAt: nullableFirestoreDateSchema,
    confirmedBy: documentIdSchema.nullable(),
    confirmedAt: nullableFirestoreDateSchema,
  })
  .strict()
  .superRefine((location, context) => {
    if ((location.latitude === null) !== (location.longitude === null)) {
      context.addIssue({
        code: "custom",
        message: "Latitude and longitude must either both exist or both be null.",
        path: [location.latitude === null ? "latitude" : "longitude"],
      });
    }

    if ((location.confirmedBy === null) !== (location.confirmedAt === null)) {
      context.addIssue({
        code: "custom",
        message: "confirmedBy and confirmedAt must be set together.",
        path: [location.confirmedBy === null ? "confirmedBy" : "confirmedAt"],
      });
    }
  });

export const schoolSchema = z
  .object({
    schoolId: documentIdSchema,
    source: schoolSourceSchema,
    name: requiredTextSchema.max(200),
    shortName: nullableShortTextSchema,
    normalizedName: requiredTextSchema.max(200),
    initials: z.string().trim().max(100),
    aliases: z
      .array(z.string().trim().min(1).max(200))
      .max(50)
      .refine((values) => new Set(values).size === values.length, "Aliases must be unique."),
    schoolType: schoolTypeSchema,
    district: districtSchema,
    address: schoolAddressSchema,
    phone: nullableShortTextSchema,
    homepage: z.string().url().nullable(),
    location: schoolLocationSchema,
    operationalStatus: schoolOperationalStatusSchema,
    possibleRelocation: z.boolean(),
    schoolBaseRevision: positiveRevisionSchema,
    createdAt: firestoreDateSchema,
    updatedAt: firestoreDateSchema,
  })
  .strict();

export const cafeteriaSchema = z
  .object({
    building: nullableShortTextSchema,
    floor: nullableShortTextSchema,
    locationDescription: nullableTextSchema,
    entranceDescription: nullableTextSchema,
    routeDescription: nullableTextSchema,
  })
  .strict();

export const inspectionSchema = z
  .object({
    startTime: nullableTimeOfDaySchema,
    endTime: nullableTimeOfDaySchema,
    note: nullableTextSchema,
  })
  .strict()
  .superRefine((inspection, context) => {
    if (inspection.startTime && inspection.endTime && inspection.startTime >= inspection.endTime) {
      context.addIssue({
        code: "custom",
        message: "Inspection end must follow start.",
        path: ["endTime"],
      });
    }
  });

export const equipmentSchema = z
  .object({
    cartRequired: requirementStatusSchema,
    elevator: availabilityStatusSchema,
    stairsRequired: requirementStatusSchema,
  })
  .strict();

export const vehicleSchema = z
  .object({
    access: accessStatusSchema,
    unloadingLocation: nullableTextSchema,
    parking: accessStatusSchema,
    note: nullableTextSchema,
  })
  .strict();

const nullablePhoneNumberSchema = z.string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[0-9+()\-.\s]+$/u, "Phone numbers may only contain digits and common separators.")
  .nullable();

export const schoolContactSchema = z
  .object({
    dietitianPhone: nullablePhoneNumberSchema,
    cafeteriaPhone: nullablePhoneNumberSchema,
  })
  .strict();

const EMPTY_SCHOOL_CONTACT = {
  dietitianPhone: null,
  cafeteriaPhone: null,
} as const;

export const schoolFieldProfileSchema = z
  .object({
    schoolId: documentIdSchema,
    contacts: schoolContactSchema.default(EMPTY_SCHOOL_CONTACT),
    cafeteria: cafeteriaSchema,
    inspection: inspectionSchema,
    equipment: equipmentSchema,
    vehicle: vehicleSchema,
    fieldNotes: nullableTextSchema,
    completeness: percentageSchema,
    reviewRequired: z.boolean(),
    revision: positiveRevisionSchema,
    createdAt: firestoreDateSchema,
    createdBy: documentIdSchema,
    updatedAt: firestoreDateSchema,
    updatedBy: documentIdSchema,
  })
  .strict();

export const schoolFieldProfilePatchSchema = z
  .object({
    contacts: schoolContactSchema.optional(),
    cafeteria: cafeteriaSchema.optional(),
    inspection: inspectionSchema.optional(),
    equipment: equipmentSchema.optional(),
    vehicle: vehicleSchema.optional(),
    fieldNotes: nullableTextSchema.optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, "At least one field section is required.");

export const schoolPhotoSchema = z
  .object({
    schoolId: documentIdSchema,
    slotId: photoSlotIdSchema,
    currentVersionId: documentIdSchema,
    caption: nullableTextSchema,
    status: photoStatusSchema,
    photoRevision: positiveRevisionSchema,
    createdAt: firestoreDateSchema,
    createdBy: documentIdSchema,
    updatedAt: firestoreDateSchema,
    updatedBy: documentIdSchema,
    deletedAt: nullableFirestoreDateSchema,
    deletedBy: documentIdSchema.nullable(),
    deleteReason: nullableTextSchema,
  })
  .strict()
  .superRefine((photo, context) => {
    const hasDeletionMetadata = photo.deletedAt !== null && photo.deletedBy !== null && photo.deleteReason !== null;
    const hasNoDeletionMetadata = photo.deletedAt === null && photo.deletedBy === null && photo.deleteReason === null;

    if (photo.status === "deleted" && !hasDeletionMetadata) {
      context.addIssue({
        code: "custom",
        message: "Deleted photos require deletedAt and deletedBy.",
        path: ["status"],
      });
    }

    if (photo.status === "active" && !hasNoDeletionMetadata) {
      context.addIssue({
        code: "custom",
        message: "Active photos cannot retain deletion metadata.",
        path: ["status"],
      });
    }
  });

export const schoolPhotoSlotsSchema = z
  .array(schoolPhotoSchema)
  .max(PHOTO_SLOT_IDS.length)
  .refine(
    (photos) => new Set(photos.map((photo) => photo.slotId)).size === photos.length,
    "A school can only have one photo per slot.",
  )
  .refine(
    (photos) => new Set(photos.map((photo) => photo.schoolId)).size <= 1,
    "A photo slot collection must belong to one school.",
  );

export type School = z.infer<typeof schoolSchema>;
export type SchoolFieldProfile = z.infer<typeof schoolFieldProfileSchema>;
export type SchoolFieldProfilePatch = z.infer<typeof schoolFieldProfilePatchSchema>;
export type SchoolPhoto = z.infer<typeof schoolPhotoSchema>;
export type PhotoSlotId = z.infer<typeof photoSlotIdSchema>;
