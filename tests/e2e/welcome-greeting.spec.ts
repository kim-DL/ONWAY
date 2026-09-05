import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
const globals = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
const storageKey = "onnuriway:header-motion-paused:v1";
let script = "";
let moduleCss = "";

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
  expect(moduleCss.length).toBeGreaterThan(0);
});

type FixtureOptions = {
  width?: number;
  placement?: "delivery" | "sales" | "activity" | "team";
  longName?: boolean;
  initialPaused?: boolean;
  hydrate?: boolean;
};

async function hydrate(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("welcome-fixture-hydrate")));
}

async function fixture(page: Page, options: FixtureOptions = {}) {
  await page.setViewportSize({ width: options.width ?? 390, height: 844 });
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.resourceType() === "image" || request.resourceType() === "media") requests.push(request.url()); });
  if (options.initialPaused !== undefined) {
    await page.addInitScript(({ key, paused }) => localStorage.setItem(key, String(paused)), {
      key: storageKey, paused: options.initialPaused,
    });
  }
  // Same-origin routing exercises real localStorage and browser CSS animation
  // without a server. The ornament must not depend on any image/video request.
  await page.route("https://welcome.fixture/**", async route => {
    if (new URL(route.request().url()).pathname !== "/") { await route.abort(); return; }
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
const cloud = (page: Page) => page.locator("[data-quantum-cloud]");
const greeting = (page: Page) => page.locator("[data-welcome-greeting]");
const particles = (page: Page) => page.locator("[data-quantum-particle]");

async function expectMotion(page: Page, state: "running" | "paused") {
  await expect(cloud(page)).toHaveAttribute("data-motion", state);
  await expect(particles(page)).toHaveCount(4);
  await expect.poll(() => particles(page).evaluateAll(elements => elements.map(element => getComputedStyle(element).animationPlayState)))
    .toEqual(Array(4).fill(state));
}

async function expectEveryParticleMoving(page: Page) {
  const before = await particles(page).evaluateAll(elements => elements.map(element => getComputedStyle(element).transform));
  await expect.poll(() => particles(page).evaluateAll((elements, transforms) => elements.map((element, index) =>
    getComputedStyle(element).transform !== transforms[index]), before)).toEqual([true, true, true, true]);
}

async function expectReadableLayout(target: Locator, enlarged = false) {
  const geometry = await target.evaluate(element => {
    const copy = element.querySelector("[data-greeting-copy]")!;
    const headline = element.querySelector("[data-welcome-headline]")!;
    const title = element.querySelector("[data-welcome-title]")!;
    const lead = element.querySelector("[data-welcome-title-lead]")!;
    const accent = element.querySelector("[data-welcome-title-accent]")!;
    const mascot = element.querySelector("[data-welcome-mascot]")!;
    const copyBox = copy.getBoundingClientRect();
    const headlineBox = headline.getBoundingClientRect();
    const titleBox = title.getBoundingClientRect();
    const leadBox = lead.getBoundingClientRect();
    const accentBox = accent.getBoundingClientRect();
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
      return lines.filter(line => line.width > 0 && line.height > 0);
    };
    const copyLines = textLines(copy);
    const titleLines = [...textLines(lead), ...textLines(accent)];
    const particleBoxes = Array.from(element.querySelectorAll("[data-quantum-particle]"), particle => particle.getBoundingClientRect());
    return {
      copyOverflow: copy.scrollWidth - copy.clientWidth,
      titleOverflow: title.scrollWidth - title.clientWidth,
      viewportOverflow: document.documentElement.scrollWidth - innerWidth,
      slotClipped: mascotBox.left < headlineBox.left - 1 || mascotBox.right > headlineBox.right + 1,
      copyClipped: copyLines.some(line => line.left < copyBox.left - 1 || line.right > copyBox.right + 1),
      titleClipped: titleLines.some(line => line.left < titleBox.left - 1 || line.right > titleBox.right + 1),
      overlaps: [...copyLines, ...titleLines].some(line => particleBoxes.some(particle =>
        line.left < particle.right - 1 && line.right > particle.left + 1 && line.top < particle.bottom - 1 && line.bottom > particle.top + 1)),
      overlapDetails: titleLines.flatMap(line => particleBoxes.filter(particle =>
        line.left < particle.right - 1 && line.right > particle.left + 1 && line.top < particle.bottom - 1 && line.bottom > particle.top + 1)
        .map(particle => ({ text: { top: line.top, bottom: line.bottom }, particle: { top: particle.top, bottom: particle.bottom } }))),
      copyUsesFullWidth: Math.abs(copyBox.width - greetingBox.width) <= 1,
      headlineBelowGreeting: headlineBox.top >= copyBox.bottom - 1,
      adjacentGap: mascotBox.left - leadBox.right,
      mascotWithinFirstLine: mascotBox.top < leadBox.bottom && mascotBox.bottom > leadBox.top,
      accentBelowLead: accentBox.top >= leadBox.bottom - 1,
      accentUsesFullWidth: Math.abs(accentBox.width - titleBox.width) <= 1,
    };
  });
  expect(geometry.copyOverflow).toBeLessThanOrEqual(1);
  expect(geometry.titleOverflow).toBeLessThanOrEqual(1);
  expect(geometry.viewportOverflow).toBeLessThanOrEqual(1);
  expect(geometry.slotClipped).toBe(false);
  expect(geometry.copyClipped).toBe(false);
  expect(geometry.titleClipped).toBe(false);
  expect(geometry.overlaps, JSON.stringify(geometry.overlapDetails)).toBe(false);
  expect(geometry.copyUsesFullWidth).toBe(true);
  expect(geometry.headlineBelowGreeting).toBe(true);
  expect(geometry.accentBelowLead).toBe(true);
  expect(geometry.accentUsesFullWidth).toBe(true);
  if (!enlarged) {
    // This belongs beside the phrase, not centered in the remaining card space.
    expect(geometry.adjacentGap).toBeGreaterThanOrEqual(3);
    expect(geometry.adjacentGap).toBeLessThanOrEqual(18);
    expect(geometry.mascotWithinFirstLine).toBe(true);
  }
}

for (const placement of ["delivery", "sales", "activity", "team"] as const) {
  test(`${placement} particles sit by the title lead at 360/390/430/768/1280px and survive 200% text`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const { errors, requests } = await fixture(page, { placement, longName: true, width: 360 });
    for (const width of [360, 390, 430, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await expectMotion(page, "paused");
      await expectReadableLayout(greeting(page));
      const copy = page.locator("[data-greeting-copy]");
      await expect(copy).toHaveText("김온누리직원님, 오늘도 반가워요.");
      await greeting(page).screenshot({ path: `output/playwright/welcome-greeting/${placement}-${width}-normal-${testInfo.project.name}.png` });
      if (width === 390 || width === 1280) {
        const initialSize = await copy.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize));
        const largeTextStyle = await page.addStyleTag({ content: "html { font-size:200% !important; }" });
        await expect.poll(() => copy.evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(initialSize * 1.75);
        await expectReadableLayout(greeting(page), true);
        await greeting(page).screenshot({ path: `output/playwright/welcome-greeting/${placement}-${width}-large-${testInfo.project.name}.png` });
        await largeTextStyle.evaluate(element => element.parentNode?.removeChild(element));
      }
    }
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("server markup is paused then visible hydration starts four CSS particles without media or duplicate text", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const { errors, requests } = await fixture(page, { hydrate: false });
  await expectMotion(page, "paused");
  await hydrate(page);
  await expectMotion(page, "running");
  await expect(page.locator("[data-greeting-copy]")).toHaveCount(1);
  await expect(page.locator("h1[data-welcome-title]")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(mascot(page).locator("img, video, canvas")).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("pause and resume share the existing preference and a stopped choice survives reload", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await fixture(page);
  await expectMotion(page, "running");
  await page.getByRole("switch", { name: "인사 애니메이션" }).click();
  await expectMotion(page, "paused");
  const stoppedTransforms = await particles(page).evaluateAll(elements => elements.map(element => getComputedStyle(element).transform));
  await page.waitForTimeout(350);
  expect(await particles(page).evaluateAll(elements => elements.map(element => getComputedStyle(element).transform))).toEqual(stoppedTransforms);
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

test("stored stop is respected and changing OS reduced motion takes precedence", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await fixture(page, { initialPaused: true });
  await expectMotion(page, "paused");
  await page.getByRole("switch", { name: "인사 애니메이션" }).click();
  await expectMotion(page, "running");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expectMotion(page, "paused");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expectMotion(page, "running");
  await expectEveryParticleMoving(page);
});

test("out-of-viewport and hidden-document states stop particles and resume when visible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await fixture(page);
  await expectMotion(page, "running");
  await page.getByTestId("page-bottom").scrollIntoViewIfNeeded();
  await expectMotion(page, "paused");
  await greeting(page).scrollIntoViewIfNeeded();
  await expectMotion(page, "running");
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

test("forced colors suppress ornament while preserving readable title and resume normal motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "active" });
  await fixture(page);
  await expectMotion(page, "paused");
  await expect(mascot(page)).toBeHidden();
  await expect(page.locator("[data-greeting-copy]")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.emulateMedia({ forcedColors: "none" });
  await expectMotion(page, "running");
});

test("all particles keep moving and their native cycles either close or reverse seamlessly", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await fixture(page, { placement: "sales" });
  await expectMotion(page, "running");
  await expectEveryParticleMoving(page);
  const loops = await particles(page).evaluateAll(elements => elements.map(element => {
    const animation = element.getAnimations()[0]!;
    const effect = animation.effect as KeyframeEffect;
    const frames = effect.getKeyframes();
    return {
      iterations: String(effect.getTiming().iterations),
      duration: Number(effect.getTiming().duration),
      direction: effect.getTiming().direction,
      startTransform: frames[0]?.transform,
      endTransform: frames.at(-1)?.transform,
      startOpacity: frames[0]?.opacity,
      endOpacity: frames.at(-1)?.opacity,
    };
  }));
  for (const loop of loops) {
    expect(loop.iterations).toBe("Infinity");
    expect(loop.duration).toBeGreaterThan(1_000);
    if (loop.direction !== "alternate") {
      expect(loop.startTransform).toBe(loop.endTransform);
      expect(loop.startOpacity).toBe(loop.endOpacity);
    }
  }
  // Advance native CSS timelines through several cycles, using their actual
  // computed keyframes rather than a mocked JavaScript animation loop.
  await particles(page).evaluateAll(elements => elements.forEach(element => {
    const animation = element.getAnimations()[0]!;
    animation.currentTime = Number(animation.effect?.getTiming().duration) * 3 + 250;
  }));
  await expectMotion(page, "running");
  await expectEveryParticleMoving(page);
  await expectReadableLayout(greeting(page));
});

test("320px and enlarged text remain readable without constraining the normal phone composition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const placement of ["delivery", "sales", "activity", "team"] as const) {
    const { errors } = await fixture(page, { placement, width: 320, longName: true });
    await expectReadableLayout(greeting(page), true);
    await page.addStyleTag({ content: "html { font-size:200% !important; }" });
    await expectReadableLayout(greeting(page), true);
    expect(errors).toEqual([]);
  }
});

test("every particle orbit stays clear of title ink throughout its full range", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const placement of ["delivery", "sales", "activity", "team"] as const) {
    await fixture(page, { placement, width: 390 });
    await expectMotion(page, "running");
    await page.getByRole("switch", { name: "인사 애니메이션" }).click();
    await expectMotion(page, "paused");
    for (const progress of [0, .125, .25, .375, .5, .625, .75, .875, 1]) {
      await particles(page).evaluateAll((elements, fraction) => elements.forEach(element => {
        const animation = element.getAnimations()[0]!;
        animation.currentTime = Number(animation.effect?.getTiming().duration) * fraction;
      }), progress);
      await expectReadableLayout(greeting(page));
    }
    // Reset persisted preference before mounting the next independent screen.
    await page.getByRole("switch", { name: "인사 애니메이션" }).click();
  }
});

test("ornament adds no loading semantics or focus targets and shared controls remain accessible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixture(page, { placement: "sales", width: 360 });
  await expectMotion(page, "paused");
  await expect(mascot(page)).toHaveAttribute("aria-hidden", "true");
  await expect(greeting(page).getByRole("status")).toHaveCount(0);
  await expect(greeting(page).getByRole("progressbar")).toHaveCount(0);
  await expect(greeting(page).getByRole("img")).toHaveCount(0);
  await expect(greeting(page).locator("button, a, [tabindex]")).toHaveCount(0);
  const result = await new AxeBuilder({ page }).include("[data-welcome-greeting]").include(".fixture-controls")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(result.violations).toEqual([]);
});
