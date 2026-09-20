import { describe, expect, it } from "vitest";
import { inventoryLocationMap, inventoryProductSchema, type InventoryProduct } from "@/domain/inventory";
import { InventoryListReconciler } from "./inventory-list-reconciler";

const session = "employee-1:1:1";
function product(overrides: Partial<InventoryProduct> = {}): InventoryProduct {
  return inventoryProductSchema.parse({ productId: "product-1", companyId: "onnuri", name: "냉장 만두", manufacturer: "온누리", specification: "1kg", origin: "국내산",
    unitLabel: "봉", unitsPerBox: 8, defaultLocationId: "refrigerated", note: "", urgent: false, status: "active", revision: 2, stockRevision: 3, hasHistory: true,
    quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 19 }, nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null),
    photo: null, createdAt: "2026-09-10T01:00:00.000Z", updatedAt: "2026-09-10T01:00:00.000Z", createdBy: "employee-1", updatedBy: "employee-1", ...overrides });
}

describe("inventory catalog read/write reconciliation", () => {
  it("preserves a confirmed receipt or count that completes while reconnect is reading older pages", () => {
    const reconciler = new InventoryListReconciler(session);
    const stale = product();
    const saved = product({ stockRevision: 4, quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 23 },
      lastCountByLocation: { ...inventoryLocationMap(null), refrigerated: { cycleId: "week-2026-09-11", checkedAt: "2026-09-11T02:00:00.000Z",
        checkedBy: "employee-1", stockRevision: 4, changed: true, stockChangedSinceCount: false } } });
    expect(reconciler.begin()).toBe(true);
    expect(reconciler.record(session, saved)).toBe(true);
    expect(reconciler.reconcile([stale])).toEqual([saved]);
    expect(stale.quantityByLocation.refrigerated).toBe(19);
  });

  it("does not mistake independent metadata and stock revisions for one ordering counter", () => {
    const reconciler = new InventoryListReconciler(session);
    const snapshot = product({ revision: 200, stockRevision: 3 });
    const saved = product({ revision: 200, stockRevision: 4, quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 15 } });
    reconciler.begin(); reconciler.record(session, saved);
    expect(reconciler.reconcile([snapshot])).toEqual([saved]);
    reconciler.finish(); reconciler.begin();
    const renamed = product({ revision: 201, stockRevision: 4, name: "교체된 상품명", quantityByLocation: saved.quantityByLocation });
    reconciler.record(session, renamed);
    expect(reconciler.reconcile([saved])).toEqual([renamed]);
  });

  it("keeps a newly registered product omitted by a catalog snapshot and never duplicates an included one", () => {
    const reconciler = new InventoryListReconciler(session);
    const existing = product();
    const created = product({ productId: "new-product", revision: 1, stockRevision: 1 });
    reconciler.begin(); reconciler.record(session, created);
    expect(reconciler.reconcile([existing])).toEqual([existing, created]);
    expect(reconciler.reconcile([existing, created])).toEqual([existing, created]);
  });

  it("does not resurrect a deleted product from a late snapshot, even after creation in the same read", () => {
    const reconciler = new InventoryListReconciler(session);
    const original = product();
    const deleted = product({ status: "deleted", revision: 3 });
    reconciler.begin(); reconciler.record(session, original); reconciler.record(session, deleted);
    expect(reconciler.reconcile([original])).toEqual([]);
    expect(reconciler.reconcile([])).toEqual([]);
  });

  it("retains the latest confirmed change per product and leaves untouched server rows authoritative", () => {
    const reconciler = new InventoryListReconciler(session);
    const original = product();
    const received = product({ stockRevision: 4, quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 25 } });
    const adjusted = product({ stockRevision: 5, quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 20 } });
    const remote = product({ productId: "other-product", revision: 20 });
    const snapshot = [original, remote];
    reconciler.begin(); reconciler.record(session, received); reconciler.record(session, adjusted);
    expect(reconciler.reconcile(snapshot)).toEqual([adjusted, remote]);
    expect(snapshot).toEqual([original, remote]);
  });

  it("overlays progressive pages on the old catalog, protects writes, then drops absent rows at completion", () => {
    const reconciler = new InventoryListReconciler(session);
    const first = product();
    const later = product({ productId: "later-product", name: "뒤 페이지 품목" });
    const removed = product({ productId: "removed-product", name: "서버에서 삭제된 품목" });
    const saved = product({ stockRevision: 4, quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 31 } });
    reconciler.begin();
    expect(reconciler.reconcile([first], [first, later, removed])).toEqual([first, later, removed]);
    reconciler.record(session, saved);
    expect(reconciler.reconcile([first, later], [first, later, removed])).toEqual([saved, later, removed]);
    expect(reconciler.reconcile([first, later])).toEqual([saved, later]);
  });

  it("clears its overlay after success or failure so a later fresh server read wins", () => {
    const reconciler = new InventoryListReconciler(session);
    const local = product({ stockRevision: 4 });
    reconciler.begin(); reconciler.record(session, local); reconciler.finish();
    const newerRemote = product({ stockRevision: 5, name: "다른 직원이 갱신" });
    reconciler.begin();
    expect(reconciler.reconcile([newerRemote])).toEqual([newerRemote]);
    reconciler.finish();
    // A write outside an active read is not queued for an unrelated future read.
    reconciler.record(session, local); reconciler.begin();
    expect(reconciler.reconcile([newerRemote])).toEqual([newerRemote]);
  });

  it("rejects stale callbacks across employee, session-version and permissions-version boundaries", () => {
    const reconciler = new InventoryListReconciler(session);
    const item = product(); reconciler.begin();
    for (const differentSession of ["employee-2:1:1", "employee-1:2:1", "employee-1:1:2"]) {
      expect(reconciler.record(differentSession, item)).toBe(false);
    }
    expect(reconciler.reconcile([])).toEqual([]);
    reconciler.record(session, item); reconciler.dispose();
    expect(reconciler.record(session, item)).toBe(false);
    expect(reconciler.reconcile([item])).toBeNull();
    expect(reconciler.begin()).toBe(false);
    const nextSession = new InventoryListReconciler("employee-2:1:1"); nextSession.begin();
    expect(nextSession.reconcile([])).toEqual([]);
  });
});
