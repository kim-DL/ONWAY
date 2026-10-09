import { inventoryRecordInput } from "../inventory/inventory-record-search.js";
import { z } from "zod";
import { inventoryCycleSchema, inventoryEventSchema, inventoryIdSchema, inventoryLocationSchema, inventoryLotSchema, inventoryProductSchema } from "../inventory/inventory-contract.js";
import { deliveryDateKeySchema, deliveryPhotoMetadataSchema } from "../delivery-photo/delivery-photo-contract.js";
import { inventoryQuantityMatchSchema } from "../inventory/inventory-quantity-match.js";
import { customerDetailsSchema, customerSections } from "./customer-details.js";

export const MCP_VERSION = "1.11.0";
export const MCP_TOOL_NAMES = ["search_customers", "get_customer_details", "search_inventory_products", "get_inventory_product", "list_low_stock",
  "list_delivery_records", "get_delivery_photo", "get_inventory_photo", "get_inventory_products", "list_inventory_alerts", "get_customer_delivery_summary", "get_delivery_gallery", "search_delivery_records", "get_latest_employee_delivery_gallery", "get_inventory_overview", "search_inventory_records", "preview_inventory_change", "commit_inventory_change"] as const;
export type McpToolName = typeof MCP_TOOL_NAMES[number];
export const pageSchema = z.object({ returnedCount: z.number().int().nonnegative(), hasMore: z.boolean(), complete: z.boolean(),
  startedFromBeginning: z.boolean(), pagesScanned: z.number().int().nonnegative(), recordsScanned: z.number().int().nonnegative(),
  stoppedBecause: z.enum(["complete", "result_limit", "page_budget", "time_budget"]) }).strict();
const stocktakeLocationSchema = z.object({ checkedAt: z.iso.datetime(), stockChangedSinceCount: z.boolean() }).strict().nullable();
export const stockSchema = inventoryProductSchema.pick({ productId: true, name: true, manufacturer: true, specification: true,
  status: true, unitLabel: true, unitsPerBox: true, defaultLocationId: true, quantityByLocation: true, nearestExpiryByLocation: true, stockRevision: true, updatedAt: true })
  .extend({ totalQuantity: z.number().int().nonnegative().max(4_000_000_000),
    hasPhoto: z.boolean().describe("현재 상품에 사진 참조가 있는지 여부. 실제 조회 가능 여부는 get_inventory_photo에서 재확인."),
    lastStocktakeAt: z.iso.datetime().nullable().describe("해당 제품의 마지막 수량일치 확인 count_match 로그 createdAt. 다른 장소의 완료 여부와 무관. 로그가 없으면 null."),
    lastStocktake: inventoryQuantityMatchSchema.extend({
      actorName: z.string().min(1).max(120).nullable().describe("원본 로그 actorEmployeeId로 조회한 현재 직원 표시 이름. 당시 이름 스냅샷이 아님. 없으면 null."),
      actorNameSource: z.enum(["current_employee_directory", "unavailable"]),
    }).nullable().describe("마지막 수량일치 버튼의 원본 로그와 기록자 이름. 입출고/조정 제외. 이름을 찾지 못해도 로그·시각은 유지. ID는 내부 연결용."),
    stocktakeByLocation: z.object({ refrigerated: stocktakeLocationSchema, freezer1: stocktakeLocationSchema,
      freezer2: stocktakeLocationSchema, sample: stocktakeLocationSchema }).strict(),
  });
export const customerSchema = z.object({ customerId: inventoryIdSchema, name: z.string(), district: z.string(), administrativeDong: z.string() }).strict();
export const photoCursorSchema = z.object({ createdAt: z.iso.datetime(), photoId: z.uuid() }).strict();
const envelope = { status: z.literal("ok"), retrievedAt: z.iso.datetime(), timezone: z.literal("Asia/Seoul") };
export const inventoryPhotoInput = z.object({ productId: inventoryIdSchema.optional(),
  query: z.string().trim().min(1).max(120).optional().describe("상품명·제조사·초성. 하나로 확정되는 경우 사진까지 한 번에 조회."),
  photoId: z.uuid().optional().describe("확대 UI가 같은 사진임을 확인할 때만 전달. 일반 조회에서는 생략."),
  variant: z.enum(["thumbnail", "preview"]).default("thumbnail"),
  afterId: inventoryIdSchema.nullable().default(null),
}).strict().refine((input) => Boolean(input.productId) !== Boolean(input.query), "상품 ID 또는 검색어 중 하나만 지정해주세요.")
  .refine((input) => !input.photoId || Boolean(input.productId), "사진 ID는 상품 ID와 함께 지정해주세요.")
  .refine((input) => !input.afterId || Boolean(input.query), "검색 커서는 검색어와 함께 지정해주세요.");
