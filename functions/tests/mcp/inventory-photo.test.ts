import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryService } from "../../src/inventory/inventory-service.js";
import { InventoryPhotoService, InventoryPhotoDependencyError } from "../../src/inventory/inventory-photo-service.js";
import { inventoryProductSchema, inventoryLocationMap } from "../../src/inventory/inventory-contract.js";
import { McpQueries, stockProjection } from "../../src/mcp/queries.js";
import { inventoryPhotoInput } from "../../src/mcp/contracts.js";
import { mcpError } from "../../src/mcp/errors.js";
import { principal } from "./fixture.js";
const id = "05ae8398-630a-4a06-b02c-7e431a0f399d";
const product = inventoryProductSchema.parse({ productId: "synthetic-product", name: "합성 상품", manufacturer: "합성 제조사", specification: "1kg", origin: "국산", unitLabel: "봉", unitsPerBox: 8, defaultLocationId: "freezer1", companyId: "onnuri", status: "active", note: "PRIVATE", urgent: false, revision: 1, stockRevision: 1, hasHistory: true,
  quantityByLocation: inventoryLocationMap(1), nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null), photo: { photoId: id, width: 600, height: 800 }, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-09T01:00:00Z", createdBy: "PRIVATE", updatedBy: "PRIVATE" });
const page = { returnedCount: 1, hasMore: false, complete: true, startedFromBeginning: true, pagesScanned: 1, recordsScanned: 1, stoppedBecause: "complete" as const };
function setup() {
  const inventory = new InventoryService(), photos = new InventoryPhotoService();
  const search = vi.spyOn(inventory, "search").mockResolvedValue({ items: [product], nextCursor: null, page });
  const events = vi.spyOn(inventory, "lastQuantityMatches").mockRejectedValue(new Error("No stocktake reads for photos"));
  const detail = vi.spyOn(inventory, "detail").mockRejectedValue(new Error("No lot reads for photos"));
  const read = vi.spyOn(photos, "getWithMetadata").mockResolvedValue({ product: { productId: product.productId, name: product.name, manufacturer: product.manufacturer, specification: product.specification, status: "active" },
    photo: { photoId: id, variant: "thumbnail", width: 600, height: 800, contentType: "image/webp", byteSize: 4, fileBase64: "UklGRg==" } });
  return { search, events, detail, read, queries: new McpQueries(undefined, inventory, undefined, undefined, undefined, photos) };
}
afterEach(() => vi.restoreAllMocks());
describe("inventory photo query budget and resolution", () => {
  it("resolves a name and initial photo in one tool operation without history/lots", async () => {
    const f = setup(); const result = await f.queries.inventoryPhoto(inventoryPhotoInput.parse({ query: "합성 상품" }), principal);
    expect(result.resolution).toBe("resolved"); expect(result.image?.photoId).toBe(id);
    expect(f.search).toHaveBeenCalledExactlyOnceWith("합성 상품", { afterId: null, limit: 20 });
    expect(f.read).toHaveBeenCalledExactlyOnceWith({ productId: product.productId, variant: "thumbnail" }, principal);
    expect(f.events).not.toHaveBeenCalled(); expect(f.detail).not.toHaveBeenCalled();
    expect(stockProjection(product, null).hasPhoto).toBe(true);
    expect(stockProjection({ ...product, photo: null }, null).hasPhoto).toBe(false);
  });
  it("uses an ID directly and keeps the photo identity on authenticated enlargement", async () => {
    const f = setup(); await f.queries.inventoryPhoto(inventoryPhotoInput.parse({ productId: product.productId, photoId: id, variant: "preview" }), principal);
    expect(f.search).not.toHaveBeenCalled(); expect(f.events).not.toHaveBeenCalled(); expect(f.detail).not.toHaveBeenCalled();
    expect(f.read).toHaveBeenCalledExactlyOnceWith({ productId: product.productId, photoId: id, variant: "preview" }, principal);
  });
  it("does not read image bytes for ambiguous, empty or incomplete searches", async () => {
    const f = setup();
    for (const [items, info, resolution] of [
      [[product, { ...product, productId: "other" }], page, "ambiguous"],
      [[], page, "not_found"], [[product], { ...page, complete: false }, "incomplete_search"],
      [[product], { ...page, startedFromBeginning: false }, "incomplete_search"],
    ] as const) {
      f.search.mockResolvedValueOnce({ items: [...items], page: { ...info }, nextCursor: null });
      const result = await f.queries.inventoryPhoto(inventoryPhotoInput.parse({ query: "합성" }), principal);
      expect(result.resolution).toBe(resolution); expect(result.image).toBeNull(); expect(result.product).toBeNull();
      expect(JSON.stringify(result.candidates)).not.toMatch(/PRIVATE|photoId/);
    }
    expect(f.read).not.toHaveBeenCalled();
  });
  it("preserves no-photo and rejects conflicting selectors", async () => {
    const f = setup(); f.read.mockResolvedValueOnce({ product: { productId: product.productId, name: product.name, manufacturer: "", specification: "", status: "active" }, photo: null });
    expect((await f.queries.inventoryPhoto(inventoryPhotoInput.parse({ productId: product.productId }), principal)).resolution).toBe("no_photo");
    for (const input of [{}, { query: "a", productId: "p" }, { query: "a", photoId: id }, { productId: "p", afterId: "next" }, { productId: "../x" }]) expect(inventoryPhotoInput.safeParse(input).success).toBe(false);
  });
  it("maps known Storage failures without leaking dependency details", () => {
    for (const [code, expected] of [[404, "NOT_FOUND"], [503, "TEMPORARY_UNAVAILABLE"], [403, "INTERNAL_ERROR"]] as const) {
      const detail = mcpError(new InventoryPhotoDependencyError("storage-read", Object.assign(new Error("PRIVATE PATH"), { code })));
      expect(detail.code).toBe(expected); expect(JSON.stringify(detail)).not.toContain("PRIVATE");
    }
  });
});
