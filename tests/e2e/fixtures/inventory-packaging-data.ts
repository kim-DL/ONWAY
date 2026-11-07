import { inventoryLocationMap, inventoryProductSchema, type InventoryMovementInput, type SaveInventoryProductInput } from "../../../src/domain/inventory";

export const product = inventoryProductSchema.parse({ productId: "sample-product", companyId: "onnuri", name: "검증용 만두 1kg", manufacturer: "", specification: "1000g", origin: "국내산", unitLabel: "봉", unitsPerBox: 1, boxPackSize: 10,
  defaultLocationId: "freezer1", note: "", urgent: false, status: "active", revision: 3, stockRevision: 2, hasHistory: true,
  quantityByLocation: { ...inventoryLocationMap(0), freezer1: 47 }, nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null), photo: null,
  createdAt: "2026-11-07T00:00:00.000Z", updatedAt: "2026-11-07T00:00:00.000Z", createdBy: "fixture", updatedBy: "fixture" });
export const detail = { product, lots: [{ lotId: "sample-lot", originLotId: "sample-lot", productId: product.productId, locationId: "freezer1" as const, label: "", expiryState: "dated" as const, expiryDate: "2027-01-01", quantity: 47, revision: 1, createdAt: product.createdAt, updatedAt: product.updatedAt }] };
export const inventoryErrorMessage = () => "검증 중 오류";
const capture = (input: unknown) => { document.documentElement.dataset.saved = JSON.stringify(input); };
export const inventoryRepository = {
  save: async (input: SaveInventoryProductInput) => { capture(input); return { ...product, ...input.draft }; },
  movement: async (input: InventoryMovementInput) => { capture(input); return { product, replayed: false }; },
};
