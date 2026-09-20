import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inventoryLocationMap, inventoryProductSchema, type InventoryProduct } from "@/domain/inventory";

const mock = vi.hoisted(() => ({ services: { auth: { currentUser: { uid: "employee-1" } as { uid: string } | null }, functions: {} }, invoke: vi.fn() }));
vi.mock("client-only", () => ({}));
vi.mock("@/lib/firebase/client", () => ({ getFirebaseClientServices: () => mock.services }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_functions: unknown, name: string) => (input: unknown) => mock.invoke(name, input) }));
import { inventoryErrorMessage, inventoryRepository } from "./inventory-repository";

function product(productId = "product-1"): InventoryProduct {
  return inventoryProductSchema.parse({ productId, companyId: "onnuri", name: "검증용 닭가슴살", manufacturer: "", specification: "", origin: "", unitLabel: "봉", unitsPerBox: 10, defaultLocationId: "refrigerated", note: "", urgent: false, status: "active", revision: 0, stockRevision: 0, hasHistory: false, quantityByLocation: inventoryLocationMap(0), nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null), photo: null, createdAt: "2026-09-10T01:00:00.000Z", updatedAt: "2026-09-10T01:00:00.000Z", createdBy: "employee-1", updatedBy: "employee-1" });
}
beforeEach(() => { mock.invoke.mockReset(); mock.services.auth.currentUser = { uid: "employee-1" }; });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("inventory callable boundary", () => {
  it("requests summaries with detail and metadata writes while accepting legacy products that have no summary yet", async () => {
    mock.invoke.mockResolvedValueOnce({ data: { product: product(), lots: [] } }).mockResolvedValueOnce({ data: product() });
    const result = await inventoryRepository.detail("product-1");
    expect(result.product).not.toHaveProperty("lotSummary");
    await inventoryRepository.save({ requestId: "41bd2065-a415-4e30-8b97-3dca1f8a66cc", productId: "product-1", expectedRevision: 0,
      draft: { name: "품목", manufacturer: "", specification: "", origin: "", unitLabel: "봉", unitsPerBox: 10, defaultLocationId: "refrigerated", note: "", urgent: false } });
    expect(mock.invoke.mock.calls[0]).toEqual(["getInventoryProduct", { productId: "product-1", includeSummary: true }]);
    expect(mock.invoke.mock.calls[1]![1]).toMatchObject({ includeSummary: true });
  });
  it("requests the thumbnail variant only when explicitly selected and keeps detail previews unchanged", async () => {
    const photoId = "37f53804-77f5-49e7-82ae-bdbf7c6f7bc9";
    mock.invoke.mockResolvedValue({ data: { contentType: "image/webp", byteSize: 3, fileBase64: "YWJj" } });
    await inventoryRepository.photo("product-1", photoId, "thumbnail");
    await inventoryRepository.photo("product-1", photoId);
    expect(mock.invoke.mock.calls).toEqual([
      ["getInventoryPhoto", { productId: "product-1", photoId, variant: "thumbnail" }],
      ["getInventoryPhoto", { productId: "product-1", photoId, variant: "preview" }],
    ]);
  });
  it("loads all bounded pages, deduplicates rows and does not fetch photos", async () => {
    mock.invoke.mockResolvedValueOnce({ data: { products: [product()], nextCursor: "product-1" } }).mockResolvedValueOnce({ data: { products: [product(), product("product-2")], nextCursor: null } });
    const rows = await inventoryRepository.list();
    expect(rows.map((row) => row.productId)).toEqual(["product-1", "product-2"]);
    expect(mock.invoke.mock.calls).toEqual([["listInventoryProducts", { afterId: null, includeSummary: true }], ["listInventoryProducts", { afterId: "product-1", includeSummary: true }]]);
  });
  it("publishes each accumulated page without adding requests", async () => {
    mock.invoke.mockResolvedValueOnce({ data: { products: [product()], nextCursor: "product-1" } }).mockResolvedValueOnce({ data: { products: [product("product-2")], nextCursor: null } });
    const progress: Array<{ ids: string[]; pageCount: number; complete: boolean }> = [];
    const rows = await inventoryRepository.list((products, state) => progress.push({ ids: products.map((item) => item.productId), ...state }));
    expect(progress).toEqual([
      { ids: ["product-1"], pageCount: 1, complete: false },
      { ids: ["product-1", "product-2"], pageCount: 2, complete: true },
    ]);
    expect(rows.map((row) => row.productId)).toEqual(["product-1", "product-2"]);
    expect(mock.invoke).toHaveBeenCalledTimes(2);
  });
  it.each([{ total: 500, pages: 5 }, { total: 1_000, pages: 10 }])("separates first-page T2 from all $pages pages for $total products", async ({ total, pages }) => {
    vi.useFakeTimers();
    const catalog = Array.from({ length: total }, (_, index) => product(`product-${String(index + 1).padStart(4, "0")}`));
    let request = 0;
    mock.invoke.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const page = request++;
      return { data: { products: catalog.slice(page * 100, (page + 1) * 100), nextCursor: page + 1 < pages ? `cursor-${page + 1}` : null } };
    });
    const startedAt = Date.now();
    let firstUsableAt: number | null = null;
    const loading = inventoryRepository.list((_products, progress) => {
      if (progress.pageCount === 1) firstUsableAt = Date.now() - startedAt;
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(firstUsableAt).toBe(300);
    await vi.runAllTimersAsync();
    await expect(loading).resolves.toHaveLength(total);
    expect(Date.now() - startedAt).toBe(pages * 300);
    expect(mock.invoke).toHaveBeenCalledTimes(pages);
  });
  it("rejects repeated cursors instead of silently looping", async () => {
    mock.invoke.mockResolvedValue({ data: { products: [product()], nextCursor: "product-1" } });
    await expect(inventoryRepository.list()).rejects.toThrow("pagination");
    expect(mock.invoke).toHaveBeenCalledTimes(2);
  });
  it("does not return private data after the signed-in account changes", async () => {
    mock.invoke.mockImplementation(async () => { mock.services.auth.currentUser = { uid: "different-employee" }; return { data: { products: [product()], nextCursor: null } }; });
    await expect(inventoryRepository.list()).rejects.toMatchObject({ code: "unauthenticated" });
  });
  it("never calls a backend without an authenticated account", async () => {
    mock.services.auth.currentUser = null;
    await expect(inventoryRepository.list()).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(inventoryRepository.context()).rejects.toMatchObject({ code: "unauthenticated" });
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it("rejects invalid adjustment inputs before making any write", () => {
    expect(() => inventoryRepository.movement({ requestId: "41bd2065-a415-4e30-8b97-3dca1f8a66cc", productId: "product-1", expectedStockRevision: 0, kind: "adjust", locationId: "refrigerated", lotId: "lot-1", quantity: -1, reason: "" })).toThrow();
    expect(mock.invoke).not.toHaveBeenCalled();
  });
  it("validates every returned product and exposes useful conflict/offline guidance", async () => {
    mock.invoke.mockResolvedValueOnce({ data: { products: [{ productId: "unvalidated" }], nextCursor: null } });
    await expect(inventoryRepository.list()).rejects.toThrow();
    expect(inventoryErrorMessage({ code: "functions/aborted" })).toContain("다른 직원");
    vi.stubGlobal("navigator", { onLine: false });
    expect(inventoryErrorMessage(new Error())).toContain("인터넷 연결");
  });
});
