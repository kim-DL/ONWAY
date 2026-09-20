import { INVENTORY_LOCATIONS, INVENTORY_LOCATION_LABELS, inventoryLotChangeSchema, inventoryStatusChangeSchema, type InventoryLocation, type InventoryLotDraft } from "../inventory/inventory-contract.js";

const STATUS_LABELS = { active: "사용 중", inactive: "비활성", deleted: "삭제" } as const;
function quantityLabel(quantities: Record<InventoryLocation, number>, unit: string) {
  return INVENTORY_LOCATIONS.filter((location) => quantities[location] > 0)
    .map((location) => `${INVENTORY_LOCATION_LABELS[location]} ${quantities[location].toLocaleString("ko-KR")}${unit}`).join(" · ") || `0${unit}`;
}
function expiryLabel(lot: InventoryLotDraft) {
  return `${lot.expiryDate ?? (lot.expiryState === "not_applicable" ? "해당 없음" : "미확인")}${lot.label ? ` (${lot.label})` : ""}`;
}

/** Keep the existing strict admin wire shape while displaying trusted snapshots. */
export function inventoryAuditSummary(data: Record<string, unknown>, originalReason: string | null): string | null {
  let summary = "";
  if (data.eventType === "INVENTORY_PRODUCT_STATUS_CHANGED" || data.eventType === "INVENTORY_PRODUCT_DELETED") {
    const parsed = inventoryStatusChangeSchema.safeParse(data.inventoryStatusChange);
    if (parsed.success) {
      const { productName, unitLabel, before, after } = parsed.data;
      const unchanged = INVENTORY_LOCATIONS.every((location) => before.quantityByLocation[location] === after.quantityByLocation[location]);
      summary = `${productName} · ${STATUS_LABELS[before.status]} → ${STATUS_LABELS[after.status]} · ${unchanged ? "재고 보존: " : `${quantityLabel(before.quantityByLocation, unitLabel)} → `}${quantityLabel(after.quantityByLocation, unitLabel)}`;
    }
  } else if (data.eventType === "INVENTORY_LOT_UPDATE") {
    const parsed = inventoryLotChangeSchema.safeParse(data.inventoryLotChange);
    if (parsed.success) summary = `${parsed.data.productName} · 유통기한 ${expiryLabel(parsed.data.before)} → ${expiryLabel(parsed.data.after)}`;
  }
  return summary ? `${summary}${originalReason ? `\n사유: ${originalReason.slice(0, 2_000)}` : ""}` : originalReason;
}