const photoProduct = inventoryProductSchema.pick({ productId: true, name: true, manufacturer: true, specification: true, status: true });
export const inventoryPhotoResult = z.object({ ...envelope,
  resolution: z.enum(["resolved", "no_photo", "not_found", "ambiguous", "incomplete_search"]),
  product: photoProduct.nullable(), candidates: z.array(photoProduct.extend({ hasPhoto: z.boolean() })).max(20),
  searchPage: pageSchema.nullable(), searchNextCursor: inventoryIdSchema.nullable(),
  photo: z.object({ photoId: z.uuid(), variant: z.enum(["thumbnail", "preview"]), contentType: z.literal("image/webp"),
    byteSize: z.number().int().positive().max(10 * 1024 * 1024),
    sourceWidth: z.number().int().positive().max(2560), sourceHeight: z.number().int().positive().max(2560) }).strict().nullable(),
  note: z.string(),
}).strict();
const inventoryEnvelope = { ...envelope, stocktakeBasis: z.string() };
const catalog = { nextCursor: inventoryIdSchema.nullable(), page: pageSchema };
export const customerSearchResult = z.object({ ...envelope, ...catalog, customers: z.array(customerSchema).max(100), query: z.string(), note: z.string() }).strict();
export const customerDetailsResult = z.object({ ...envelope,
  resolution: z.enum(["resolved", "ambiguous", "not_found", "incomplete_search"]),
  customer: customerDetailsSchema.nullable(), candidates: z.array(customerSchema.extend({ status: customerDetailsSchema.shape.status })).max(100),
  searchPage: pageSchema.nullable(), searchNextCursor: inventoryIdSchema.nullable(),
  sectionsIncluded: z.array(z.enum(customerSections)).max(4), basis: z.string(), note: z.string(),
}).strict();
export const productSearchResult = z.object({ ...inventoryEnvelope, ...catalog, products: z.array(stockSchema).max(100), query: z.string().nullable(),
  matches: z.array(z.object({ query: z.string(), productIds: z.array(inventoryIdSchema).max(100) }).strict()).max(10).optional() }).strict();
export const lowStockResult = z.object({ ...inventoryEnvelope, ...catalog, products: z.array(stockSchema).max(100), threshold: z.number(), basis: z.string() }).strict();
export const productResult = z.object({ ...inventoryEnvelope, product: stockSchema, lotsIncluded: z.boolean(),
  lots: z.array(z.object({ lotId: inventoryLotSchema.shape.lotId, locationId: inventoryLocationSchema,
    quantity: inventoryLotSchema.shape.quantity, expiryDate: inventoryLotSchema.shape.expiryDate, expiryState: inventoryLotSchema.shape.expiryState }).strict()).max(200).nullable() }).strict();
export const productsResult = z.object({ ...inventoryEnvelope, products: z.array(stockSchema).max(20), missingProductIds: z.array(inventoryIdSchema).max(20),
  requestedCount: z.number().int(), returnedCount: z.number().int() }).strict();
export const alertsResult = z.object({ ...inventoryEnvelope, ...catalog, alerts: z.array(z.object({ product: stockSchema, lowStock: z.boolean(),
  expiringLocations: z.array(inventoryLocationSchema), expiredLocations: z.array(inventoryLocationSchema) }).strict()).max(100),
  threshold: z.number(), days: z.number().int(), today: deliveryDateKeySchema, throughDate: deliveryDateKeySchema, basis: z.string() }).strict();
const overviewCount = z.number().int().min(0).max(500);
const overviewExample = stockSchema.pick({ productId: true, name: true, unitLabel: true, totalQuantity: true, lastStocktakeAt: true, lastStocktake: true });
export const inventoryOverviewResult = z.object({ ...inventoryEnvelope, ...catalog, threshold: z.number(), days: z.number().int(),
  today: deliveryDateKeySchema, throughDate: deliveryDateKeySchema, cycle: inventoryCycleSchema,
  countScope: z.literal("returned_scan_segment"), basis: z.string(),
  counts: z.object({ activeProducts: overviewCount, zeroStockProducts: overviewCount, lowStockProducts: overviewCount,
    expiringProducts: overviewCount, expiredProducts: overviewCount,
    stocktake: z.object({ confirmed: overviewCount, changed: overviewCount, pending: overviewCount, notDue: overviewCount }).strict(),
    stocktakeByLocation: z.record(inventoryLocationSchema, z.object({ confirmed: overviewCount, changed: overviewCount, pending: overviewCount, notDue: overviewCount }).strict()),
    stockedProductsByLocation: z.object({ refrigerated: overviewCount, freezer1: overviewCount, freezer2: overviewCount, sample: overviewCount }).strict() }).strict(),
  examples: z.object({ lowStock: z.array(overviewExample).max(10), expiring: z.array(overviewExample).max(10), stocktakePending: z.array(overviewExample).max(10) }).strict(),
  examplesTruncated: z.object({ lowStock: z.boolean(), expiring: z.boolean(), stocktakePending: z.boolean() }).strict(),
}).strict();
export const deliveryResult = z.object({ ...envelope, photos: z.array(deliveryPhotoMetadataSchema).max(100), nextCursor: photoCursorSchema.nullable(),
  page: pageSchema, customerId: inventoryIdSchema, date: deliveryDateKeySchema.nullable(), retentionHours: z.literal(168), evidence: z.string() }).strict();
