import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const employeeNameSchema = z.string().trim().min(1).max(120);
const requestIdSchema = z.uuid();
const photoIdSchema = z.uuid();
const customerIdsSchema = z.array(idSchema).max(100)
  .refine((ids) => new Set(ids).size === ids.length, "거래처 식별자가 중복되었습니다.");

export const DELIVERY_PHOTO_RETENTION_HOURS = 168;
export const DELIVERY_PHOTO_DAY_OVERRIDE_RETENTION_DAYS = 14;
export const DELIVERY_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const DELIVERY_PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const deliveryDateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, "날짜를 YYYY-MM-DD 형식으로 확인해주세요.");

export const deliveryPhotoRouteSchema = z.object({
  employeeId: idSchema,
  customerIds: customerIdsSchema,
  revision: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
  updatedByEmployeeId: idSchema,
}).strict();

export const deliveryPhotoDaySchema = z.object({
  employeeId: idSchema,
  deliveryDateKey: deliveryDateKeySchema,
  hasOverride: z.boolean(),
  customerIds: customerIdsSchema,
  revision: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
  updatedByEmployeeId: idSchema,
  expiresAt: z.iso.datetime(),
}).strict();

export const deliveryPhotoObjectSchema = z.object({
  objectPath: z.string().trim().min(1).max(1_024),
  generation: z.string().regex(/^\d+$/),
  uploadAttemptToken: z.uuid(),
  contentType: z.literal("image/webp"),
  byteSize: z.number().int().positive().max(DELIVERY_PHOTO_MAX_BYTES),
  width: z.number().int().positive().max(4_096),
  height: z.number().int().positive().max(4_096),
}).strict();

const deletionMetadataSchema = z.object({
  deletedAt: z.iso.datetime(),
  deletedByEmployeeId: idSchema,
  deleteReason: z.enum(["user", "admin", "expired"]),
}).strict();

export const deliveryPhotoSchema = z.object({
  photoId: photoIdSchema,
  customerId: idSchema,
  deliveryDateKey: deliveryDateKeySchema,
  source: z.enum(["camera", "album"]),
  status: z.enum(["active", "deleted"]),
  createdAt: z.iso.datetime(),
  createdByUid: idSchema,
  createdByEmployeeId: idSchema,
  createdByName: employeeNameSchema,
  expiresAt: z.iso.datetime(),
  evidence: deliveryPhotoObjectSchema,
  thumbnail: deliveryPhotoObjectSchema,
  cleanupAfter: z.iso.datetime().nullable().optional(),
  deletion: deletionMetadataSchema.optional(),
}).strict().superRefine((photo, context) => {
  if ((photo.status === "deleted") !== Boolean(photo.deletion)) {
    context.addIssue({ code: "custom", path: ["deletion"], message: "삭제 상태와 삭제 기록이 일치하지 않습니다." });
  }
  const prefix = `delivery-photos/${photo.deliveryDateKey}/${photo.photoId}/attempts/${photo.evidence.uploadAttemptToken}/`;
  if (photo.evidence.uploadAttemptToken !== photo.thumbnail.uploadAttemptToken
    || photo.evidence.objectPath !== `${prefix}evidence.webp`
    || photo.thumbnail.objectPath !== `${prefix}thumbnail.webp`) {
    context.addIssue({ code: "custom", path: ["evidence"], message: "사진 객체가 동일한 업로드 시도를 참조해야 합니다." });
  }
});

export const getDeliveryPhotoRouteInputSchema = z.object({}).strict();
export const saveDeliveryPhotoRouteInputSchema = z.object({
  requestId: requestIdSchema,
  expectedRevision: z.number().int().positive().nullable(),
  customerIds: customerIdsSchema,
}).strict();
export const getDeliveryPhotoDayInputSchema = z.object({}).strict();
export const saveDeliveryPhotoDayInputSchema = z.object({
  requestId: requestIdSchema,
  expectedRevision: z.number().int().positive().nullable(),
  customerIds: customerIdsSchema,
}).strict();
export const deliveryPhotoDayResultSchema = z.object({
  deliveryDateKey: deliveryDateKeySchema,
  customerIds: customerIdsSchema,
  revision: z.number().int().positive().nullable(),
  isOverride: z.boolean(),
}).strict();

export const createDeliveryPhotoInputSchema = z.object({
  requestId: requestIdSchema,
  customerId: idSchema,
  source: z.enum(["camera", "album"]),
  contentType: z.enum(DELIVERY_PHOTO_CONTENT_TYPES),
  fileBase64: z.string().min(4).max(Math.ceil(DELIVERY_PHOTO_MAX_BYTES * 4 / 3) + 8),
}).strict();

export const deliveryPhotoMetadataSchema = z.object({
  photoId: photoIdSchema,
  customerId: idSchema,
  deliveryDateKey: deliveryDateKeySchema,
  source: z.enum(["camera", "album"]),
  createdAt: z.iso.datetime(),
  createdByEmployeeId: idSchema,
  createdByName: employeeNameSchema,
  expiresAt: z.iso.datetime(),
  thumbnail: z.object({
    width: z.number().int().positive().max(4_096),
    height: z.number().int().positive().max(4_096),
  }).strict(),
}).strict();
export const createDeliveryPhotoResultSchema = deliveryPhotoMetadataSchema;

export const listDeliveryPhotosInputSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("today") }).strict(),
  z.object({ scope: z.literal("customer"), customerId: idSchema, limit: z.number().int().min(1).max(100).default(30) }).strict(),
]);
export const deliveryPhotoCustomerSummarySchema = z.object({
  customerId: idSchema,
  count: z.number().int().nonnegative(),
  latest: deliveryPhotoMetadataSchema.nullable(),
}).strict();
export const listDeliveryPhotosResultSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("today"),
    deliveryDateKey: deliveryDateKeySchema,
    truncated: z.boolean(),
    photos: z.array(deliveryPhotoMetadataSchema).max(500),
    customers: z.array(deliveryPhotoCustomerSummarySchema).max(500),
  }).strict(),
  z.object({
    scope: z.literal("customer"),
    customerId: idSchema,
    fromDateKey: deliveryDateKeySchema,
    photos: z.array(deliveryPhotoMetadataSchema).max(100),
  }).strict(),
]);

export const getDeliveryPhotoInputSchema = z.object({
  photoId: photoIdSchema,
  variant: z.enum(["evidence", "thumbnail"]).default("evidence"),
}).strict();
export const deliveryPhotoDownloadSchema = z.object({
  photoId: photoIdSchema,
  variant: z.enum(["evidence", "thumbnail"]),
  contentType: z.literal("image/webp"),
  byteSize: z.number().int().positive().max(DELIVERY_PHOTO_MAX_BYTES),
  fileBase64: z.string().min(4).max(Math.ceil(DELIVERY_PHOTO_MAX_BYTES * 4 / 3) + 8),
}).strict();
export const deleteDeliveryPhotoInputSchema = z.object({
  requestId: requestIdSchema,
  photoId: photoIdSchema,
}).strict();
export const deleteDeliveryPhotoResultSchema = z.object({
  photoId: photoIdSchema,
  deletedAt: z.iso.datetime(),
}).strict();

export type DeliveryPhotoRoute = z.infer<typeof deliveryPhotoRouteSchema>;
export type DeliveryPhotoDay = z.infer<typeof deliveryPhotoDaySchema>;
export type DeliveryPhotoObject = z.infer<typeof deliveryPhotoObjectSchema>;
export type DeliveryPhoto = z.infer<typeof deliveryPhotoSchema>;
export type DeliveryPhotoMetadata = z.infer<typeof deliveryPhotoMetadataSchema>;
