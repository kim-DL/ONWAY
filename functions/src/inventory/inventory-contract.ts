import { z } from "zod";

// Pure client/server wire contract. Never import Firebase or Node APIs here.
export const INVENTORY_COMPANY_ID = "onnuri" as const;
export const INVENTORY_PRODUCT_PATH = "companies/onnuri/inventoryProducts";
export const INVENTORY_SETTINGS_PATH = "companies/onnuri/inventorySettings/current";
export const INVENTORY_CYCLE_PATH = "companies/onnuri/inventoryCountCycles";
export const INVENTORY_LOCATIONS = ["refrigerated", "freezer1", "freezer2", "sample"] as const;
export const INVENTORY_LOCATION_LABELS = { refrigerated: "냉장", freezer1: "냉동1", freezer2: "냉동2", sample: "샘플" } as const;
export const INVENTORY_MAX_QUANTITY = 1_000_000_000;
export const INVENTORY_MAX_LOTS = 200;
export const inventoryIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const inventoryLocationSchema = z.enum(INVENTORY_LOCATIONS);
export const inventoryQuantitySchema = z.number().int().nonnegative().max(INVENTORY_MAX_QUANTITY);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z.string().trim().max(200);
const note = z.string().trim().max(2_000);
// Audit persistence retains the already-validated input verbatim. Never silently
// truncate a lifecycle reason, which has no separate stock event to recover it.
export const inventoryAuditReasonSchema = z.string().max(2_000);
export const inventoryDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "올바른 날짜를 입력해주세요.");
const locationMap = <T extends z.ZodType>(value: T) => z.object({ refrigerated: value, freezer1: value, freezer2: value, sample: value }).strict();

export const inventoryPhotoSchema = z.object({ photoId: z.uuid(), width: z.number().int().positive().max(2560), height: z.number().int().positive().max(2560) }).strict();
export const inventoryProductDraftSchema = z.object({
  name: z.string().trim().min(1).max(200), manufacturer: text, specification: text, origin: text,
  unitLabel: z.string().trim().min(1).max(20), unitsPerBox: z.number().int().positive().max(1_000_000),
  defaultLocationId: inventoryLocationSchema, note, urgent: z.boolean(),
}).strict();
export const inventoryCountSummarySchema = z.object({
  cycleId: inventoryIdSchema, checkedAt: z.iso.datetime(), checkedBy: inventoryIdSchema,
  stockRevision: revision,
  // Historical fact: this physical count corrected the recorded quantity.
  changed: z.boolean(),
  // Badge freshness: a later quantity change affected this location only.
  stockChangedSinceCount: z.boolean().default(false),
}).strict();
const lotCounts = z.object({ lotCount: z.number().int().nonnegative().max(INVENTORY_MAX_LOTS),
  expiryCount: z.number().int().nonnegative().max(INVENTORY_MAX_LOTS) }).strict();
