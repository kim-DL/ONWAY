// Shared by the app shell without loading stock command validation.
export const INVENTORY_LOCATIONS = ["refrigerated", "freezer1", "freezer2", "sample"] as const;
export const INVENTORY_LOCATION_LABELS = { refrigerated: "냉장", freezer1: "냉동1", freezer2: "냉동2", sample: "샘플" } as const;
export function inventoryUnitDisplayLabel(unitLabel: string): string {
  return unitLabel === "개" ? "낱개" : unitLabel;
}
