import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { buildInventoryPhotoFixture } from "../helpers/build-inventory-photo-fixture";

let fixture: Awaited<ReturnType<typeof buildInventoryPhotoFixture>>;
test.beforeAll(async () => {
  fixture = await buildInventoryPhotoFixture("tests/e2e/fixtures/delivery-photo-cards.tsx");
  const compiled = await postcss([tailwindcss()]).process(fixture.css, { from: fileURLToPath(new URL("../../src/app/globals.css", import.meta.url)) });
  fixture.css = compiled.css;
});

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", request => errors.push(request.url()));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://photo-cards.test") return route.abort();
    if (url.pathname === "/ui/customer-ceramic-camera-v1.webp") return route.fulfill({ contentType: "image/webp", body: readFileSync(new URL(`../../public${url.pathname}`, import.meta.url)) });
    if (url.pathname !== "/") return route.abort();
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>납품사진 카드 검증</title><style>${fixture.css}</style><div id="root"></div><script>${fixture.script.replaceAll("</script>", "<\\/script>")}</script></html>` });
  });
  await page.goto("http://photo-cards.test/");
  await expect(page.getByRole("list", { name: "검색된 납품처" }).getByRole("listitem")).toHaveCount(5);
  return errors;
}

async function geometry(page: Page) {
  return page.getByRole("list", { name: "검색된 납품처" }).getByRole("listitem").evaluateAll(rows => ({
    viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    rows: rows.map(row => {
      const inspect = (element: Element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right,
          minWidth: style.minWidth, boxSizing: style.boxSizing, fontSize: style.fontSize, columns: style.gridTemplateColumns };
      };
      return { name: row.querySelector("strong")!.textContent, card: inspect(row),
        text: inspect(row.querySelector('[aria-label$="사진 기록"]')!),
        camera: inspect(row.querySelector('[aria-label$="카메라 촬영"]')!), more: inspect(row.querySelector('[aria-label$="더보기"]')!) };
    }),
  }));
}

async function waitForLayoutInput(page: Page, width: number, fontSize = "16px") {
  await expect.poll(() => page.evaluate(() => ({ width: innerWidth, fontSize: getComputedStyle(document.documentElement).fontSize })))
    .toEqual({ width, fontSize });
}

test("photo card controls remain centered across full cards and fit every viewport", async ({ page }, info) => {
  const errors = await open(page);
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 950 });
    await waitForLayoutInput(page, width);
    const rows = page.getByRole("list", { name: "검색된 납품처" }).getByRole("listitem");
    const measured = await geometry(page);
    await info.attach(`geometry-${width}`, { body: JSON.stringify(measured, null, 2), contentType: "application/json" });
    for (const row of measured.rows) {
      for (const control of [row.camera, row.more]) {
        expect(control.width, JSON.stringify(row)).toBeGreaterThanOrEqual(48);
        expect(control.height, JSON.stringify(row)).toBeGreaterThanOrEqual(48);
        expect(Math.abs(control.y + control.height / 2 - row.card.y - row.card.height / 2), JSON.stringify(row)).toBeLessThan(2);
        expect(control.right, JSON.stringify(row)).toBeLessThanOrEqual(row.card.right);
      }
      expect(row.more.x - row.camera.right, JSON.stringify(row)).toBeGreaterThanOrEqual(4);
    }
    for (const image of await rows.getByRole("button", { name: /카메라 촬영$/ }).locator("img").all()) {
      expect(await image.evaluate(async element => {
        const image = element as HTMLImageElement;
        await image.decode(); return image.naturalWidth;
      })).toBe(192);
    }
    expect(measured.scrollWidth).toBeLessThanOrEqual(measured.viewport);
    await page.screenshot({ path: `output/photo-cards-20261104/cards-${width}-${info.project.name}.png`, fullPage: true, scale: "css" });
  }
  expect(errors).toEqual([]);
});

test("photo card actions remain separate and the real more menu closes after selection", async ({ page }) => {
  const errors = await open(page);
  const events = page.getByRole("status", { name: "동작 기록" });
  const history = page.getByRole("button", { name: "새봄 급식 사진 기록", exact: true });
  await history.focus(); await page.keyboard.press("Enter");
  await expect(events).toHaveText("history:PREVIEW-0");
  const camera = page.getByRole("button", { name: "새봄 급식 카메라 촬영", exact: true });
  await camera.focus(); await page.keyboard.press("Enter");
  await expect(events).toHaveText("history:PREVIEW-0\ncamera:PREVIEW-0");
  const more = page.getByRole("button", { name: "새봄 급식 더보기", exact: true });
  await more.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "새봄 급식 더보기", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "앨범에서 사진 추가", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(events).toHaveText("history:PREVIEW-0\ncamera:PREVIEW-0\nmore:PREVIEW-0\nalbum:PREVIEW-0");
  await more.click();
  await dialog.getByRole("button", { name: "거래처 상세정보", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(events).toContainText("detail:PREVIEW-0");
  await page.getByRole("listitem").first().getByRole("button", { name: "오늘 추가", exact: true }).click();
  await expect(page.getByRole("listitem").first()).toContainText("오늘 목록");
  await page.getByRole("button", { name: "온유 식당 사진 업로드 다시 시도", exact: true }).click();
  await expect(events).toContainText("retry:retry-photo");
  await expect(page.getByRole("button", { name: "도담 학교 카메라 촬영", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "아침 공장 카메라 촬영", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "아침 공장 더보기", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "앨범에서 사진 추가", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("photo card text and options meet contrast and remain operable with larger text and forced colors", async ({ page }, info) => {
  const errors = await open(page);
  await page.setViewportSize({ width: 390, height: 950 });
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
  const contrast = await page.getByRole("button", { name: "새봄 급식 더보기", exact: true }).evaluate(element => {
    const rgb = getComputedStyle(element).color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const linear = rgb.map(channel => { const value = channel / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
    return 1.05 / (.2126 * linear[0]! + .7152 * linear[1]! + .0722 * linear[2]! + .05);
  });
  expect(contrast).toBeGreaterThanOrEqual(3);
  await page.setViewportSize({ width: 320, height: 950 });
  await page.addStyleTag({ content: "html{font-size:200%}" });
  await waitForLayoutInput(page, 320, "32px");
  const measured = await geometry(page);
  await info.attach("geometry-large-text", { body: JSON.stringify(measured, null, 2), contentType: "application/json" });
  expect(measured.scrollWidth).toBeLessThanOrEqual(measured.viewport);
  for (const row of measured.rows) expect(row.text.right, JSON.stringify(row)).toBeLessThanOrEqual(row.camera.x);
  await page.screenshot({ path: `output/photo-cards-20261104/cards-large-text-${info.project.name}.png`, fullPage: true, scale: "css" });
  await page.emulateMedia({ forcedColors: "active" });
  const more = page.getByRole("button", { name: "새봄 급식 더보기", exact: true });
  await more.focus(); await expect(more).toBeFocused(); await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "새봄 급식 더보기", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({ path: `output/photo-cards-20261104/cards-forced-colors-${info.project.name}.png`, fullPage: true, scale: "css" });
  expect(errors).toEqual([]);
});
