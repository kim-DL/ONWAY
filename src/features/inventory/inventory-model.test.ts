import { describe, expect, it } from "vitest";
import { inventoryLocationMap, inventoryProductSchema, type InventoryContext, type InventoryLot, type InventoryProduct } from "@/domain/inventory";
import { inventoryCardHighlight, inventoryCountState, inventoryExpiryLabel, inventoryInitials, inventoryIsUrgent, inventoryLocationsFor, inventoryLotDateLabel, inventoryTransferPreview, matchesInventorySearch, inventoryScope, inventoryScopeCountState, inventoryScopeIsUrgent, inventoryOpeningLocation } from "./inventory-model";

function product(overrides: Partial<InventoryProduct> = {}): InventoryProduct {
  return inventoryProductSchema.parse({ productId: "product-1", companyId: "onnuri", name: "닭 가슴살", manufacturer: "온누리식품", specification: "1kg", origin: "국내산", unitLabel: "봉", unitsPerBox: 12, defaultLocationId: "refrigerated", note: "", urgent: false, status: "active", revision: 2, stockRevision: 3, hasHistory: false, quantityByLocation: inventoryLocationMap(0), nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null), photo: null, createdAt: "2026-09-10T01:00:00.000Z", updatedAt: "2026-09-10T01:00:00.000Z", createdBy: "employee-1", updatedBy: "employee-1", ...overrides });
}
describe("inventory catalog model", () => {
  it("aggregates each product once across locations, keeping nearest expiry only from positive stock", () => {
    const item = product({ quantityByLocation: { refrigerated: 20, freezer1: 0, freezer2: 3, sample: 2 }, nearestExpiryByLocation: { refrigerated: "2027-01-01", freezer1: "2025-01-01", freezer2: "2026-09-14", sample: null } });
    expect(inventoryScope(item, "all")).toEqual({ locations: ["refrigerated", "freezer2", "sample"], quantity: 25, expiryDate: "2026-09-14" });
    expect(inventoryScope(item, "sample")).toEqual({ locations: ["sample"], quantity: 2, expiryDate: null });
    expect(inventoryScopeIsUrgent(item, "all", "2026-09-13", 100)).toBe(true);
    expect(inventoryScopeIsUrgent(item, "refrigerated", "2026-09-13", 100)).toBe(false);
    expect(inventoryScopeIsUrgent(item, "freezer1", "2026-09-13", 100)).toBe(false);
    expect(inventoryScope(product(), "all").quantity).toBe(0);
  });
  it("never calls an all-location product complete after only one location is counted", () => {
    const count = { cycleId: "cycle-1", checkedAt: "2026-09-10T01:00:00.000Z", checkedBy: "employee-1", stockRevision: 1, changed: false, stockChangedSinceCount: false };
    const item = product({ quantityByLocation: { refrigerated: 2, freezer1: 0, freezer2: 0, sample: 1 }, lastCountByLocation: { ...inventoryLocationMap(null), refrigerated: count } });
    expect(inventoryScopeCountState(item, "refrigerated", "cycle-1")).toBe("done");
    expect(inventoryScopeCountState(item, "all", "cycle-1")).toBe("pending");
    const finished = { ...item, lastCountByLocation: { ...item.lastCountByLocation, sample: count } };
    expect(inventoryScopeCountState(finished, "all", "cycle-1")).toBe("done");
    expect(inventoryScopeCountState(finished, "all", "cycle-2")).toBe("pending");
    expect(inventoryScopeCountState({ ...finished, lastCountByLocation: { ...finished.lastCountByLocation, sample: { ...count, stockChangedSinceCount: true } } }, "all", "cycle-1")).toBe("changed");
  });
  it("opens a real storage location, never all, even for zero-stock or moved products", () => {
    expect(inventoryOpeningLocation(product(), "all")).toBe("refrigerated");
    expect(inventoryOpeningLocation(product({ quantityByLocation: { refrigerated: 0, freezer1: 0, freezer2: 8, sample: 0 } }), "all")).toBe("freezer2");
    expect(inventoryOpeningLocation(product(), "sample")).toBe("sample");
  });
  it("emphasizes unfinished stocktaking only on the designated day, never with unverified calendar context", () => {
    const context: InventoryContext = { today: "2026-09-11", canWrite: true, canAdmin: false,
      cycle: { cycleId: "2026-09-11", startDate: "2026-09-11", nextDate: "2026-09-18", weekday: 5 },
      settings: { weekday: 5, urgentDays: 100, revision: 0, pendingWeekday: null, effectiveDate: null, pendingCycleStartDate: null, updatedAt: null, updatedBy: null } };
    for (const state of ["pending", "changed"] as const) {
      expect(inventoryCardHighlight(state, context)).toBe("pending");
      expect(inventoryCardHighlight(state, { ...context, today: "2026-09-12" })).toBe("neutral");
      expect(inventoryCardHighlight(state, null)).toBe("neutral");
    }
    expect(inventoryCardHighlight("done", context)).toBe("done");
    expect(inventoryCardHighlight("done", { ...context, today: "2026-09-12" })).toBe("done");
    expect(inventoryCardHighlight("done", null)).toBe("neutral");
  });
  it("uses dates as the primary stock-group label and distinguishes unknown from not applicable", () => {
    expect(inventoryLotDateLabel({ expiryDate: "2026-09-13", expiryState: "dated" })).toBe("2026.09.13");
    expect(inventoryLotDateLabel({ expiryDate: null, expiryState: "unknown" })).toBe("유통기한 미확인");
    expect(inventoryLotDateLabel({ expiryDate: null, expiryState: "not_applicable" })).toBe("유통기한 해당 없음");
  });
  it("includes D-100 and expired stock but excludes D-101, unknown dates, and zero stock", () => {
    const item = product({ quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 4 } });
    const dated = (date: string | null) => ({ ...item, nearestExpiryByLocation: { ...inventoryLocationMap(null), refrigerated: date } });
    expect(inventoryIsUrgent(dated("2026-04-11"), "refrigerated", "2026-01-01", 100)).toBe(true);
    expect(inventoryExpiryLabel("2026-04-11", "2026-01-01")).toBe("D-100");
    expect(inventoryIsUrgent(dated("2026-04-12"), "refrigerated", "2026-01-01", 100)).toBe(false);
    expect(inventoryIsUrgent(dated("2025-12-31"), "refrigerated", "2026-01-01", 100)).toBe(true);
    expect(inventoryIsUrgent(dated(null), "refrigerated", "2026-01-01", 100)).toBe(false);
    expect(inventoryIsUrgent({ ...dated("2026-04-11"), quantityByLocation: inventoryLocationMap(0) }, "refrigerated", "2026-01-01", 100)).toBe(false);
  });
  it("previews a transfer without changing the total, merging expiry lots, or mutating data", () => {
    const item = product({ quantityByLocation: { refrigerated: 29, freezer1: 3, freezer2: 0, sample: 0 } });
    const lot: InventoryLot = { lotId: "lot-1", productId: item.productId, locationId: "refrigerated", originLotId: "lot-1", quantity: 10, revision: 1, label: "입고", expiryState: "dated", expiryDate: "2026-09-13", createdAt: item.createdAt, updatedAt: item.updatedAt };
    expect(inventoryTransferPreview(item, lot, "refrigerated", "freezer1", 5)).toEqual({ sourceAfter: 24, destinationAfter: 8 });
    expect(item.quantityByLocation.refrigerated).toBe(29); expect(lot.quantity).toBe(10); expect(lot.expiryDate).toBe("2026-09-13");
    for (const quantity of [0, -1, 1.5, 11, Number.NaN]) expect(inventoryTransferPreview(item, lot, "refrigerated", "freezer1", quantity)).toBeNull();
    expect(inventoryTransferPreview(item, lot, "refrigerated", "refrigerated", 1)).toBeNull();
    expect(inventoryTransferPreview(item, lot, "refrigerated", "", 1)).toBeNull();
    expect(inventoryTransferPreview(item, lot, "freezer2", "sample", 1)).toBeNull();
    expect(inventoryTransferPreview({ ...item, quantityByLocation: { ...item.quantityByLocation, freezer1: 1_000_000_000 } }, lot, "refrigerated", "freezer1", 1)).toBeNull();
  });
  it("supports full words, Korean initials, spaces, and specification search", () => {
    expect(inventoryInitials("닭 가슴살 ABC")).toBe("ㄷ ㄱㅅㅅ ABC");
    for (const query of ["닭가슴살", "ㄷㄱㅅ", "온누리", "1KG", "ㄱㄴㅅ", ""]) expect(matchesInventorySearch(product(), query)).toBe(true);
    expect(matchesInventorySearch(product(), "소고기")).toBe(false);
  });
  it("shows a zero-stock product only at its default location, and every positive additional location", () => {
    expect(inventoryLocationsFor(product())).toEqual(["refrigerated"]);
    expect(inventoryLocationsFor(product({ quantityByLocation: { refrigerated: 0, freezer1: 12, freezer2: 0, sample: 2 } }))).toEqual(["refrigerated", "freezer1", "sample"]);
  });
  it("does not reuse a previous week's count, and distinguishes changes after this week's count", () => {
    const count = { cycleId: "cycle-1", checkedAt: "2026-09-10T01:00:00.000Z", checkedBy: "employee-1", stockRevision: 1, changed: false, stockChangedSinceCount: false };
    const item = product({ lastCountByLocation: { ...inventoryLocationMap(null), refrigerated: count } });
    expect(inventoryCountState(item, "refrigerated", "cycle-1")).toBe("done");
    expect(inventoryCountState(item, "refrigerated", "cycle-2")).toBe("pending");
    expect(inventoryCountState(item, "sample", "cycle-1")).toBe("pending");
    expect(inventoryCountState(product({ lastCountByLocation: { ...inventoryLocationMap(null), refrigerated: { ...count, stockChangedSinceCount: true } } }), "refrigerated", "cycle-1")).toBe("changed");
    expect(inventoryCountState(product({ lastCountByLocation: { ...inventoryLocationMap(null), refrigerated: { ...count, changed: true } } }), "refrigerated", "cycle-1")).toBe("done");
    // A movement at a different location changes the global stock revision,
    // but cannot invalidate this location's completed count.
    expect(inventoryCountState({ ...item, stockRevision: 99 }, "refrigerated", "cycle-1")).toBe("done");
  });
  it("uses calendar dates for expiry, including the day itself and expired stock", () => {
    expect(inventoryExpiryLabel("2026-09-11", "2026-09-10")).toBe("D-1");
    expect(inventoryExpiryLabel("2026-09-10", "2026-09-10")).toBe("D-day");
    expect(inventoryExpiryLabel("2026-09-08", "2026-09-10")).toBe("기한 2일 지남");
    expect(inventoryExpiryLabel(null, "2026-09-10")).toBe("날짜 미등록");
    expect(inventoryExpiryLabel("2028-03-01", "2028-02-28")).toBe("D-2");
  });
  it("marks only in-stock dates within the configured threshold as urgent", () => {
    const item = product({ quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 4 }, nearestExpiryByLocation: { ...inventoryLocationMap(null), refrigerated: "2026-09-13" } });
    expect(inventoryIsUrgent(item, "refrigerated", "2026-09-10", 3)).toBe(true);
    expect(inventoryIsUrgent(item, "refrigerated", "2026-09-10", 2)).toBe(false);
    expect(inventoryIsUrgent(item, "freezer1", "2026-09-10", 3)).toBe(false);
    expect(inventoryIsUrgent({ ...item, quantityByLocation: inventoryLocationMap(0) }, "refrigerated", "2026-09-10", 3)).toBe(false);
    expect(inventoryIsUrgent(product({ urgent: true }), "refrigerated", "2026-09-10", 3)).toBe(false);
    expect(inventoryIsUrgent({ ...item, urgent: true }, "refrigerated", "2026-09-10", 2)).toBe(false);
  });
});
