import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ShellHeader } from "./app-shell-header";
import styles from "./app-shell-header.module.css";
import brandStyles from "./app-brand.module.css";

describe("shell header", () => {
  it("keeps four desktop choices and a discoverable compact picker beside the brand", () => {
    const html = renderToStaticMarkup(createElement(ShellHeader, { mode: "inventory", availableModes: ["customer", "delivery", "sales", "inventory"], onModeChange: () => undefined }));
    expect(html).toContain('data-mode-count="4"');
    expect(html).toContain('data-mode="inventory" aria-pressed="true"');
    expect(html).toContain("grid-template-columns:repeat(4, minmax(0, 1fr))");
    expect(html.indexOf(">영업/홍보</button>")).toBeLessThan(html.indexOf(">재고</button>"));
    const css = readFileSync(new URL("./app-shell-header.module.css", import.meta.url), "utf8");
    expect(css).toContain('.header[data-mode-count="4"] .controls');
    expect(css).not.toContain("flex: 1 0 100%");
    expect(css).not.toContain("flex-wrap: wrap");
    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain(".segmentedFrame { display: none; }");
    expect(html).toContain('aria-label="업무 모드 변경, 현재 재고"');
    expect(html).toContain('aria-haspopup="dialog" aria-expanded="false"');
    expect(html).toContain("모드 전환");
    expect(html).not.toContain('class="bottom-sheet-layer"');
  });
  it("presents customer, school delivery, sales in that order with three equal columns", () => {
    const html = renderToStaticMarkup(createElement(ShellHeader, {
      mode: "customer", availableModes: ["customer", "delivery", "sales"], onModeChange: () => undefined,
    }));
    expect(html).toContain('data-mode="customer" aria-pressed="true"');
    expect(html.indexOf(">거래처</button>")).toBeLessThan(html.indexOf(">학교납품</button>"));
    expect(html.indexOf(">학교납품</button>")).toBeLessThan(html.indexOf(">영업/홍보</button>"));
    expect(html).toContain("grid-template-columns:repeat(3, minmax(0, 1fr))");
  });
  it("keeps both named native mode buttons and the company name, without a profile avatar", () => {
    const html = renderToStaticMarkup(createElement(ShellHeader, {
      mode: "sales", availableModes: ["delivery", "sales"], onModeChange: () => undefined,
    }));
    expect(html.replace(/<[^>]+>/g, "")).toContain("온누리종합식품");
    expect(html).toContain('aria-label="업무 모드"');
    expect(html).toContain('data-mode="sales" aria-pressed="true"');
    expect(html).not.toContain("employee-avatar");
    expect(html).toContain('data-motion="paused"');
  });

  it("shows only the authorized mode and preserves the detail back action", () => {
    const html = renderToStaticMarkup(createElement(ShellHeader, {
      mode: "delivery", availableModes: ["delivery"], onModeChange: () => undefined,
      onDetailBack: () => undefined,
    }));
    expect(html).toContain("학교 목록");
    expect(html).toContain("학교납품 모드");
    expect(html).not.toContain('aria-label="업무 모드"');
    expect(html).not.toContain("영업");
    expect(html).not.toContain('aria-haspopup="dialog"');
  });

  it("never exposes an unauthorized mode through either control", () => {
    const html = renderToStaticMarkup(createElement(ShellHeader, {
      mode: "delivery", availableModes: ["customer", "delivery"], onModeChange: () => undefined,
    }));
    expect(html).toContain('aria-label="업무 모드 변경, 현재 학교납품"');
    expect(html).not.toContain('data-mode="sales"');
    expect(html).not.toContain('data-mode="inventory"');
  });

  it("provides explicit selected markers and keeps arrival motion optional", () => {
    const source = readFileSync(new URL("./app-shell-header.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("./app-shell-header.module.css", import.meta.url), "utf8");
    expect(source).toContain('title="업무 모드 선택"');
    expect(source).toContain("<span>현재</span>");
    expect(source).toContain("queueMicrotask(() => onModeChange(nextMode))");
    expect(source).toContain("useBottomSheetClose()");
    expect(source).not.toContain("window.history.back()");
    expect(css).toContain("min-height: 52px");
    expect(css).toContain("min-height: 78px");
    expect(css.indexOf(".pickerOption { animation:")).toBeGreaterThan(css.indexOf("@media (prefers-reduced-motion: no-preference)"));
    expect(css).toContain("@media (forced-colors: active)");
  });

  it("exports actual component markup and scoped styles for serverless browser layout verification", () => {
    const globalCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    const rawCss = readFileSync(new URL("./app-shell-header.module.css", import.meta.url), "utf8");
    const scopedCss = rawCss.replace(/:global\(([^)]+)\)/g, "$1")
      .replace(/\.(header|controls|modeFrame|modeControl|modeButton|singleMode|segmentedFrame|compactFrame|modeTrigger|pickerOption|triggerIcon|triggerChevron|triggerCopy|currentLabel|pickerList|optionIcon|optionCopy|currentMarker|optionChevron)\b/g, (_, name: string) => `.${styles[name]}`);
    const brandCss = readFileSync(new URL("./app-brand.module.css", import.meta.url), "utf8")
      .replace(/\.(companyName|nameLead|nameDescriptor)\b/g, (_, name: string) => `.${brandStyles[name]}`);
    const directory = new URL("../../../output/playwright/header-layout/", import.meta.url);
    mkdirSync(directory, { recursive: true });
    for (const mode of ["customer", "delivery", "sales"] as const) {
      for (const state of ["dual", "single", "detail", "triple", "triple-detail"] as const) {
        const html = renderToStaticMarkup(createElement(ShellHeader, {
          mode, availableModes: state === "single" ? [mode] : state.startsWith("triple") ? ["customer", "delivery", "sales"] : ["delivery", "sales"],
          onModeChange: () => undefined,
          ...(state.endsWith("detail") ? { onDetailBack: () => undefined } : {}),
        }));
        // Files are generated verification artifacts, never production assets.
        writeFileSync(new URL(`${mode}-${state}.html`, directory), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${globalCss}</style><style>${scopedCss}</style><style>${brandCss}</style></head><body><main class="workspace-shell" data-mode="${mode}"><div class="aurora-background" aria-hidden="true"><i></i><i></i><i></i></div>${html}</main></body></html>`);
      }
    }
    expect(scopedCss).not.toContain(":global(");
    expect(scopedCss).toContain(`.${styles.compactFrame} { display: none; }`);
    const inventoryHtml = renderToStaticMarkup(createElement(ShellHeader, { mode: "inventory", availableModes: ["customer", "delivery", "sales", "inventory"], onModeChange: () => undefined }));
    writeFileSync(new URL("inventory-four.html", directory), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${globalCss}</style><style>${scopedCss}</style><style>${brandCss}</style></head><body><main class="workspace-shell" data-mode="inventory">${inventoryHtml}</main></body></html>`);
  });
});
