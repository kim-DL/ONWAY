import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

let motionScript = "";
let motionCss = "";
test.beforeAll(async () => {
  const result = await build({ absWorkingDir: fileURLToPath(new URL("../../", import.meta.url)), entryPoints: ["tests/e2e/fixtures/header-motion.tsx"], outfile: "header-motion.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", logLevel: "silent", define: { "process.env.NODE_ENV": '"development"' } });
  motionScript = result.outputFiles.find((file) => file.path.endsWith(".js"))!.text;
  motionCss = result.outputFiles.find((file) => file.path.endsWith(".css"))!.text;
});

async function liveMotionFixture(page: Page, kind = "header") {
  const globals = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
  await page.route("**/brand/onnuri-food-logo.png", (route) => route.fulfill({ contentType: "image/png", body: readFileSync(new URL("../../public/brand/onnuri-food-logo.png", import.meta.url)) }));
  await page.setContent(`<!doctype html><html lang="ko" data-fixture="${kind}"><head><base href="http://header.fixture/"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>헤더 모션 검증</title><style>${globals}</style><style>${motionCss}</style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: motionScript });
}

const visibleModeFrame = (page: Page) => page.locator('[data-mode-switcher]:visible');
const selectedModeControl = (page: Page, mode: string) => page.locator(`[data-mode-switcher]:visible button[data-mode="${mode}"]`);

async function chooseMode(page: Page, mode: string) {
  const picker = page.getByRole("button", { name: /^업무 모드 변경, 현재 / });
  if (await picker.isVisible()) {
    await picker.click();
    const dialog = page.getByRole("dialog", { name: "업무 모드 선택" });
    await dialog.locator(`button[data-mode="${mode}"]`).click();
    await expect(dialog).toHaveCount(0);
  } else {
    await page.getByRole("group", { name: "업무 모드" }).locator(`[data-mode="${mode}"]`).click();
  }
  await expect(page.locator("main")).toHaveAttribute("data-mode", mode);
}

test("four-mode switcher stays beside the brand, opens an accessible picker and preserves Back", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await liveMotionFixture(page);
    const header = page.locator(".workspace-header");
    const geometry = await header.evaluate((element) => {
      const brand = element.querySelector(".app-brand")!.getBoundingClientRect();
      const controls = element.querySelector(".workspace-header__controls")!.getBoundingClientRect();
      return { brandRight: brand.right, controlsLeft: controls.left, brandMiddle: (brand.top + brand.bottom) / 2, controlsMiddle: (controls.top + controls.bottom) / 2 };
    });
    expect(geometry.controlsLeft).toBeGreaterThan(geometry.brandRight + 3);
    expect(Math.abs(geometry.brandMiddle - geometry.controlsMiddle)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width <= 900) {
      const trigger = page.getByRole("button", { name: /^업무 모드 변경, 현재 / });
      await expect(trigger).toBeVisible();
      const bounds = (await trigger.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "업무 모드 선택" });
      await expect(dialog).toBeVisible();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(dialog.getByRole("button", { pressed: true })).toContainText("거래처");
      await expect(dialog.getByRole("group", { name: "업무 모드" }).getByRole("button")).toHaveCount(4);
      for (const option of await dialog.getByRole("group", { name: "업무 모드" }).getByRole("button").all()) expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await new AxeBuilder({ page }).include("dialog").analyze()).violations).toEqual([]);
      await page.screenshot({ path: `output/playwright/header-layout/mode-picker-${width}-${info.project.name}.png` });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.goBack();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator("main")).toHaveAttribute("data-mode", "customer");
    } else {
      await expect(page.getByRole("group", { name: "업무 모드" }).getByRole("button")).toHaveCount(4);
    }
    for (const mode of ["inventory", "sales", "delivery", "customer"]) await chooseMode(page, mode);
    await page.goBack();
    await expect(page.locator("main")).toHaveAttribute("data-mode", "delivery");
    expect((await new AxeBuilder({ page }).include(".workspace-header").analyze()).violations).toEqual([]);
    await header.screenshot({ path: `output/playwright/header-layout/mode-current-${width}-${info.project.name}.png` });
  }
});

test("rapid mode selection and Escape share a single guarded Back operation", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await liveMotionFixture(page);
  await chooseMode(page, "delivery");
  await page.getByRole("button", { name: /^업무 모드 변경, 현재 / }).click();
  const dialog = page.getByRole("dialog", { name: "업무 모드 선택" });
  await dialog.locator('button[data-mode="inventory"]').evaluate((button: HTMLButtonElement) => {
    // The close guard must also cover inputs queued before React disables rows.
    button.click();
    button.click();
    button.closest("dialog")?.dispatchEvent(new Event("cancel", { cancelable: true }));
  });
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("main")).toHaveAttribute("data-mode", "inventory");
  await page.goBack();
  await expect(page.locator("main")).toHaveAttribute("data-mode", "delivery");
  await page.goBack();
  await expect(page.locator("main")).toHaveAttribute("data-mode", "customer");
});

test("mode switches keep the shine moving while the selected button retains focus", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await liveMotionFixture(page);
  const frame = visibleModeFrame(page);
  const motion = () => frame.evaluate((element) => ({ state: getComputedStyle(element, "::before").animationPlayState, transform: getComputedStyle(element, "::before").transform }));
  await expect(frame).toHaveAttribute("data-motion", "running");
  for (const mode of ["sales", "delivery", "customer", "sales"]) {
    await chooseMode(page, mode);
    const button = selectedModeControl(page, mode);
    // Touch-only browsers may not focus on tap; also exercise keyboard focus.
    await button.focus();
    await expect(button).toHaveAttribute("data-mode", mode);
    expect((await motion()).state).toBe("running");
    const previous = (await motion()).transform;
    await expect.poll(async () => (await motion()).transform).not.toBe(previous);
  }
  await page.getByRole("button", { name: "활동 탭", exact: true }).click();
  expect((await motion()).state).toBe("running");
});

test("live header and particles respect user pause, hidden tabs, reduced motion and forced colors", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await liveMotionFixture(page);
  const frame = visibleModeFrame(page);
  const cloud = page.locator("[data-quantum-cloud]");
  const particle = cloud.locator("[data-quantum-particle]").first();
  await expect(cloud).toHaveAttribute("data-motion", "running");
  await page.getByRole("button", { name: "모션 일시정지", exact: true }).click();
  await expect(frame).toHaveAttribute("data-motion", "paused");
  await expect(particle).toHaveCSS("animation-play-state", "paused");
  for (const core of await cloud.locator("[data-quantum-particle] > span").all()) await expect(core).toHaveCSS("animation-play-state", "paused");
  await chooseMode(page, "sales");
  await expect(frame).toHaveAttribute("data-motion", "paused");
  await expect(cloud).toHaveAttribute("data-motion", "paused");
  for (const core of await cloud.locator("[data-quantum-particle] > span").all()) await expect(core).toHaveCSS("animation-play-state", "paused");
  await page.getByRole("button", { name: "모션 재개", exact: true }).click();
  await expect(frame).toHaveAttribute("data-motion", "running");
  await expect(cloud).toHaveAttribute("data-motion", "running");
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(frame).toHaveAttribute("data-motion", "paused");
  await expect(cloud).toHaveAttribute("data-motion", "paused");
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(frame).toHaveAttribute("data-motion", "running");
  await expect(cloud).toHaveAttribute("data-motion", "running");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await frame.evaluate((element) => getComputedStyle(element, "::before").animationName)).toBe("none");
  await expect(particle).toHaveCSS("animation-play-state", "paused");
  for (const core of await cloud.locator("[data-quantum-particle] > span").all()) await expect(core).toHaveCSS("animation-play-state", "paused");
  await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "active" });
  expect(await frame.evaluate((element) => getComputedStyle(element, "::before").display)).toBe("none");
  await expect(cloud).toHaveCSS("visibility", "hidden");
  expect((await new AxeBuilder({ page }).include(".workspace-header").analyze()).violations).toEqual([]);
});

test("each work mode has a coordinated four-particle palette and readable quiet company wordmark", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await liveMotionFixture(page);
  const palettes = {
    customer: ["rgb(102, 174, 152)", "rgb(82, 156, 174)", "rgb(200, 188, 145)", "rgb(154, 175, 208)"],
    delivery: ["rgb(101, 157, 221)", "rgb(88, 169, 181)", "rgb(178, 190, 221)", "rgb(215, 187, 150)"],
    sales: ["rgb(229, 140, 117)", "rgb(191, 159, 175)", "rgb(230, 189, 137)", "rgb(136, 185, 179)"],
  };
  for (const mode of ["customer", "delivery", "sales"] as const) {
    await chooseMode(page, mode);
    const particles = page.locator("[data-quantum-particle]");
    await expect(particles).toHaveCount(4);
    expect(await particles.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).color))).toEqual(palettes[mode]);
    const selected = selectedModeControl(page, mode);
    await expect(page.locator("[data-welcome-title-accent]")).toHaveCSS("color", await selected.evaluate((element) => getComputedStyle(element).color));
    await expect(page.locator("[data-company-wordmark]")).toHaveText("온누리종합식품");
    await expect(page.locator("[data-company-wordmark]").locator("span").first()).toHaveCSS("color", "rgb(49, 91, 101)");
    expect((await new AxeBuilder({ page }).include(".app-brand").analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/header-layout/brand-palette-${mode}-${info.project.name}.png` });
  }
});

