import { inventoryLocationMap, type InventoryContext, type InventoryProduct } from "../../../src/domain/inventory";
import type { AuthenticatedSession } from "../../../src/features/auth/auth-context";
import { inventoryKoreaDate } from "../../../src/features/inventory/inventory-calendar";

const readOnly = new URLSearchParams(location.search).has("readonly");
export const session = { uid: "inventory-settings-fixture", displayName: "테스트 직원", claims: {
  employeeId: "TEST-INVENTORY", roleScopes: readOnly ? ["viewer"] : ["delivery"], sessionVersion: 1, permissionsVersion: 1,
} } as AuthenticatedSession;
export const context = { today: inventoryKoreaDate(), canWrite: !readOnly, canAdmin: false,
  settings: { urgentDays: 7, weekday: 1, revision: 1 },
  cycle: { cycleId: "fixture-cycle", startDate: "2026-01-01", nextDate: "2099-01-01", weekday: 1 },
} as InventoryContext;
export const products = Array.from({length: 80}, (_, index) => ({
  productId: `item-${index}`, name: `샘플 식품 ${String(index + 1).padStart(3, "0")}`, manufacturer: "테스트 제조사",
  status: "active", unitLabel: "봉", defaultLocationId: "freezer1", revision: 1, stockRevision: 1,
  quantityByLocation: {...inventoryLocationMap(0), freezer1: index + 1},
  nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null),
}) as InventoryProduct);

export const inventoryRepository = {
  context: async () => { if (new URLSearchParams(location.search).has("error")) throw new Error("합성 조회 실패"); return context; },
  list: async () => products,
};
export const inventoryErrorMessage = () => "합성 조회 실패";
