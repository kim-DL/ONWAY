import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const employeeNameSchema = z.string().trim().min(1).max(120);
const customerIdsSchema = z.array(idSchema).max(500)
  .refine((ids) => new Set(ids).size === ids.length, "거래처 식별자가 중복되었습니다.");

export const DELIVERY_PHOTO_RETENTION_HOURS = 168;
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
  customerIds: customerIdsSchema,
  revision: z.number().int().positive(),
  updatedAt: z.iso.datetime(),
  updatedByEmployeeId: idSchema,
  expiresAt: z.iso.datetime(),
}).strict();

export const deliveryPhotoObjectSchema = z.object({
  objectPath: z.string().trim().min(1).max(1_024),
  generation: z.string().regex(/^\d+$/),
  contentType: z.literal("image/webp"),
  byteSize: z.number().int().positive(),
  width: z.number().int().positive().max(4_096),
  height: z.number().int().positive().max(4_096),
}).strict();

const deletionMetadataSchema = z.object({
  deletedAt: z.iso.datetime(),
  deletedByEmployeeId: idSchema,
  deleteReason: z.string().trim().max(500),
}).strict();

export const deliveryPhotoSchema = z.object({
  photoId: z.uuid(),
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
  deletion: deletionMetadataSchema.optional(),
}).strict().superRefine((photo, context) => {
  if ((photo.status === "deleted") !== Boolean(photo.deletion)) {
    context.addIssue({ code: "custom", path: ["deletion"], message: "삭제 상태와 삭제 기록이 일치하지 않습니다." });
  }
});

export type DeliveryPhotoRoute = z.infer<typeof deliveryPhotoRouteSchema>;
export type DeliveryPhotoDay = z.infer<typeof deliveryPhotoDaySchema>;
export type DeliveryPhotoObject = z.infer<typeof deliveryPhotoObjectSchema>;
export type DeliveryPhoto = z.infer<typeof deliveryPhotoSchema>;
