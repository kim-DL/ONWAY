import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ShellHeader } from "./app-shell-header";
import styles from "./app-shell-header.module.css";

describe("shell header", () => {
  it("keeps both named native mode buttons and the company name, without a profile avatar", () => {
    const html = renderToStaticMarkup(createElement(ShellHeader, {
      mode: "sales", availableModes: ["delivery", "sales"], onModeChange: () => undefined,
    }));
    expect(html).toContain("온누리종합식품");
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
    expect(html).toContain("납품 모드");
    expect(html).not.toContain('aria-label="업무 모드"');
    expect(html).not.toContain("영업");
  });

  it("exports actual component markup and scoped styles for serverless browser layout verification", () => {
    const globalCss = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    const rawCss = readFileSync(new URL("./app-shell-header.module.css", import.meta.url), "utf8");
    const scopedCss = rawCss.replace(/:global\(([^)]+)\)/g, "$1")
      .replace(/\.(header|controls|modeFrame|modeControl|modeButton|singleMode)\b/g, (_, name: string) => `.${styles[name]}`);
    const directory = new URL("../../../output/playwright/header-layout/", import.meta.url);
    mkdirSync(directory, { recursive: true });
    for (const mode of ["delivery", "sales"] as const) {
      for (const state of ["dual", "single", "detail"] as const) {
        const html = renderToStaticMarkup(createElement(ShellHeader, {
          mode, availableModes: state === "single" ? [mode] : ["delivery", "sales"],
          onModeChange: () => undefined,
          ...(state === "detail" ? { onDetailBack: () => undefined } : {}),
        }));
        // Files are generated verification artifacts, never production assets.
        writeFileSync(new URL(`${mode}-${state}.html`, directory), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${globalCss}</style><style>${scopedCss}</style></head><body><main class="workspace-shell" data-mode="${mode}">${html}</main></body></html>`);
      }
    }
    expect(scopedCss).not.toContain(":global(");
  });
});
