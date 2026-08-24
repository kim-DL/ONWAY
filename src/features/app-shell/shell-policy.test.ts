import { describe, expect, it } from "vitest";

import { getAvailableModes, getInitialMode, getNavigation, normalizeView } from "./shell-policy";

describe("app shell role policy", () => {
  it("shows only school and settings navigation to delivery employees", () => {
    expect(getAvailableModes(["delivery"])).toEqual(["delivery"]);
    expect(getNavigation("delivery").map((item) => item.id)).toEqual(["schools", "settings"]);
  });

  it("shows activity navigation to sales employees", () => {
    expect(getAvailableModes(["sales"])).toEqual(["sales"]);
    expect(getNavigation("sales").map((item) => item.id)).toEqual(["schools", "activity", "settings"]);
  });

  it("restores only an available mode and normalizes unavailable views", () => {
    expect(getInitialMode(["delivery", "sales"], "sales")).toBe("sales");
    expect(getInitialMode(["delivery"], "sales")).toBe("delivery");
    expect(normalizeView("delivery", "activity")).toBe("schools");
  });
});
