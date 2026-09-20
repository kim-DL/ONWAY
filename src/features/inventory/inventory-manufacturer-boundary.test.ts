import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("inventory manufacturer lazy boundary", () => {
  it("keeps the full picker behind an interaction-only dynamic import", () => {
    const formSource = readFileSync(new URL("./inventory-forms.tsx", import.meta.url), "utf8");
    const productSource = readFileSync(new URL("./inventory-product-editor.tsx", import.meta.url), "utf8");
    const fieldSource = readFileSync(new URL("./inventory-manufacturer-field.tsx", import.meta.url), "utf8");
    expect(formSource).toContain('lazy(() => import("./inventory-product-editor")');
    expect(formSource).not.toMatch(/import\s+\{[^}]*InventoryManufacturerPicker[^}]*\}\s+from/u);
    expect(productSource).toContain('lazy(() => import("./inventory-manufacturer-field")');
    expect(fieldSource).toContain('lazy(() => import("./inventory-manufacturer-picker")');
    expect(fieldSource.indexOf("setOpen(true)")).toBeGreaterThan(fieldSource.indexOf("lazy(() => import"));
  });

  it("keeps manufacturer controls touch-safe and width-bounded on a 360px sheet", () => {
    const css = readFileSync(new URL("./inventory-manufacturer-picker.module.css", import.meta.url), "utf8");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("min-height: 48px");
    expect(css).toMatch(/\.picker[^}]*min-width:\s*0/u);
    expect(css).toMatch(/\.option[^}]*width:\s*100%[^}]*min-width:\s*0/u);
    expect(css).not.toMatch(/width:\s*[4-9]\d{2}px/u);
  });
});
