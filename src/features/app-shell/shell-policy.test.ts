import { describe, expect, it } from "vitest";

import { getAvailableModes, getInitialMode, getNavigation, isSchoolWorkMode, normalizeView } from "./shell-policy";

describe("app shell role policy", () => {
  it("gates inventory without changing first-login defaults or accepting a disabled saved mode", () => {
    expect(getAvailableModes(["delivery", "sales"], true)).toEqual(["customer", "delivery", "sales", "inventory"]);
    expect(getAvailableModes(["viewer"], true)).toContain("inventory");
    expect(getAvailableModes([], true)).not.toContain("inventory");
    expect(getAvailableModes(["delivery", "sales"], false)).not.toContain("inventory");
    expect(getInitialMode(["sales"], undefined, true)).toBe("sales");
    expect(getInitialMode(["sales"], "inventory", true)).toBe("inventory");
    expect(getInitialMode(["sales"], "inventory", false)).toBe("sales");
    expect(getNavigation("inventory").map((item) => item.label)).toEqual(["재고", "설정"]);
    expect(normalizeView("inventory", "activity")).toBe("schools");
  });
  it("excludes both customer and inventory from every school-only branch", () => {
    expect(isSchoolWorkMode("delivery")).toBe(true);
    expect(isSchoolWorkMode("sales")).toBe(true);
    expect(isSchoolWorkMode("inventory")).toBe(false);
    expect(isSchoolWorkMode("customer")).toBe(false);
    expect(isSchoolWorkMode(undefined)).toBe(false);
  });
  it("shows only school and settings navigation to delivery employees", () => {
    expect(getAvailableModes(["delivery"])).toEqual(["customer", "delivery"]);
    expect(getNavigation("delivery").map((item) => item.id)).toEqual(["schools", "settings"]);
  });

  it("shows activity navigation to sales employees", () => {
    expect(getAvailableModes(["sales"])).toEqual(["customer", "sales"]);
    expect(getNavigation("sales").map((item) => item.id)).toEqual(["schools", "activity", "settings"]);
  });

  it("adds customer mode first without invalidating remembered school modes", () => {
    expect(getAvailableModes(["delivery", "sales"])).toEqual(["customer", "delivery", "sales"]);
    expect(getInitialMode(["delivery", "sales"], "delivery")).toBe("delivery");
    expect(getInitialMode(["sales"], "customer")).toBe("customer");
    expect(getInitialMode(["sales"])).toBe("sales");
    expect(getInitialMode(["delivery"])).toBe("delivery");
    expect(getNavigation("customer", false).map((item) => item.label)).toEqual(["거래처", "설정"]);
    expect(normalizeView("customer", "activity", false)).toBe("schools");
  });

  it("keeps production customer navigation unchanged until delivery photos are enabled", () => {
    expect(getNavigation("customer", false).map((item) => item.label)).toEqual(["거래처", "설정"]);
    expect(normalizeView("customer", "activity", false)).toBe("schools");
    expect(getNavigation("customer", true).map((item) => item.label)).toEqual(["거래처", "납품사진", "설정"]);
    expect(normalizeView("customer", "activity", true)).toBe("activity");
  });

  it("restores only an available mode and normalizes unavailable views", () => {
    expect(getInitialMode(["delivery", "sales"], "sales")).toBe("sales");
    expect(getInitialMode(["delivery"], "sales")).toBe("delivery");
    expect(normalizeView("delivery", "activity")).toBe("schools");
  });
});
