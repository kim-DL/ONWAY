import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { build } from "esbuild";
import sharp from "sharp";

const root = fileURLToPath(new URL("../../", import.meta.url));
const globals = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
const storageKey = "onnuriway:header-motion-paused:v1";
const animatedPath = "/brand/bloub-welcome-v2.webp";
const stillPath = "/brand/bloub-welcome-still-v2.png";
let script = "";
let moduleCss = "";
let loopDurationMs = 0;

test.beforeAll(async () => {
  const result = await build({
    absWorkingDir: root, entryPoints: ["tests/e2e/fixtures/welcome-greeting.tsx"],
    outfile: "welcome-greeting-fixture.js", bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
  });
  script = result.outputFiles.find(file => file.path.endsWith(".js"))?.text ?? "";
  moduleCss = result.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "";
  expect(script.length).toBeGreaterThan(0);
  const metadata = await sharp(readFileSync(new URL(`../../public${animatedPath}`, import.meta.url)), { animated: true }).metadata();
  expect(metadata.pages).toBe(200);
  expect(metadata.loop).toBe(0);
  loopDurationMs = (metadata.delay ?? []).reduce((sum, delay) => sum + delay, 0);
  expect(loopDurationMs).toBe(10_000);
});

type FixtureOptions = {
  width?: number;
  placement?: "delivery" | "sales" | "activity";
  longName?: boolean;
  initialPaused?: boolean;
  hydrate?: boolean;
  failAnimated?: boolean;
  failStill?: boolean;
};

async function hydrate(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("welcome-fixture-hydrate")));
}

