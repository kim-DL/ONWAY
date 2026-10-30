import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadingIndicator } from "./loading-indicator";
import { LoadingStatus } from "./loading-status";
import { LoadingSkeleton } from "./loading-skeleton";

describe("Onnuri loading indicator", () => {
  it("announces the operation immediately without flashing an animation before hydration", () => {
    const markup = renderToStaticMarkup(createElement(LoadingIndicator, { label: "학교 정보를 여는 중" }));
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="학교 정보를 여는 중"');
    expect(markup).toContain('data-motion="paused"');
    expect(markup).toContain('data-visible="false"');
    expect(markup).toContain('data-variant="linear"');
    expect(markup).not.toContain('role="progressbar"');
    expect(markup).not.toContain("aria-valuenow");
  });

  it("does not repeat a surrounding status announcement", () => {
    const markup = renderToStaticMarkup(createElement(LoadingIndicator, { decorative: true, size: "small", tone: "inherit" }));
    expect(markup).not.toContain('role="status"');
    expect(markup).not.toContain("aria-label=");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('data-size="small"');
    expect(markup).toContain('data-tone="inherit"');
    expect(markup).toContain('data-variant="circular"');
  });

  it("has one live region for a status and its decorative indicator", () => {
    const markup = renderToStaticMarkup(createElement(LoadingStatus, { label: "사진 등록 중", detail: "등록 결과를 확인하고 있어요." }));
    expect(markup.match(/role="status"/g)).toHaveLength(1);
    expect(markup.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(markup).toContain("사진 등록 중");
    expect(markup).not.toContain("등록 결과를 확인하고 있어요.");
  });

  it("keeps placeholders out of the accessibility tree and never suggests a percentage", () => {
    for (const kind of ["row", "card", "photo", "text"] as const) {
      const markup = renderToStaticMarkup(createElement(LoadingSkeleton, { kind }));
      expect(markup).toContain('aria-hidden="true"');
      expect(markup).not.toContain("role=");
      expect(markup).not.toContain("aria-value");
    }
  });

  it("can announce a button operation without creating a second visual indicator", () => {
    const markup = renderToStaticMarkup(createElement(LoadingStatus, { label: "로그인 확인 중", indicator: false }));
    expect(markup.match(/role="status"/g)).toHaveLength(1);
    expect(markup).not.toContain("data-loading-indicator");
  });

  it("keeps photo placeholder markup phrasing-only when rendered inside a span", () => {
    const markup = renderToStaticMarkup(createElement(LoadingStatus, { as: "span", label: "사진 불러오는 중" }));
    expect(markup).not.toContain("<div");
    expect(markup.match(/role="status"/g)).toHaveLength(1);
  });

  it("uses compositor motion with static reduced-motion and high-contrast fallbacks", () => {
    const css = readFileSync(new URL("./loading.module.css", import.meta.url), "utf8");
    const keyframes = css.slice(css.indexOf("@keyframes"), css.indexOf("@media"));
    expect(keyframes).not.toMatch(/(?:width|height|box-shadow|filter|top|left)\s*:/);
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("forced-colors: active");
    expect(css).not.toContain("will-change");
  });
});