test("independent orb breathing explores wider paths without touching the greeting or title", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await liveMotionFixture(page);
  await page.getByRole("button", { name: "모션 일시정지", exact: true }).click();
  const cloud = page.locator("[data-quantum-cloud]");
  const cores = cloud.locator("[data-quantum-particle] > span");
  await expect(cores).toHaveCount(4);
  const spans = await cloud.evaluate((element) => {
    const particles = [...element.querySelectorAll<HTMLElement>("[data-quantum-particle]")];
    const samples = particles.map(() => ({ minimumScale: Infinity, maximumScale: 0, minimumX: Infinity, maximumX: -Infinity }));
    const animations = element.getAnimations({ subtree: true });
    for (let time = 0; time <= 28_000; time += 700) {
      for (const animation of animations) animation.currentTime = time;
      particles.forEach((particle, index) => {
        const orbit = new DOMMatrixReadOnly(getComputedStyle(particle).transform);
        const core = new DOMMatrixReadOnly(getComputedStyle(particle.firstElementChild!).transform);
        const sample = samples[index]!;
        sample.minimumScale = Math.min(sample.minimumScale, core.a);
        sample.maximumScale = Math.max(sample.maximumScale, core.a);
        sample.minimumX = Math.min(sample.minimumX, orbit.e);
        sample.maximumX = Math.max(sample.maximumX, orbit.e);
      });
    }
    return samples;
  });
  for (const sample of spans) {
    expect(sample.maximumScale - sample.minimumScale).toBeGreaterThan(.2);
    expect(sample.maximumX - sample.minimumX).toBeGreaterThan(40);
  }
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const mode of ["customer", "delivery", "sales"]) {
      await chooseMode(page, mode);
      for (const time of [0, 1_800, 4_300, 8_600, 14_500]) {
        const bounds = await cloud.evaluate((element, currentTime) => {
          for (const animation of element.getAnimations({ subtree: true })) animation.currentTime = currentTime;
          const cloudRect = element.getBoundingClientRect();
          const title = document.querySelector("[data-welcome-title-lead]")!.getBoundingClientRect();
          const copy = document.querySelector("[data-greeting-copy]")!.getBoundingClientRect();
          return [...element.querySelectorAll("[data-quantum-particle] > span")].map((core) => {
            const rect = core.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, cloudLeft: cloudRect.left, cloudRight: cloudRect.right, cloudTop: cloudRect.top, cloudBottom: cloudRect.bottom, titleRight: title.right, copyBottom: copy.bottom };
          });
        }, time);
        for (const rect of bounds) {
          expect(rect.left).toBeGreaterThanOrEqual(rect.cloudLeft - 1);
          expect(rect.right).toBeLessThanOrEqual(rect.cloudRight + 1);
          expect(rect.top).toBeGreaterThanOrEqual(rect.cloudTop - 1);
          expect(rect.bottom).toBeLessThanOrEqual(rect.cloudBottom + 1);
          expect(rect.left).toBeGreaterThan(rect.titleRight + 1);
          expect(rect.top).toBeGreaterThan(rect.copyBottom);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `output/playwright/header-layout/orb-breathing-${mode}-${width}-${info.project.name}.png` });
    }
  }
});

