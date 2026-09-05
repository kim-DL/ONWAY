import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../", import.meta.url));
const globals = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");
let script = "";
let moduleCss = "";

test.beforeAll(async () => {
  // Bundle the actual React components and CSS modules; no application server,
  // Firebase session, hand-written card markup, or Next build is involved.
  const result = await build({
    absWorkingDir: root,
    entryPoints: ["tests/e2e/fixtures/sales-school-cards.tsx"],
    outfile: "sales-school-card-fixture.js",
    bundle: true, write: false, platform: "browser", format: "iife",
    jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
  });
  script = result.outputFiles.find((file) => file.path.endsWith(".js"))?.text ?? "";
  moduleCss = result.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "";
  expect(script.length).toBeGreaterThan(0);
  expect(moduleCss.length).toBeGreaterThan(0);
});

async function fixture(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"><title>학교 카드 검증</title>
    <style>${globals}</style><style>${moduleCss}</style><style>
    #card-fixture { display:block; padding:12px; min-height:100vh; width:100%; }
    #card-fixture > h1 { font-size:1rem; margin:0 0 12px; }
    .fixture-list { display:grid; grid-template-columns:minmax(0,1fr); gap:10px; margin-bottom:20px; min-width:0; }
    .fixture-list > div { display:grid; grid-template-columns:minmax(0,1fr); min-width:0; }
    </style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: script });
  await expect(page.locator(".assignment-card")).toHaveCount(6);
  await expect(page.locator(".sales-task-row")).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
}

async function noOverflow(locator: Locator) {
  const geometry = await locator.evaluate((element) => ({
    description: `${element.className}: ${element.textContent?.slice(0, 40)}`,
    scroll: element.scrollWidth, client: element.clientWidth,
    left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
    viewport: window.innerWidth,
  }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right, geometry.description).toBeLessThanOrEqual(geometry.viewport + 1);
}

async function fullNameVisible(locator: Locator) {
  const geometry = await locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return { textBottom: text.bottom, boxBottom: box.bottom, textRight: text.right, boxRight: box.right,
      scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
      clamp: getComputedStyle(element).webkitLineClamp };
  });
  expect(geometry.textBottom).toBeLessThanOrEqual(geometry.boxBottom + 1);
  expect(geometry.textRight).toBeLessThanOrEqual(geometry.boxRight + 1);
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
  expect(geometry.clamp).toBe("none");
}

for (const width of [320, 390]) {
  test(`actual cards remain compact and long names wrap fully at ${width}px`, async ({ page }, testInfo) => {
    await fixture(page, width);
    const heights: Record<string, number> = {};
    for (const kind of ["assignment", "activity"]) {
      for (const grade of ["elementary", "middle", "high"]) {
        const card = page.getByTestId(`${kind}-${grade}`).locator(kind === "assignment" ? ".assignment-card" : ".sales-task-row");
        const box = await card.boundingBox();
        expect(box).not.toBeNull();
        heights[`${kind}-${grade}`] = box!.height;
        expect(box!.height).toBeLessThanOrEqual(kind === "assignment" ? 160 : 100);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await noOverflow(card);
      }
    }
    for (const kind of ["assignment", "activity"]) {
      const card = page.getByTestId(`${kind}-long`);
      await noOverflow(card);
      await fullNameVisible(card.locator("strong"));
      await expect(card.locator("strong")).toHaveText("대전온누리미래융합과학국제문화예술고등학교부설방송통신고등학교");
    }
    await testInfo.attach(`card-heights-${width}`, { body: JSON.stringify(heights), contentType: "application/json" });
    await page.screenshot({ path: `output/playwright/sales-school-cards/${width}-${testInfo.project.name}.png`, fullPage: true });
  });
}

