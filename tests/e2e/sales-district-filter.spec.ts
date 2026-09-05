import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
const globals = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
let script = "";
let moduleCss = "";

test.beforeAll(async () => {
  const result = await build({
    absWorkingDir: root, entryPoints: ["tests/e2e/fixtures/sales-district-filter.tsx"],
    outfile: "sales-district-filter-fixture.js", bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
  });
  script = result.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  moduleCss = result.outputFiles.find((file) => file.path.endsWith(".css"))!.text;
});

async function fixture(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>지역 필터 검증</title>
    <style>${globals}</style><style>${moduleCss}</style><style>
      #district-fixture { padding:16px; min-width:0; width:100%; }
      #district-fixture h1 { font:700 1.25rem/1.4 sans-serif; margin:0 0 20px; }
      #district-fixture > button { display:block; margin:12px 0; padding:10px; }
      #district-fixture output { display:block; margin:12px 0; font-size:.875rem; color:#4e5968; }
      .fixture-results { display:grid; gap:10px; }
      .fixture-results article { display:grid; gap:8px; padding:16px; border:1px solid #e5e8eb; border-radius:14px; background:#fff; }
      .fixture-results small { color:#4e5968; }
    </style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: script });
  await expect(page.getByRole("radiogroup", { name: "행정구 필터" }).getByRole("radio")).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready);
}

const radios = (page: Page) => page.getByRole("radiogroup", { name: "행정구 필터" });
const rail = (page: Page) => page.locator("[data-overflow]");

for (const width of [320, 390]) {
  test(`compact district counts, selected state, and real filtering at ${width}px`, async ({ page }, testInfo) => {
    await fixture(page, width);
    await expect(radios(page).getByRole("radio", { name: "전체 지역, 40곳" })).toBeChecked();
    await expect(rail(page)).toHaveAttribute("data-overflow", "true");
    const box = await rail(page).boundingBox();
    expect(box!.height).toBeLessThanOrEqual(64);
    for (const button of await rail(page).getByRole("button").all()) {
      const size = await button.boundingBox();
      expect(size!.width).toBeGreaterThanOrEqual(44);
      expect(size!.height).toBeGreaterThanOrEqual(44);
    }
    await radios(page).getByRole("radio", { name: "서구, 8곳" }).click();
    await expect(page.getByTestId("selection")).toHaveText("seo:8");
    await expect(radios(page).getByRole("radio", { name: "서구, 8곳" })).toBeChecked();
    await expect(radios(page).getByRole("radio", { name: "전체 지역, 40곳" })).not.toBeChecked();
    await expect(page.locator(".fixture-results small")).toHaveText(["seo", "seo", "seo"]);
    await radios(page).getByRole("radio", { name: "전체 지역, 40곳" }).click();
    await expect(page.getByTestId("selection")).toHaveText("all:40");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await testInfo.attach("filter-size", { body: JSON.stringify(box), contentType: "application/json" });
    await page.screenshot({ path: `output/playwright/sales-district-filter/${width}-${testInfo.project.name}.png`, fullPage: true });
  });
}

test("keyboard single-selection moves focus with arrows and Home/End, while Tab leaves the radio group", async ({ page }) => {
  await fixture(page, 320);
  await page.getByTestId("before").focus();
  await page.keyboard.press("Tab");
  const all = radios(page).getByRole("radio", { name: "전체 지역, 40곳" });
  await expect(all).toBeFocused();
  await expect(all).toHaveCSS("outline-width", "3px");
  await page.keyboard.press("ArrowRight");
  await expect(radios(page).getByRole("radio", { name: "서구, 8곳" })).toBeFocused();
  await expect(page.getByTestId("selection")).toHaveText("seo:8");
  await page.keyboard.press("End");
  const last = radios(page).getByRole("radio", { name: "유성구, 8곳" });
  await expect(last).toBeFocused();
  await expect(last).toBeChecked();
  await expect(page.getByRole("button", { name: "다음 지역 보기" })).toBeDisabled();
  await page.keyboard.press("ArrowRight");
  await expect(all).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(last).toBeFocused();
  await page.keyboard.press("Home");
  await expect(all).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "다음 지역 보기" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("after")).toBeFocused();
  await expect(radios(page).locator('[tabindex="0"]')).toHaveCount(1);
});

