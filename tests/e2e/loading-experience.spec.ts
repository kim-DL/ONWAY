import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readStylesheet } from "../helpers/read-stylesheet";

const root = fileURLToPath(new URL("../../", import.meta.url));
let script = "";
let css = "";
test.beforeAll(async () => {
  const result = await build({ absWorkingDir: root, entryPoints: ["tests/e2e/fixtures/loading-experience.tsx"], outfile: "loading-fixture.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", logLevel: "silent", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "isolated-auth", setup(builder) {
    builder.onResolve({ filter: /auth-context$/ }, () => ({ path: "auth", namespace: "loading-fixture" }));
    builder.onResolve({ filter: /^next\/dynamic$/ }, () => ({ path: "dynamic", namespace: "loading-fixture" }));
    builder.onResolve({ filter: /app-shell\/app-shell$/ }, () => ({ path: "shell", namespace: "loading-fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "loading-fixture" }, ({ path }) => ({ loader: "js", resolveDir: root, contents: path === "auth" ? `import {useState,useEffect} from 'react';export function useAuth(){const [state,setState]=useState({status:'unauthenticated'});useEffect(()=>{const update=e=>setState(e.detail);window.addEventListener('fixture-auth-state',update);return()=>window.removeEventListener('fixture-auth-state',update)},[]);return {state,login:()=>new Promise((_,reject)=>window.addEventListener('fixture-login-fail',()=>reject(new Error('연결을 확인한 뒤 다시 시도해주세요.')),{once:true})),loginWithGoogle:()=>new Promise(()=>{})}}` : path === "dynamic" ? "import {createElement} from 'react';export default function dynamic(){return ()=>createElement('main',null,'인증된 업무 화면')}" : "export const AppShell=()=>null" }));
  } }] });
  script = result.outputFiles.find(file => file.path.endsWith(".js"))!.text;
  css = readStylesheet(new URL("../../src/app/globals.css", import.meta.url)) + result.outputFiles.find(file => file.path.endsWith(".css"))!.text;
});

async function fixture(page: Page, view = "launch", clock = true) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  if (clock) await page.clock.install({ time: new Date("2026-10-29T00:00:00Z") });
  await page.route("https://loading.fixture/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (["/brand/onnuri-food-logo.png", "/icons/onnuriway-company-icon-192-v4.png"].includes(path)) return route.fulfill({ contentType: "image/png", body: readFileSync(new URL(`../../public${path}`, import.meta.url)) });
    if (path !== "/") return route.abort();
    await route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>급식길 로딩 검증</title><style>${css}</style><style>.fixture-controls{display:flex;gap:12px}.fixture-controls button{min-height:44px;padding:8px}body{margin:0}</style></head><body><div id="root"></div></body></html>` });
  });
  await page.goto(`https://loading.fixture/?view=${view}`);
  await page.addScriptTag({ content: script });
  await expect(page.locator("main")).toBeVisible();
}

test("launch thresholds survive fallback remounts and completion adds no dwell", async ({ page }) => {
  await fixture(page);
  const indicator = page.locator("[data-loading-indicator]");
  await expect(page.getByRole("status")).toHaveText("급식길 여는 중");
  await expect(indicator).toHaveAttribute("data-visible", "false");
  await page.clock.runFor(600);
  await page.getByRole("button", { name: "세션 단계", exact: true }).click();
  await expect(indicator).toHaveAttribute("data-visible", "false");
  await page.clock.runFor(450);
  await expect(indicator).toHaveAttribute("data-visible", "true");
  await page.getByRole("button", { name: "업무 단계", exact: true }).click();
  await expect(indicator).toHaveAttribute("data-visible", "true");
  await expect(page.getByText("업무 화면을 준비하고 있습니다.")).toHaveCount(0);
  await page.clock.runFor(2000);
  await expect(page.getByText("업무 화면을 준비하고 있습니다.")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(1);
  await page.getByRole("button", { name: "완료", exact: true }).click();
  await expect(page.locator("[data-loading-indicator]")).toHaveCount(0);
  await expect(page.getByLabel("업무 검색")).toBeEditable();
});

test("quick operations finish without flashing an animated indicator", async ({ page }) => {
  await fixture(page);
  await page.clock.runFor(200);
  await expect(page.locator("[data-loading-indicator]")).toHaveAttribute("data-visible", "false");
  await page.getByRole("button", { name: "완료", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("first workspace continues launch timing while later navigation starts fresh", async ({ page }) => {
  await fixture(page, "workspace");
  await page.clock.runFor(1600);
  await page.getByRole("button", { name: "업무 진입", exact: true }).click();
  const indicator = page.locator("[data-loading-indicator]");
  await expect(indicator).toHaveAttribute("data-visible", "true");
  expect(await indicator.locator("[data-loading-segment]").evaluate(el => parseFloat(getComputedStyle(el).animationDelay))).toBeLessThan(0);
  await page.getByRole("button", { name: "재고 이동", exact: true }).click();
  await expect(indicator).toHaveAttribute("data-visible", "false");
  await page.clock.runFor(1100);
  await expect(indicator).toHaveAttribute("data-visible", "true");
  await page.getByRole("button", { name: "거래처 복귀", exact: true }).click();
  await expect(indicator).toHaveAttribute("data-visible", "false");
});

for (const terminal of ["조회 완료", "조회 실패"]) {
  test(`same-page data retry starts fresh after ${terminal}`, async ({ page }) => {
    await fixture(page, "data-retry");
    // Pause well after launch so subsequent boundary checks have no real-time drift.
    await page.clock.pauseAt(new Date("2026-10-29T00:01:00Z"));
    await page.getByRole("button", { name: "데이터 조회 시작", exact: true }).click();
    const indicator = page.locator("[data-loading-indicator]");
    const detail = page.getByText("거래처 목록을 확인하고 있습니다.", { exact: true });
    await expect(indicator).toHaveAttribute("data-visible", "true");
    await expect(detail).toBeVisible();

    // The provider, consumer and navigation key stay mounted throughout.
    await page.getByRole("button", { name: terminal, exact: true }).click();
    await expect(page.getByRole("status")).toHaveCount(0);
    await page.getByRole("button", { name: "다시 조회", exact: true }).click();
    await expect(indicator).toHaveAttribute("data-visible", "false");
    await expect(detail).toHaveCount(0);
    await page.clock.runFor(999);
    await expect(indicator).toHaveAttribute("data-visible", "false");
    await page.clock.runFor(1);
    await expect(indicator).toHaveAttribute("data-visible", "true");
    await page.clock.runFor(1_999);
    await expect(detail).toHaveCount(0);
    await page.clock.runFor(1);
    await expect(detail).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(1);
  });
}

test("PIN keeps its form and locked controls then restores focus after failure", async ({ page }) => {
  await fixture(page, "pin");
  await page.getByLabel("직원 PIN").fill("123456");
  await page.getByRole("button", { name: "급식길 시작하기", exact: true }).click();
  await expect(page.getByLabel("직원 PIN")).toBeDisabled();
  await expect(page.getByRole("button", { name: "로그인 확인 중", exact: true })).toBeDisabled();
  await expect(page.locator("[data-loading-indicator]")).toHaveAttribute("data-visible", "false");
  await page.clock.runFor(3100);
  await expect(page.locator("[data-loading-indicator]")).toHaveAttribute("data-visible", "true");
  await expect(page.getByRole("status")).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-login-fail")));
  await expect(page.getByRole("alert")).toContainText("연결을 확인");
  await expect(page.getByLabel("직원 PIN")).toBeFocused();
  await expect(page.getByLabel("직원 PIN")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Google로 관리자 로그인" })).toBeEnabled();
});

test("logout, cleanup and external sign-in start a fresh wait", async ({ page }) => {
  await fixture(page, "pin");
  for (const previous of ["authenticated", "invalid", "unauthenticated"]) {
    await page.evaluate(status => window.dispatchEvent(new CustomEvent("fixture-auth-state", { detail: status === "authenticated"
      ? { status, session: { uid: "fixture", claims: { sessionVersion: 1, permissionsVersion: 1 } } }
      : { status, message: status === "invalid" ? "세션이 변경되었습니다." : undefined } })), previous);
    await page.clock.runFor(5_000);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("fixture-auth-state", { detail: { status: "resolving" } })));
    await expect(page.locator("[data-loading-indicator]")).toHaveAttribute("data-visible", "false");
    await expect(page.getByText("로그인 상태를 확인하고 있습니다.")).toHaveCount(0);
    await page.clock.runFor(1_050);
    await expect(page.locator("[data-loading-indicator]")).toHaveAttribute("data-visible", "true");
  }
});

test("connection recovery keeps one static status instead of an indefinite loader", async ({ page }) => {
  await fixture(page, "pin");
  const message = "로그인은 유지되어 있어요. 연결이 돌아오면 자동으로 이어집니다.";
  await page.evaluate(message => window.dispatchEvent(new CustomEvent("fixture-auth-state", {
    detail: { status: "resolving", waitingForConnection: true, message },
  })), message);
  await page.clock.runFor(5_000);
  await expect(page.locator("[data-auth-stage='connection']")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(message);
  await expect(page.locator("[data-loading-indicator]")).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("fixture-auth-state", { detail: { status: "unauthenticated" } })));
  await expect(page.getByLabel("직원 PIN")).toBeEditable();
});

test("a submitted PIN keeps its elapsed time when Firebase starts resolving", async ({ page }) => {
  await fixture(page, "pin");
  await page.getByLabel("직원 PIN").fill("123456");
  await page.getByRole("button", { name: "급식길 시작하기", exact: true }).click();
  await page.clock.runFor(1_200);
  await expect(page.locator("[data-loading-indicator]")).toHaveAttribute("data-visible", "true");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("fixture-auth-state", { detail: { status: "resolving" } })));
  await expect(page.locator("[data-auth-stage='session']")).toBeVisible();
  await expect(page.locator("[data-loading-indicator]")).toHaveAttribute("data-visible", "true");
  await page.clock.runFor(1_850);
  await expect(page.getByText("로그인 상태를 확인하고 있습니다.")).toBeVisible();
});

for (const view of ["launch", "pin", "skeleton"]) {
  test(`${view} is readable without motion at mobile, desktop and enlarged text`, async ({ page }, info) => {
    for (const width of [320, 390, 768, 840, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await fixture(page, view, false);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(page.locator("[data-loader-piece]")).toHaveCount(0);
      const statusText = page.locator("[data-loading-status] > span:not([data-loading-indicator])");
      if (view !== "pin") {
        await expect(page.locator("[data-loading-indicator]")).toHaveAttribute("data-visible", "true");
        await expect(statusText).toHaveCount(2);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
      if (info.project.name === "mobile-chromium") await page.locator("main").screenshot({ path: `output/loading-experience-20261029/${view}-${width}.png` });
      const statusFontSizes = await statusText.evaluateAll(nodes => nodes.map(node => Number.parseFloat(getComputedStyle(node).fontSize)));
      await page.addStyleTag({ content: "html{font-size:200%}" });
      await statusText.evaluateAll((nodes, sizes) => nodes.forEach((node, index) => {
        const originalSize = sizes[index];
        if (originalSize === undefined) throw new Error("Missing loading status font size");
        (node as HTMLElement).style.fontSize = `${originalSize * 2}px`;
      }), statusFontSizes);
      // Reduced motion leaves a .01ms transition: wait for the next rendered style.
      await expect(page.locator("html")).toHaveCSS("font-size", "32px");
      await expect.poll(() => statusText.evaluateAll(nodes => nodes.map(node => Number.parseFloat(getComputedStyle(node).fontSize))))
        .toEqual(statusFontSizes.map(size => size * 2));
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      expect(await page.locator("main").evaluate(element => Array.from(element.querySelectorAll("h1:not(.sr-only), h2, input, button, .auth-launch-content, .auth-brand, [data-loading-status] > span:not([data-loading-indicator])"))
        .filter(node => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1);
        }).map(node => node.className || node.tagName))).toEqual([]);
      await page.emulateMedia({ forcedColors: "active" });
      expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
      await page.emulateMedia({ forcedColors: "none" });
    }
  });
}