export const inventoryLotSummarySchema = z.object({ all: lotCounts, byLocation: locationMap(lotCounts) }).strict();
export const inventoryProductSchema = inventoryProductDraftSchema.extend({
  productId: inventoryIdSchema, companyId: z.literal(INVENTORY_COMPANY_ID),
  status: z.enum(["active", "inactive", "deleted"]), revision: revision, stockRevision: revision,
  hasHistory: z.boolean(), quantityByLocation: locationMap(inventoryQuantitySchema),
  nearestExpiryByLocation: locationMap(inventoryDateSchema.nullable()),
  lastCountByLocation: locationMap(inventoryCountSummarySchema.nullable()),
  // Opt-in wire expansion; absent on legacy documents until safely summarized.
  lotSummary: inventoryLotSummarySchema.optional(),
  photo: inventoryPhotoSchema.nullable(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  createdBy: inventoryIdSchema, updatedBy: inventoryIdSchema,
}).strict();
const inventoryStatusSnapshotSchema = z.object({
  status: inventoryProductSchema.shape.status, quantityByLocation: locationMap(inventoryQuantitySchema),
}).strict();
export const inventoryStatusChangeSchema = z.object({
  productName: z.string().min(1).max(200), unitLabel: z.string().min(1).max(20),
  before: inventoryStatusSnapshotSchema, after: inventoryStatusSnapshotSchema,
}).strict();
export const inventoryLotDraftSchema = z.object({
  label: text, expiryState: z.enum(["dated", "unknown", "not_applicable"]), expiryDate: inventoryDateSchema.nullable(),
}).strict().refine((value) => (value.expiryState === "dated") === (value.expiryDate !== null), "유통기한 상태와 날짜를 확인해주세요.");
export const inventoryLotChangeSchema = z.object({
  productName: z.string().min(1).max(200), unitLabel: z.string().min(1).max(20), originLotId: inventoryIdSchema,
  before: inventoryLotDraftSchema, after: inventoryLotDraftSchema,
}).strict();
export const inventoryLotSchema = inventoryLotDraftSchema.safeExtend({
  lotId: inventoryIdSchema, productId: inventoryIdSchema, locationId: inventoryLocationSchema,
  // Source identity survives transfers without merging different expiry lots.
  originLotId: inventoryIdSchema, quantity: inventoryQuantitySchema, revision,
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export const inventorySettingsSchema = z.object({
  weekday: z.number().int().min(0).max(6), urgentDays: z.number().int().min(0).max(365), revision,
  // A weekday change starts after the current count period, never resets it.
  pendingWeekday: z.number().int().min(0).max(6).nullable(), effectiveDate: inventoryDateSchema.nullable(),
  pendingCycleStartDate: inventoryDateSchema.nullable().optional(),
  updatedAt: z.iso.datetime().nullable(), updatedBy: inventoryIdSchema.nullable(),
}).strict();
export const inventoryCycleSchema = z.object({
  cycleId: inventoryIdSchema, startDate: inventoryDateSchema, nextDate: inventoryDateSchema,
  weekday: z.number().int().min(0).max(6),
}).strict();
export const inventoryContextSchema = z.object({
  settings: inventorySettingsSchema, cycle: inventoryCycleSchema, today: inventoryDateSchema,
  canWrite: z.boolean(), canAdmin: z.boolean(),
}).strict();
export const inventoryListInputSchema = z.object({ afterId: inventoryIdSchema.nullable().default(null), includeSummary: z.boolean().optional() }).strict();
export const inventoryListPageSchema = z.object({ products: z.array(inventoryProductSchema).max(100), nextCursor: inventoryIdSchema.nullable() }).strict();
export const getInventoryProductInputSchema = z.object({ productId: inventoryIdSchema, includeSummary: z.boolean().optional() }).strict();
export const inventoryProductDetailSchema = z.object({ product: inventoryProductSchema, lots: z.array(inventoryLotSchema).max(INVENTORY_MAX_LOTS) }).strict();
export const inventoryInitialStockSchema = z.object({
  quantity: inventoryQuantitySchema.positive(), lot: inventoryLotDraftSchema,
}).strict();
export const saveInventoryProductInputSchema = z.object({
  requestId: z.uuid(), productId: inventoryIdSchema.nullable(), expectedRevision: revision.nullable(),
  // Only an exact retry performs the extra canonical read; first saves retain
  // their one-call response and older clients retain original-receipt replay.
  refreshOnReplay: z.boolean().optional(),
  includeSummary: z.boolean().optional(),
  draft: inventoryProductDraftSchema,
  // Optional for older clients. New registration commits its first expiry lot
  // and quantity together; editing an existing product must use stock actions.
  initialStock: inventoryInitialStockSchema.optional(),
  photoChange: z.discriminatedUnion("action", [
    z.object({ action: z.literal("replace"), uploadId: z.uuid() }).strict(),
    z.object({ action: z.literal("remove") }).strict(),
  ]).optional(),
}).strict().refine((value) => (value.productId === null) === (value.expectedRevision === null), "상품 버전을 확인해주세요.")
  .refine((value) => value.initialStock === undefined || value.productId === null, {
    path: ["initialStock"], message: "초기 수량은 새 상품을 등록할 때만 입력할 수 있습니다.",
  });
export const inventoryMovementInputSchema = z.object({
  requestId: z.uuid(), productId: inventoryIdSchema, expectedStockRevision: revision,
  includeDetail: z.boolean().optional(),
  includeSummary: z.boolean().optional(),
  inspectionCycleId: inventoryIdSchema.optional(),
  kind: z.enum(["receive", "issue", "adjust", "transfer"]), locationId: inventoryLocationSchema,
  lotId: inventoryIdSchema.nullable(), quantity: inventoryQuantitySchema,
  newLot: inventoryLotDraftSchema.optional(), toLocationId: inventoryLocationSchema.optional(), reason: note,
}).strict().superRefine((value, context) => {
  if (value.kind !== "adjust" && value.quantity === 0) context.addIssue({ code: "custom", path: ["quantity"], message: "수량은 1 이상이어야 합니다." });
  if (value.kind !== "receive" && value.lotId === null) context.addIssue({ code: "custom", path: ["lotId"], message: "재고 묶음을 선택해주세요." });
  if ((value.kind === "receive" && value.lotId === null) !== !!value.newLot) context.addIssue({ code: "custom", path: ["newLot"], message: "입고 묶음 정보를 확인해주세요." });
  if ((value.kind === "transfer") !== (value.toLocationId !== undefined) || value.toLocationId === value.locationId) context.addIssue({ code: "custom", path: ["toLocationId"], message: "이동할 보관 장소를 확인해주세요." });
});
export const inventoryCountInputSchema = z.object({
  requestId: z.uuid(), productId: inventoryIdSchema, locationId: inventoryLocationSchema,
  includeDetail: z.boolean().optional(),
  includeSummary: z.boolean().optional(),
  matchOnly: z.boolean().optional(),
  cycleId: inventoryIdSchema, expectedStockRevision: revision,
  // Include every currently positive lot at this location, even when counted 0.
  // An empty list explicitly confirms a zero-stock product at its default location.
  counts: z.array(z.object({ lotId: inventoryIdSchema, quantity: inventoryQuantitySchema }).strict()).max(INVENTORY_MAX_LOTS)
    .refine((items) => new Set(items.map((item) => item.lotId)).size === items.length, "묶음이 중복되었습니다."),
  reason: note,
}).strict();
export const updateInventoryLotInputSchema = z.object({
  requestId: z.uuid(), productId: inventoryIdSchema, lotId: inventoryIdSchema,
  includeDetail: z.boolean().optional(),
  includeSummary: z.boolean().optional(),
  expectedStockRevision: revision, draft: inventoryLotDraftSchema, reason: note,
}).strict();
export const setInventoryProductStatusInputSchema = z.object({
  requestId: z.uuid(), productId: inventoryIdSchema, expectedRevision: revision,
  refreshOnReplay: z.boolean().optional(),
  includeSummary: z.boolean().optional(),
  status: z.enum(["active", "inactive"]), reason: note,
}).strict();
export const deleteInventoryProductInputSchema = z.object({ requestId: z.uuid(), productId: inventoryIdSchema, expectedRevision: revision,
  refreshOnReplay: z.boolean().optional(), includeSummary: z.boolean().optional(), reason: z.string().trim().min(1).max(2_000) }).strict();
export const updateInventorySettingsInputSchema = z.object({
  requestId: z.uuid(), expectedRevision: revision, weekday: z.number().int().min(0).max(6), urgentDays: z.number().int().min(0).max(365),
}).strict();
export const inventoryEventLineSchema = z.object({
  lotId: inventoryIdSchema, locationId: inventoryLocationSchema, before: inventoryQuantitySchema,
  after: inventoryQuantitySchema, delta: z.number().int().min(-INVENTORY_MAX_QUANTITY).max(INVENTORY_MAX_QUANTITY),
  lotLabel: text.optional(), expiryState: z.enum(["dated", "unknown", "not_applicable"]).optional(), expiryDate: inventoryDateSchema.nullable().optional(),
}).strict();
export const inventoryEventSchema = z.object({
  eventId: z.uuid(), productId: inventoryIdSchema,
  kind: z.enum(["receive", "issue", "adjust", "transfer", "count_match", "count_adjust", "lot_update"]),
  locationId: inventoryLocationSchema, lines: z.array(inventoryEventLineSchema).max(INVENTORY_MAX_LOTS),
  reason: note, actorEmployeeId: inventoryIdSchema, createdAt: z.iso.datetime(),
  cycleId: inventoryIdSchema.nullable(), unitLabel: z.string().min(1).max(20), unitsPerBox: z.number().int().positive(),
  stockRevision: revision,
  lotMetadataChange: z.object({ originLotId: inventoryIdSchema, before: inventoryLotDraftSchema, after: inventoryLotDraftSchema }).strict().optional(),
}).strict();
export const inventoryHistoryInputSchema = z.object({ productId: inventoryIdSchema, afterId: z.uuid().nullable().default(null) }).strict();
export const inventoryHistoryPageSchema = z.object({ events: z.array(inventoryEventSchema).max(50), nextCursor: z.uuid().nullable() }).strict();
export const inventoryMutationResultSchema = z.object({
  product: inventoryProductSchema, event: inventoryEventSchema, replayed: z.boolean(),
  // Opt-in, commit-confirmed working set. Legacy callers receive no new field;
  // an idempotency replay omits it so clients fetch the latest stock instead.
  detail: inventoryProductDetailSchema.optional(),
}).strict();

export const INVENTORY_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const INVENTORY_PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const uploadInventoryPhotoInputSchema = z.object({ uploadId: z.uuid(), contentType: z.enum(INVENTORY_PHOTO_CONTENT_TYPES), fileBase64: z.string().min(4).max(Math.ceil(INVENTORY_PHOTO_MAX_BYTES * 4 / 3) + 8) }).strict();
export const inventoryPhotoUploadResultSchema = z.object({ uploadId: z.uuid(), width: z.number().int().positive().max(2560), height: z.number().int().positive().max(2560) }).strict();
export const getInventoryPhotoInputSchema = z.object({ productId: inventoryIdSchema, photoId: z.uuid(), variant: z.enum(["thumbnail", "preview"]).default("preview") }).strict();
export const inventoryPhotoDownloadSchema = z.object({ contentType: z.literal("image/webp"), byteSize: z.number().int().positive().max(INVENTORY_PHOTO_MAX_BYTES), fileBase64: z.string().min(4).max(Math.ceil(INVENTORY_PHOTO_MAX_BYTES * 4 / 3) + 8) }).strict();

export type InventoryLocation = z.infer<typeof inventoryLocationSchema>;
export type InventoryProductDraft = z.infer<typeof inventoryProductDraftSchema>;
export type InventoryProduct = z.infer<typeof inventoryProductSchema>;
export type InventoryLotSummary = z.infer<typeof inventoryLotSummarySchema>;
export type InventoryStatusChange = z.infer<typeof inventoryStatusChangeSchema>;
export type InventoryLotChange = z.infer<typeof inventoryLotChangeSchema>;
export type InventoryLot = z.infer<typeof inventoryLotSchema>;
export type InventoryLotDraft = z.infer<typeof inventoryLotDraftSchema>;
export type InventorySettings = z.infer<typeof inventorySettingsSchema>;
export type InventoryCycle = z.infer<typeof inventoryCycleSchema>;
export type InventoryContext = z.infer<typeof inventoryContextSchema>;
export type InventoryProductDetail = z.infer<typeof inventoryProductDetailSchema>;
export type SaveInventoryProductInput = z.infer<typeof saveInventoryProductInputSchema>;
export type InventoryMovementInput = z.infer<typeof inventoryMovementInputSchema>;
export type InventoryCountInput = z.infer<typeof inventoryCountInputSchema>;
export type UpdateInventoryLotInput = z.infer<typeof updateInventoryLotInputSchema>;
export type SetInventoryProductStatusInput = z.infer<typeof setInventoryProductStatusInputSchema>;
export type DeleteInventoryProductInput = z.infer<typeof deleteInventoryProductInputSchema>;
export type UpdateInventorySettingsInput = z.infer<typeof updateInventorySettingsInputSchema>;
export type InventoryEvent = z.infer<typeof inventoryEventSchema>;
export type InventoryMutationResult = z.infer<typeof inventoryMutationResultSchema>;

export function inventoryLocationMap<T>(value: T): Record<InventoryLocation, T> {
  return { refrigerated: value, freezer1: value, freezer2: value, sample: value };
}
export function inventoryQuantityFromPackages(boxes: number, loose: number, unitsPerBox: number): number {
  const packCount = inventoryQuantitySchema.parse(boxes);
  const remainder = inventoryQuantitySchema.parse(loose);
  const multiplier = z.number().int().positive().max(1_000_000).parse(unitsPerBox);
  return inventoryQuantitySchema.parse(packCount * multiplier + remainder);
}
export function inventoryExpiryDays(expiryDate: string | null, today: string): number | null {
  if (expiryDate === null) return null;
  return Math.round((Date.parse(`${inventoryDateSchema.parse(expiryDate)}T00:00:00Z`) - Date.parse(`${inventoryDateSchema.parse(today)}T00:00:00Z`)) / 86_400_000);
}
