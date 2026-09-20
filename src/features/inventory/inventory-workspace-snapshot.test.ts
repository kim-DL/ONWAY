import { afterEach, describe, expect, it, vi } from "vitest";

import { inventoryLocationMap, type InventoryContext, type InventoryProduct } from "@/domain/inventory";

import {
  clearInventoryWorkspaceSnapshot, commitInventoryCatalog, discardInventoryWorkspaceCatalog, getInventoryWorkspaceSession,
  subscribeInventoryCatalog, updateInventorySnapshotProduct, updateInventoryWorkspaceUi,
} from "./inventory-workspace-snapshot";
import { readRecentInventoryManufacturers, rememberInventoryManufacturer } from "./inventory-manufacturer-session";

const context = { today: "2026-09-20", settings: { urgentDays: 7 } } as InventoryContext;
const product = (revision = 1) => ({
  productId: "product-1", name: `품목 ${revision}`, status: "active", revision, stockRevision: revision,
  quantityByLocation: inventoryLocationMap(0), nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null),
} as InventoryProduct);

afterEach(() => clearInventoryWorkspaceSnapshot());

describe("inventory workspace memory snapshot", () => {
  it("keeps five deduplicated recent manufacturers only inside the current session namespace", () => {
    getInventoryWorkspaceSession("session-a");
    for (let index = 1; index <= 6; index += 1) rememberInventoryManufacturer("session-a", { manufacturerId: `m-${index}`, name: `제조사 ${index}` });
    rememberInventoryManufacturer("session-a", { manufacturerId: "m-4", name: "제조사 4 최신" });
    expect(readRecentInventoryManufacturers("session-a").map((item) => item.manufacturerId)).toEqual(["m-4", "m-6", "m-5", "m-3", "m-2"]);
    expect(readRecentInventoryManufacturers("session-b")).toEqual([]);
    getInventoryWorkspaceSession("session-b");
    expect(readRecentInventoryManufacturers("session-a")).toEqual([]);
    expect(readRecentInventoryManufacturers("session-b")).toEqual([]);
    rememberInventoryManufacturer("session-b", { manufacturerId: "m-b", name: "다른 세션" });
    clearInventoryWorkspaceSnapshot();
    expect(readRecentInventoryManufacturers("session-b")).toEqual([]);
  });
  it("stores only catalog and list UI for one namespace", () => {
    getInventoryWorkspaceSession("A:1:1");
    commitInventoryCatalog("A:1:1", { context, products: [product()], observedDate: context.today, freshness: "fresh", lastSuccessAt: 1_000 });
    updateInventoryWorkspaceUi("A:1:1", { location: "freezer1", query: "만두", urgentOnly: true, showInactive: true, limit: 180, scrollTop: 920 });
    expect(getInventoryWorkspaceSession("A:1:1").snapshot).toMatchObject({
      catalog: { products: [product()] },
      ui: { location: "freezer1", query: "만두", urgentOnly: true, showInactive: true, limit: 180, scrollTop: 920 },
    });

    expect(getInventoryWorkspaceSession("B:1:1").snapshot.catalog).toBeNull();
    expect(getInventoryWorkspaceSession("A:1:1").snapshot.catalog).toBeNull();
  });

  it("writes a committed mutation into the snapshot before re-entry", () => {
    getInventoryWorkspaceSession("A:1:1");
    commitInventoryCatalog("A:1:1", { context, products: [product()], observedDate: context.today, freshness: "fresh", lastSuccessAt: 1_000 });
    updateInventorySnapshotProduct("A:1:1", product(2));
    expect(getInventoryWorkspaceSession("A:1:1").snapshot.catalog?.products).toEqual([product(2)]);
  });

  it("ignores a late catalog commit from an invalidated namespace", () => {
    getInventoryWorkspaceSession("A:1:1");
    getInventoryWorkspaceSession("A:2:1");

    commitInventoryCatalog("A:1:1", { context, products: [product()], observedDate: context.today, freshness: "fresh", lastSuccessAt: 2_000 });
    expect(getInventoryWorkspaceSession("A:2:1").snapshot.catalog).toBeNull();
  });

  it("publishes progress only from the current reconciler generation", () => {
    const first = getInventoryWorkspaceSession("A:1:1");
    const oldReconciler = first.reconciler;
    const listener = vi.fn();
    const unsubscribe = subscribeInventoryCatalog("A:1:1", listener);
    expect(commitInventoryCatalog("A:1:1", { context: null, products: [product()], observedDate: context.today, freshness: "refreshing", lastSuccessAt: null }, oldReconciler)).toBe(true);
    expect(listener).toHaveBeenCalledOnce();

    discardInventoryWorkspaceCatalog("A:1:1");
    expect(commitInventoryCatalog("A:1:1", { context, products: [product(2)], observedDate: context.today, freshness: "fresh", lastSuccessAt: 2_000 }, oldReconciler)).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
