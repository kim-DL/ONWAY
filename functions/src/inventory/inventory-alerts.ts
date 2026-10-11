import { INVENTORY_LOCATIONS, type InventoryProduct } from "./inventory-contract.js";
import { inventoryToday } from "./inventory-calendar.js";

export function inventoryTotalQuantity(product: InventoryProduct) {
  return INVENTORY_LOCATIONS.reduce((sum, location) => sum + product.quantityByLocation[location], 0);
}
export function inventoryAlertWindow(days: number, now: Date) {
  const today = inventoryToday(now);
  const throughDate = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  return { today, throughDate };
}
export function inventoryAlerts(product: InventoryProduct, threshold: number, window: ReturnType<typeof inventoryAlertWindow>) {
  const expiringLocations = INVENTORY_LOCATIONS.filter((location) => product.quantityByLocation[location] > 0
    && product.nearestExpiryByLocation[location] !== null && product.nearestExpiryByLocation[location]! <= window.throughDate);
  return { lowStock: inventoryTotalQuantity(product) <= threshold, expiringLocations,
    expiredLocations: expiringLocations.filter((location) => product.nearestExpiryByLocation[location]! < window.today) };
}