test("school grades are distinct, district/grade text is not repeated, and all delivery states remain explicit", async ({ page }) => {
  await fixture(page, 320);
  const glyphs = new Set<string>();
  for (const [grade, label, status] of [
    ["elementary", "초등학교", "미확인"], ["middle", "중학교", "미전달"], ["high", "고등학교", "전달"],
  ] as const) {
    const assignment = page.getByTestId(`assignment-${grade}`);
    const activity = page.getByTestId(`activity-${grade}`);
    for (const card of [assignment, activity]) {
      const text = await card.innerText();
      expect(text.match(/대덕구/g)).toHaveLength(1);
      expect(text.split(label!).length - 1).toBe(1);
      await expect(card.getByRole("img", { name: label, exact: true })).toBeVisible();
    }
    glyphs.add(await assignment.locator("[data-school-type] svg").innerHTML());
    await expect(assignment.getByText(`홍보지 ${status}`, { exact: true })).toBeVisible();
    await expect(assignment.getByText(`샘플 ${status}`, { exact: true })).toBeVisible();
  }
  expect(glyphs.size).toBe(3);
  await expect(page.getByTestId("assignment-long")).toContainText("동선 16번째");
  await expect(page.getByTestId("assignment-long")).toContainText("외 1명");
  await expect(page.getByTestId("assignment-long")).toContainText("최근 방문");
  await expect(page.getByTestId("activity-elementary").locator("small")).toHaveAttribute("title", "대전광역시 대덕구 대화로 242-36");
});

test("real click and controlled manage selection preserve callbacks and disabled protection", async ({ page }) => {
  await fixture(page);
  await page.getByTestId("assignment-elementary").getByRole("button").click();
  await page.getByTestId("activity-middle").getByRole("button").click();
  await expect(page.getByTestId("events")).toHaveText("select:elementary|select:middle");
  const enabled = page.getByTestId("manage-enabled");
  await enabled.locator("strong").click();
  await expect(enabled.getByRole("checkbox")).toBeChecked();
  await expect(enabled.locator(".assignment-card")).toHaveAttribute("data-selected", "true");
  await enabled.locator("strong").click();
  await expect(enabled.getByRole("checkbox")).not.toBeChecked();
  const disabled = page.getByTestId("manage-disabled");
  await expect(disabled.getByRole("checkbox")).toBeDisabled();
  // Playwright intentionally refuses locator.click on a disabled label. Send
  // a real pointer click to its visible name without bypassing browser behavior.
  await disabled.scrollIntoViewIfNeeded();
  const disabledName = await disabled.locator("strong").boundingBox();
  expect(disabledName).not.toBeNull();
  await page.mouse.click(disabledName!.x + 4, disabledName!.y + 4);
  await expect(page.getByTestId("events")).toHaveText("select:elementary|select:middle|toggle:elementary:true|toggle:elementary:false");
  await expect(disabled).toContainText("업무 기록이 있어 담당 변경만 가능");
});

test("keyboard focus is visible on normal cards and manage checkbox; disabled row is skipped", async ({ page }) => {
  await fixture(page);
  await page.keyboard.press("Tab");
  const first = page.getByTestId("assignment-elementary").getByRole("button");
  await expect(first).toBeFocused();
  await expect(first).toHaveCSS("outline-width", "3px");
  await expect(first).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("events")).toHaveText("select:elementary");
  for (let index = 0; index < 8; index += 1) await page.keyboard.press("Tab");
  const manage = page.getByTestId("manage-enabled");
  await expect(manage.getByRole("checkbox")).toBeFocused();
  await expect(manage.locator(".assignment-card")).toHaveCSS("outline-width", "3px");
  await page.keyboard.press("Space");
  await expect(manage.getByRole("checkbox")).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("manage-disabled").getByRole("checkbox")).not.toBeFocused();
});

test("200% text and reduced motion retain complete school names, readable controls, and access semantics", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixture(page, 320);
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await expect(page.getByTestId("assignment-elementary").locator("strong")).toHaveCSS("font-size", "32px");
  for (const card of await page.locator(".assignment-card, .sales-task-row").all()) {
    await noOverflow(card);
    await fullNameVisible(card.locator("strong"));
    const duration = await card.evaluate((element) => getComputedStyle(element).transitionDuration);
    // The shared reduced-motion reset uses 0.01ms to retain transitionend hooks.
    expect(duration.split(",").every((value) => Number.parseFloat(value) <= 0.00001)).toBe(true);
    await expect(card).toHaveCSS("animation-name", "none");
  }
  const card = page.getByTestId("assignment-elementary").getByRole("button");
  await card.hover();
  await expect(card).toHaveCSS("transform", "none");
  await card.click();
  await expect(page.getByTestId("events")).toHaveText("select:elementary");
  const audit = await new AxeBuilder({ page }).include("#card-fixture").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(audit.violations).toEqual([]);
});
