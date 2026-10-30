import { readApplicationStylesheet } from "../../../tests/helpers/read-stylesheet";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ShellHeader } from "./app-shell-header";
import type { WorkMode } from "./shell-policy";
import styles from "./app-shell-header.module.css";
import brandStyles from "./app-brand.module.css";

const ALL_MODES: readonly WorkMode[] = ["customer", "delivery", "sales", "inventory"];
const renderHeader = (availableModes: readonly WorkMode[], mode: WorkMode = availableModes[0]!, detail = false) =>
  renderToStaticMarkup(createElement(ShellHeader, { mode, availableModes, onModeChange: () => undefined,
    ...(detail ? { onDetailBack: () => undefined } : {}) }));

describe("shell header", () => {
  it("keeps one persistent set of named mode buttons beside the company identity", () => {
    const html = renderHeader(ALL_MODES, "inventory");
    expect(html).toContain('data-mode-count="4"');
    expect(html).toContain('data-mode-switcher="glass" data-motion="static"');
    expect(html).toContain('data-mode="inventory" aria-pressed="true"');
    expect(html.match(/data-mode="/g)).toHaveLength(4);
    expect(html.replace(/<[^>]+>/g, "")).toContain("온누리종합식품");
    expect(html.indexOf('app-brand')).toBeLessThan(html.indexOf('aria-label="업무 모드"'));
    expect(html).not.toContain('aria-haspopup');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("employee-avatar");
    expect(html.slice(html.indexOf('aria-label="업무 모드"'))).not.toContain("<svg");
    expect(html).toContain('aria-label="영업"');
    expect(html).not.toContain("영업/홍보");
  });

  it("filters every permission combination without exposing unauthorized modes", () => {
    for (let mask = 1; mask < 16; mask++) {
      const allowed = ALL_MODES.filter((_, index) => mask & (1 << index));
      const html = renderHeader(allowed);
      expect(html.match(/data-mode="/g)).toHaveLength(allowed.length);
      expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
      for (const mode of ALL_MODES) expect(html.includes('data-mode="' + mode + '"')).toBe(allowed.includes(mode));
      expect(allowed.map(mode => html.indexOf('data-mode="' + mode + '"'))).toEqual(
        allowed.map(mode => html.indexOf('data-mode="' + mode + '"')).toSorted((a, b) => a - b));
    }
  });

  it("preserves the detail back action and a consistent single authorized choice", () => {
    const html = renderHeader(["delivery"], "delivery", true);
    expect(html).toContain("학교 목록");
    expect(html).toContain("학교");
    expect(html).toContain('data-mode-count="1"');
    expect(html).toContain('aria-label="업무 모드"');
    expect(html).not.toContain('data-mode="sales"');
  });

  it("exports actual component markup and scoped styles for browser verification", () => {
    const globalCss = readApplicationStylesheet();
    const scope = (css: string, names: Record<string, string>, keys: string[]) => {
      let scoped = css.replace(/:global\(([^)]+)\)/g, "$1");
      for (const name of keys) scoped = scoped.replace(new RegExp("\\." + name + "\\b", "g"), "." + names[name]);
      return scoped;
    };
    const scopedCss = scope(readFileSync(new URL("./app-shell-header.module.css", import.meta.url), "utf8"), styles,
      ["header", "controls", "modeControl", "modeButton", "glassSurface", "glassMaterial", "modeLabel"]);
    const brandCss = scope(readFileSync(new URL("./app-brand.module.css", import.meta.url), "utf8"), brandStyles,
      ["companyName", "nameLead", "nameDescriptor"]);
    const directory = new URL("../../../output/playwright/header-layout/", import.meta.url);
    mkdirSync(directory, { recursive: true });
    const write = (name: string, mode: WorkMode, availableModes: readonly WorkMode[], detail = false) =>
      writeFileSync(new URL(name + ".html", directory), '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>' + globalCss + '</style><style>' + scopedCss + '</style><style>' + brandCss + '</style></head><body><main class="workspace-shell" data-mode="' + mode + '"><div class="aurora-background" aria-hidden="true"><i></i><i></i><i></i></div>' + renderHeader(availableModes, mode, detail) + '</main></body></html>');
    for (const mode of ["customer", "delivery", "sales"] as const) {
      for (const state of ["dual", "single", "detail", "triple", "triple-detail"] as const) {
        write(mode + "-" + state, mode, state === "single" ? [mode] : state.startsWith("triple") ? ALL_MODES.slice(0, 3) : ["delivery", "sales"], state.endsWith("detail"));
      }
    }
    write("inventory-four", "inventory", ALL_MODES);
    write("delivery-inventory", "delivery", ["customer", "delivery", "inventory"]);
    write("sales-inventory", "sales", ["customer", "sales", "inventory"]);
    expect(scopedCss).not.toContain(":global(");
    expect(scopedCss).toContain("." + styles.modeControl);
  });
});