test("four-piece loader preserves readable status, three compact sizes and inherited work-mode palettes", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 840 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await liveMotionFixture(page, "loader");
  const catalog = page.getByRole("region", { name: "로더 표시", exact: true });
  await expect(catalog.getByRole("status")).toHaveCount(3);
  const dimensions: number[] = [];
  for (const size of ["small", "medium", "large"]) {
    const loader = catalog.getByRole("status", { name: `${size} 정보 불러오는 중`, exact: true });
    await expect(loader).toHaveAttribute("data-size", size);
    await expect(loader.locator("[data-loader-piece]")).toHaveCount(4);
    const bounds = (await loader.boundingBox())!;
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.width).toBeLessThanOrEqual(160);
    expect(bounds.height).toBeGreaterThan(0);
    dimensions.push(bounds.width);
  }
  expect(dimensions[0]).toBeLessThan(dimensions[1]!);
  expect(dimensions[1]).toBeLessThan(dimensions[2]!);
  const explicit = page.getByRole("region", { name: "명시적 로더 색상", exact: true });
  await expect(explicit.getByRole("status")).toHaveCount(0);
  for (const loader of await explicit.locator("[data-onnuri-loader]").all()) await expect(loader).toHaveAttribute("aria-hidden", "true");
  const colors: string[] = [];
  for (const mode of ["customer", "delivery", "sales"]) {
    await page.getByRole("group", { name: "검증용 업무 모드" }).locator(`[data-mode="${mode}"]`).click();
    await expect(page.locator("main")).toHaveAttribute("data-mode", mode);
    const autoPiece = catalog.locator("[data-loader-piece]").first();
    const explicitPiece = explicit.locator(`[data-tone="${mode}"] [data-loader-piece]`).first();
    const appearance = (element: Element) => { const style = getComputedStyle(element); return `${style.backgroundColor}|${style.backgroundImage}|${style.color}`; };
    await expect.poll(() => autoPiece.evaluate(appearance), `${mode} inherited loader palette`).toBe(await explicitPiece.evaluate(appearance));
    const current = await autoPiece.evaluate(appearance);
    expect(current).toBe(await explicitPiece.evaluate(appearance));
    colors.push(current);
    await page.screenshot({ path: `output/playwright/header-layout/loader-${mode}-${info.project.name}.png` });
  }
  expect(new Set(colors).size).toBe(3);
  await explicit.getByRole("button", { name: "저장 상태", exact: true }).click();
  await expect(page.getByLabel("검증용 버튼 입력 횟수", { exact: true })).toHaveText("1");
  await page.addStyleTag({ content: "html{font-size:200%}" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("four-piece loader moves naturally and respects explicit pause, hidden tabs, reduced motion and forced colors", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 840 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await liveMotionFixture(page, "loader");
  const loader = page.getByRole("status", { name: "medium 정보 불러오는 중", exact: true });
  const piece = loader.locator("[data-loader-piece]").first();
  await expect(loader).toHaveAttribute("data-motion", "running");
  const previous = await piece.evaluate((element) => getComputedStyle(element).transform);
  await expect.poll(() => piece.evaluate((element) => getComputedStyle(element).transform)).not.toBe(previous);
  await page.getByRole("button", { name: "모션 일시정지", exact: true }).click();
  await expect(loader).toHaveAttribute("data-motion", "paused");
  await expect(piece).toHaveCSS("animation-play-state", "paused");
  await page.getByRole("group", { name: "검증용 업무 모드" }).locator('[data-mode="sales"]').click();
  await expect(loader).toHaveAttribute("data-motion", "paused");
  await page.getByRole("button", { name: "모션 재개", exact: true }).click();
  await expect(loader).toHaveAttribute("data-motion", "running");
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(loader).toHaveAttribute("data-motion", "paused");
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(loader).toHaveAttribute("data-motion", "running");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(loader).toHaveAttribute("data-motion", "paused");
  await expect(piece).toHaveCSS("animation-name", "none");
  await page.emulateMedia({ forcedColors: "active" });
  await expect(loader).toBeVisible();
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
});

// Generated from the real React component, CSS Module, and production global
// stylesheet by: npx vitest run src/features/app-shell/app-shell-header.test.ts
for (const mode of ["customer", "delivery", "sales"] as const) {
for (const state of ["triple", "triple-detail"] as const) {
  test(`${mode} ${state} keeps all three labels readable at 320–1280px`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/brand/onnuri-food-logo.png", (route) => route.fulfill({
      contentType: "image/png", body: readFileSync(new URL("../../public/brand/onnuri-food-logo.png", import.meta.url)),
    }));
    const fixture = readFileSync(new URL(`../../output/playwright/header-layout/${mode}-${state}.html`, import.meta.url), "utf8");
    for (const width of [320, 360, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.setContent(fixture.replace("<head>", '<head><base href="http://header.fixture/">'));
      const group = page.locator('[data-mode-switcher="segmented"] [role="group"]');
      await expect(group.locator("button")).toHaveText(["거래처", "학교납품", "영업/홍보"]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const geometry = await page.locator(".workspace-header").evaluate((element) => {
        const leading = element.firstElementChild!.getBoundingClientRect();
        const controls = element.querySelector(".workspace-header__controls")!.getBoundingClientRect();
        return { leadingRight: leading.right, controlsLeft: controls.left, controlsRight: controls.right };
      });
      expect(geometry.leadingRight + 4).toBeLessThanOrEqual(geometry.controlsLeft);
      expect(geometry.controlsRight).toBeLessThanOrEqual(width);
      await expect(group.locator(`[data-mode="${mode}"]`)).toHaveAttribute("aria-pressed", "true");
      const selected = selectedModeControl(page, mode);
      const colors = { customer: ["rgb(39, 74, 148)", "rgb(56, 104, 206)"], delivery: ["rgb(27, 100, 218)", "rgb(49, 130, 246)"], sales: ["rgb(250, 111, 66)", "rgb(250, 170, 157)"] } as const;
      await expect(selected).toHaveCSS("color", colors[mode][0]);
      expect(await selected.evaluate(element => getComputedStyle(element).boxShadow)).toContain(colors[mode][1]);
      for (const button of await visibleModeFrame(page).getByRole("button").all()) {
        const size = await button.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight, fits: element.scrollWidth <= element.clientWidth }));
        expect(size.width).toBeGreaterThanOrEqual(44);
        expect(size.height).toBeGreaterThanOrEqual(44);
        expect(size.fits).toBe(true);
      }
      expect((await new AxeBuilder({ page }).include(".workspace-header").analyze()).violations).toEqual([]);
      await page.locator(".workspace-header").screenshot({ path: `output/playwright/header-layout/${mode}-${state}-${width}-${testInfo.project.name}.png` });
    }
  });
}
}

