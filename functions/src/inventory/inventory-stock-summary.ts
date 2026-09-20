import { z } from "zod";
import {
  INVENTORY_LOCATIONS, INVENTORY_MAX_LOTS, inventoryIdSchema, inventoryLocationMap,
  inventoryLotSummarySchema, inventoryProductSchema, inventoryQuantitySchema,
  type InventoryLot, type InventoryLotSummary, type InventoryProduct,
} from "./inventory-contract.js";

export const inventoryLotChecksSchema = z.record(inventoryIdSchema, z.object({
  cycleId: inventoryIdSchema, quantity: inventoryQuantitySchema,
  checkedAt: z.iso.datetime(), checkedBy: inventoryIdSchema, changed: z.boolean(),
}).strict()).refine((value) => Object.keys(value).length <= INVENTORY_MAX_LOTS);
export type InventoryLotChecks = z.infer<typeof inventoryLotChecksSchema>;
export type InventoryProductRecord = InventoryProduct & { inspectionByLot?: InventoryLotChecks };

// The internal inspection ledger is not a public product field. Explicitly
// separate it before strict wire validation; never forward arbitrary DB fields.
export function inventoryProductRecord(data: Record<string, unknown>): InventoryProductRecord {
  const { inspectionByLot, ...wire } = data;
  return { ...inventoryProductSchema.parse(wire),
    ...(inspectionByLot === undefined ? {} : { inspectionByLot: inventoryLotChecksSchema.parse(inspectionByLot) }) };
}
export function inventoryProductWire(record: InventoryProductRecord): InventoryProduct {
  const { inspectionByLot: _privateChecks, ...wire } = record;
  void _privateChecks;
  return inventoryProductSchema.parse(wire);
}

export function summarizeInventoryLotGroups(lots: InventoryLot[]): InventoryLotSummary {
  const positive = lots.filter((lot) => lot.quantity > 0);
  const counts = (items: InventoryLot[]) => ({ lotCount: items.length,
    expiryCount: new Set(items.map((lot) => lot.expiryState === "dated" ? `dated:${lot.expiryDate}` : lot.expiryState)).size });
  const byLocation = inventoryLocationMap({ lotCount: 0, expiryCount: 0 });
  for (const location of INVENTORY_LOCATIONS) byLocation[location] = counts(positive.filter((lot) => lot.locationId === location));
  return inventoryLotSummarySchema.parse({ all: counts(positive), byLocation });
}

// Older installed clients validate strict objects, so new fields must be sent
// only when requested. Do not strip unrelated fields or change stored receipts.
export function inventorySummaryResponse(value: unknown, includeSummary: boolean): unknown {
  if (includeSummary || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => inventorySummaryResponse(item, false));
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "lotSummary")
    .map(([key, item]) => [key, inventorySummaryResponse(item, false)]));
}
