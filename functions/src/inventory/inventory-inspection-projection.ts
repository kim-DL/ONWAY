import type { InventoryEvent, InventoryLocation, InventoryLot } from "./inventory-contract.js";
import type { InventoryLotChecks, InventoryProductRecord } from "./inventory-stock-summary.js";

export function projectInventoryInspection({ product, lots, lines, kind, locationId, cycleId, now, employeeId }: {
  product: InventoryProductRecord;
  lots: InventoryLot[];
  lines: InventoryEvent["lines"];
  kind: InventoryEvent["kind"];
  locationId: InventoryLocation;
  cycleId: string | null;
  now: Date;
  employeeId: string;
}) {
  const quantityChanged = lines.some((line) => line.delta !== 0);
  // Metadata edits can change the nearest expiry without changing quantity.
  const stockRevision = product.stockRevision + (quantityChanged || kind === "lot_update" ? 1 : 0);
  const lastCountByLocation = { ...product.lastCountByLocation };
  for (const location of new Set(lines.filter((line) => line.delta !== 0).map((line) => line.locationId))) {
    const previous = lastCountByLocation[location];
    if (previous) lastCountByLocation[location] = { ...previous, stockChangedSinceCount: true };
  }
  const inspectionByLot: InventoryLotChecks = { ...product.inspectionByLot };
  // Migrate a legacy full-location confirmation lazily inside a stock write.
  // Use BEFORE quantities, otherwise a newly received lot would be falsely
  // inherited as checked merely because the old location was complete.
  if (product.inspectionByLot === undefined) for (const lot of lots) {
    const before = lines.find((line) => line.lotId === lot.lotId)?.before ?? lot.quantity;
    const summary = product.lastCountByLocation[lot.locationId];
    if (before > 0 && summary && !summary.stockChangedSinceCount) inspectionByLot[lot.lotId] = {
      cycleId: summary.cycleId, quantity: before, checkedAt: summary.checkedAt, checkedBy: summary.checkedBy, changed: summary.changed,
    };
  }
  for (const line of lines) {
    if (line.delta !== 0) delete inspectionByLot[line.lotId];
    if (cycleId) inspectionByLot[line.lotId] = { cycleId, quantity: line.after,
      checkedAt: now.toISOString(), checkedBy: employeeId, changed: line.delta !== 0 };
  }
  if (cycleId) for (const location of new Set([locationId, ...lines.map((line) => line.locationId)])) {
    const positive = lots.filter((lot) => lot.locationId === location && lot.quantity > 0);
    if (positive.every((lot) => inspectionByLot[lot.lotId]?.cycleId === cycleId && inspectionByLot[lot.lotId]?.quantity === lot.quantity)) {
      lastCountByLocation[location] = { cycleId, checkedAt: now.toISOString(), checkedBy: employeeId, stockRevision,
        changed: quantityChanged || positive.some((lot) => inspectionByLot[lot.lotId]?.changed), stockChangedSinceCount: false };
    }
  }
  // Exhausted lots retain their append-only events; the bounded working-set
  // confirmation map does not accumulate one entry per historical batch.
  const positiveIds = new Set(lots.filter((lot) => lot.quantity > 0).map((lot) => lot.lotId));
  for (const id of Object.keys(inspectionByLot)) if (!positiveIds.has(id)) delete inspectionByLot[id];
  return { quantityChanged, stockRevision, lastCountByLocation, inspectionByLot };
}
