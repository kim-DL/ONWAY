import { afterEach, describe, expect, it, vi } from "vitest";
import { inventoryLocationMap, inventoryProductSchema, type InventoryProduct } from "../../src/inventory/inventory-contract.js";
import { defaultInventorySettings, inventoryCycle } from "../../src/inventory/inventory-calendar.js";
import { InventoryService } from "../../src/inventory/inventory-service.js";
import { McpQueries, stockProjection, STOCKTAKE_BASIS } from "../../src/mcp/queries.js";
import { inventoryOverviewResult, stockSchema } from "../../src/mcp/contracts.js";
import { EmployeeDirectory } from "../../src/employee/employee-directory.js";
import { principal } from "./fixture.js";
import type { InventoryQuantityMatch } from "../../src/inventory/inventory-quantity-match.js";

afterEach(() => vi.restoreAllMocks());
export function stockProduct(index: number, name = "합성 만두"): InventoryProduct {
  return inventoryProductSchema.parse({ productId: `p${String(index).padStart(4, "0")}`, name, manufacturer: "합성 제조사", specification: "1kg", origin: "대한민국",
    companyId: "onnuri", status: "active", unitLabel: "봉", unitsPerBox: 8, defaultLocationId: "freezer1", note: "PRIVATE-NOTE", urgent: false,
    revision: 2, stockRevision: 3, hasHistory: true, quantityByLocation: { ...inventoryLocationMap(0), freezer1: 5 },
    nearestExpiryByLocation: { ...inventoryLocationMap(null), freezer1: "2026-10-15" }, lastCountByLocation: inventoryLocationMap(null), photo: null,
    createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-12T01:00:00Z", createdBy: "PRIVATE-EMPLOYEE", updatedBy: "PRIVATE-EMPLOYEE" });
}
function checked(at = "2026-10-09T04:00:00Z", stockChangedSinceCount = false, cycleId = "week-2026-10-09") {
  return { checkedAt: at, stockChangedSinceCount, cycleId, changed: true, stockRevision: 2, checkedBy: "PRIVATE-EMPLOYEE" };
}
function buttonLog(productId: string, createdAt = "2026-10-09T02:00:00.000Z"): InventoryQuantityMatch {
  return { eventId: "ca6b43a3-cd27-4f8d-94a9-f9389e67ce2d", productId, kind: "count_match", locationId: "freezer1", createdAt, cycleId: "week-2026-10-09", stockRevision: 1, actorEmployeeId: "RECORDER-1" };
}
function fixture(products: InventoryProduct[], logs = new Map<string, InventoryQuantityMatch | null>()) {
  const service = new InventoryService(undefined, () => new Date("2026-10-12T03:00:00Z"));
  const list = vi.spyOn(service, "listActive").mockImplementation(async (after) => {
    const remaining = products.filter((product) => product.status === "active" && (after === null || product.productId > after));
    return { products: remaining.slice(0, 100), nextCursor: remaining.length > 100 ? remaining[99]!.productId : null };
  });
  const settings = defaultInventorySettings(), today = "2026-10-12", cycle = inventoryCycle(settings, today);
  const context = vi.spyOn(service, "context").mockResolvedValue({ settings, today, cycle });
  const events = vi.spyOn(service, "lastQuantityMatches").mockImplementation(async (ids) => new Map(ids.map((id) => [id, logs.get(id) ?? null])));
  const employees = new EmployeeDirectory();
  const names = vi.spyOn(employees, "namesByIds").mockImplementation(async (ids) => new Map(ids.map((id) => [id, "합성 기록자"])));
  return { service, queries: new McpQueries(undefined, service, undefined, employees), list, context, events, names };
}
describe("inventory timestamps and efficient MCP queries", () => {
  it("returns recorder names in all stock projections with one unique-author batch and no inferred authors", async () => {
    const products = [stockProduct(0), stockProduct(1), stockProduct(2), stockProduct(3)];
    const logs = new Map<string, InventoryQuantityMatch | null>([
      ["p0000", buttonLog("p0000")], ["p0001", buttonLog("p0001")],
      ["p0002", { ...buttonLog("p0002"), actorEmployeeId: null }], ["p0003", null],
    ]);
    const f = fixture(products, logs);
    vi.spyOn(f.service, "readProducts").mockResolvedValue({ products, missingProductIds: [] });
    const responses = [await f.queries.searchProductsBatch(["만두"], null), await f.queries.products(products.map((p) => p.productId), principal),
      await f.queries.lowStock(10, null)];
    for (const response of responses) {
      expect(response.products[0]!.lastStocktake).toMatchObject({ actorName: "합성 기록자", actorNameSource: "current_employee_directory", actorEmployeeId: "RECORDER-1" });
      expect(response.products[1]!.lastStocktake?.actorName).toBe("합성 기록자");
      expect(response.products[2]!.lastStocktake).toMatchObject({ createdAt: logs.get("p0002")!.createdAt, actorName: null, actorNameSource: "unavailable" });
      expect(response.products[3]!.lastStocktake).toBeNull();
    }
    expect(f.names.mock.calls).toEqual(Array(3).fill([["RECORDER-1"]]));
    const alerts = await f.queries.alerts(10, 7, null), overview = await f.queries.inventoryOverview(10, 7, null, 4);
    expect(alerts.alerts[0]!.product.lastStocktake?.actorName).toBe("합성 기록자");
    expect(overview.examples.lowStock[0]!.lastStocktake?.actorName).toBe("합성 기록자");
    f.names.mockResolvedValueOnce(new Map([["RECORDER-1", null]]));
    expect((await f.queries.product("p0000", principal, false)).product.lastStocktake).toMatchObject({ actorName: null, actorNameSource: "unavailable" });
    f.names.mockRejectedValueOnce(new Error("lookup failed"));
    await expect(f.queries.searchProducts("만두", null)).rejects.toThrow("lookup failed");
  });
  it("uses only the button event, even if location summaries or the modification time are newer", () => {
    const product = stockProduct(0);
    expect(stockProjection(product, null).lastStocktakeAt).toBeNull();
    product.lastCountByLocation.freezer1 = checked("2026-10-09T04:00:00.000Z", true);
    product.lastCountByLocation.sample = checked("2026-10-09T04:00:00.001Z");
    expect(stockProjection(product, null).lastStocktakeAt).toBeNull();
    const event = buttonLog(product.productId);
    const result = stockSchema.parse(stockProjection(product, event));
    expect(result.lastStocktakeAt).toBe(event.createdAt);
    expect(result.lastStocktake).toEqual({ ...event, actorName: null, actorNameSource: "unavailable" });
    expect(result.updatedAt).toBe("2026-10-12T01:00:00Z");
    expect(result.stocktakeByLocation).toMatchObject({ freezer1: { checkedAt: "2026-10-09T04:00:00.000Z", stockChangedSinceCount: true }, refrigerated: null });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|checkedBy/);
    product.updatedAt = "2026-10-13T00:00:00Z";
    expect(stockProjection(product, event).lastStocktakeAt).toBe(result.lastStocktakeAt);
    product.lastCountByLocation = inventoryLocationMap(null);
    expect(stockProjection(product, event).lastStocktakeAt).toBe(event.createdAt);
  });
  it("searches three terms in one catalog pass, retains overlap once and exports all stocktake fields", async () => {
    const products = Array.from({ length: 490 }, (_, index) => stockProduct(index, index === 480 ? "합성 만두 쌀" : index === 489 ? "합성 떡" : "기타"));
    products[480]!.lastCountByLocation.freezer1 = checked();
    const f = fixture(products, new Map([["p0480", buttonLog("p0480")]])), terms = ["ㅁㄷ", "쌀", "떡"];
    for (const term of terms) await f.queries.searchProducts(term, null);
    expect(f.list).toHaveBeenCalledTimes(15);
    f.list.mockClear();
    f.events.mockClear();
    const batch = await f.queries.searchProductsBatch(terms, null);
    expect(f.list).toHaveBeenCalledTimes(5);
    expect(batch.products.map((product) => product.productId)).toEqual(["p0480", "p0489"]);
    expect(batch.matches).toEqual([{ query: "ㅁㄷ", productIds: ["p0480"] }, { query: "쌀", productIds: ["p0480"] }, { query: "떡", productIds: ["p0489"] }]);
    expect(batch.products[0]!.lastStocktakeAt).toBe("2026-10-09T02:00:00.000Z");
    expect(f.events).toHaveBeenCalledExactlyOnceWith(["p0480", "p0489"]);
    expect(batch.page.complete).toBe(true);
  });
  it("continues a batch inside a page without omissions and never marks an unfinished empty term complete", async () => {
    const products = Array.from({ length: 505 }, (_, index) => stockProduct(index, index === 504 ? "쌀" : "만두"));
    const f = fixture(products);
    const first = await f.queries.searchProductsBatch(["만두", "쌀"], null, 2);
    expect(first).toMatchObject({ nextCursor: "p0001", page: { complete: false }, matches: [{ query: "만두", productIds: ["p0000", "p0001"] }, { query: "쌀", productIds: [] }] });
    const second = await f.queries.searchProductsBatch(["만두", "쌀"], first.nextCursor, 2);
    expect(second.products.map((product) => product.productId)).toEqual(["p0002", "p0003"]);
    expect(second.page.startedFromBeginning).toBe(false);
    const rare = await f.queries.searchProductsBatch(["쌀", "없는 품목"], null);
    expect(rare).toMatchObject({ products: [], nextCursor: "p0499", page: { complete: false, stoppedBecause: "page_budget" } });
    expect((await f.queries.searchProductsBatch(["쌀", "없는 품목"], rare.nextCursor)).products[0]?.productId).toBe("p0504");
  });
  it("uses PWA cycle/location rules for zero stock, changed counts, old cycles and new products", async () => {
    const rows = Array.from({ length: 6 }, (_, index) => stockProduct(index));
    rows[0]!.lastCountByLocation.freezer1 = checked();
    rows[1]!.lastCountByLocation.freezer1 = checked(undefined, true);
    rows[2]!.lastCountByLocation.freezer1 = checked(undefined, false, "week-2026-10-02");
    rows[3]!.createdAt = "2026-10-10T00:00:00Z";
    rows[4]!.quantityByLocation.freezer1 = 0; rows[4]!.lastCountByLocation.freezer1 = checked();
    rows[5]!.status = "inactive";
    const f = fixture(rows), result = await f.queries.inventoryOverview(0, 7, null, 1);
    expect(result.counts).toEqual({ activeProducts: 5, zeroStockProducts: 1, lowStockProducts: 1, expiringProducts: 4, expiredProducts: 0,
      stocktake: { confirmed: 2, changed: 1, pending: 1, notDue: 1 }, stockedProductsByLocation: { refrigerated: 0, freezer1: 4, freezer2: 0, sample: 0 },
      stocktakeByLocation: { freezer1: { confirmed: 2, changed: 1, pending: 1, notDue: 1 },
        refrigerated: { confirmed: 0, changed: 0, pending: 0, notDue: 0 }, freezer2: { confirmed: 0, changed: 0, pending: 0, notDue: 0 },
        sample: { confirmed: 0, changed: 0, pending: 0, notDue: 0 } } });
    expect(result.examplesTruncated).toEqual({ lowStock: false, expiring: true, stocktakePending: true });
    expect(result.examples.stocktakePending[0]!.productId).toBe("p0001");
    expect(result.page).toMatchObject({ complete: true, startedFromBeginning: true, returnedCount: 5 });
    expect(f.context).toHaveBeenCalledTimes(1);
    expect(f.events).toHaveBeenCalledExactlyOnceWith(["p0004", "p0000", "p0001"]);
    inventoryOverviewResult.parse({ ...result, status: "ok", retrievedAt: new Date().toISOString(), timezone: "Asia/Seoul", stocktakeBasis: STOCKTAKE_BASIS });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|checkedBy|note":/);
  });
  it("keeps report totals scoped to bounded segments, including a zero-example report", async () => {
    const f = fixture(Array.from({ length: 520 }, (_, index) => stockProduct(index)));
    const first = await f.queries.inventoryOverview(0, 7, null, 0);
    expect(first).toMatchObject({ countScope: "returned_scan_segment", counts: { activeProducts: 500 }, examples: { expiring: [] }, examplesTruncated: { expiring: true },
      page: { complete: false, pagesScanned: 5, stoppedBecause: "page_budget" }, nextCursor: "p0499" });
    expect(f.events).toHaveBeenLastCalledWith([]);
    expect(f.names).not.toHaveBeenCalled();
    const second = await f.queries.inventoryOverview(0, 7, first.nextCursor, 0);
    expect(second).toMatchObject({ counts: { activeProducts: 20 }, page: { complete: true, startedFromBeginning: false } });
    expect(JSON.stringify(first).length).toBeLessThan(JSON.stringify((await f.queries.searchProducts("만두", null, 100)).products).length / 10);
  });
  it("reports a time budget without declaring a partial overview empty or complete", async () => {
    const f = fixture(Array.from({ length: 201 }, (_, index) => stockProduct(index)));
    let clock = 0;
    const result = await f.service.overview(0, 7, 2, { now: () => clock += 100, maxDurationMs: 50 });
    expect(result).toMatchObject({ counts: { activeProducts: 100 }, nextCursor: "p0099", page: { complete: false, stoppedBecause: "time_budget" } });
  });
  it("makes summary-only requests through authorized batch reads and leaves lots explicitly unrequested", async () => {
    const f = fixture([]);
    const read = vi.spyOn(f.service, "readProducts").mockResolvedValue({ products: [stockProduct(0)], missingProductIds: [] });
    const detail = vi.spyOn(f.service, "detail");
    expect(await f.queries.product("p0000", principal, false)).toMatchObject({ lotsIncluded: false, lots: null, product: { totalQuantity: 5, lastStocktakeAt: null } });
    expect(read).toHaveBeenCalledWith(["p0000"], principal); expect(detail).not.toHaveBeenCalled();
    read.mockResolvedValueOnce({ products: [], missingProductIds: ["p0000"] });
    await expect(f.queries.product("p0000", principal, false)).rejects.toMatchObject({ code: "not-found" });
  });
});
