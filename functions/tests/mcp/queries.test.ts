import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerService, nextCustomer } from "../../src/customer/customer-service.js";
import type { Customer } from "../../src/customer/customer-contract.js";
import { InventoryService } from "../../src/inventory/inventory-service.js";
import { inventoryProductSchema, type InventoryProduct } from "../../src/inventory/inventory-contract.js";
import { DeliveryPhotoService } from "../../src/delivery-photo/delivery-photo-service.js";
import { McpQueries } from "../../src/mcp/queries.js";
import { galleryInput } from "../../src/mcp/contracts.js";
import { principal } from "./fixture.js";

afterEach(() => vi.restoreAllMocks());
function product(index: number, name = "합성 쌀"): InventoryProduct {
  return inventoryProductSchema.parse({ productId: `p${String(index).padStart(4, "0")}`, name, manufacturer: "합성", specification: "1kg", origin: "국산",
    unitLabel: "봉", unitsPerBox: 8, defaultLocationId: "freezer1", note: "private-note", urgent: false, companyId: "onnuri", status: "active",
    revision: 1, stockRevision: 1, hasHistory: false, quantityByLocation: { refrigerated: 0, freezer1: 5, freezer2: 0, sample: 0 },
    nearestExpiryByLocation: { refrigerated: null, freezer1: "2026-10-15", freezer2: null, sample: null },
    lastCountByLocation: { refrigerated: null, freezer1: null, freezer2: null, sample: null }, photo: null,
    createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", createdBy: "test", updatedBy: "test" });
}
function customer(id: string, name: string): Customer {
  return nextCustomer(null, { requestId: "c3bc6631-22fb-4f14-b622-bb852652c891", customerId: null, expectedRevision: null, clearNotice: false,
    draft: { name, district: "합성구", administrativeDong: "합성동", officialAddress: "", deliveryAddress: "", accessPassword: "DO-NOT-EXPORT",
      accessPasswordState: "registered", deliveryLocationDescription: "", deliveryPoint: null, contacts: [], status: "active", noticeType: "none", changeNote: "" } },
  id, "test", "2026-10-01T00:00:00Z");
}
function paged<T>(rows: T[], getId: (value: T) => string, size: number, cursor: string | null) {
  const remaining = cursor === null ? rows : rows.filter((row) => getId(row) > cursor);
  return { items: remaining.slice(0, size), nextCursor: remaining.length > size ? getId(remaining[size - 1]!) : null };
}
function fixture(products: InventoryProduct[] = [], customers: Customer[] = []) {
  const inventory = new InventoryService(undefined, () => new Date("2026-10-07T16:00:00Z"));
  vi.spyOn(inventory, "lastQuantityMatches").mockImplementation(async (ids) => new Map(ids.map((id) => [id, null])));
  const customerService = new CustomerService(); const delivery = new DeliveryPhotoService();
  const productList = vi.spyOn(inventory, "listActive").mockImplementation(async (cursor) => {
    const page = paged(products, (row) => row.productId, 100, cursor);
    return { products: page.items.filter((row) => row.status !== "deleted"), nextCursor: page.nextCursor };
  });
  vi.spyOn(customerService, "listSearch").mockImplementation(async (cursor) => {
    const page = paged(customers, (row) => row.customerId, 250, cursor);
    return { customers: page.items, nextCursor: page.nextCursor };
  });
  const photos = vi.spyOn(delivery, "listPage").mockResolvedValue({ photos: [], nextCursor: null, recordsScanned: 0 });
  return { queries: new McpQueries(customerService, inventory, delivery), customerService, delivery, photos, productList };
}
describe("MCP service composition", () => {
  it("resolves an added business suffix and returns two photos plus the first checked image in one operation", async () => {
    const f = fixture([], [customer("school", "합성")]);
    vi.spyOn(f.customerService, "read").mockResolvedValue(customer("school", "합성"));
    const first = { photoId: "c3bc6631-22fb-4f14-b622-bb852652c891", customerId: "school", deliveryDateKey: "2026-10-07",
      source: "camera" as const, createdAt: "2026-10-07T03:56:00.000Z", createdByEmployeeId: "MCP-TEST",
      createdByName: "합성 직원", expiresAt: "2026-10-14T03:56:00.000Z", thumbnail: { width: 40, height: 40 } };
    f.photos.mockResolvedValue({ photos: [first, { ...first, photoId: "d3bc6631-22fb-4f14-b622-bb852652c891" }], nextCursor: null, recordsScanned: 2 });
    const image = vi.spyOn(f.delivery, "getWithMetadata").mockResolvedValue({ customerId: "school", createdAt: first.createdAt,
      createdByName: first.createdByName, createdByEmployeeId: first.createdByEmployeeId,
      download: { photoId: first.photoId, variant: "thumbnail", contentType: "image/webp", byteSize: 4, fileBase64: "UklGRg==" } });
    const result = await f.queries.customerGallery(galleryInput.parse({ query: "합성유통" }), principal);
    expect(result).toMatchObject({ resolution: "resolved", customerName: "합성", date: null,
      page: { returnedCount: 2 }, initialPhoto: { photoId: first.photoId, variant: "thumbnail", customerName: "합성" } });
    expect(image).toHaveBeenCalledTimes(1); expect(f.photos).toHaveBeenCalledTimes(1);
    expect(f.photos.mock.calls[0]![0]).not.toHaveProperty("date", expect.any(String));
    expect(JSON.stringify(result)).not.toContain("DO-NOT-EXPORT");
    await f.queries.customerGallery(galleryInput.parse({ customerId: "school", after: { photoId: first.photoId, createdAt: first.createdAt } }), principal);
    expect(image).toHaveBeenCalledTimes(1);
    image.mockResolvedValueOnce({ ...result.initialPhoto!, customerId: "different", download: { photoId: first.photoId, variant: "thumbnail", contentType: "image/webp", byteSize: 4, fileBase64: "UklGRg==" } });
    await expect(f.queries.customerGallery(galleryInput.parse({ customerId: "school" }), principal)).rejects.toMatchObject({ code: "aborted" });
  });
  it("never downloads photos or guesses a customer for ambiguous, absent or incomplete name searches", async () => {
    for (const rows of [[customer("one", "합성"), customer("two", "합성유통")], [],
      Array.from({ length: 1251 }, (_, i) => customer(String(i).padStart(4, "0"), i === 0 ? "합성" : "다른업체"))]) {
      const f = fixture([], rows); const image = vi.spyOn(f.delivery, "getWithMetadata");
      const result = await f.queries.customerGallery(galleryInput.parse({ query: "합성유통" }), principal);
      expect(result.resolution).toBe(rows.length > 100 ? "incomplete_search" : rows.length ? "ambiguous" : "not_found");
      expect(result.initialPhoto).toBeNull(); expect(f.photos).not.toHaveBeenCalled(); expect(image).not.toHaveBeenCalled();
    }
    for (const bad of [{}, { query: "합성", customerId: "one" }, { query: "합성", after: { photoId: "c3bc6631-22fb-4f14-b622-bb852652c891", createdAt: "2026-10-07T00:00:00Z" } }]) {
      expect(galleryInput.safeParse(bad).success).toBe(false);
    }
  });
  it("composes a metadata-only gallery through the existing dated/cursored service and excludes unrelated private fields", async () => {
    const f = fixture();
    const read = vi.spyOn(f.customerService, "read").mockResolvedValue({ ...customer("school", "합성 업체"), status: "closed" });
    const download = vi.spyOn(f.delivery, "getWithMetadata");
    const photo = { photoId: "c3bc6631-22fb-4f14-b622-bb852652c891", customerId: "school", deliveryDateKey: "2026-10-07",
      source: "camera" as const, createdAt: "2026-10-07T03:56:00.000Z", createdByEmployeeId: "PRIVATE-EMPLOYEE",
      createdByName: "합성 직원", expiresAt: "2026-10-14T03:56:00.000Z", thumbnail: { width: 40, height: 40 } };
    f.photos.mockResolvedValue({ photos: [photo], nextCursor: null, recordsScanned: 1 });
    const input = { customerId: "school", date: "2026-10-07", limit: 50, after: { photoId: photo.photoId, createdAt: "2026-10-07T04:00:00.000Z" } };
    const result = await f.queries.gallery(input, principal);
    expect(read).toHaveBeenCalledWith("school", principal, true);
    expect(f.photos).toHaveBeenCalledWith(input, principal);
    expect(result).toMatchObject({ customerName: "합성 업체", after: input.after, page: { complete: true, startedFromBeginning: false },
      photos: [{ photoId: photo.photoId, createdAt: photo.createdAt, createdByName: photo.createdByName }] });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE-EMPLOYEE|DO-NOT-EXPORT|fileBase64/);
    expect(download).not.toHaveBeenCalled();
  });
  it("adds the current company name to an authenticated photo and keeps missing company metadata nullable", async () => {
    const f = fixture();
    const read = vi.spyOn(f.customerService, "read").mockResolvedValue(customer("school", "합성 업체"));
    vi.spyOn(f.delivery, "getWithMetadata").mockResolvedValue({ download: {
      photoId: "c3bc6631-22fb-4f14-b622-bb852652c891", variant: "thumbnail", contentType: "image/webp", byteSize: 4, fileBase64: "UklGRg==",
    }, customerId: "school", createdByEmployeeId: "MCP-TEST", createdAt: "2026-10-07T03:56:00.000Z", createdByName: "합성 직원" });
    const input = { photoId: "c3bc6631-22fb-4f14-b622-bb852652c891", variant: "thumbnail" as const };
    expect(await f.queries.photo(input, principal)).toMatchObject({ customerId: "school", customerName: "합성 업체", createdByName: "합성 직원" });
    expect(read).toHaveBeenCalledWith("school", principal, true);
    read.mockResolvedValue(null);
    expect(await f.queries.photo(input, principal)).toMatchObject({ customerName: null });
  });
  it("reuses Korean search across pages and exports only projected customer/product fields", async () => {
    const products = Array.from({ length: 205 }, (_, i) => product(i, i === 204 ? "합성 만두" : "합성 쌀"));
    const customers = Array.from({ length: 260 }, (_, i) => customer(String(i).padStart(4, "0"), i === 259 ? "합성 한빛초" : "합성 다른학교"));
    const f = fixture(products, customers);
    const found = await f.queries.searchProducts("ㅁㄷ", null);
    expect(found.products.map((row) => row.productId)).toEqual(["p0204"]);
    expect(found.page).toMatchObject({ pagesScanned: 3, complete: true, returnedCount: 1 });
    expect(JSON.stringify(found)).not.toContain("private-note");
    const schools = await f.queries.searchCustomers("ㅎㅂㅊ", null);
    expect(schools.customers.map((row) => row.customerId)).toEqual(["0259"]);
    expect(schools.page.pagesScanned).toBe(2);
    expect(JSON.stringify(schools)).not.toContain("DO-NOT-EXPORT");
  });
  it("reports low stock and nearest expiry together, includes sample stock and uses Seoul day boundaries", async () => {
    const expiring = product(0);
    expiring.quantityByLocation.sample = 2;
    expiring.nearestExpiryByLocation.sample = "2026-10-07";
    expiring.nearestExpiryByLocation.refrigerated = "2026-10-01"; // No remaining stock in this location.
    const empty = product(1); empty.quantityByLocation.freezer1 = 0;
    const inactive = product(2); inactive.status = "inactive";
    const f = fixture([expiring, empty, inactive]);
    const result = await f.queries.alerts(0, 7, null);
    expect(result).toMatchObject({ today: "2026-10-08", throughDate: "2026-10-15", page: { returnedCount: 2, complete: true } });
    expect(result.alerts[0]).toMatchObject({ product: { totalQuantity: 7 }, lowStock: false,
      expiringLocations: ["freezer1", "sample"], expiredLocations: ["sample"] });
    expect(result.alerts[1]).toMatchObject({ lowStock: true, expiringLocations: [] });
    expect(f.productList).toHaveBeenCalledTimes(1);
    expect((await f.queries.lowStock(6, null)).products.map((row) => row.productId)).toEqual(["p0001"]);
  });
  it("resolves a complete unique customer search and never exports private fields", async () => {
    const f = fixture([], [customer("school", "합성 한빛초")]);
    const result = await f.queries.customerDeliverySummary({ query: "한빛", limit: 5 }, principal);
    expect(result).toMatchObject({ resolution: "resolved", customer: { customerId: "school" }, records: { photos: [], page: { complete: true } } });
    expect(f.photos).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("DO-NOT-EXPORT");
  });
  it("does not select a customer when ambiguous or the only current match is in an incomplete scan", async () => {
    const ambiguous = fixture([], [customer("one", "한빛초"), customer("two", "한빛초")]);
    expect((await ambiguous.queries.customerDeliverySummary({ query: "한빛", limit: 5 }, principal)).resolution).toBe("ambiguous");
    expect(ambiguous.photos).not.toHaveBeenCalled();
    const many = Array.from({ length: 1251 }, (_, i) => customer(String(i).padStart(4, "0"), i === 0 || i === 1250 ? "한빛초" : "다른학교"));
    const partial = fixture([], many);
    const result = await partial.queries.customerDeliverySummary({ query: "한빛", limit: 5 }, principal);
    expect(result).toMatchObject({ resolution: "incomplete_search", customer: null, records: null, searchPage: { complete: false } });
    expect(result.candidates).toHaveLength(1);
    expect(partial.photos).not.toHaveBeenCalled();
  });
  it("keeps deleted-only photo pages incomplete at the scan limit", async () => {
    const f = fixture();
    let sequence = 0;
    f.photos.mockImplementation(async () => ({ photos: [], recordsScanned: 1,
      nextCursor: { createdAt: `2026-10-07T00:00:0${sequence++}Z`, photoId: "c3bc6631-22fb-4f14-b622-bb852652c891" } }));
    const result = await f.queries.deliveries({ customerId: "school", limit: 1 }, principal);
    expect(result.page).toMatchObject({ returnedCount: 0, complete: false, pagesScanned: 5, stoppedBecause: "page_budget" });
    expect(result.nextCursor).not.toBeNull();
  });
});
