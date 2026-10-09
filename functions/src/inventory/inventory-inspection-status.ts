import { INVENTORY_LOCATIONS, inventoryLocationMap, type InventoryContext, type InventoryLocation, type InventoryProduct } from "./inventory-contract.js";

/** Shared by the PWA and server reports; the default location includes zero-stock checks. */
export function inventoryLocationsFor(product: InventoryProduct): InventoryLocation[] {
  return INVENTORY_LOCATIONS.filter((location) => location === product.defaultLocationId || product.quantityByLocation[location] > 0);
}
export type InventoryCountState = "done" | "changed" | "pending";
export function inventoryCountState(product: InventoryProduct, location: InventoryLocation, cycleId: string): InventoryCountState {
  const count = product.lastCountByLocation[location];
  if (!count || count.cycleId !== cycleId) return "pending";
  return count.stockChangedSinceCount ? "changed" : "done";
}
export function inventoryCountEligible(product: InventoryProduct, context: Pick<InventoryContext, "cycle">): boolean {
  const created = Date.parse(product.createdAt);
  if (!Number.isFinite(created)) return false;
  return new Date(created + 9 * 60 * 60 * 1_000).toISOString().slice(0, 10) <= context.cycle.startDate;
}

/** PWA completion summary; may include stock movements, so this is not a button log. */
export function inventoryLocationConfirmations(product: InventoryProduct) {
  const stocktakeByLocation = inventoryLocationMap<{ checkedAt: string; stockChangedSinceCount: boolean } | null>(null);
  for (const location of INVENTORY_LOCATIONS) {
    const count = product.lastCountByLocation[location];
    if (!count) continue;
    stocktakeByLocation[location] = { checkedAt: count.checkedAt, stockChangedSinceCount: count.stockChangedSinceCount };
  }
  return { stocktakeByLocation };
}