for (const mode of ["delivery", "sales"] as const) {
  for (const state of ["dual", "single", "detail"] as const) {
    test(`${mode} ${state} header preserves 320/390/1280 layout and touch targets`, async ({ page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.route("**/brand/onnuri-food-logo.png", (route) => route.fulfill({
        contentType: "image/png", body: readFileSync(new URL("../../public/brand/onnuri-food-logo.png", import.meta.url)),
      }));
      const fixture = readFileSync(new URL(`../../output/playwright/header-layout/${mode}-${state}.html`, import.meta.url), "utf8");
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 740 });
        await page.setContent(fixture.replace("<head>", '<head><base href="http://header.fixture/">'));
        const header = page.locator(".workspace-header");
        const geometry = await header.evaluate((element) => {
          const leading = element.firstElementChild!.getBoundingClientRect();
          const controls = element.querySelector(".workspace-header__controls")!.getBoundingClientRect();
          const mark = element.querySelector(".app-brand__mark")?.getBoundingClientRect();
          const svg = element.querySelector(".app-brand__mark > svg")?.getBoundingClientRect();
          return { leadingRight: leading.right, controlsLeft: controls.left, controlsRight: controls.right,
            overflow: document.documentElement.scrollWidth > innerWidth,
            scale: mark && svg ? svg.width / mark.width : null };
        });
        expect(geometry.overflow).toBe(false);
        expect(geometry.leadingRight + 4).toBeLessThanOrEqual(geometry.controlsLeft);
        expect(geometry.controlsRight).toBeLessThanOrEqual(width);
        if (geometry.scale !== null) expect(geometry.scale).toBeCloseTo(0.85, 2);
        if (state !== "detail") {
          await expect(header.getByText("온누리종합식품", { exact: true })).toBeVisible();
          await expect(header.locator(".app-brand__wordmark strong")).toHaveCSS("font-size", width < 760 ? "13px" : "15px");
        } else {
          await expect(header.getByRole("button", { name: "학교 목록" })).toBeVisible();
          await expect(header.locator(".workspace-header__back")).toHaveCSS("white-space", "nowrap");
        }
        expect(await header.locator(".employee-avatar").count()).toBe(0);
        const targets = await header.locator("button:visible").evaluateAll((buttons) => buttons.map((button) => ({
          width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height,
        })));
        for (const target of targets) {
          expect(target.width).toBeGreaterThanOrEqual(44);
          expect(target.height).toBeGreaterThanOrEqual(44);
        }
        if (state !== "single") {
          expect(targets.slice(state === "detail" ? 1 : 0).every((target) => target.width >= 70)).toBe(true);
          const selected = selectedModeControl(page, mode);
          await expect(selected).toHaveCSS("color", mode === "sales" ? "rgb(250, 111, 66)" : "rgb(27, 100, 218)");
          expect(await selected.evaluate((element) => getComputedStyle(element).boxShadow)).toContain(mode === "sales" ? "rgb(250, 170, 157)" : "rgb(49, 130, 246)");
        }
        expect((await new AxeBuilder({ page }).include(".workspace-header").analyze()).violations).toEqual([]);
        await header.screenshot({ path: `output/playwright/header-layout/${mode}-${state}-${width}-${testInfo.project.name}.png` });
      }
    });
  }
}