export const deliverySummaryResult = z.object({ ...envelope, resolution: z.enum(["resolved", "ambiguous", "not_found", "incomplete_search"]),
  customer: customerSchema.nullable(), candidates: z.array(customerSchema).max(100), searchPage: pageSchema.nullable(),
  searchNextCursor: inventoryIdSchema.nullable(), records: deliveryResult.omit({ status: true, retrievedAt: true, timezone: true }).nullable(), note: z.string() }).strict();
export const photoResult = z.object({ ...envelope, photoId: z.uuid(), variant: z.enum(["thumbnail", "evidence"]), contentType: z.literal("image/webp") }).strict();
export const galleryInput = z.object({ customerId: inventoryIdSchema.optional(),
  query: z.string().trim().min(1).max(120).optional().describe("거래처 이름만 알면 바로 전달. 등록명과 추가 업종 호칭도 확인하며 여러 후보는 임의 선택하지 않음."),
  employeeId: inventoryIdSchema.optional(), date: deliveryDateKeySchema.optional(),
  limit: z.number().int().min(1).max(100).default(50), after: photoCursorSchema.optional(),
  afterId: inventoryIdSchema.nullable().default(null),
}).strict().refine((input) => Boolean(input.customerId) !== Boolean(input.query), "거래처 ID 또는 이름 중 하나만 지정해주세요.")
  .refine((input) => !input.after || Boolean(input.customerId), "사진 커서는 확인된 거래처 ID와 함께 지정해주세요.")
  .refine((input) => !input.afterId || Boolean(input.query), "검색 커서는 거래처 이름과 함께 지정해주세요.");
export const galleryResult = z.object({ ...envelope,
  resolution: z.enum(["resolved", "ambiguous", "not_found", "incomplete_search"]),
  customerId: inventoryIdSchema.nullable(), customerName: z.string().nullable(), employeeId: inventoryIdSchema.nullable(), date: deliveryDateKeySchema.nullable(),
  photoIds: z.array(z.uuid()).max(100), nextCursor: photoCursorSchema.nullable(), page: pageSchema.nullable(),
  candidates: z.array(customerSchema).max(100), searchPage: pageSchema.nullable(), searchNextCursor: inventoryIdSchema.nullable(),
  retentionHours: z.literal(168), timeBasis: z.literal("photo_registered_at"), evidence: z.string(), note: z.string() }).strict();
export const employeeIdentitySchema = z.object({ employeeId: inventoryIdSchema, displayName: z.string() }).strict();
const customerReference = z.object({ customerId: inventoryIdSchema, name: z.string().nullable() }).strict();
const deliveryResolution = {
  resolution: z.enum(["resolved", "employee_not_found", "ambiguous_employee", "incomplete_employee_search", "customer_not_found",
    "ambiguous_customer", "incomplete_customer_search", "no_records", "incomplete_records"]),
  employee: employeeIdentitySchema.nullable(), employeeCandidates: z.array(employeeIdentitySchema).max(20), employeeSearchComplete: z.boolean(),
  customer: customerReference.nullable(), customerCandidates: z.array(customerSchema).max(100), customerSearchComplete: z.boolean(),
  timeBasis: z.literal("photo_registered_at"), retentionHours: z.literal(168), evidence: z.string(), note: z.string(),
};
export const deliveryRecordSchema = z.object({ photoId: z.uuid(), customerId: inventoryIdSchema, customerName: z.string().nullable(),
  employeeId: inventoryIdSchema, recordedByName: z.string(), registeredAt: z.iso.datetime(), deliveryCompletedAt: z.null() }).strict();
export const recordSearchResult = z.object({ ...envelope, ...deliveryResolution,
  filters: z.object({ employeeId: inventoryIdSchema.nullable(), customerId: inventoryIdSchema.nullable(), date: deliveryDateKeySchema.nullable() }).strict(),
  records: z.array(deliveryRecordSchema).max(100), page: pageSchema.nullable(), nextCursor: photoCursorSchema.nullable() }).strict();
