import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";

import { installCustomerMapMock } from "./fixtures/customer-map-mock";

const root = fileURLToPath(new URL("../../", import.meta.url));
const globals = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
let script = "";
let moduleCss = "";

test.beforeAll(async () => {
  const result = await build({
    absWorkingDir: root, entryPoints: ["tests/e2e/fixtures/customer-map.tsx"],
    outfile: "customer-map-fixture.js", bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", logLevel: "silent",
    define: { "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY": '"fixture-map-key"' },
  });
  script = result.outputFiles.find((file) => file.path.endsWith(".js"))?.text ?? "";
  moduleCss = result.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
});

async function fixture(page: Page, mock: boolean | Parameters<typeof installCustomerMapMock>[0] = true) {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>거래처 지도 검증</title><style>${globals}</style><style>${moduleCss}</style><style>
    #customer-map-fixture {display:block;width:100%;min-height:0;padding:12px;}
    #customer-map-fixture h1 {font-size:20px;}
    .fixture-actions {display:flex;flex-wrap:wrap;gap:6px;}
    .fixture-actions button {min-height:44px;}
    #customer-map-fixture > a {display:inline-flex;align-items:center;min-height:44px;}
    output {display:block;}
  </style></head><body><div id="root"></div></body></html>`);
  if (mock) await page.evaluate(installCustomerMapMock, mock === true ? undefined : mock);
  await page.addScriptTag({ content: script });
}

test("actual map mounts in StrictMode with a single exact pin and accessible scrolling controls", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await fixture(page);
  const canvas = page.locator("[data-customer-map-canvas]");
  await expect(canvas).toHaveAttribute("data-mock-center", "36.35,127.38");
  await expect(page.locator("[data-mock-marker]")).toHaveCount(1);
  await expect(canvas).toHaveAttribute("data-mock-draggable", "false");
  await expect(canvas).toHaveCSS("touch-action", "pan-y");
  await page.getByRole("button", { name: "지도 직접 조작", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-mock-draggable", "true");
  await expect(canvas).toHaveAttribute("data-mock-zoomable", "true");
  await expect(canvas).toHaveCSS("touch-action", "none");
  await page.getByRole("button", { name: "지도 확대", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-mock-level", "2");
  await page.getByRole("button", { name: "지도 축소", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-mock-level", "3");
  await page.getByRole("button", { name: "다른 납품지 선택", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-mock-center", "36.36,127.39");
  await expect(page.locator("[data-mock-marker]")).toHaveAttribute("data-mock-position", "36.36,127.39");
  await page.getByRole("button", { name: "지도 핀", exact: true }).click();
  await expect(page.getByText("선택한 거래처 핵심 정보", { exact: true })).toBeVisible();
  for (const button of await page.getByRole("group", { name: "지도 조작 도구" }).getByRole("button").all()) {
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(errors).toEqual([]);
});

test("map resizes, unmounts, remounts and clears stale pins for missing coordinates", async ({ page }) => {
  await fixture(page);
  const canvas = page.locator("[data-customer-map-canvas]");
  await expect(canvas).toHaveAttribute("data-mock-map", "ready");
  const layouts = Number(await canvas.getAttribute("data-mock-relayouts"));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => Number(await canvas.getAttribute("data-mock-relayouts"))).toBeGreaterThan(layouts);
  await page.getByRole("button", { name: "지도 표시 전환", exact: true }).click();
  await expect(page.locator("[data-mock-marker]")).toHaveCount(0);
  await page.getByRole("button", { name: "지도 표시 전환", exact: true }).click();
  await expect(page.locator("[data-mock-marker]")).toHaveCount(1);
  await page.getByRole("button", { name: "좌표 없는 거래처", exact: true }).click();
  await expect(page.getByText("실제 납품 위치가 등록되지 않았습니다.")).toBeVisible();
  await expect(canvas).toHaveCount(0);
  await expect(page.locator("[data-mock-marker]")).toHaveCount(0);
});

test("administrator map clicks update numbers only when map editing is enabled", async ({ page }) => {
  await fixture(page);
  await page.getByRole("button", { name: "지도 편집 전환", exact: true }).click();
  const canvas = page.locator("[data-customer-map-canvas]");
  await expect(canvas).toHaveAttribute("data-mock-draggable", "true");
  await canvas.click({ position: { x: 24, y: 24 } });
  await expect(page.getByLabel("좌표 변경 결과")).toHaveText("36.351,127.381");
  await page.getByRole("button", { name: "지도 직접 조작", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-mock-draggable", "false");
  await canvas.click({ position: { x: 24, y: 24 } });
  await expect(page.getByLabel("좌표 변경 결과")).toHaveText("36.351,127.381");
});

test("SDK failure preserves sensitive app-only information and a fresh retry succeeds", async ({ page }) => {
  let calls = 0;
  await page.route("https://dapi.kakao.com/v2/maps/sdk.js*", async (route) => {
    calls += 1;
    if (calls === 1) await route.abort();
    else await route.fulfill({ contentType: "application/javascript", body: `(${installCustomerMapMock.toString()})();` });
  });
  await fixture(page, false);
  await expect(page.getByText("지도를 불러오지 못했습니다.", { exact: true })).toBeVisible();
  await expect(page.getByText("출입비번 00123* · 담당자 010-1234-5678", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "담당자 전화" })).toHaveAttribute("href", "tel:01012345678");
  await page.getByRole("button", { name: "지도 다시 불러오기", exact: true }).click();
  await expect(page.locator("[data-customer-map-canvas]")).toHaveAttribute("data-mock-map", "ready");
  expect(calls).toBe(2);
  await expect(page.locator("[data-mock-marker]")).toHaveAttribute("title", "테스트 거래처");
});

test("narrow layout and enlarged text keep map controls accessible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixture(page);
  await page.addStyleTag({ content: "html { font-size:200%; }" });
  await expect(page.locator("[data-customer-map-canvas]")).toHaveAttribute("data-mock-map", "ready");
  for (const button of await page.locator('section[aria-label="테스트 거래처 납품 지점 지도"] button').all()) {
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(321);
  }
  const audit = await new AxeBuilder({ page }).include("#customer-map-fixture").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(audit.violations).toEqual([]);
});

test("missing initial tiles provide a bounded nonblocking retry and late completion recovers", async ({ page }) => {
  await page.clock.install();
  await fixture(page, { tiles: "missing" });
  const canvas = page.locator("[data-customer-map-canvas]");
  await expect(canvas).toHaveAttribute("data-mock-map", "ready");
  await page.clock.runFor(15_100);
  await expect(page.getByText("지도 표시가 지연되고 있어요.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "지도 직접 조작", exact: true })).toBeEnabled();
  await expect(page.getByText("출입비번 00123* · 담당자 010-1234-5678", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "담당자 전화" })).toHaveAttribute("href", "tel:01012345678");
  await page.getByRole("button", { name: "지도 다시 불러오기", exact: true }).click();
  await expect(page.getByText("지도 표시가 지연되고 있어요.", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-mock-marker]")).toHaveCount(1);
  await page.clock.runFor(15_100);
  await expect(page.getByText("지도 표시가 지연되고 있어요.", { exact: true })).toBeVisible();
  await canvas.dispatchEvent("mock-tilesloaded");
  await expect(page.getByText("지도 표시가 지연되고 있어요.", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-mock-marker]")).toHaveAttribute("data-mock-position", "36.35,127.38");
});

test("cached tiles need no SDK event", async ({ page }) => {
  await page.clock.install();
  await fixture(page, { tiles: "cached" });
  const canvas = page.locator("[data-customer-map-canvas]");
  await expect.poll(() => canvas.locator("img").evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.clock.runFor(30_000);
  await expect(page.getByText("지도 표시가 지연되고 있어요.", { exact: true })).toHaveCount(0);
});

test("hidden containers do not consume the initial loading deadline", async ({ page }) => {
  await page.clock.install();
  await fixture(page, { tiles: "missing" });
  const canvas = page.locator("[data-customer-map-canvas]");
  await expect(canvas).toHaveAttribute("data-mock-map", "ready");
  const hiddenStyle = await page.addStyleTag({ content: "[data-customer-map-canvas] { display:none; }" });
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.clock.runFor(50);
  await page.clock.runFor(30_000);
  await expect(page.getByText("지도 표시가 지연되고 있어요.", { exact: true })).toHaveCount(0);
  await hiddenStyle.evaluate((element) => element.parentNode?.removeChild(element));
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.clock.runFor(14_000);
  await expect(page.getByText("지도 표시가 지연되고 있어요.", { exact: true })).toHaveCount(0);
  await page.clock.runFor(1_200);
  await expect(page.getByText("지도 표시가 지연되고 있어요.", { exact: true })).toBeVisible();
});

test("background tabs and disposed maps cannot trigger a stale tile warning", async ({ page }) => {
  await page.clock.install();
  await fixture(page, { tiles: "missing" });
  await expect(page.locator("[data-customer-map-canvas]")).toHaveAttribute("data-mock-map", "ready");
  await page.clock.runFor(5_000);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(60_000);
  await expect(page.getByText("지도 표시가 지연되고 있어요.", { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(9_000);
  await expect(page.getByText("지도 표시가 지연되고 있어요.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "지도 표시 전환", exact: true }).click();
  await page.clock.runFor(30_000);
  await expect(page.getByText("지도 표시가 지연되고 있어요.", { exact: true })).toHaveCount(0);
  await expect(page.locator("[data-mock-marker]")).toHaveCount(0);
});
