import { z } from "zod";

export const PHOTO_SLOT_IDS = ["01", "02", "03"] as const;
export const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_VARIANTS = ["thumbnail", "preview", "original"] as const;
export const MAX_PHOTO_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_INPUT_PIXELS = 40_000_000;

const documentIdSchema = z.string().trim().min(1).max(128).regex(/^[^/]+$/);
const appVersionSchema = z.string().trim().min(1).max(100);
const requestIdSchema = z.string().uuid();
const captionSchema = z.string().trim().max(2_000).nullable();

export const photoSlotIdSchema = z.enum(PHOTO_SLOT_IDS);
export const photoContentTypeSchema = z.enum(PHOTO_CONTENT_TYPES);
export const photoVariantSchema = z.enum(PHOTO_VARIANTS);

export const preparePhotoUploadInputSchema = z.object({
  schoolId: documentIdSchema,
  slotId: photoSlotIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  requestId: requestIdSchema,
  appVersion: appVersionSchema,
  fileName: z.string().trim().min(1).max(255).regex(/^[^/\\]+$/),
  contentType: photoContentTypeSchema,
  byteSize: z.number().int().positive().max(MAX_PHOTO_UPLOAD_BYTES),
  caption: captionSchema,
}).strict();

export const finalizePhotoUploadInputSchema = z.object({
  uploadId: z.string().uuid(),
  fileBase64: z.string().min(4).max(Math.ceil(MAX_PHOTO_UPLOAD_BYTES * 4 / 3) + 8),
}).strict();

export const getSchoolPhotoInputSchema = z.object({
  schoolId: documentIdSchema,
  slotId: photoSlotIdSchema,
  versionId: documentIdSchema,
  variant: photoVariantSchema,
}).strict();

export const mutateSchoolPhotoInputSchema = z.object({
  schoolId: documentIdSchema,
  slotId: photoSlotIdSchema,
  expectedRevision: z.number().int().positive(),
  requestId: requestIdSchema,
  appVersion: appVersionSchema,
  reason: z.string().trim().min(1).max(500).optional(),
}).strict();

export type PreparePhotoUploadInput = z.infer<typeof preparePhotoUploadInputSchema>;
export type FinalizePhotoUploadInput = z.infer<typeof finalizePhotoUploadInputSchema>;
export type GetSchoolPhotoInput = z.infer<typeof getSchoolPhotoInputSchema>;
export type MutateSchoolPhotoInput = z.infer<typeof mutateSchoolPhotoInputSchema>;
export type PhotoVariant = z.infer<typeof photoVariantSchema>;
