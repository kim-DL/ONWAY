import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppBrand } from "./app-brand";

describe("company brand signature", () => {
  it("pairs the company name with the original transparent wave, not a padded install icon", () => {
    const markup = renderToStaticMarkup(createElement(AppBrand));
    expect(markup).toContain("app-brand--signature");
    expect(markup).toContain("<strong>온누리종합식품</strong>");
    expect(markup).toContain("<small>급식길</small>");
    expect(markup).toContain('viewBox="0 0 1200 446"');
    expect(markup).toContain('href="/brand/onnuri-food-logo.png"');
    expect(markup).not.toContain("/icons/");
  });

  it("keeps the compact desktop rail on the updated square icon", () => {
    const markup = renderToStaticMarkup(createElement(AppBrand, { compact: true }));
    expect(markup).not.toContain("app-brand--signature");
    expect(markup).toContain("onnuriway-company-icon-192-v4.png");
    expect(markup).toContain("<strong>급식길</strong>");
  });
});
