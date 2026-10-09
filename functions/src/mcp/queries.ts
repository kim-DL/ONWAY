import { InventoryRecordSearch, type InventoryRecordInput } from "../inventory/inventory-record-search.js";
import { CustomerService } from "../customer/customer-service.js";
import type { Customer } from "../customer/customer-contract.js";
import { InventoryService } from "../inventory/inventory-service.js";
import type { InventoryProduct } from "../inventory/inventory-contract.js";
import { inventoryTotalQuantity } from "../inventory/inventory-alerts.js";
import { inventoryLocationConfirmations } from "../inventory/inventory-inspection-status.js";
import type { InventoryQuantityMatch } from "../inventory/inventory-quantity-match.js";
import { Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { EmployeeDirectory } from "../employee/employee-directory.js";
import { DeliveryPhotoService, deliveryDateKeyInSeoul, type DeliveryPhotoSearch } from "../delivery-photo/delivery-photo-service.js";
import type { McpPrincipal } from "./authorization.js";
import type { ScanStop } from "../shared/bounded-scan.js";
import { InventoryPhotoService } from "../inventory/inventory-photo-service.js";
import type { z } from "zod";
import type { inventoryPhotoInput, galleryInput } from "./contracts.js";
import { customerDetailsProjection, CUSTOMER_DETAILS_BASIS, type customerDetailsInput } from "./customer-details.js";
import { selectCustomerCandidate } from "../customer/customer-name-search.js";

const STOCK_BASIS = "모든 보관장소(샘플 포함)의 합계가 threshold 이하. 상품별 안전재고/수요 기준은 등록되어 있지 않습니다. 단위는 각 상품의 unitLabel입니다.";
export const STOCKTAKE_BASIS = "lastStocktakeAt은 제품별 수량일치 확인 버튼이 남긴 마지막 count_match 로그의 createdAt입니다. 기록자는 lastStocktake.actorName으로 답하세요. 원본 actorEmployeeId로 현재 직원 명부에서 조회한 이름이며 당시 이름 스냅샷은 아닙니다. actorName이 null이면 기록자 정보 없음이며 현재 로그인 사용자나 상품 수정자로 추정하지 마세요. 원본 로그 필드는 lastStocktake에 있으며 해당 로그의 장소에서 확인한 시각입니다. 다른 장소의 실사 완료 여부와 무관하고 입출고/수량조정은 포함하지 않습니다. null은 해당 버튼 로그 없음입니다. stocktakeByLocation과 현황의 실사 상태는 입출고도 반영하는 기존 PWA 완료 요약으로 버튼 로그와 구분하세요. updatedAt은 상품 문서 수정시각입니다. 수량과 로그는 별도 읽기이며 같은 시점 스냅샷을 보장하지 않습니다.";
export const DELIVERY_BASIS = "사진 등록 시각(createdAt) 기준이며 실제 납품완료 시각은 기록하지 않습니다. 납품사진 등록 기록이며 품목/수량이 있는 납품 장부가 아닙니다. 삭제/보관기간 만료/미등록으로 사진이 없어도 미납품을 의미하지 않습니다.";
export function stockProjection(product: InventoryProduct, lastStocktake: InventoryQuantityMatch | null, actorName: string | null = null) {
  return { productId: product.productId, name: product.name, manufacturer: product.manufacturer,
    specification: product.specification, status: product.status, unitLabel: product.unitLabel, unitsPerBox: product.unitsPerBox,
    defaultLocationId: product.defaultLocationId, ...inventoryLocationConfirmations(product),
    hasPhoto: product.photo !== null,
    lastStocktakeAt: lastStocktake?.createdAt ?? null,
    lastStocktake: lastStocktake ? { ...lastStocktake, actorName,
      actorNameSource: actorName === null ? "unavailable" as const : "current_employee_directory" as const } : null,
    totalQuantity: inventoryTotalQuantity(product), quantityByLocation: product.quantityByLocation,
    nearestExpiryByLocation: product.nearestExpiryByLocation, stockRevision: product.stockRevision, updatedAt: product.updatedAt };
}
function customerProjection(customer: Pick<Customer, "customerId" | "name" | "district" | "administrativeDong">) {
  return { customerId: customer.customerId, name: customer.name, district: customer.district, administrativeDong: customer.administrativeDong };
}
export interface DeliveryRecordFilters {
  employeeId?: string | undefined;
  employeeName?: string | undefined;
  customerId?: string | undefined;
  customerName?: string | undefined;
  date?: string | undefined;
}
export interface DeliveryRecordSearch extends DeliveryRecordFilters {
  limit: number;
  after?: { createdAt: string; photoId: string } | undefined;
}

/** Transport-independent projections over the existing business services, no business writes. */
export class McpQueries {
  constructor(private readonly customers = new CustomerService(), private readonly inventory = new InventoryService(),
    private readonly delivery = new DeliveryPhotoService(), private readonly employees = new EmployeeDirectory(),
    private readonly inventoryRecords = new InventoryRecordSearch(), private readonly inventoryPhotos = new InventoryPhotoService()) {}
  async inventoryPhoto(input: z.infer<typeof inventoryPhotoInput>, actor: McpPrincipal) {
    const base = { searchPage: null, searchNextCursor: null, candidates: [], product: null, image: null };
    let productId = input.productId;
    if (!productId) {
      const found = await this.inventory.search(input.query!, { afterId: input.afterId, limit: 20 });
      // Only a complete search from the beginning can establish an unambiguous name.
      if (!found.page.complete || !found.page.startedFromBeginning || found.items.length !== 1) {
        return { ...base, searchPage: found.page, searchNextCursor: found.nextCursor,
          candidates: found.items.map(({ productId, name, manufacturer, specification, status, photo }) =>
            ({ productId, name, manufacturer, specification, status, hasPhoto: photo !== null })),
          resolution: !found.page.complete || !found.page.startedFromBeginning ? "incomplete_search" as const
            : found.items.length ? "ambiguous" as const : "not_found" as const,
          note: found.items.length || !found.page.complete ? "상품 후보를 확인한 뒤 선택한 productId로 사진을 조회하세요. 부분 검색을 유일한 일치로 판단하지 마세요."
            : "검색 조건에 맞는 활성 상품이 없습니다. 이름·제조사·규격을 확인해 주세요." };
      }
      productId = found.items[0]!.productId;
    }
    const result = await this.inventoryPhotos.getWithMetadata({ productId, variant: input.variant,
      ...(input.photoId ? { photoId: input.photoId } : {}) }, actor);
    return { ...base, product: result.product, image: result.photo,
      resolution: result.photo ? "resolved" as const : "no_photo" as const,
      note: result.photo ? "현재 상품에 등록된 사진입니다. 촬영일·현재 묶음의 실물 상태를 증명하지 않습니다. 큰 보기는 카드에서 열며 추가 모델 호출은 필요 없습니다."
        : "이 상품에 등록된 사진이 없습니다. 다른 상품 사진으로 대신하지 않습니다." };
  }
  private async projectStock(products: InventoryProduct[]) {
    const events = await this.inventory.lastQuantityMatches(products.map((product) => product.productId));
    const ids = [...new Set([...events.values()].flatMap((event) => event?.actorEmployeeId ? [event.actorEmployeeId] : []))];
    // One masked batch for unique authors in this response; no per-product directory scan or cross-request cache.
    const names = ids.length ? await this.employees.namesByIds(ids) : new Map<string, string | null>();
    return products.map((product) => {
      const event = events.get(product.productId) ?? null;
      return stockProjection(product, event, event?.actorEmployeeId ? event.actorEmployeeId ? names.get(event.actorEmployeeId) ?? null : null : null);
    });
  }
  async searchInventoryRecords(input: InventoryRecordInput, actor: McpPrincipal) {
    const resolved = input.employeeId || input.employeeName ? await this.employees.resolve(input, actor) : null;
    const base = { employee: resolved?.employee ?? null, employeeCandidates: resolved?.candidates ?? [],
      employeeSearchComplete: resolved?.complete ?? true, fromDate: input.fromDate, throughDate: input.throughDate,
      kind: input.kind, locationId: input.locationId ?? null, linesIncluded: input.includeRecords && input.includeLines, recordsIncluded: input.includeRecords,
      countScope: "returned_page" as const, timeBasis: "event_registered_at" as const,
      basis: "원본 재고 이벤트 등록 시각(서울) 기준입니다. count_match만 수량일치 버튼 기록이며 count_adjust/입출고/상품 수정과 구분합니다. 이름은 현재 명부·상품 이름이며 당시 이름 스냅샷이 아닙니다. 직원별 건수는 수행 기록이고 담당 업무 완료율이 아닙니다. transfer의 장소 조건은 출발 장소이며 lines에 목적지가 있습니다. 페이지별 건수이며 distinct 상품 수는 페이지 사이에 중복될 수 있습니다. 삭제·비활성 상품의 과거 이력도 보존합니다." };
    if (resolved && !resolved.employee) return { ...base, resolution: resolved.complete
      ? resolved.candidates.length ? "ambiguous_employee" as const : "employee_not_found" as const : "incomplete_employee_search" as const,
      records: input.includeRecords ? [] : null, nextCursor: null, page: null, summary: [], asOf: null };
    const found = await this.inventoryRecords.search({ ...input, employeeId: resolved?.employee?.employeeId });
    const ids = [...new Set(found.events.flatMap((event) => event.actorEmployeeId ? [event.actorEmployeeId] : []))];
    const [names, products] = await Promise.all([this.employees.namesByIds(ids), this.inventoryRecords.productNames(input.includeRecords ? found.events.map((event) => event.productId) : [])]);
    const records = found.events.map((event) => ({ eventId: event.eventId, productId: event.productId,
      productName: products.get(event.productId)?.name ?? null, productStatus: products.get(event.productId)?.status ?? null,
      employeeId: event.actorEmployeeId, recordedByName: event.actorEmployeeId ? names.get(event.actorEmployeeId) ?? null : null,
      actorNameSource: event.actorEmployeeId && names.get(event.actorEmployeeId) ? "current_employee_directory" as const : "unavailable" as const,
      kind: event.kind, locationId: event.locationId, registeredAt: event.createdAt, cycleId: event.cycleId,
      unitLabel: event.unitLabel, stockRevision: event.stockRevision,
      lines: input.includeLines ? event.lines : null, lotMetadataChange: input.includeLines ? event.lotMetadataChange ?? null : null }));
    const groups = new Map<string, { employeeId: string | null; recordedByName: string | null; locationId: typeof records[number]["locationId"];
      records: number; quantityMatches: number; countAdjustments: number; products: Set<string> }>();
    for (const record of records) {
      const key = record.employeeId + ":" + record.locationId;
      const group = groups.get(key) ?? { employeeId: record.employeeId, recordedByName: record.recordedByName,
        locationId: record.locationId, records: 0, quantityMatches: 0, countAdjustments: 0, products: new Set<string>() };
      group.records++; group.quantityMatches += Number(record.kind === "count_match"); group.countAdjustments += Number(record.kind === "count_adjust");
      group.products.add(record.productId); groups.set(key, group);
    }
    return { ...base, resolution: "resolved" as const, records: input.includeRecords ? records : null, nextCursor: found.nextCursor, page: found.page, asOf: found.asOf,
      summary: [...groups.values()].map(({ products, ...group }) => ({ ...group, distinctProducts: products.size })) };
  }
  async searchCustomers(query: string, afterId: string | null, limit = 50) {
    const result = await this.customers.search(query, { afterId, limit });
    return { customers: result.items.map(customerProjection), query, nextCursor: result.nextCursor, page: result.page,
      note: "등록 이름·초성과 추가 업종 호칭을 확인했습니다. 여러 후보면 customerId를 확인하세요. page.complete가 false면 검색이 끝나지 않았습니다. 여러 페이지는 동일 시점의 스냅샷이 아닙니다." };
  }
  async customerDetails(input: z.infer<typeof customerDetailsInput>, actor: McpPrincipal) {
    const search = input.query ? await this.customers.search(input.query,
      { afterId: input.afterId, limit: 100, includeClosed: input.includeClosed }) : null;
    const base = { candidates: search?.items.map((customer) => ({ ...customerProjection(customer), status: customer.status })) ?? [],
      searchPage: search?.page ?? null, searchNextCursor: search?.nextCursor ?? null,
      sectionsIncluded: input.sections, basis: CUSTOMER_DETAILS_BASIS };
    const customerId = input.customerId ?? (search
      ? selectCustomerCandidate(input.query!, search.items, search.page)?.customerId : null);
    if (!customerId) return { ...base, customer: null,
      resolution: search && (!search.page.complete || !search.page.startedFromBeginning) ? "incomplete_search" as const
        : search?.items.length ? "ambiguous" as const : "not_found" as const,
      note: search && (!search.page.complete || !search.page.startedFromBeginning)
        ? "전체 검색을 마치지 못했습니다. searchNextCursor를 같은 이름의 afterId로 전달하거나 확인된 customerId를 사용하세요. 후속 페이지 하나만 보고 자동 선택하지 않습니다."
        : search?.items.length ? "거래처를 하나로 확인할 수 없습니다. 후보의 등록명·지역·상태를 보고 원하는 거래처를 선택해 주세요."
          : "일치하는 거래처가 없습니다. 기본은 활성 거래처이며 등록명 또는 명시적으로 요청한 폐업 포함 조건을 확인해 주세요." };
    // Always read the current source with canonical membership checks, including after name resolution.
    const customer = await this.customers.read(customerId, actor, input.includeClosed);
    if (customer && customer.customerId !== customerId) throw new HttpsError("failed-precondition", "Customer identity mismatch");
    return { ...base, candidates: [], resolution: customer ? "resolved" as const : "not_found" as const,
      customer: customer ? customerDetailsProjection(customer, input) : null,
      note: !customer ? "거래처가 없거나 폐업 처리되어 조회 조건에 맞지 않습니다. 기존 검색 결과로 상세정보를 추정하지 마세요."
        : customer.status === "closed" ? "폐업 처리된 거래처의 현재 저장 정보입니다. 방문·납품 전 확인하세요."
          : "거래처 상세정보를 확인했습니다. 요청한 항목만 답하고 이후 같은 거래처는 customerId를 재사용하세요. 추가 검색·사진·실사 조회는 필요하지 않습니다." };
  }
  async searchProducts(query: string, afterId: string | null, limit = 50) {
    const result = await this.inventory.search(query, { afterId, limit });
    return { products: await this.projectStock(result.items), query, nextCursor: result.nextCursor, page: result.page };
  }
  async searchProductsBatch(queries: string[], afterId: string | null, limit = 50) {
    const result = await this.inventory.searchMany(queries, { afterId, limit });
    return { products: await this.projectStock(result.items), query: null, matches: result.matches, nextCursor: result.nextCursor, page: result.page };
  }
  async lowStock(threshold: number, afterId: string | null, limit = 50) {
    const result = await this.inventory.lowStock(threshold, { afterId, limit });
    return { products: await this.projectStock(result.items), nextCursor: result.nextCursor, page: result.page, threshold, basis: STOCK_BASIS };
  }
  async product(productId: string, actor: McpPrincipal, includeLots = true) {
    if (!includeLots) {
      const result = await this.inventory.readProducts([productId], actor);
      const product = result.products[0];
      if (!product) throw new HttpsError("not-found", "상품을 찾을 수 없습니다.");
      return { product: (await this.projectStock([product]))[0]!, lotsIncluded: false, lots: null };
    }
    const detail = await this.inventory.detail(productId, actor);
    return { product: (await this.projectStock([detail.product]))[0]!, lotsIncluded: true, lots: detail.lots.map((lot) => ({ lotId: lot.lotId,
      locationId: lot.locationId, quantity: lot.quantity, expiryDate: lot.expiryDate, expiryState: lot.expiryState })) };
  }
  async products(productIds: string[], actor: McpPrincipal) {
    const result = await this.inventory.readProducts(productIds, actor);
    return { products: await this.projectStock(result.products), missingProductIds: result.missingProductIds,
      requestedCount: productIds.length, returnedCount: result.products.length };
  }
  async alerts(threshold: number, days: number, afterId: string | null, limit = 50) {
    const result = await this.inventory.alerts(threshold, days, { afterId, limit });
    const products = await this.projectStock(result.items.map((item) => item.product));
    return { alerts: result.items.map((alert, index) => ({ product: products[index]!, lowStock: alert.lowStock,
      expiringLocations: alert.expiringLocations, expiredLocations: alert.expiredLocations })),
      nextCursor: result.nextCursor, page: result.page, threshold, days, ...result.window,
      basis: STOCK_BASIS + " 유통기한은 재고가 있는 장소의 가장 가까운 날짜 기준이며 이미 지난 날짜도 포함합니다. 장소의 전체 수량이 모두 해당 날짜에 만료되는 것은 아닙니다. 묶음별 수량은 상품 상세로 확인하세요. 날짜 미등록은 임박 여부를 판단할 수 없습니다." };
  }
  async inventoryOverview(threshold: number, days: number, afterId: string | null, exampleLimit = 5) {
    const { examples, ...result } = await this.inventory.overview(threshold, days, exampleLimit, { afterId });
    const uniqueProducts = new Map(Object.values(examples).flat().map((product) => [product.productId, product]));
    const projected = new Map((await this.projectStock([...uniqueProducts.values()])).map((product) => [product.productId, product]));
    const brief = (products: InventoryProduct[]) => products.map((product) => ({ productId: product.productId, name: product.name,
      unitLabel: product.unitLabel, totalQuantity: inventoryTotalQuantity(product), lastStocktakeAt: projected.get(product.productId)!.lastStocktakeAt,
      lastStocktake: projected.get(product.productId)!.lastStocktake }));
    return { ...result, threshold, days, countScope: "returned_scan_segment" as const,
      examples: { lowStock: brief(examples.lowStock), expiring: brief(examples.expiring), stocktakePending: brief(examples.stocktakePending) },
      examplesTruncated: { lowStock: result.counts.lowStockProducts > examples.lowStock.length,
        expiring: result.counts.expiringProducts > examples.expiring.length,
        stocktakePending: result.counts.stocktake.pending + result.counts.stocktake.changed > examples.stocktakePending.length },
      basis: STOCK_BASIS + " 집계는 이번 커서 구간의 활성 품목 수입니다. 부분/후속 페이지를 전체로 해석하지 마세요. 유통기한 임박은 경과를 포함하며 장소별 가장 가까운 날짜 기준입니다. 실사 상태는 기존 지정 주기의 장소 전체 확인을 기준으로 하며 신규 품목은 notDue로 구분합니다. 예시는 상품 ID 순의 제한된 목록이며 심각도 순위나 전체 목록이 아닙니다. 서로 다른 단위의 수량을 합산하지 않습니다." };
  }
  async deliveries(input: Parameters<DeliveryPhotoService["listPage"]>[0], actor: McpPrincipal) {
    return { ...await this.deliveryPages(input, actor, false), customerId: input.customerId };
  }
  private async deliveryPages(input: DeliveryPhotoSearch, actor: McpPrincipal, direct = true, at = Timestamp.now()) {
    const photos: Awaited<ReturnType<DeliveryPhotoService["listPage"]>>["photos"] = [];
    let cursor = input.after ?? null;
    let pagesScanned = 0; let recordsScanned = 0;
    let stoppedBecause: ScanStop = "complete";
    const deadline = Date.now() + 5_000;
    do {
      const pageInput = { ...(input.customerId ? { customerId: input.customerId } : {}), ...(input.employeeId ? { employeeId: input.employeeId } : {}),
        ...(input.date ? { date: input.date } : {}), limit: input.limit - photos.length, ...(cursor ? { after: cursor } : {}) };
      const page = direct ? await this.delivery.searchPage(pageInput, actor, at)
        : await this.delivery.listPage({ ...pageInput, customerId: input.customerId! }, actor);
      photos.push(...page.photos); pagesScanned++; recordsScanned += page.recordsScanned;
      if (cursor && page.nextCursor && cursor.createdAt === page.nextCursor.createdAt && cursor.photoId === page.nextCursor.photoId) {
        throw new Error("Non-advancing photo cursor");
      }
      cursor = page.nextCursor;
      if (!cursor) break;
      if (photos.length >= input.limit) { stoppedBecause = "result_limit"; break; }
      if (pagesScanned >= 5) { stoppedBecause = "page_budget"; break; }
      if (Date.now() >= deadline) { stoppedBecause = "time_budget"; break; }
    } while (cursor);
    return { photos, nextCursor: cursor, date: input.date ?? null,
      page: { returnedCount: photos.length, hasMore: cursor !== null, complete: cursor === null, startedFromBeginning: !input.after,
        pagesScanned, recordsScanned, stoppedBecause }, retentionHours: 168 as const, evidence: DELIVERY_BASIS };
  }
  async customerDeliverySummary(input: { customerId?: string | undefined; query?: string | undefined; date?: string | undefined; limit: number }, actor: McpPrincipal) {
    const search = input.customerId ? null : await this.searchCustomers(input.query!, null, 100);
    const customer = input.customerId ? await this.customers.read(input.customerId, actor)
      : search ? selectCustomerCandidate(input.query!, search.customers, search.page) : null;
    const resolution = customer ? "resolved" as const
      : search && (!search.page.complete || !search.page.startedFromBeginning) ? "incomplete_search" as const
        : search && search.customers.length > 1 ? "ambiguous" as const : "not_found" as const;
    return { resolution, customer: customer ? customerProjection(customer) : null,
      candidates: customer ? [] : search?.customers ?? [], searchPage: search?.page ?? null, searchNextCursor: search?.nextCursor ?? null,
      records: customer ? await this.deliveries({ customerId: customer.customerId, date: input.date, limit: input.limit }, actor) : null,
      note: resolution === "resolved" ? "거래처를 확인했습니다. 사진 보여주기는 같은 customerId와 요청 날짜로 get_delivery_gallery를 호출해 한 갤러리로 표시하세요."
        : resolution === "ambiguous" ? "거래처를 하나로 확인할 수 없습니다. 후보의 등록명과 지역으로 원하는 거래처를 선택해 주세요."
          : resolution === "incomplete_search" ? "검색 범위를 모두 확인하지 못했습니다. searchNextCursor로 거래처 검색을 계속하거나 이름을 더 구체적으로 입력하세요."
            : "일치하는 활성 거래처를 찾지 못했습니다. 이름 또는 ID를 확인하세요." };
  }
  async photo(input: Parameters<DeliveryPhotoService["get"]>[0], actor: McpPrincipal) {
    const { download, ...metadata } = await this.delivery.getWithMetadata(input, actor);
    const customer = await this.customers.read(metadata.customerId, actor, true);
    return { ...download, ...metadata, customerName: customer?.name ?? null };
  }
  async gallery(input: Parameters<DeliveryPhotoService["listPage"]>[0], actor: McpPrincipal) {
    const [customer, records] = await Promise.all([
      this.customers.read(input.customerId, actor, true), input.employeeId
        ? this.deliveryPages(input, actor) : this.deliveries(input, actor),
    ]);
    return { ...records, customerId: input.customerId, customerName: customer?.name ?? null, employeeId: input.employeeId ?? null,
      photos: records.photos.map(({ photoId, createdAt, createdByName }) => ({ photoId, createdAt, createdByName })),
      after: input.after ?? null };
  }
  /** Name resolution, one gallery and its first checked thumbnail in one tool operation. */
  async customerGallery(input: z.infer<typeof galleryInput>, actor: McpPrincipal) {
    const search = input.query ? await this.searchCustomers(input.query, input.afterId, 100) : null;
    const base = { candidates: search?.customers ?? [], searchPage: search?.page ?? null,
      searchNextCursor: search?.nextCursor ?? null, timeBasis: "photo_registered_at" as const };
    const customerId = input.customerId ?? (search
      ? selectCustomerCandidate(input.query!, search.customers, search.page)?.customerId : null);
    if (!customerId) return { ...base, resolution: search && (!search.page.complete || !search.page.startedFromBeginning)
      ? "incomplete_search" as const : search?.customers.length ? "ambiguous" as const : "not_found" as const,
      customerId: null, customerName: null, employeeId: input.employeeId ?? null, date: input.date ?? null,
      photos: [], nextCursor: null, page: null, after: null, retentionHours: 168 as const, evidence: DELIVERY_BASIS,
      initialPhoto: null, note: search && (!search.page.complete || !search.page.startedFromBeginning)
        ? "검색 범위를 모두 확인하지 못했습니다. 검색 커서로 계속하거나 확인된 거래처 ID를 지정해 주세요."
        : search?.customers.length ? "거래처를 하나로 확인할 수 없습니다. 후보의 등록명과 지역으로 원하는 거래처를 선택해 주세요."
          : "일치하는 활성 거래처가 없습니다. 등록명을 확인해 주세요. 다른 거래처 사진으로 대신하지 않습니다." };
    const gallery = await this.gallery({ customerId, employeeId: input.employeeId, date: input.date,
      limit: input.limit, after: input.after }, actor);
    // Pagination is UI-only metadata: do not download another first image for every page.
    const first = !input.after ? gallery.photos[0] : null;
    const checked = first ? await this.delivery.getWithMetadata({ photoId: first.photoId, variant: "thumbnail" }, actor) : null;
    if (checked && (checked.customerId !== customerId || checked.download.photoId !== first!.photoId
      || input.employeeId && checked.createdByEmployeeId !== input.employeeId)) {
      throw new HttpsError("aborted", "Photo records changed during gallery lookup");
    }
    return { ...base, ...gallery, candidates: [], resolution: "resolved" as const,
      initialPhoto: checked ? { ...checked.download, customerId, customerName: gallery.customerName,
        createdAt: checked.createdAt, createdByName: checked.createdByName, createdByEmployeeId: checked.createdByEmployeeId } : null,
      note: gallery.photos.length ? "등록명으로 확인한 거래처의 납품사진 갤러리입니다. 첫 썸네일은 응답에 포함하며 추가 모델 호출은 불필요합니다. 나머지 사진·확대·페이지는 UI에서 조회합니다."
        : gallery.page.complete ? "최근168시간·지정 날짜에 조회 가능한 사진 등록 기록이 없습니다. 삭제·만료·미등록은 미납품을 뜻하지 않습니다."
          : "이 구간에 유효한 사진이 없습니다. 같은 거래처와 nextCursor로 사진 더 보기를 사용하세요." };
  }
  private async resolveDeliveryFilters(input: DeliveryRecordFilters, actor: McpPrincipal) {
    const [staff, customerSearch, customerById] = await Promise.all([
      input.employeeName || input.employeeId ? this.employees.resolve(input, actor) : null,
      input.customerName ? this.searchCustomers(input.customerName, null, 100) : null,
      input.customerId ? this.customers.read(input.customerId, actor, true) : null,
    ]);
    const employee = staff?.employee ?? null;
    const selectedCustomer = customerSearch ? selectCustomerCandidate(input.customerName!, customerSearch.customers, customerSearch.page) : null;
    const customer = input.customerId ? { customerId: input.customerId, name: customerById?.name ?? null }
      : selectedCustomer ? { customerId: selectedCustomer.customerId, name: selectedCustomer.name } : null;
    const resolution = staff && !employee ? !staff.complete ? "incomplete_employee_search" as const
      : staff.candidates.length ? "ambiguous_employee" as const : "employee_not_found" as const
      : customerSearch && !customer ? !customerSearch.page.complete ? "incomplete_customer_search" as const
        : customerSearch.customers.length ? "ambiguous_customer" as const : "customer_not_found" as const : "resolved" as const;
    return { resolution, employee, employeeCandidates: staff?.candidates ?? [], employeeSearchComplete: staff?.complete ?? true,
      customer, customerCandidates: customer ? [] : customerSearch?.customers ?? [], customerSearchComplete: customerSearch?.page.complete ?? true };
  }
  private resolutionNote(resolution: string) {
    if (resolution.includes("incomplete")) return "이름 검색 범위를 모두 확인하지 못했습니다. 등록 이름을 더 구체적으로 지정하거나 확인된 ID로 다시 조회해 주세요.";
    if (resolution.includes("ambiguous")) return "대상을 하나로 확인할 수 없습니다. 후보의 직원 이름 또는 거래처 등록명·지역을 확인해 선택해 주세요.";
    return "일치하는 직원/거래처 등록 이름을 찾지 못했습니다. 현재 등록 이름 또는 확인된 ID를 지정해 주세요.";
  }
  async searchDeliveryRecords(input: DeliveryRecordSearch, actor: McpPrincipal) {
    const resolved = await this.resolveDeliveryFilters(input, actor);
    const filters = { employeeId: resolved.employee?.employeeId ?? null, customerId: resolved.customer?.customerId ?? null, date: input.date ?? null };
    const common = { ...resolved, filters, timeBasis: "photo_registered_at" as const, retentionHours: 168 as const, evidence: DELIVERY_BASIS };
    if (resolved.resolution !== "resolved") return { ...common, records: [], page: null, nextCursor: null, note: this.resolutionNote(resolved.resolution) };
    const result = await this.deliveryPages({ employeeId: filters.employeeId ?? undefined, customerId: filters.customerId ?? undefined,
      date: input.date, limit: input.limit, after: input.after }, actor);
    const names = result.photos.length ? await this.customers.readNames(result.photos.map((photo) => photo.customerId), actor) : [];
    const byId = new Map(names.map((customer) => [customer.customerId, customer.name]));
    return { ...common, records: result.photos.map((photo) => ({ photoId: photo.photoId, customerId: photo.customerId,
      customerName: byId.get(photo.customerId) ?? null, registeredAt: photo.createdAt, deliveryCompletedAt: null,
      employeeId: photo.createdByEmployeeId, recordedByName: photo.createdByName })), page: result.page, nextCursor: result.nextCursor,
      note: "사진 등록 시각 내림차순, 동시각은 사진 ID 내림차순입니다. 부분 결과는 동일 직원/날짜/거래처 조건과 nextCursor로 계속 조회하세요. 사진 등록은 납품완료 확정이 아닙니다." };
  }
  async latestEmployeeGallery(input: DeliveryRecordSearch, actor: McpPrincipal) {
    const resolved = await this.resolveDeliveryFilters(input, actor);
    const common = { ...resolved, timeBasis: "photo_registered_at" as const, retentionHours: 168 as const, evidence: DELIVERY_BASIS };
    if (resolved.resolution !== "resolved") return { ...common, latestRecord: null, recordsPage: null, nextCursor: null,
      gallery: null, initialPhoto: null, note: this.resolutionNote(resolved.resolution) };
    if (!resolved.employee) throw new HttpsError("invalid-argument", "Employee selection required");
    // Use one upper bound throughout the operation. New registrations after it belong to the next lookup.
    const at = Timestamp.now();
    const found = await this.deliveryPages({ employeeId: resolved.employee!.employeeId, customerId: resolved.customer?.customerId,
      date: input.date, limit: 1, after: input.after }, actor, true, at);
    const latest = found.photos[0];
    if (!latest) return { ...common, resolution: found.page.complete ? "no_records" as const : "incomplete_records" as const,
      latestRecord: null, recordsPage: found.page, nextCursor: found.nextCursor, gallery: null, initialPhoto: null,
      note: found.page.complete ? "최근168시간·지정 조건에서 조회할 수 있는 사진 등록 기록이 없습니다. 실제 미납품을 뜻하지 않습니다."
        : "읽기 한도 내에 유효한 사진을 확인하지 못했습니다. 동일 직원/조건과 nextCursor로 이어서 조회해 주세요." };
    const date = deliveryDateKeyInSeoul(new Date(latest.createdAt));
    const [customer, records, initial] = await Promise.all([
      this.customers.read(latest.customerId, actor, true),
      this.deliveryPages({ employeeId: resolved.employee!.employeeId, customerId: latest.customerId, date, limit: input.limit }, actor, true, at),
      this.delivery.getWithMetadata({ photoId: latest.photoId, variant: "thumbnail" }, actor),
    ]);
    // A concurrent delete/reassignment must not pair a stale latest record with a different image.
    if (records.photos[0]?.photoId !== latest.photoId || initial.customerId !== latest.customerId
      || initial.createdByEmployeeId !== resolved.employee!.employeeId) throw new HttpsError("aborted", "Photo records changed during lookup");
    const customerName = customer?.name ?? null;
    return { ...common, latestRecord: { photoId: latest.photoId, customerId: latest.customerId, customerName,
      registeredAt: initial.createdAt, deliveryCompletedAt: null, employeeId: latest.createdByEmployeeId, recordedByName: initial.createdByName },
      recordsPage: found.page, nextCursor: null,
      gallery: { ...records, customerId: latest.customerId, customerName, employeeId: resolved.employee!.employeeId,
        employeeName: resolved.employee!.displayName, after: null },
      initialPhoto: { ...initial.download, customerId: initial.customerId, customerName, createdAt: initial.createdAt,
        createdByName: initial.createdByName, createdByEmployeeId: initial.createdByEmployeeId },
      note: "직원이 가장 최근 사진을 등록한 거래처·서울 등록일의 해당 직원 사진을 한 갤러리에 표시했습니다. 최초 썸네일을 이 응답에 포함해 추가 MCP 호출 없이 표시합니다. 추가 사진/확대/다음 페이지는 사용자 조작 시 조회합니다. 등록 시각은 실제 납품완료 시각이 아닙니다." };
  }

}