async function fixture(page: Page, options: FixtureOptions = {}) {
  await page.setViewportSize({ width: options.width ?? 390, height: 844 });
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  if (options.initialPaused !== undefined) {
    await page.addInitScript(({ key, paused }) => localStorage.setItem(key, String(paused)), {
      key: storageKey, paused: options.initialPaused,
    });
  }
  // A routed same-origin document enables real localStorage and real image
  // decoding without starting a server or contacting an external host.
  await page.route("https://welcome.fixture/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === animatedPath || pathname === stillPath) {
      requests.push(pathname);
      const failed = pathname === animatedPath ? options.failAnimated : options.failStill;
      await route.fulfill(failed ? { status: 404, body: "Fixture image unavailable" } : {
        contentType: pathname === animatedPath ? "image/webp" : "image/png",
        body: readFileSync(new URL(`../../public${pathname}`, import.meta.url)),
      });
      return;
    }
    if (pathname !== "/") { await route.abort(); return; }
    await route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1"><title>웰컴 인사 검증</title>
      <style>${globals}</style><style>${moduleCss}</style><style>
        #welcome-fixture { display:block; padding:16px; min-height:100vh; width:100%; min-width:0; }
        .fixture-controls { display:flex; align-items:center; gap:12px; margin-bottom:16px; }
        .fixture-controls button, [data-testid="page-bottom"] { min-height:44px; padding:8px 12px; color:#191f28; background:#fff; border:1px solid #b0b8c1; border-radius:8px; }
        .fixture-controls output { font-size:.875rem; color:#4e5968; }
        #welcome-fixture [data-testid="next-content"] { margin:12px 0 0; font:700 1.1rem/1.5 sans-serif; }
        .fixture-spacer { height:1600px; }
      </style></head><body><div id="root"></div></body></html>` });
  });
  await page.goto(`https://welcome.fixture/?placement=${options.placement ?? "delivery"}&long=${options.longName ?? false}`);
  await page.addScriptTag({ content: script });
  await expect(page.locator("#root")).toHaveAttribute("data-ssr-ready", "true");
  await expect(page.locator("[data-welcome-greeting]")).toHaveCount(1);
  if (options.hydrate !== false) await hydrate(page);
  await page.evaluate(() => document.fonts.ready);
  return { errors, requests };
}

const mascot = (page: Page) => page.locator("[data-welcome-mascot]");
const greeting = (page: Page) => page.locator("[data-welcome-greeting]");
const image = (page: Page) => mascot(page).locator("img");

async function expectMotion(page: Page, state: "running" | "paused") {
  await expect(mascot(page)).toHaveAttribute("data-motion", state);
  await expect(image(page)).toHaveAttribute("src", state === "running" ? animatedPath : stillPath);
  await expect.poll(() => image(page).evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
}

async function expectReadableLayout(target: Locator) {
  const geometry = await target.evaluate(element => {
    const copy = element.querySelector("[data-greeting-copy]")!;
    const headline = element.querySelector("[data-welcome-headline]")!;
    const title = element.querySelector("[data-welcome-title]")!;
    const mascot = element.querySelector("[data-welcome-mascot]")!;
    const copyBox = copy.getBoundingClientRect();
    const headlineBox = headline.getBoundingClientRect();
    const titleBox = title.getBoundingClientRect();
    const mascotBox = mascot.getBoundingClientRect();
    const greetingBox = element.getBoundingClientRect();
    const textLines = (parent: Element) => {
      const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT);
      const lines: DOMRect[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const range = document.createRange();
        range.selectNodeContents(node);
        lines.push(...range.getClientRects());
      }
      return lines;
    };
    const copyLines = textLines(copy);
    const titleLines = textLines(title);
    const outside = (line: DOMRect, box: DOMRect) => line.left < box.left - 1 || line.right > box.right + 1
      || line.top < box.top - 1 || line.bottom > box.bottom + 1;
    return {
      // Check actual text and the reserved decoration slot independently of
      // the transparent media canvas, which is deliberately larger than it.
      copyOverflow: copy.scrollWidth - copy.clientWidth,
      titleOverflow: title.scrollWidth - title.clientWidth,
      slotClipped: mascotBox.left < headlineBox.left - 1 || mascotBox.right > headlineBox.right + 1,
      viewportOverflow: document.documentElement.scrollWidth - innerWidth,
      copyClipped: copyLines.some(line => outside(line, copyBox)),
      // Existing display headings use tight line-height; their visible font
      // ascenders extend above the line box without clipping (overflow visible).
      // The title must still remain inside its horizontal grid allocation.
      titleClipped: titleLines.some(line => line.left < titleBox.left - 1 || line.right > titleBox.right + 1),
      overlaps: [...copyLines, ...titleLines].some(line => line.left < mascotBox.right - 1 && line.right > mascotBox.left + 1
        && line.top < mascotBox.bottom - 1 && line.bottom > mascotBox.top + 1),
      copyUsesFullWidth: Math.abs(copyBox.width - greetingBox.width) <= 1,
      headlineBelowGreeting: headlineBox.top >= copyBox.bottom - 1,
      compact: greetingBox.width <= 14 * Number.parseFloat(getComputedStyle(document.documentElement).fontSize) + .5,
      mascotRightOfTitle: mascotBox.left >= titleBox.right + 3,
      mascotCenterOffset: Math.abs((mascotBox.top + mascotBox.bottom) / 2 - (headlineBox.top + headlineBox.bottom) / 2),
      mascotBelowTitle: mascotBox.top >= titleBox.bottom + 3,
      mascotRightOffset: Math.abs(mascotBox.right - headlineBox.right),
      height: greetingBox.height,
    };
  });
  expect(geometry.copyOverflow).toBeLessThanOrEqual(1);
  expect(geometry.titleOverflow).toBeLessThanOrEqual(1);
  expect(geometry.viewportOverflow).toBeLessThanOrEqual(1);
  expect(geometry.slotClipped).toBe(false);
  expect(geometry.copyClipped).toBe(false);
  expect(geometry.titleClipped).toBe(false);
  expect(geometry.overlaps).toBe(false);
  expect(geometry.copyUsesFullWidth).toBe(true);
  expect(geometry.headlineBelowGreeting).toBe(true);
  if (geometry.compact) {
    expect(geometry.mascotBelowTitle).toBe(true);
    expect(geometry.mascotRightOffset).toBeLessThanOrEqual(1);
  } else {
    expect(geometry.mascotRightOfTitle).toBe(true);
    expect(geometry.mascotCenterOffset).toBeLessThanOrEqual(1);
  }
  expect(geometry.height).toBeGreaterThan(0);
}

for (const placement of ["delivery", "sales", "activity"] as const) {
  test(`${placement} mascot sits beside the real headline at 320/390/768/1280px with long names and 200% text`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { errors } = await fixture(page, { placement, longName: true, width: 320 });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await expectMotion(page, "paused");
      await expectReadableLayout(greeting(page));
      const copy = page.locator("[data-greeting-copy]");
      await expect(copy).toHaveText("이름이아주긴온누리종합식품영업지원담당직원님, 오늘도 반가워요.");
      await greeting(page).screenshot({ path: `output/playwright/welcome-greeting/${placement}-${width}-normal-${testInfo.project.name}.png` });
      const initialSize = await copy.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
      const largeTextStyle = await page.addStyleTag({ content: "html { font-size:200% !important; }" });
      await expect.poll(() => copy.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(initialSize * 1.75);
      await expectReadableLayout(greeting(page));
      await greeting(page).screenshot({ path: `output/playwright/welcome-greeting/${placement}-${width}-large-${testInfo.project.name}.png` });
      await largeTextStyle.evaluate(element => element.parentNode?.removeChild(element));
      await expect.poll(() => copy.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeCloseTo(initialSize, 1);
    }
    expect(errors).toEqual([]);
  });
}

test("server snapshot is static, then visible default client hydration starts animation without duplicate text", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const { errors, requests } = await fixture(page, { hydrate: false });
  await expectMotion(page, "paused");
  expect(requests).not.toContain(animatedPath);
  await hydrate(page);
  await expectMotion(page, "running");
  await expect(page.locator("[data-greeting-copy]")).toHaveCount(1);
  await expect(page.locator("[data-welcome-title] h1")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(image(page)).toHaveAttribute("alt", "");
  await expect(greeting(page).getByRole("img")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("pause and resume use the shared preference and a stopped choice survives a page reload", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await fixture(page);
  await expectMotion(page, "running");
  await page.getByRole("switch", { name: "인사 애니메이션" }).click();
  await expectMotion(page, "paused");
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe("true");
  await page.reload();
  await page.addScriptTag({ content: script });
  await hydrate(page);
  await expectMotion(page, "paused");
  await expect(page.getByRole("switch", { name: "인사 애니메이션" })).not.toBeChecked();
  await page.getByRole("switch", { name: "인사 애니메이션" }).click();
  await expectMotion(page, "running");
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe("false");
});

test("a stored pause never starts the animated asset and dynamic OS reduced motion takes precedence", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const { requests } = await fixture(page, { initialPaused: true });
  await expectMotion(page, "paused");
  expect(requests).not.toContain(animatedPath);
  await page.getByRole("switch", { name: "인사 애니메이션" }).click();
  await expectMotion(page, "running");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expectMotion(page, "paused");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expectMotion(page, "running");
});

test("out-of-viewport and hidden-document states stop motion and resume when visible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await fixture(page);
  await expectMotion(page, "running");
  await page.getByTestId("page-bottom").scrollIntoViewIfNeeded();
  await expectMotion(page, "paused");
  await greeting(page).scrollIntoViewIfNeeded();
  await expectMotion(page, "running");
  // Headless tabs do not consistently become hidden when another tab opens.
  // Dispatch the platform's visibility event with controlled document state.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expectMotion(page, "paused");
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "visibilityState");
    Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expectMotion(page, "running");
});

test("an animated image load error falls back to the real static poster without breaking the greeting", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const { errors, requests } = await fixture(page, { failAnimated: true });
  await expect.poll(() => requests.includes(animatedPath)).toBe(true);
  await expectMotion(page, "paused");
  await expect(page.locator("[data-greeting-copy]")).toHaveText("김온누리님, 오늘도 반가워요.");
  expect(errors).toEqual([]);
});

