import { HttpsError } from "firebase-functions/v2/https";
import { inventoryLocationMap, inventoryQuantitySchema, type InventoryLot } from "./inventory-contract.js";

export function activeSortedLots(lots: InventoryLot[]) {
  return lots.filter((lot) => lot.quantity > 0).sort((a, b) => a.locationId.localeCompare(b.locationId)
    || (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999") || a.lotId.localeCompare(b.lotId));
}
export function ensureQuantity(quantity: number): number {
  const parsed = inventoryQuantitySchema.safeParse(quantity);
  if (!parsed.success) throw new HttpsError("failed-precondition", "재고가 부족하거나 허용 수량을 초과합니다.", { reason: "inventory-quantity" });
  return parsed.data;
}
export function summarizeInventoryLots(lots: InventoryLot[]) {
  const quantityByLocation = inventoryLocationMap(0);
  const nearestExpiryByLocation = inventoryLocationMap<string | null>(null);
  for (const lot of lots) {
    if (lot.quantity <= 0) continue;
    quantityByLocation[lot.locationId] = ensureQuantity(quantityByLocation[lot.locationId] + lot.quantity);
    const current = nearestExpiryByLocation[lot.locationId];
    if (lot.expiryDate && (!current || lot.expiryDate < current)) nearestExpiryByLocation[lot.locationId] = lot.expiryDate;
  }
  return { quantityByLocation, nearestExpiryByLocation };
}
