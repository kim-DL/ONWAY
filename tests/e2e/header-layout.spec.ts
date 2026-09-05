import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Generated from the real React component, CSS Module, and production global
// stylesheet by: npx vitest run src/features/app-shell/app-shell-header.test.ts
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
        const targets = await header.locator("button").evaluateAll((buttons) => buttons.map((button) => ({
          width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height,
        })));
        for (const target of targets) {
          expect(target.width).toBeGreaterThanOrEqual(44);
          expect(target.height).toBeGreaterThanOrEqual(44);
        }
        if (state !== "single") {
          expect(targets.slice(state === "detail" ? 1 : 0).every((target) => target.width >= 70)).toBe(true);
          const selected = header.locator('button[aria-pressed="true"]');
          await expect(selected).toHaveCSS("color", mode === "sales" ? "rgb(36, 118, 71)" : "rgb(27, 100, 218)");
          expect(await selected.evaluate((element) => getComputedStyle(element).boxShadow)).toContain(mode === "sales" ? "rgb(38, 150, 83)" : "rgb(49, 130, 246)");
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
  const frame = page.locator("[data-motion]");
  const pseudo = () => frame.evaluate((element) => {
    const style = getComputedStyle(element, "::before");
    return { name: style.animationName, state: style.animationPlayState, count: style.animationIterationCount, display: style.display };
  });
  expect((await pseudo()).state).toBe("paused");
  await frame.evaluate((element) => element.setAttribute("data-motion", "running"));
  expect(await pseudo()).toMatchObject({ name: "mode-border-orbit", state: "running", count: "infinite" });
  await frame.evaluate((element) => element.setAttribute("data-motion", "paused"));
  await page.mouse.move(0, 700);
  expect((await pseudo()).state).toBe("paused");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect((await pseudo()).name).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "active" });
  expect(await pseudo()).toMatchObject({ display: "none", name: "none" });
  const selected = page.locator('button[aria-pressed="true"]');
  await expect(selected).toHaveCSS("box-shadow", "none");
  expect(await selected.evaluate((element) => getComputedStyle(element).color)).not.toBe("rgb(36, 118, 71)");
  expect((await new AxeBuilder({ page }).include(".workspace-header").analyze()).violations).toEqual([]);
});
