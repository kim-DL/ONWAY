import { beforeEach, describe, expect, it, vi } from "vitest";
import { inventoryLocationMap, inventoryProductSchema } from "@/domain/inventory";

const mock = vi.hoisted(() => ({ services: { auth: { currentUser: { uid: "employee-1" } as { uid: string } | null }, functions: {} }, invoke: vi.fn() }));
vi.mock("client-only", () => ({}));
vi.mock("@/lib/firebase/client", () => ({ getFirebaseClientServices: () => mock.services }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_functions: unknown, name: string) => (input: unknown) => mock.invoke(name, input) }));
import { inventoryManufacturerRepository } from "./inventory-manufacturer-repository";

const product = { ...inventoryProductSchema.parse({ productId: "product-1", companyId: "onnuri", name: "검증 상품", manufacturer: "정식 제조사", specification: "", origin: "", unitLabel: "봉", unitsPerBox: 1, defaultLocationId: "refrigerated", note: "", urgent: false, status: "active", revision: 1, stockRevision: 0, hasHistory: false, quantityByLocation: inventoryLocationMap(0), nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null), photo: null, createdAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z", createdBy: "EMP", updatedBy: "EMP" }), manufacturerId: "manufacturer-one" };

describe("inventory manufacturer repository", () => {
  beforeEach(() => { mock.invoke.mockReset(); mock.services.auth.currentUser = { uid: "employee-1" }; });

  it("uses one bounded list callable and a request-id protected create callable", async () => {
    mock.invoke.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: { manufacturerId: "manufacturer-one", name: "온누리 식품", normalizedName: "온누리식품", active: true, revision: 1, createdAt: product.createdAt, createdBy: "EMP", updatedAt: product.updatedAt } });
    await inventoryManufacturerRepository.list();
    await inventoryManufacturerRepository.create({ requestId: "41bd2065-a415-4e30-8b97-3dca1f8a66cc", name: "  온누리  식품  " });
    expect(mock.invoke.mock.calls[0]).toEqual(["listInventoryManufacturers", {}]);
    expect(mock.invoke.mock.calls[1]![0]).toBe("createInventoryManufacturer");
    expect(mock.invoke.mock.calls[1]![1]).toEqual({ requestId: "41bd2065-a415-4e30-8b97-3dca1f8a66cc", name: "온누리 식품" });
  });

  it("shares an in-flight list request across development remounts", async () => {
    let resolveList!: (value: { data: [] }) => void;
    mock.invoke.mockImplementationOnce(() => new Promise((resolve) => { resolveList = resolve; }));
    const first = inventoryManufacturerRepository.list();
    const second = inventoryManufacturerRepository.list();
    expect(mock.invoke).toHaveBeenCalledTimes(1);
    resolveList({ data: [] });
    await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
  });

  it("opts in only for reference reads and manufacturer-aware saves, including explicit clear", async () => {
    mock.invoke.mockResolvedValueOnce({ data: { product, lots: [] } }).mockResolvedValueOnce({ data: product }).mockResolvedValueOnce({ data: { ...product, manufacturer: "", manufacturerId: undefined } });
    await expect(inventoryManufacturerRepository.reference(product.productId)).resolves.toMatchObject({ product: { manufacturerId: "manufacturer-one" } });
    const base = { requestId: "41bd2065-a415-4e30-8b97-3dca1f8a66cc", productId: product.productId, expectedRevision: 1,
      draft: { name: product.name, manufacturer: product.manufacturer, manufacturerId: product.manufacturerId, specification: "", origin: "", unitLabel: "봉", unitsPerBox: 1, defaultLocationId: "refrigerated" as const, note: "", urgent: false } };
    await inventoryManufacturerRepository.saveProduct(base);
    const clear = { ...base, requestId: "51bd2065-a415-4e30-8b97-3dca1f8a66cc", clearManufacturerReference: true,
      draft: { ...base.draft, manufacturer: "", manufacturerId: undefined } };
    await inventoryManufacturerRepository.saveProduct(clear);
    expect(mock.invoke.mock.calls[0]).toEqual(["getInventoryProduct", { productId: product.productId, includeManufacturerReference: true }]);
    expect(mock.invoke.mock.calls[1]![1]).toMatchObject({ includeManufacturerReference: true, draft: { manufacturerId: "manufacturer-one" } });
    expect(mock.invoke.mock.calls[2]![1]).toMatchObject({ includeManufacturerReference: true, clearManufacturerReference: true, draft: { manufacturer: "", manufacturerId: undefined } });
  });
});