test("header orbit supports an indefinite user pause, reduced motion, and forced colors", async ({ page }) => {
  const fixture = readFileSync(new URL("../../output/playwright/header-layout/sales-dual.html", import.meta.url), "utf8");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setContent(fixture);
  const frame = visibleModeFrame(page);
  const pseudo = () => frame.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return { name: style.animationName, state: style.animationPlayState, count: style.animationIterationCount,
      duration: style.animationDuration, background: style.backgroundImage, display: style.display };
  });
  expect((await pseudo()).state).toBe("paused");
  await frame.evaluate((element) => element.setAttribute("data-motion", "running"));
  expect(await pseudo()).toMatchObject({ name: "mode-border-orbit", state: "running", count: "infinite", duration: "8s" });
  expect((await pseudo()).background).toContain("rgb(77, 147, 229)");
  expect((await pseudo()).background).toContain("rgb(73, 164, 140)");
  await frame.evaluate((element) => element.setAttribute("data-motion", "paused"));
  await page.mouse.move(0, 700);
  expect((await pseudo()).state).toBe("paused");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect((await pseudo()).name).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "active" });
  expect(await pseudo()).toMatchObject({ display: "none", name: "none" });
  const selected = selectedModeControl(page, "sales");
  await expect(selected).toHaveCSS("box-shadow", "none");
  expect(await selected.evaluate((element) => getComputedStyle(element).color)).not.toBe("rgb(39, 74, 148)");
  expect((await new AxeBuilder({ page }).include(".workspace-header").analyze()).violations).toEqual([]);
});

