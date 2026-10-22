import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InventoryGreeting } from "./inventory-greeting";

describe("inventory welcome typography", () => {
  it("serves the personalized greeting with typography only and no decorative heading or artwork", () => {
    const html = renderToStaticMarkup(createElement(InventoryGreeting, { displayName: "담당자" }));
    expect(html).toContain('data-welcome-variant="copy"');
    expect(html).toContain('data-greeting-accessible="true">담당자님, 반가워요.');
    expect(html).toContain('data-typing="complete"');
    expect(html).not.toContain("data-welcome-headline");
    expect(html).not.toContain("data-welcome-mascot");
    expect(html).not.toContain("data-quantum-cloud");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("aria-live");
  });
});
