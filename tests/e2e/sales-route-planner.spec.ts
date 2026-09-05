import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";

let script = "";
let moduleCss = "";
const globals = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
test.beforeAll(async () => {
  const bundle = await build({
    absWorkingDir: fileURLToPath(new URL("../../", import.meta.url)),
    entryPoints: ["tests/e2e/fixtures/sales-route-planner.tsx"], outfile: "route-fixture.js",
    write: false, bundle: true, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
    plugins: [{ name: "no-live-route-service", setup(build) {
      build.onResolve({ filter: /sales-route-repository$/ }, () => ({ path: "route-test-service", namespace: "fixture" }));
      build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export async function optimizeSalesRoute() { throw new Error('No live service in standalone tests'); }", loader: "js" }));
    } }],
  });
  script = bundle.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  moduleCss = bundle.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
});

async function fixture(page: Page, width = 390, count = 40) {
  await page.setViewportSize({ width, height: 844 });
  await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>방문 동선 검증</title><style>${globals}</style><style>${moduleCss}</style></head><body data-school-count="${count}"><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: script });
  await page.getByRole("button", { name: "방문 동선", exact: true }).click();
  await expect(page.locator(".sales-route-candidates > li")).toHaveCount(count);
}

for (const width of [320, 390]) test(`selecting first schools deep in forty candidates does not blank the dialog at ${width}px`, async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fixture(page, width);
  await page.getByRole("button", { name: "전체 선택 40곳" }).click();
  for (const name of ["대전선화초등학교", "대전외국어고등학교", "동선검증40초등학교", "대전선화초등학교"]) {
    const row = page.locator(".sales-route-candidates > li").filter({ hasText: name });
    const check = row.getByRole("checkbox");
    if (!await check.isChecked()) await row.locator(".sales-route-candidate__select").click();
    const start = row.getByRole("button", { name: `${name} 첫 학교로 선택`, exact: true });
    await start.scrollIntoViewIfNeeded();
    await start.click();
    await expect(page.getByRole("dialog", { name: "방문 동선" })).toBeVisible();
    await expect(row.locator(".sales-route-candidate__start")).toHaveAttribute("data-selected", "true");
    await expect(start).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { pressed: true, name: /첫 학교로 선택/ })).toHaveCount(1);
    const geometry = await page.locator(".bottom-sheet-layer").evaluate((element) => ({
      dialogScroll: element.scrollTop, sheetTop: element.querySelector(".bottom-sheet")!.getBoundingClientRect().top,
      sectionScroll: element.querySelector(".bottom-sheet")!.scrollTop,
      footerTop: element.querySelector(".bottom-sheet__footer")!.getBoundingClientRect().top,
      bodyScroll: element.querySelector(".bottom-sheet__body")!.scrollTop,
    }));
    await testInfo.attach(`${name}-scroll`, { body: JSON.stringify(geometry), contentType: "application/json" });
    await expect(page.getByRole("button", { name: "가까운 순서 계산" })).toBeInViewport({ ratio: 1 });
    expect(geometry.dialogScroll).toBe(0);
    expect(geometry.sectionScroll).toBe(0);
    expect(geometry.sheetTop).toBeGreaterThanOrEqual(0);
    expect(errors).toEqual([]);
  }
  await page.screenshot({ path: `output/playwright/sales-route-planner/first-school-${width}-${testInfo.project.name}.png` });
});

test("bulk actions show their selection state, include all forty, and preserve a chosen start when possible", async ({ page }) => {
  await fixture(page);
  const unfinished = page.getByRole("button", { name: "미완료 선택 32곳" });
  const all = page.getByRole("button", { name: "전체 선택 40곳" });
  const checks = page.locator(".sales-route-candidates input[type=checkbox]:checked");
  await expect(checks).toHaveCount(32);
  await expect(unfinished).toHaveAttribute("aria-pressed", "true");
  await all.click();
  await expect(checks).toHaveCount(40);
  await expect(all).toHaveAttribute("aria-pressed", "true");
  const start = page.getByRole("button", { name: "대전외국어고등학교 첫 학교로 선택" });
  await start.click();
  await unfinished.click();
  await expect(start).toHaveAttribute("aria-pressed", "true");
  await expect(checks).toHaveCount(32);
  await all.click();
  const completedStart = page.getByRole("button", { name: "동선검증05초등학교 첫 학교로 선택" });
  await completedStart.click();
  await unfinished.click();
  await expect(completedStart).toBeDisabled();
  await expect(completedStart).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "동선검증01초등학교 첫 학교로 선택" })).toHaveAttribute("aria-pressed", "true");
});

test("more than fifty schools shows an explicit limit and keeps later schools individually selectable", async ({ page }) => {
  await fixture(page, 390, 60);
  await expect(page.getByText(/한 번에 최대 50곳까지 계산할 수 있어요/)).toBeVisible();
  await page.getByRole("button", { name: "전체 선택 50 / 60곳" }).click();
  await expect(page.locator(".sales-route-candidates input[type=checkbox]:checked")).toHaveCount(50);
  const last = page.getByRole("checkbox", { name: "동선검증60초등학교 방문 선택" });
  await expect(last).toBeDisabled();
  await page.getByRole("checkbox", { name: "동선검증01초등학교 방문 선택" }).uncheck();
  await last.check();
  await expect(last).toBeChecked();
  await expect(page.locator(".sales-route-candidates input[type=checkbox]:checked")).toHaveCount(50);
  await page.getByRole("button", { name: "동선검증60초등학교 첫 학교로 선택" }).click();
  await expect(page.getByRole("button", { name: "가까운 순서 계산" })).toBeInViewport({ ratio: 1 });
  expect(await page.locator(".bottom-sheet").evaluate((element) => element.scrollTop)).toBe(0);
});

test("keyboard and enlarged text keep the first-school action visible without hidden ancestor scrolling", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixture(page, 320);
  await page.addStyleTag({ content: "html { font-size:200%; }" });
  const row = page.locator(".sales-route-candidates > li").filter({ hasText: "대전외국어고등학교" });
  const check = row.getByRole("checkbox");
  await check.focus();
  await page.keyboard.press("Tab");
  const start = row.getByRole("button", { name: "대전외국어고등학교 첫 학교로 선택" });
  await expect(start).toBeFocused();
  await expect(start).toHaveCSS("outline-width", "3px");
  await page.keyboard.press("Enter");
  await expect(start).toHaveAttribute("aria-pressed", "true");
  await expect(start).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "가까운 순서 계산" })).toBeInViewport({ ratio: 1 });
  const geometry = await page.locator(".bottom-sheet").evaluate((element) => ({
    scroll: element.scrollTop, overflow: element.scrollWidth - element.clientWidth,
  }));
  expect(geometry).toEqual({ scroll: 0, overflow: 0 });
  const audit = await new AxeBuilder({ page }).include(".bottom-sheet").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(audit.violations).toEqual([]);
});
