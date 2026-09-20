import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OnnuriLoader } from "./onnuri-loader";

describe("Onnuri loading indicator", () => {
  it("provides one named status and four still pieces before hydration", () => {
    const markup = renderToStaticMarkup(createElement(OnnuriLoader, { label: "학교 정보를 여는 중" }));
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="학교 정보를 여는 중"');
    expect(markup).toContain('data-motion="paused"');
    expect(markup.match(/data-loader-piece=/g)).toHaveLength(4);
  });

  it("does not repeat a surrounding status announcement", () => {
    const markup = renderToStaticMarkup(createElement(OnnuriLoader, { decorative: true, size: "small", tone: "inherit" }));
    expect(markup).not.toContain('role="status"');
    expect(markup).not.toContain("aria-label=");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('data-size="small"');
    expect(markup).toContain('data-tone="inherit"');
  });

  it("animates fixed pieces without changing dimensions or shadows each frame", () => {
    const css = readFileSync(new URL("./onnuri-loader.module.css", import.meta.url), "utf8");
    const keyframes = css.slice(css.indexOf("@keyframes"), css.indexOf("@media"));
    expect(keyframes).not.toMatch(/(?:width|height|box-shadow|filter|top|left)\s*:/);
    expect(keyframes.match(/@keyframes/g)).toHaveLength(4);
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("forced-colors: active");
    expect(css).not.toContain("will-change");
  });
});
