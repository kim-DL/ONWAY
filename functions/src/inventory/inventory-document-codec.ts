import { Timestamp, type DocumentData } from "firebase-admin/firestore";
import { defaultInventorySettings } from "./inventory-calendar.js";
import { inventoryLotSchema, inventorySettingsSchema,
  type InventoryLot, type InventoryProduct, type InventorySettings } from "./inventory-contract.js";
import { inventoryProductRecord, inventoryProductWire } from "./inventory-stock-summary.js";

function timestampToIso(value: unknown) { return value instanceof Timestamp ? value.toDate().toISOString() : value; }
export function datesFromDocument(value: DocumentData) {
  return { ...value, ...(value.createdAt !== undefined ? { createdAt: timestampToIso(value.createdAt) } : {}),
    ...(value.updatedAt !== undefined ? { updatedAt: timestampToIso(value.updatedAt) } : {}) };
}
export function persisted(value: Record<string, unknown>) {
  return { ...value, ...(typeof value.createdAt === "string" ? { createdAt: Timestamp.fromDate(new Date(value.createdAt)) } : {}),
    ...(typeof value.updatedAt === "string" ? { updatedAt: Timestamp.fromDate(new Date(value.updatedAt)) } : {}) };
}
export function inventoryProductFromDocument(data: DocumentData): InventoryProduct { return inventoryProductWire(inventoryProductRecord(datesFromDocument(data))); }
export function inventoryLotFromDocument(data: DocumentData): InventoryLot { return inventoryLotSchema.parse(datesFromDocument(data)); }
export function settingsFromDocument(data: DocumentData | undefined): InventorySettings {
  return data ? inventorySettingsSchema.parse(datesFromDocument(data)) : defaultInventorySettings();
}