export const latestEmployeeGalleryResult = z.object({ ...envelope, ...deliveryResolution, latestRecord: deliveryRecordSchema.nullable(),
  recordsPage: pageSchema.nullable(), nextCursor: photoCursorSchema.nullable(),
  gallery: galleryResult.omit({ status: true, retrievedAt: true, timezone: true, resolution: true, candidates: true,
    searchPage: true, searchNextCursor: true, timeBasis: true, note: true }).extend({ customerId: inventoryIdSchema,
      page: pageSchema, customerName: z.string().nullable() }).nullable() }).strict();
const staffFilter = { employeeName: z.string().trim().min(2).max(100).optional().describe("현재 등록 직원 이름 또는 이름 앞부분. 예: 이름만으로 직함이 붙은 등록 이름 검색. 동명이인은 후보 확인."),
  employeeId: inventoryIdSchema.optional().describe("이미 확인한 직원 ID. employeeName과 동시에 지정하지 마세요.") };
export const recordSearchInput = z.object({ ...staffFilter,
  customerName: z.string().trim().min(1).max(120).optional().describe("활성 거래처 이름·초성. customerId와 동시에 지정하지 마세요."),
  customerId: inventoryIdSchema.optional(), date: deliveryDateKeySchema.optional().describe("사진 등록 시각의 서울 날짜 YYYY-MM-DD. 생략하면 최근168시간."),
  limit: z.number().int().min(1).max(100).default(50), after: photoCursorSchema.optional(),
}).refine((input) => !(input.employeeName && input.employeeId), "직원 이름과 ID 중 하나만 지정해주세요.")
  .refine((input) => !(input.customerName && input.customerId), "거래처 이름과 ID 중 하나만 지정해주세요.");
export const latestEmployeeGalleryInput = recordSearchInput.refine((input) => Boolean(input.employeeId || input.employeeName), "직원 이름 또는 ID를 지정해주세요.");
export const errorSchema = z.object({ code: z.enum(["AUTH_REQUIRED", "FORBIDDEN", "NOT_FOUND", "INVALID_INPUT", "INVALID_DATA",
  "RATE_LIMITED", "TEMPORARY_UNAVAILABLE", "TIMEOUT", "INTERNAL_ERROR", "PREVIEW_STALE", "PREVIEW_EXPIRED", "WRITE_CONSENT_REQUIRED", "WRITE_RESULT_UNKNOWN"]), message: z.string(), retryable: z.boolean(),
  retryAfterSeconds: z.number().int().nonnegative().nullable() }).strict();
export type McpErrorDetail = z.infer<typeof errorSchema>;

export const inventoryRecordsResult = z.object({ ...envelope, resolution: z.enum(["resolved", "ambiguous_employee", "employee_not_found", "incomplete_employee_search"]),
  employee: employeeIdentitySchema.nullable(), employeeCandidates: z.array(employeeIdentitySchema).max(20), employeeSearchComplete: z.boolean(),
  fromDate: deliveryDateKeySchema, throughDate: deliveryDateKeySchema, kind: inventoryRecordInput.shape.kind, locationId: inventoryLocationSchema.nullable(),
  linesIncluded: z.boolean(), recordsIncluded: z.boolean(), countScope: z.literal("returned_page"), timeBasis: z.literal("event_registered_at"), basis: z.string(),
  asOf: z.iso.datetime().nullable(), nextCursor: inventoryRecordInput.shape.after.unwrap().nullable(), page: pageSchema.nullable(),
  records: z.array(z.object({ eventId: z.uuid(), productId: inventoryIdSchema, productName: z.string().nullable(), productStatus: z.string().nullable(),
    employeeId: inventoryIdSchema.nullable(), recordedByName: z.string().nullable(), actorNameSource: z.enum(["current_employee_directory", "unavailable"]),
    kind: inventoryEventSchema.shape.kind, locationId: inventoryLocationSchema, registeredAt: z.iso.datetime(), cycleId: inventoryIdSchema.nullable(),
    unitLabel: z.string(), stockRevision: z.number().int(), lines: inventoryEventSchema.shape.lines.nullable(),
    lotMetadataChange: inventoryEventSchema.shape.lotMetadataChange.unwrap().nullable() }).strict()).max(100).nullable(),
  summary: z.array(z.object({ employeeId: inventoryIdSchema.nullable(), recordedByName: z.string().nullable(), locationId: inventoryLocationSchema,
    records: z.number().int(), quantityMatches: z.number().int(), countAdjustments: z.number().int(), distinctProducts: z.number().int() }).strict()).max(100),
}).strict();
