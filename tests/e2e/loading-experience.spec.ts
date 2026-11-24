import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readApplicationStylesheet } from "../helpers/read-stylesheet";

const root = fileURLToPath(new URL("../../", import.meta.url));
let script = "";
let css = "";
test.beforeAll(async () => {
  const result = await build({ absWorkingDir: root, entryPoints: ["tests/e2e/fixtures/loading-experience.tsx"], outfile: "loading-fixture.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", logLevel: "silent", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "isolated-auth", setup(builder) {
    builder.onResolve({ filter: /auth-context$/ }, () => ({ path: "auth", namespace: "loading-fixture" }));
    builder.onResolve({ filter: /^next\/dynamic$/ }, () => ({ path: "dynamic", namespace: "loading-fixture" }));
    builder.onResolve({ filter: /app-shell\/app-shell$/ }, () => ({ path: "shell", namespace: "loading-fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "loading-fixture" }, ({ path }) => ({ loader: "js", resolveDir: root, contents: path === "auth" ? `import {useState,useEffect} from 'react';
      export function prepareSessionAuthorization() {
        const root = document.documentElement;
        root.dataset.authorizationPreloads = String(Number(root.dataset.authorizationPreloads || 0) + 1);
      }
      export function useAuth(){const [state,setState]=useState({status:'unauthenticated'});useEffect(()=>{const update=e=>setState(e.detail);window.addEventListener('fixture-auth-state',update);return()=>window.removeEventListener('fixture-auth-state',update)},[]);return {state,login:()=>new Promise((_,reject)=>window.addEventListener('fixture-login-fail',()=>reject(new Error('연결을 확인한 뒤 다시 시도해주세요.')),{once:true})),loginWithGoogle:()=>new Promise(()=>{})}}` : path === "dynamic" ? "import {createElement} from 'react';export default function dynamic(){return ()=>createElement('main',null,'인증된 업무 화면')}" : "export const AppShell=()=>null" }));
  } }] });
  script = result.outputFiles.find(file => file.path.endsWith(".js"))!.text;
  css = readApplicationStylesheet() + result.outputFiles.find(file => file.path.endsWith(".css"))!.text;
});

async function fixture(page: Page, view = "launch", clock = true) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  if (clock) await page.clock.install({ time: new Date("2026-10-29T00:00:00Z") });
  await page.route("https://loading.fixture/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/brand/onnuri-food-logo-auth.webp") return route.fulfill({ contentType: "image/webp", body: readFileSync(new URL(`../../public${path}`, import.meta.url)) });
    if (path !== "/") return route.abort();
    await route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>급식길 로딩 검증</title><style>${css}</style><style>.fixture-controls{display:flex;gap:12px}.fixture-controls button{min-height:44px;padding:8px}body{margin:0}</style></head><body><div id="root"></div></body></html>` });
  });
  await page.goto(`https://loading.fixture/?view=${view}`);
  await page.addScriptTag({ content: script });
  await expect(page.locator("main")).toBeVisible();
}

for (const slow of [false, true]) {
  test(`initial launch holds only the remaining reading time, slow=${slow}`, async ({ page }) => {
    await fixture(page, "entry");
    const cover = page.locator(".initial-launch");
    await expect(page.getByRole("status")).toHaveText("로그인 확인 중");
    await page.clock.runFor(slow ? 1800 : 100);
    await page.evaluate(() => window.dispatchEvent(new Event("fixture-ready")));
    await expect(page.locator("input")).toHaveCount(1);
    if (!slow) {
      await page.clock.runFor(400);
      await expect(cover).toHaveAttribute("data-leaving", "false");
      await page.clock.runFor(575);
    } else {
      await page.clock.runFor(16);
    }
    await expect(cover).toHaveAttribute("data-leaving", "true");
    await page.clock.runFor(210);
    await expect(cover).toHaveCount(0);
    await expect(page.getByLabel("업무 검색")).toBeEditable();
  });
}

test("launch thresholds survive fallback remounts and completion adds no dwell", async ({ page }) => {
  await fixture(page);
  const indicator = page.locator("[data-loading-indicator]");
  await expect(page.getByRole("status")).toHaveText("앱을 여는 중");
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

test("only the first PIN digit starts preparing the verifier, including full-field input", async ({ page }) => {
  for (const fullField of [false, true]) {
    await fixture(page, "pin", false);
    const input = page.getByLabel("직원 PIN", { exact: true });
    await input.focus();
    await input.fill("x");
    await expect(input).toHaveValue("");
    await expect(page.locator("html")).not.toHaveAttribute("data-authorization-preloads");
    if (fullField) await input.fill("123456");
    else {
      await input.pressSequentially("1");
      await expect(page.locator("html")).toHaveAttribute("data-authorization-preloads", "1");
      await input.pressSequentially("23456");
    }
    await expect(page.locator("html")).toHaveAttribute("data-authorization-preloads", "1");
    await expect(page.getByRole("button", { name: "급식길 시작하기" })).toBeEnabled();
  }
});

test("quick operations finish without flashing an animated indicator", async ({ page }) => {
  await fixture(page);
  await page.clock.runFor(200);
  await expect(page.locator("[data-loading-indicator]")).toHaveAttribute("data-visible", "false");
  await page.getByRole("button", { name: "완료", exact: true }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("launch centers the company logo, name and progress bar through delayed feedback", async ({ page }) => {
  for (const width of [320, 390, 840, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await fixture(page);
    await page.addStyleTag({ content: ".fixture-controls{display:none}" });
    const brand = page.locator(".auth-launch-brand");
    const mark = brand.locator("img");
    const heading = brand.getByRole("heading", { level: 1, name: /^온누리\s*종합식품$/ });
    const indicator = page.locator("[data-loading-indicator]");
    await expect(mark).toHaveAttribute("src", "/brand/onnuri-food-logo-auth.webp");
    await expect(mark).toHaveAttribute("alt", "");
    await expect.poll(() => mark.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true);
    await expect(heading).toBeVisible();
    await expect(heading).toHaveCSS("font-weight", "700");
    await expect(page.getByText("급식길", { exact: true })).toHaveCount(0);

    const measure = () => page.locator("main").evaluate(main => {
      const box = main.getBoundingClientRect();
      const group = main.querySelector(".auth-launch-group")!.getBoundingClientRect();
      const name = main.querySelector(".auth-launch-brand h1")!;
      const text = document.createRange();
      text.selectNodeContents(name);
      const nameBox = text.getBoundingClientRect();
      const mark = main.querySelector(".auth-launch-brand img")!.getBoundingClientRect();
      const label = main.querySelector("[data-loading-status] > span:first-child")!;
      const labelBox = label.getBoundingClientRect();
      const track = main.querySelector("[data-loading-track]")!.getBoundingClientRect();
      return {
        centerX: box.left + box.width / 2,
        centerY: box.top + box.height / 2,
        groupCenterY: group.top + group.height / 2,
        artCenterX: mark.left + mark.width / 2,
        nameCenterX: nameBox.left + nameBox.width / 2,
        labelCenterX: labelBox.left + labelBox.width / 2,
        trackCenterX: track.left + track.width / 2,
        markWidth: mark.width,
        lineWidth: track.width,
        lineHeight: track.height,
        labelSize: parseFloat(getComputedStyle(label).fontSize),
        nameSize: parseFloat(getComputedStyle(name).fontSize),
        trackAboveLabel: track.bottom <= labelBox.top,
        positions: [mark.top, nameBox.top, labelBox.top, track.top],
      };
    });
    const initial = await measure();
    expect(Math.abs(initial.groupCenterY - initial.centerY)).toBeLessThanOrEqual(1);
    for (const center of [initial.artCenterX, initial.nameCenterX, initial.labelCenterX, initial.trackCenterX]) {
      expect(Math.abs(center - initial.centerX)).toBeLessThanOrEqual(1);
    }
    expect(initial.markWidth).toBeGreaterThanOrEqual(112);
    expect(initial.markWidth).toBeLessThanOrEqual(136);
    expect(initial.lineWidth).toBeGreaterThanOrEqual(144);
    expect(initial.lineHeight).toBeGreaterThanOrEqual(2);
    expect(initial.labelSize).toBeGreaterThanOrEqual(14);
    expect(initial.nameSize).toBeGreaterThan(initial.labelSize);
    expect(initial.trackAboveLabel).toBe(true);
    await expect(indicator).toHaveCSS("opacity", "1");
    await expect(indicator.locator("[data-loading-segment]")).toHaveCSS("visibility", "hidden");
    await expect(indicator).toHaveAttribute("data-visible", "false");
    await page.clock.runFor(1_450);
    await expect(indicator).toHaveAttribute("data-visible", "true");
    await expect(indicator.locator("[data-loading-segment]")).toHaveCSS("visibility", "visible");
    expect((await measure()).positions).toEqual(initial.positions);
    await expect(page.getByRole("status")).toHaveText("앱을 여는 중");
    await page.clock.runFor(2_000);
    await expect(page.getByText("앱을 준비하고 있습니다.", { exact: true })).toBeVisible();
    expect((await measure()).positions).toEqual(initial.positions);
    await expect(page.getByRole("status")).toHaveCount(1);
    await page.emulateMedia({ forcedColors: "active" });
    await expect(mark).toBeVisible();
    await expect(heading).toBeVisible();
    await expect(page.locator("[data-loading-track]")).toBeVisible();
    await page.emulateMedia({ forcedColors: "none" });
  }
});

test("the company name stays still while its light moves only with motion enabled", async ({ page }) => {
  await fixture(page, "launch", false);
  const heading = page.getByRole("heading", { level: 1, name: /^온누리\s*종합식품$/ });
  const solid = async () => {
    await expect(heading).toHaveCSS("animation-name", "none");
    await expect(heading).toHaveCSS("background-image", "none");
    await expect(heading).not.toHaveCSS("color", "rgba(0, 0, 0, 0)");
    await expect(heading).toHaveCSS("font-weight", "700");
  };
  await page.emulateMedia({ reducedMotion: "reduce" });
  await solid();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(heading).toHaveCSS("animation-name", "company-wordmark-light");
  await expect(heading).toHaveCSS("animation-iteration-count", "2");
  await expect(heading).toHaveCSS("background-clip", "text");
  const startBox = await heading.boundingBox();
  const position = () => heading.evaluate(node => getComputedStyle(node).backgroundPosition);
  const first = await position();
  await expect.poll(position).not.toBe(first);
  expect(await heading.boundingBox()).toEqual(startBox);
  await page.emulateMedia({ forcedColors: "active" });
  await solid();
});

test("launch and PIN remain reachable on short landscape screens with doubled text", async ({ page }) => {
  for (const view of ["launch", "pin"]) {
    await page.setViewportSize({ width: 844, height: 390 });
    await fixture(page, view);
    await page.addStyleTag({ content: ".fixture-controls{display:none}html{font-size:200%}" });
    if (view === "launch") await page.clock.runFor(3_050);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const clipped = await page.locator("main").evaluate(main => {
      const bounds = main.getBoundingClientRect();
      return Array.from(main.querySelectorAll(".auth-launch-brand, .auth-launch-brand img, .auth-launch-brand h1, .auth-brand, .auth-brand__mark, h1:not(.sr-only), h2, input, button, [data-loading-status]"))
        .filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1);
        }).map(element => element.className || element.tagName);
    });
    expect(clipped).toEqual([]);
    if (view === "pin") {
      const administrator = page.getByRole("button", { name: "Google로 관리자 로그인" });
      await administrator.scrollIntoViewIfNeeded();
      await expect(administrator).toBeInViewport();
      const pin = page.getByLabel("직원 PIN", { exact: true });
      await pin.scrollIntoViewIfNeeded();
      await expect(pin).toBeEditable();
      await expect(pin).toBeInViewport();
    } else {
      await page.getByRole("status").scrollIntoViewIfNeeded();
      await expect(page.getByRole("status")).toBeInViewport();
    }
  }
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
  await page.getByLabel("직원 PIN", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "급식길 시작하기", exact: true }).click();
  await expect(page.getByLabel("직원 PIN", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "로그인 확인 중", exact: true })).toBeDisabled();
  await expect(page.locator("[data-loading-indicator]")).toHaveAttribute("data-visible", "false");
  await page.clock.runFor(3100);
  await expect(page.locator("[data-loading-indicator]")).toHaveAttribute("data-visible", "true");
  await expect(page.getByRole("status")).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-login-fail")));
  await expect(page.getByRole("alert")).toContainText("연결을 확인");
  await expect(page.getByLabel("직원 PIN", { exact: true })).toBeFocused();
  await expect(page.getByLabel("직원 PIN", { exact: true })).toHaveValue("");
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
  await expect(page.getByLabel("직원 PIN", { exact: true })).toBeEditable();
});

test("a submitted PIN keeps its elapsed time when Firebase starts resolving", async ({ page }) => {
  await fixture(page, "pin");
  await page.getByLabel("직원 PIN", { exact: true }).fill("123456");
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
      if (info.project.name === "mobile-chromium") await page.locator("main").screenshot({ path: `output/mobile-loading-20261030/after/${view}-${width}.png` });
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
      const zoomGeometry = await page.locator("main").evaluate(main => Array.from(main.querySelectorAll(".auth-launch-group, .auth-launch-brand, .auth-launch-brand img, .auth-launch-brand h1, .auth-brand, .auth-brand__mark, .auth-launch-content, [data-loading-status], [data-loading-indicator]"))
        .map(element => { const rect = element.getBoundingClientRect(); const css = getComputedStyle(element); return { className: element.className, left: rect.left, right: rect.right, width: rect.width, minWidth: css.minWidth, maxWidth: css.maxWidth }; }));
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), JSON.stringify(zoomGeometry)).toBeLessThanOrEqual(1);
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
