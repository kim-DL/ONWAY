import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
const globals = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
let script = "";
let css = "";
test.beforeAll(async () => {
  const mocks: Record<string, string> = {
    "use-customers": `export function useCustomers(){return {status:'ready',customers:window.customerSearchFixtures,message:'',canRetainDraft:true,retry(){}}}`,
    "use-recent-customers": `export function useRecentCustomers(){return {recentCustomers:window.customerSearchFixtures.slice(0,2),ready:true,rememberCustomer(){},clearRecentCustomers(){}}}`,
    toast: `export function useToast(){return {showToast(){}}}`,
    "customer-overview-photo": `export function CustomerOverviewPhoto(){return null}`,
    "customer-directory": `export function CustomerDirectory(){return null}`,
    "customer-detail": `export function CustomerDetail({customer,onClose}){return <section role="dialog" aria-label={customer.name}><button onClick={onClose}>상세 닫기</button></section>}`,
    "next/dynamic": `export default function dynamic(){return ()=>null}`,
  };
  const result = await build({ absWorkingDir: root, entryPoints: ["tests/e2e/fixtures/customer-search.tsx"], outfile: "customer-search.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", logLevel: "silent", define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "isolated-customer-search", setup(builder) {
      builder.onResolve({ filter: /use-customers$|use-recent-customers$|\/toast$|customer-overview-photo$|customer-directory$|customer-detail$|^next\/dynamic$/ }, (args) => ({ path: args.path === "next/dynamic" ? args.path : args.path.split("/").at(-1)!, namespace: "customer-search-fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "customer-search-fixture" }, (args) => ({ contents: mocks[args.path]!, loader: "tsx", resolveDir: root }));
    } }],
  });
  script = result.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  css = result.outputFiles.find((file) => file.path.endsWith(".css"))!.text;
});

async function fixture(page: Page, width: number) {
  await page.setViewportSize({ width, height: 840 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>거래처 검색 검증</title><style>${globals}</style><style>${css}</style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: script });
  await expect(page.locator("[data-welcome-greeting]")).toBeVisible();
}

for (const width of [320, 390]) {
  test(`${width}px search puts results directly below the input and restores the home when closed`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await fixture(page, width);
    const trigger = page.getByRole("button", { name: /거래처 이름으로 찾기/ });
    await trigger.click();
    const input = page.getByRole("searchbox", { name: "거래처명 또는 초성 검색", exact: true });
    await expect(input).toBeFocused();
    await expect(page.locator("[data-welcome-greeting]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "거래처 등록", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /거래처 전체보기/ })).toHaveCount(0);
    await expect(input).toHaveAttribute("autocomplete", "off");
    await input.fill("온누리");
    const cards = page.locator("[data-customer-card]");
    await expect(cards).toHaveCount(3);
    await page.evaluate(() => (window as unknown as { remountCustomerSearchFixture: () => void }).remountCustomerSearchFixture());
    await expect(page.getByRole("searchbox", { name: "거래처명 또는 초성 검색", exact: true })).toHaveValue("온누리");
    await expect(cards).toHaveCount(3);
    const search = input.locator("..");
    const close = page.getByRole("button", { name: "검색 닫기", exact: true });
    const searchBox = (await search.boundingBox())!;
    const closeBox = (await close.boundingBox())!;
    const cardBox = (await cards.first().boundingBox())!;
    expect(Math.abs((closeBox.y + closeBox.height / 2) - (searchBox.y + searchBox.height / 2))).toBeLessThanOrEqual(1);
    expect(closeBox.width).toBeGreaterThanOrEqual(44);
    expect(closeBox.height).toBeGreaterThanOrEqual(44);
    expect(cardBox.y - searchBox.y - searchBox.height).toBeLessThanOrEqual(60);

    // A reduced layout viewport is the conservative keyboard-open case.
    // Real operating-system keyboard chrome remains a physical-device check.
    await page.setViewportSize({ width, height: 380 });
    await expect(input).toBeInViewport();
    await expect(cards.first().getByRole("heading")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
    await page.screenshot({ path: `output/playwright/customer-search/search-${width}-${info.project.name}.png` });

    await page.getByRole("button", { name: "검색어 지우기", exact: true }).click();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("");
    await expect(page.locator("[data-customer-recents]")).toBeVisible();
    await input.fill("없는거래처");
    await expect(page.getByRole("heading", { name: "등록된 거래처를 찾을 수 없습니다." })).toBeVisible();
    await close.click();
    await expect(input).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator("[data-welcome-greeting]")).toBeVisible();
    await expect(page.getByRole("button", { name: "거래처 등록", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /거래처 전체보기/ })).toBeVisible();
    await trigger.click();
    await expect(input).toHaveValue("");
    await expect(input).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test("Korean composition preserves focus; completed Enter dismisses keyboard and Escape restores home", async ({ page }) => {
  await fixture(page, 390);
  await page.getByRole("button", { name: /거래처 이름으로 찾기/ }).click();
  const input = page.getByRole("searchbox", { name: "거래처명 또는 초성 검색", exact: true });
  await input.fill("ㅇㄴㄹ");
  await expect(page.locator("[data-customer-card]")).toHaveCount(3);
  await input.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(input).toBeFocused();
  await input.dispatchEvent("keydown", { key: "Enter", keyCode: 229 });
  await expect(input).toBeFocused();
  await input.dispatchEvent("keydown", { key: "Escape", isComposing: true });
  await expect(input).toBeFocused();
  await input.press("Enter");
  await expect(input).not.toBeFocused();
  await expect(page.locator("[data-customer-card]")).toHaveCount(3);
  await input.focus();
  await input.press("Escape");
  await expect(input).toHaveCount(0);
  await expect(page.getByRole("button", { name: /거래처 이름으로 찾기/ })).toBeFocused();
});

test("200% text keeps search actions reachable without horizontal overflow", async ({ page }) => {
  await fixture(page, 320);
  await page.getByRole("button", { name: /거래처 이름으로 찾기/ }).click();
  await page.addStyleTag({ content: "html{font-size:200%}" });
  const input = page.getByRole("searchbox", { name: "거래처명 또는 초성 검색", exact: true });
  await input.fill("온누리");
  await expect(page.getByRole("button", { name: "검색 닫기", exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "검색어 지우기", exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator("[data-customer-search-header]").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.emulateMedia({ forcedColors: "active" });
  await page.keyboard.press("Tab");
  await page.getByRole("button", { name: "검색 닫기", exact: true }).focus();
  await expect(page.getByRole("button", { name: "검색 닫기", exact: true })).toHaveCSS("outline-style", "solid");
});
