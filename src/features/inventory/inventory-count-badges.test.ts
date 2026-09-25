import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("./inventory-thumbnail", () => ({ InventoryThumbnail: () => null }));
import { inventoryLocationMap, inventoryProductSchema, type InventoryContext } from "@/domain/inventory";
import { InventoryCard } from "./inventory-card";
import { inventoryCountBadgeState, inventoryCountEligible, inventoryExpiryGroupCount } from "./inventory-model";

const context: InventoryContext = { today: "2026-09-19", canWrite: true, canAdmin: false, cycle: { cycleId: "count-2026-09-18", startDate: "2026-09-18", nextDate: "2026-09-25", weekday: 5 }, settings: { weekday: 5, urgentDays: 100, revision: 0, pendingWeekday: null, effectiveDate: null, updatedAt: null, updatedBy: null } };
const product = inventoryProductSchema.parse({ productId: "badge-product", companyId: "onnuri", name: "유통기한 검증", manufacturer: "", specification: "", origin: "", unitLabel: "봉", unitsPerBox: 1, defaultLocationId: "refrigerated", note: "", urgent: false, status: "active", revision: 0, stockRevision: 0, hasHistory: true, quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 5 }, nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null), photo: null, createdAt: "2026-09-17T01:00:00.000Z", updatedAt: "2026-09-17T01:00:00.000Z", createdBy: "staff-one", updatedBy: "staff-one" });
describe("inventory scheduled and personal count badges", () => {
  it("hides pending on regular days, showing it on count day or in personal mode", () => {
    expect(inventoryCountBadgeState(product, "all", context)).toBeNull();
    expect(inventoryCountBadgeState(product, "all", context, true)).toBe("pending");
    expect(inventoryCountBadgeState(product, "all", { ...context, today: "2026-09-18" })).toBe("pending");
    expect(inventoryCountBadgeState(product, "all", null, true)).toBeNull();
  });
  it("never flags a product added after the KST count day, until the next cycle", () => {
    const late = { ...product, createdAt: "2026-09-18T15:00:00.000Z" };
    expect(inventoryCountEligible(late, context)).toBe(false);
    expect(inventoryCountBadgeState(late, "all", context, true)).toBeNull();
    expect(inventoryCountEligible({ ...late, createdAt: "2026-09-18T14:59:59.999Z" }, context)).toBe(true);
    expect(inventoryCountBadgeState(late, "all", { ...context, today: "2026-09-25", cycle: { ...context.cycle, cycleId: "count-2026-09-25", startDate: "2026-09-25", nextDate: "2026-10-02" } })).toBe("pending");
  });
  it("keeps an actual confirmation visible without inventing it for new products", () => {
    const done = { ...product, lastCountByLocation: { ...product.lastCountByLocation, refrigerated: { cycleId: context.cycle.cycleId, checkedAt: "2026-09-18T01:00:00.000Z", checkedBy: "staff-one", stockRevision: 0, changed: false, stockChangedSinceCount: false } } };
    expect(inventoryCountBadgeState(done, "all", context)).toBe("done");
    expect(inventoryCountBadgeState({ ...done, status: "inactive" }, "all", context)).toBeNull();
  });
  it("uses distinct expiry summaries, without assuming missing legacy summaries mean one date", () => {
    expect(inventoryExpiryGroupCount(product, "all")).toBeNull();
    const item = { ...product, lotSummary: { all: { lotCount: 3, expiryCount: 2 }, byLocation: { refrigerated: { lotCount: 2, expiryCount: 2 }, freezer1: { lotCount: 1, expiryCount: 1 }, freezer2: { lotCount: 0, expiryCount: 0 }, sample: { lotCount: 0, expiryCount: 0 } } } };
    expect(inventoryExpiryGroupCount(item, "all")).toBe(2);
    expect(inventoryExpiryGroupCount(item, "freezer1")).toBe(1);
    const html = renderToStaticMarkup(createElement(InventoryCard, { product: item, context, location: "all", onOpen: () => {} }));
    expect(html).toContain("유통기한별 수량 2");
    expect(html).not.toContain('data-count-indicator="pending"');
  });
});
