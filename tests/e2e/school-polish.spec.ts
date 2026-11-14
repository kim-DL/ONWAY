import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { buildCustomerCeramicFixture } from "../helpers/build-customer-ceramic-fixture";

let fixture: Awaited<ReturnType<typeof buildCustomerCeramicFixture>>;
test.beforeAll(async () => { fixture = await buildCustomerCeramicFixture(true, false, true); });
async function open(page: Page, empty = false) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("http://school-polish.test/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/ui/") || path.startsWith("/brand/")) return route.fulfill({ contentType: path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".webp") ? "image/webp" : "image/png", body: readFileSync(new URL(`../../public${path}`, import.meta.url)) });
    if (path !== "/") return route.abort();
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>학교 화면 검증</title><style>${fixture.css}</style><div id="root"></div><script>${fixture.script.replaceAll("</script>", "<\\/script>")}</script></html>` });
  });
  await page.goto(`http://school-polish.test/${empty ? "?empty" : ""}`);
  await page.getByRole("group", { name: "업무 모드" }).getByRole("button", { name: "학교", exact: true }).click();
  await expect(page.getByRole("heading", { name: "최근 본 학교" })).toBeVisible();
}

test("school home and search keep long names, readable metadata and ceramic assets across widths", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await open(page);
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator(".delivery-recents__list > button")).toHaveCount(3);
    for (const selector of [".school-search-trigger small", ".delivery-recents__school small", ".delivery-recents__time"]) {
      await expect(page.locator(selector).first()).toHaveCSS("font-size", "14px");
    }
    for (const button of await page.locator(".delivery-recents button, .school-search-trigger").all()) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
    }
    expect(await page.locator(".delivery-recents__school strong").evaluateAll(elements => elements.every(el => el.scrollWidth <= el.clientWidth))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/school-unslop/home-${width}-${info.project.name}.png` });
    await page.locator(".school-search-trigger").click();
    await expect(page.getByRole("combobox", { name: "학교명 검색" })).toBeFocused();
    await page.getByRole("combobox", { name: "학교명 검색" }).fill("예시");
    await expect(page.getByRole("option")).toHaveCount(3);
    const icons = page.locator(".school-search-result__mark img");
    expect(await icons.evaluateAll(async images => { await Promise.all(images.map(img => (img as HTMLImageElement).decode())); return images.every(img => (img as HTMLImageElement).naturalWidth === 192); })).toBe(true);
    await expect(page.locator(".school-search-result__meta").first()).toHaveCSS("font-size", "14px");
    expect(await page.locator(".school-search-result").evaluateAll(rows => rows.every(row => row.scrollWidth <= row.clientWidth + 1))).toBe(true);
    expect(await page.locator(".school-search-result__body").evaluateAll(bodies => bodies.every(body => {
      const row = body.parentElement!.getBoundingClientRect();
      const content = body.getBoundingClientRect();
      return content.top >= row.top && content.bottom <= row.bottom;
    }))).toBe(true);
    expect((await new AxeBuilder({ page }).include(".school-search-layer").analyze()).violations).toEqual([]);
    await page.screenshot({ path: `output/school-unslop/search-${width}-${info.project.name}.png` });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".school-search-trigger")).toBeFocused();
  }
  expect(errors).toEqual([]);
});

test("empty school entry works with keyboard and enlarged text, and search retains forced-color glyphs", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await open(page, true);
  const entry = page.getByRole("button", { name: "학교를 찾아 현장정보 확인" });
  await expect(entry).toBeVisible();
  await entry.locator("img").evaluate(async image => (image as HTMLImageElement).decode());
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await entry.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "학교명 검색" })).toBeFocused();
  expect(await page.locator(".school-search-result").evaluateAll(rows => rows.every(row => row.scrollWidth <= row.clientWidth + 1))).toBe(true);
  expect(await page.locator(".school-search-result__body").evaluateAll(bodies => bodies.every(body => body.getBoundingClientRect().bottom <= body.parentElement!.getBoundingClientRect().bottom))).toBe(true);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await expect(page.locator(".school-search-result__mark svg").first()).toBeVisible();
  await expect(page.locator(".school-search-result__mark img").first()).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(entry).toBeFocused();
});
