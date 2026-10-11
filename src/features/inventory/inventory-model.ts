import { INVENTORY_LOCATIONS, INVENTORY_MAX_QUANTITY, inventoryExpiryDays, type InventoryContext, type InventoryLocation, type InventoryLot, type InventoryProduct } from "@/domain/inventory";

export { inventoryInitials, inventorySearchText, inventorySearchMatcher, matchesInventorySearch } from "../../../functions/src/inventory/inventory-search";
import { inventoryLocationsFor, inventoryCountState, inventoryCountEligible } from "../../../functions/src/inventory/inventory-inspection-status";
export { inventoryLocationsFor, inventoryCountState, inventoryCountEligible, type InventoryCountState } from "../../../functions/src/inventory/inventory-inspection-status";
import type { InventoryCountState } from "../../../functions/src/inventory/inventory-inspection-status";
export type InventoryLocationFilter = InventoryLocation | "all";

export function inventoryUnitDisplayLabel(unitLabel: string): string {
  return unitLabel === "개" ? "낱개" : unitLabel;
}
/** One product per all-location row; stock and completion retain their location boundaries. */
export function inventoryScope(product: InventoryProduct, location: InventoryLocationFilter) {
  const locations = location === "all" ? inventoryLocationsFor(product) : [location];
  const stockedLocations = locations.filter((item) => product.quantityByLocation[item] > 0);
  const expiryDate = stockedLocations.map((item) => product.nearestExpiryByLocation[item]).filter((date): date is string => !!date).sort()[0] ?? null;
  return { locations, quantity: locations.reduce((sum, item) => sum + product.quantityByLocation[item], 0), expiryDate };
}
export function inventoryOpeningLocation(product: InventoryProduct, location: InventoryLocationFilter): InventoryLocation {
  if (location !== "all") return location;
  return product.quantityByLocation[product.defaultLocationId] > 0 ? product.defaultLocationId
    : INVENTORY_LOCATIONS.find((item) => product.quantityByLocation[item] > 0) ?? product.defaultLocationId;
}
export function inventoryScopeCountState(product: InventoryProduct, location: InventoryLocationFilter, cycleId: string): InventoryCountState {
  const states = inventoryScope(product, location).locations.map((item) => inventoryCountState(product, item, cycleId));
  return states.every((state) => state === "done") ? "done" : states.includes("changed") ? "changed" : "pending";
}
/** Continue the visible count scope, including a product's remaining locations. */
export function inventoryNextCountTarget(rows: readonly InventoryProduct[], saved: InventoryProduct, checkedLocation: InventoryLocation, scope: InventoryLocationFilter, context: InventoryContext): { productId: string; location: InventoryLocation } | null {
  const pending = (product: InventoryProduct, exclude?: InventoryLocation) => product.status === "active" && inventoryCountEligible(product, context)
    ? (scope === "all" ? inventoryLocationsFor(product) : [scope]).find((location) => location !== exclude && inventoryCountState(product, location, context.cycle.cycleId) !== "done") : undefined;
  const remaining = pending(saved, checkedLocation);
  if (remaining) return { productId: saved.productId, location: remaining };
  const current = rows.findIndex((product) => product.productId === saved.productId);
  for (let offset = 1; offset <= rows.length; offset++) {
    const item = rows[(current + offset) % rows.length]!;
    if (item.productId === saved.productId) continue;
    const location = pending(item);
    if (location) return { productId: item.productId, location };
  }
  return null;
}
export function inventoryScopeIsUrgent(product: InventoryProduct, location: InventoryLocationFilter, today: string, urgentDays: number): boolean {
  return inventoryScope(product, location).locations.some((item) => inventoryIsUrgent(product, item, today, urgentDays));
}
export const INVENTORY_COUNT_LABELS = { done: "이번 주 확인", changed: "변동 후 미확인", pending: "미확인" } as const;
export function inventoryCountBadgeState(product: InventoryProduct, location: InventoryLocationFilter, context: InventoryContext | null, countMode = false): InventoryCountState | null {
  if (!context || product.status !== "active") return null;
  const state = inventoryScopeCountState(product, location, context.cycle.cycleId);
  if (state === "done") return state;
  return inventoryCountEligible(product, context) && (countMode || context.today === context.cycle.startDate) ? state : null;
}
export function inventoryExpiryGroupCount(product: InventoryProduct, location: InventoryLocationFilter): number | null {
  if (!product.lotSummary) return null;
  return location === "all" ? product.lotSummary.all.expiryCount : product.lotSummary.byLocation[location].expiryCount;
}
/** Outstanding work is emphasized only on the scheduled KST count day. */
export function inventoryCardHighlight(state: InventoryCountState, context: InventoryContext | null): "done" | "pending" | "neutral" {
  if (!context) return "neutral";
  if (state === "done") return "done";
  return context.today === context.cycle.startDate ? "pending" : "neutral";
}
export function inventoryLotDateLabel(lot: Pick<InventoryLot, "expiryDate" | "expiryState">): string {
  return lot.expiryDate?.replaceAll("-", ".") ?? (lot.expiryState === "not_applicable" ? "유통기한 해당 없음" : "유통기한 미확인");
}
export function inventoryExpiryLabel(date: string | null, today: string): string {
  const days = inventoryExpiryDays(date, today);
  if (days === null) return "날짜 미등록";
  if (days < 0) return `기한 ${Math.abs(days)}일 지남`;
  return days === 0 ? "D-day" : `D-${days}`;
}
export function inventoryIsUrgent(product: InventoryProduct, location: InventoryLocation, today: string, urgentDays: number): boolean {
  const days = inventoryExpiryDays(product.nearestExpiryByLocation[location], today);
  return product.quantityByLocation[location] > 0 && days !== null && days <= urgentDays;
}
/** A display-only projection; the server rechecks both locations atomically. */
export function inventoryTransferPreview(product: InventoryProduct, lot: InventoryLot | undefined, from: InventoryLocation, to: InventoryLocation | "", quantity: number): { sourceAfter: number; destinationAfter: number } | null {
  if (!lot || lot.productId !== product.productId || lot.locationId !== from || !to || from === to
    || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > lot.quantity) return null;
  const sourceAfter = product.quantityByLocation[from] - quantity;
  const destinationAfter = product.quantityByLocation[to] + quantity;
  return sourceAfter >= 0 && destinationAfter <= INVENTORY_MAX_QUANTITY ? { sourceAfter, destinationAfter } : null;
}