test("when both image assets fail only the decoration disappears and readable content remains", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const { errors, requests } = await fixture(page, { failAnimated: true, failStill: true });
  await expect.poll(() => requests.includes(animatedPath) && requests.includes(stillPath)).toBe(true);
  await expect(mascot(page)).toHaveAttribute("data-motion", "paused");
  await expect(image(page)).toBeHidden();
  await expect(page.locator("[data-greeting-copy]")).toHaveText("김온누리님, 오늘도 반가워요.");
  await expectReadableLayout(greeting(page));
  expect(errors).toEqual([]);
});

test("forced colors suppress decoration and resume normal motion after the preference is removed", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "active" });
  const { requests } = await fixture(page);
  await expect(mascot(page)).toHaveAttribute("data-motion", "paused");
  await expect(mascot(page)).toBeHidden();
  expect(requests).not.toContain(animatedPath);
  await expect(page.locator("[data-greeting-copy]")).toBeVisible();
  await page.emulateMedia({ forcedColors: "none" });
  await expectMotion(page, "running");
});

test("the real transparent WebP keeps changing frames after its first complete loop", async ({ page }) => {
  test.setTimeout(40_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await fixture(page);
  await expectMotion(page, "running");
  // Real elapsed time is intentional: fake JS timers do not advance image decoding.
  await page.waitForTimeout(loopDurationMs + 800);
  await expectMotion(page, "running");
  const firstFrame = await image(page).screenshot();
  await expect.poll(async () => Buffer.compare(firstFrame, await image(page).screenshot()), {
    timeout: 3_000, intervals: [200, 400, 600],
  }).not.toBe(0);
});

test("decorative mascot and shared motion controls meet accessible semantics", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixture(page, { placement: "sales", width: 320 });
  await expectMotion(page, "paused");
  await expect(image(page)).toHaveAttribute("alt", "");
  await expect(greeting(page).getByRole("img")).toHaveCount(0);
  const result = await new AxeBuilder({ page }).include("[data-welcome-greeting]").include(".fixture-controls")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(result.violations).toEqual([]);
});
