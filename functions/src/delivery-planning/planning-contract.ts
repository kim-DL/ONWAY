import { z } from "zod";
import { customerPointSchema } from "../customer/customer-contract.js";
import { deliveryDateKeySchema, deliveryPhotoDayResultSchema, deliveryPhotoRouteSchema } from "../delivery-photo/delivery-photo-contract.js";

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const revision = z.number().int().positive().nullable();
export const DEFAULT_ORIGIN_ADDRESS = "대전 대덕구 우암동로17번길 10, 1층(비래동)";
// Exact road-address match from the existing Kakao geocoder, verified 2026-11-07.
export const DEFAULT_ORIGIN_POINT = Object.freeze({ latitude: 36.3598628506075, longitude: 127.451869932263 });
export const INVOICE_MAX_BYTES = 6 * 1024 * 1024;
export const PLANNING_NOTICE = "하상도로·높이 제한 2.3m 이하 통행 불가. 추천 경로에 제한 구간이 포함될 수 있으니 도로 표지를 확인하세요.";
export const vehicleSchema = z.object({
  heightCm: z.number().int().min(231).max(600), widthCm: z.number().int().min(100).max(300),
  lengthCm: z.number().int().min(200).max(4000), loadKg: z.literal(1000),
  totalWeightKg: z.number().int().min(1001).max(600000),
}).strict();
// Kia 1-ton standard refrigerated Bongo III, checked 2026-11-07 (not low/high).
// https://www.kia.com/kr/vehicles/bongo3-frozen/specification/bongo3-frozen
// Use the longer standard cab. Gross weight is a conservative routing assumption,
// NOT a manufacturer-certified or measured weight; see the implementation document.
export const DEFAULT_DELIVERY_VEHICLE = Object.freeze({
  heightCm: 240, widthCm: 175, lengthCm: 520, loadKg: 1000, totalWeightKg: 4000,
} satisfies z.infer<typeof vehicleSchema>);
export const planningSettingsDraftSchema = z.object({
  originAddress: z.string().trim().min(5).max(300), originPoint: customerPointSchema.nullable(),
}).strict();
export const planningSettingsSchema = planningSettingsDraftSchema.extend({ vehicle: vehicleSchema, revision });
export const planningContextSchema = z.object({ settings: planningSettingsSchema, canConfigure: z.boolean() }).strict();
export const savePlanningSettingsSchema = z.object({ requestId: z.uuid(), expectedRevision: revision, draft: planningSettingsDraftSchema }).strict();
export const invoiceFieldsSchema = z.object({
  recipientName: z.string().trim().max(120), recipientAddress: z.string().trim().max(500),
  invoiceDate: deliveryDateKeySchema.nullable(), uncertain: z.boolean(),
}).strict();
export const analyzeInvoiceSchema = z.object({
  requestId: z.uuid(), deliveryDateKey: deliveryDateKeySchema,
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  fileBase64: z.string().min(4).max(Math.ceil(INVOICE_MAX_BYTES * 4 / 3)),
}).strict();
export const planningListsSchema = z.object({ route: deliveryPhotoRouteSchema, day: deliveryPhotoDayResultSchema }).strict();
export const invoiceResultSchema = z.object({
  scanId: z.uuid(), fields: invoiceFieldsSchema, regionHint: z.string().max(120),
  status: z.enum(["saved", "review"]), customerId: id.nullable(), candidateIds: z.array(id).max(10),
  reason: z.string().max(200), elapsedMs: z.number().nonnegative(), lists: planningListsSchema.nullable(),
}).strict();
export const confirmInvoiceSchema = z.object({
  requestId: z.uuid(), scanId: z.uuid(), deliveryDateKey: deliveryDateKeySchema, customerId: id,
  dateConfirmed: z.boolean(),
}).strict();
export const recommendRouteSchema = z.object({
  requestId: z.uuid(), deliveryDateKey: deliveryDateKeySchema, expectedDayRevision: revision,
  lastCustomerId: id, firstCustomerId: id.optional(),
}).strict().refine((input) => input.firstCustomerId !== input.lastCustomerId, { message: "출발지와 마지막 납품처를 다르게 선택해주세요.", path: ["firstCustomerId"] });
export const routeRecommendationSchema = z.object({
  recommendationId: z.uuid(), deliveryDateKey: deliveryDateKeySchema, customerIds: z.array(id).min(2).max(20),
  totalSeconds: z.number().finite().nonnegative(), totalMeters: z.number().finite().nonnegative(),
  calculatedAt: z.iso.datetime(), notice: z.string(),
}).strict();
export const applyRecommendationSchema = z.object({ requestId: z.uuid(), recommendationId: z.uuid(), deliveryDateKey: deliveryDateKeySchema }).strict();
export type PlanningSettings = z.infer<typeof planningSettingsSchema>;
export type PlanningContext = z.infer<typeof planningContextSchema>;
export type InvoiceFields = z.infer<typeof invoiceFieldsSchema>;
export type InvoiceResult = z.infer<typeof invoiceResultSchema>;
export type PlanningLists = z.infer<typeof planningListsSchema>;
export type RouteRecommendation = z.infer<typeof routeRecommendationSchema>;
