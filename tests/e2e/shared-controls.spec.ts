import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, type Page } from "@playwright/test";

import { GlassButton } from "../../src/components/ui/glass-button";
import { SmartChip } from "../../src/components/ui/smart-chip";

const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
type Context = "delivery" | "sales" | "admin";

async function fixture(page: Page, context: Context) {
  const controls = renderToStaticMarkup(createElement("main", {
    className: `control-fixture ${context === "admin" ? "admin-shell" : "workspace-shell"}`,
    ...(context !== "admin" ? { "data-mode": context } : {}),
  },
  createElement("h1", null, "학교 방문 준비"),
  // Playwright transforms imported JSX for component testing; use the shared
  // components' actual native-button props with React's server renderer here.
  createElement("button", GlassButton({ variant: "primary", children: "방문 기록 저장" }).props),
  createElement("button", SmartChip({ selected: true, children: "샘플 전달" }).props),
  createElement("button", GlassButton({ disabled: true, children: "학교를 선택해주세요" }).props),
  createElement("button", SmartChip({ selected: true, disabled: true, children: "저장 중인 태그" }).props),
  ));
  await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>
    .control-fixture { display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; gap: 16px; width: min(100%, 420px); min-height: 0; padding: 24px; margin: 0; background: #f7f8fa; }
    .control-fixture h1 { margin: 0; color: #191f28; font-size: 20px; }
    .control-fixture > button { width: 100%; }
  </style></head><body>${controls}</body></html>`);
}

for (const context of ["delivery", "sales", "admin"] as const) {
  test(`shared controls have distinct keyboard focus and honest disabled feedback in ${context}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await fixture(page, context);
    const primary = page.getByRole("button", { name: "방문 기록 저장", exact: true });
    const chip = page.getByRole("button", { name: "샘플 전달", exact: true });
    await page.keyboard.press("Tab");
    await expect(primary).toBeFocused();
    await expect(primary).toHaveCSS("outline-style", "solid");
    await expect(primary).toHaveCSS("outline-width", "3px");
    await expect(primary).toHaveCSS("outline-color", "rgb(27, 100, 218)");
    await page.keyboard.press("Tab");
    await expect(chip).toBeFocused();
    await expect(chip).toHaveCSS("outline-color", "rgb(27, 100, 218)");
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    for (const control of [primary, chip]) {
      const bounds = await control.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
    }
    const unavailable = page.getByRole("button", { name: "학교를 선택해주세요", exact: true });
    const pendingTag = page.getByRole("button", { name: "저장 중인 태그", exact: true });
    await expect(unavailable).toBeDisabled();
    await expect(unavailable).toHaveCSS("cursor", "not-allowed");
    await expect(pendingTag).toBeDisabled();
    await expect(pendingTag).toHaveCSS("opacity", "0.6");
    await expect(pendingTag).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: `output/playwright/shared-controls/${context}-${testInfo.project.name}.png` });
    await page.locator("main").evaluate((element) => element.setAttribute("aria-busy", "true"));
    await expect(unavailable).toHaveCSS("cursor", "progress");
    await expect(pendingTag).toHaveCSS("cursor", "progress");
  });
}

test("reduced motion keeps hovered and pressed shared controls stationary", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixture(page, "sales");
  for (const label of ["방문 기록 저장", "샘플 전달"]) {
    const control = page.getByRole("button", { name: label, exact: true });
    await control.hover();
    await expect(control).toHaveCSS("transform", "none");
    await expect(control).toHaveCSS("transition-duration", "0s");
    await page.mouse.down();
    await expect(control).toHaveCSS("transform", "none");
    await page.mouse.up();
  }
});

test("forced colors keeps a visible system-color keyboard outline", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await fixture(page, "sales");
  await page.keyboard.press("Tab");
  const control = page.getByRole("button", { name: "방문 기록 저장", exact: true });
  await expect(control).toBeFocused();
  await expect(control).toHaveCSS("outline-style", "solid");
  await expect(control).toHaveCSS("outline-width", "3px");
  expect(await control.evaluate((element) => getComputedStyle(element).outlineColor)).not.toBe("rgba(0, 0, 0, 0)");
});
