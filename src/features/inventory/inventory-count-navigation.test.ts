import { describe, expect, it } from "vitest";
import { inventoryLocationMap, type InventoryContext, type InventoryProduct } from "@/domain/inventory";
import { inventoryNextCountTarget } from "./inventory-model";

const context = { cycle: { cycleId: "week-1", startDate: "2026-09-25" } } as InventoryContext;
const fixture = (id: string): InventoryProduct => ({ productId: id, status: "active", createdAt: "2026-09-24T00:00:00Z", defaultLocationId: "refrigerated", quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 1 }, lastCountByLocation: inventoryLocationMap(null) } as InventoryProduct);
const done = (product: InventoryProduct, location: "refrigerated" | "freezer1" = "refrigerated"): InventoryProduct => ({ ...product, lastCountByLocation: { ...product.lastCountByLocation, [location]: { cycleId: "week-1", stockChangedSinceCount: false } } } as InventoryProduct);
describe("inventory count continuation", () => {
  it("continues in visible order, skips completed rows and wraps to earlier outstanding rows", () => {
    const a = fixture("a"); const b = fixture("b"); const c = fixture("c");
    expect(inventoryNextCountTarget([a, b, c], done(a), "refrigerated", "refrigerated", context)).toEqual({ productId: "b", location: "refrigerated" });
    expect(inventoryNextCountTarget([a, done(b), c], done(c), "refrigerated", "refrigerated", context)).toEqual({ productId: "a", location: "refrigerated" });
  });
  it("finishes the same product's other pending stocked location before moving on", () => {
    const a = { ...fixture("a"), quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 1, freezer1: 3 } };
    expect(inventoryNextCountTarget([a, fixture("b")], done(a), "refrigerated", "all", context)).toEqual({ productId: "a", location: "freezer1" });
    expect(inventoryNextCountTarget([a, fixture("b")], done(a), "refrigerated", "refrigerated", context)).toEqual({ productId: "b", location: "refrigerated" });
  });
  it("returns to the list scope when another location was checked manually", () => {
    const a = { ...fixture("a"), quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 1, freezer1: 3 } };
    expect(inventoryNextCountTarget([a], done(a, "freezer1"), "freezer1", "refrigerated", context)).toEqual({ productId: "a", location: "refrigerated" });
    expect(inventoryNextCountTarget([a], done(a, "freezer1"), "freezer1", "all", context)).toEqual({ productId: "a", location: "refrigerated" });
  });
  it("opens the pending location even if the next product's default location is done", () => {
    const b = done({ ...fixture("b"), quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 1, freezer1: 2 } });
    expect(inventoryNextCountTarget([fixture("a"), b], done(fixture("a")), "refrigerated", "all", context)).toEqual({ productId: "b", location: "freezer1" });
  });
  it("excludes inactive, deleted and newly-added products outside this count cycle", () => {
    const a = fixture("a"); const excluded = [{ ...fixture("inactive"), status: "inactive" }, { ...fixture("deleted"), status: "deleted" }, { ...fixture("new"), createdAt: "2026-09-25T15:00:00Z" }] as InventoryProduct[];
    expect(inventoryNextCountTarget([a, ...excluded], done(a), "refrigerated", "all", context)).toBeNull();
  });
  it("uses only the filtered supplied rows and tolerates a saved row no longer in that filter", () => {
    const visible = fixture("visible");
    expect(inventoryNextCountTarget([visible], done(fixture("outside")), "refrigerated", "refrigerated", context)).toEqual({ productId: "visible", location: "refrigerated" });
    expect(inventoryNextCountTarget([], done(visible), "refrigerated", "all", context)).toBeNull();
  });
  it("rechecks a location changed since count and handles zero-stock default locations", () => {
    const changed = done(fixture("changed")); changed.lastCountByLocation.refrigerated!.stockChangedSinceCount = true;
    const zero = { ...fixture("zero"), quantityByLocation: inventoryLocationMap(0) };
    expect(inventoryNextCountTarget([fixture("a"), changed, zero], done(fixture("a")), "refrigerated", "all", context)).toEqual({ productId: "changed", location: "refrigerated" });
    expect(inventoryNextCountTarget([done(fixture("a")), zero], done(fixture("a")), "refrigerated", "all", context)).toEqual({ productId: "zero", location: "refrigerated" });
  });
});