test("overflow arrows reveal options without changing selection and disappear when the rail fits", async ({ page }) => {
  await fixture(page, 320);
  const next = page.getByRole("button", { name: "다음 지역 보기" });
  const previous = page.getByRole("button", { name: "이전 지역 보기" });
  await expect(previous).toBeDisabled();
  for (let count = 0; count < 5 && await next.isEnabled(); count += 1) await next.click();
  await expect(next).toBeDisabled();
  await expect(previous).toBeEnabled();
  await expect(page.getByTestId("selection")).toHaveText("all:40");
  await expect.poll(() => radios(page).evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await previous.click();
  await expect(next).toBeEnabled();
  await page.setViewportSize({ width: 1000, height: 844 });
  await expect(rail(page)).toHaveAttribute("data-overflow", "false");
  await expect(next).toHaveCount(0);
  await expect(previous).toHaveCount(0);
  await expect(radios(page).getByRole("radio", { name: "전체 지역, 40곳" })).toBeChecked();
});

test("a removed active district stays visible with zero schools until the user returns to all", async ({ page }) => {
  await fixture(page);
  await radios(page).getByRole("radio", { name: "중구, 8곳" }).click();
  await page.getByRole("button", { name: "서구 배정만 남기기" }).click();
  await expect(radios(page).getByRole("radio", { name: "중구, 0곳" })).toBeChecked();
  await expect(page.getByTestId("selection")).toHaveText("jung:0");
  await radios(page).getByRole("radio", { name: "전체 지역, 8곳" }).click();
  await expect(page.getByTestId("selection")).toHaveText("all:8");
  await expect(radios(page).getByRole("radio")).toHaveCount(2);
  await expect(rail(page)).toHaveAttribute("data-overflow", "false");
});

test("200% text, reduced motion, forced colors and accessible radio semantics remain usable", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixture(page, 320);
  await page.addStyleTag({ content: "html { font-size:200%; }" });
  const all = radios(page).getByRole("radio", { name: "전체 지역, 40곳" });
  await all.focus();
  await page.keyboard.press("End");
  const selected = radios(page).getByRole("radio", { name: "유성구, 8곳" });
  await expect(selected).toBeFocused();
  await expect(selected).toHaveCSS("font-size", "26px");
  await expect.poll(() => selected.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const parent = element.parentElement!.getBoundingClientRect();
    return box.left >= parent.left - 1 && box.right <= parent.right + 1;
  })).toBe(true);
  const dimensions = await selected.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const parent = element.parentElement!.getBoundingClientRect();
    return { left: box.left, right: box.right, parentLeft: parent.left, parentRight: parent.right,
      scroll: element.scrollWidth, client: element.clientWidth, height: box.height,
      duration: getComputedStyle(element).transitionDuration };
  });
  expect(dimensions.left).toBeGreaterThanOrEqual(dimensions.parentLeft - 1);
  expect(dimensions.right).toBeLessThanOrEqual(dimensions.parentRight + 1);
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
  expect(dimensions.height).toBeGreaterThanOrEqual(44);
  expect(dimensions.duration.split(",").every((value) => Number.parseFloat(value) <= .00001)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const audit = await new AxeBuilder({ page }).include("#district-fixture").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(audit.violations).toEqual([]);
  await page.screenshot({ path: `output/playwright/sales-district-filter/large-text-${testInfo.project.name}.png`, fullPage: true });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await expect(selected).toHaveCSS("border-top-style", "solid");
  await expect(selected).toHaveCSS("outline-width", "3px");
  await page.keyboard.press("Home");
  await expect(all).toBeChecked();
  await expect(page.getByTestId("selection")).toHaveText("all:40");
});
