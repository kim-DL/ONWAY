import { INVENTORY_LOCATIONS, inventoryLocationMap, type InventoryCycle, type InventoryProduct } from "./inventory-contract.js";
import { inventoryAlerts, inventoryTotalQuantity, type inventoryAlertWindow } from "./inventory-alerts.js";
import { inventoryCountEligible, inventoryCountState, inventoryLocationsFor } from "./inventory-inspection-status.js";

/** Bounded streaming summary. Only a few examples are retained, never a second catalog/cache. */
export function inventoryOverviewAccumulator(threshold: number, window: ReturnType<typeof inventoryAlertWindow>, cycle: InventoryCycle, exampleLimit: number) {
  const counts = { activeProducts: 0, zeroStockProducts: 0, lowStockProducts: 0, expiringProducts: 0, expiredProducts: 0,
    stocktake: { confirmed: 0, changed: 0, pending: 0, notDue: 0 }, stockedProductsByLocation: inventoryLocationMap(0),
    stocktakeByLocation: Object.fromEntries(INVENTORY_LOCATIONS.map((location) => [location,
      { confirmed: 0, changed: 0, pending: 0, notDue: 0 }])) as Record<typeof INVENTORY_LOCATIONS[number], { confirmed: number; changed: number; pending: number; notDue: number }> };
  const examples: { lowStock: InventoryProduct[]; expiring: InventoryProduct[]; stocktakePending: InventoryProduct[] } = { lowStock: [], expiring: [], stocktakePending: [] };
  const add = (rows: InventoryProduct[], product: InventoryProduct) => { if (rows.length < exampleLimit) rows.push(product); };
  return { counts, examples, include(product: InventoryProduct) {
    if (product.status !== "active") return;
    counts.activeProducts++;
    if (inventoryTotalQuantity(product) === 0) counts.zeroStockProducts++;
    for (const location of INVENTORY_LOCATIONS) if (product.quantityByLocation[location] > 0) counts.stockedProductsByLocation[location]++;
    const alerts = inventoryAlerts(product, threshold, window);
    if (alerts.lowStock) { counts.lowStockProducts++; add(examples.lowStock, product); }
    if (alerts.expiringLocations.length) { counts.expiringProducts++; add(examples.expiring, product); }
    if (alerts.expiredLocations.length) counts.expiredProducts++;
    const states = inventoryLocationsFor(product).map((location) => {
      const state = inventoryCountState(product, location, cycle.cycleId);
      const key = state === "done" ? "confirmed" : !inventoryCountEligible(product, { cycle }) ? "notDue" : state === "changed" ? "changed" : "pending";
      counts.stocktakeByLocation[location][key]++;
      return state;
    });
    if (states.every((state) => state === "done")) counts.stocktake.confirmed++;
    else if (!inventoryCountEligible(product, { cycle })) counts.stocktake.notDue++;
    else {
      counts.stocktake[states.includes("changed") ? "changed" : "pending"]++;
      add(examples.stocktakePending, product);
    }
  } };
}