test("work modes preserve a static aurora with a distinct coral sales palette and accessible forced colors", async ({ page }, testInfo) => {
  const backgrounds: string[] = [];
  await page.route("**/brand/onnuri-food-logo.png", (route) => route.fulfill({
    contentType: "image/png", body: readFileSync(new URL("../../public/brand/onnuri-food-logo.png", import.meta.url)),
  }));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const mode of ["delivery", "customer", "sales"]) {
    const fixture = readFileSync(new URL(`../../output/playwright/header-layout/${mode}-triple.html`, import.meta.url), "utf8");
    await page.setContent(fixture.replace("<head>", '<head><base href="http://header.fixture/">'));
    const canvas = page.locator(".aurora-background");
    await expect(canvas).toHaveCSS("pointer-events", "none");
    await expect(canvas).toHaveCSS("animation-name", "none");
    await expect(canvas).toHaveAttribute("aria-hidden", "true");
    const background = await canvas.evaluate((element) => getComputedStyle(element).backgroundImage);
    expect(background.match(/radial-gradient/g)).toHaveLength(3);
    if (mode === "sales") {
      const tints = await canvas.evaluate((element) => ["--sales-tint-peach", "--sales-tint-rose", "--sales-tint-lilac"].map((token) => getComputedStyle(element).getPropertyValue(token).trim()));
      expect(tints).toEqual(["#faaa9d", "#efd3df", "#dcd7ee"]);
      const tintOpacities = [...background.split("linear-gradient")[0]!.matchAll(/(?:rgba|color)\([^)]*[,/]\s*([\d.]+)\)/g)].map((match) => Number(match[1])).filter((alpha) => alpha > 0);
      expect(tintOpacities).toHaveLength(3);
      expect(Math.max(...tintOpacities)).toBeLessThanOrEqual(.16);
      expect(background).not.toContain("rgba(174, 223, 205, 0.22)");
    } else {
      expect(background).toContain("rgba(100, 168, 255, 0.24)");
      expect(background).toContain("rgba(144, 194, 255, 0.2)");
      expect(background).toContain("rgba(174, 223, 205, 0.22)");
    }
    backgrounds.push(background);
    // Exercise readable production text/surface styles against the actual canvas.
    await page.locator("main").evaluate((element) => element.insertAdjacentHTML("beforeend", '<section class="shell-page"><h1>학교 방문 준비</h1><p class="shell-greeting">오늘도 반가워요.</p><article class="soft-card" style="padding:24px;margin-top:24px"><h2>내 담당 학교</h2><p>오늘의 방문 기록과 다음 일정을 확인해요.</p></article></section>'));
    expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
    await page.screenshot({ path: `output/playwright/header-layout/aurora-${mode}-${testInfo.project.name}.png` });
    await page.emulateMedia({ forcedColors: "active" });
    await expect(canvas).toHaveCSS("background-image", "none");
    await expect(canvas.locator("i").first()).toHaveCSS("display", "none");
    await page.emulateMedia({ forcedColors: "none" });
  }
  expect(backgrounds[0]).toBe(backgrounds[1]);
  expect(backgrounds[2]).not.toBe(backgrounds[0]);
});
