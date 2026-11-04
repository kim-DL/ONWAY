import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { buildInventorySettingsFixture } from "../helpers/build-inventory-settings-fixture";

let fixture: Awaited<ReturnType<typeof buildInventorySettingsFixture>>;
test.beforeAll(async () => { fixture = await buildInventorySettingsFixture(); });
async function open(page: Page, query = "") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("http://inventory-settings.test/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/ui/") || path.startsWith("/brand/")) return route.fulfill({ contentType: path.endsWith(".webp") ? "image/webp" : "image/png", body: readFileSync(new URL(`../../public${path}`, import.meta.url)) });
    if (path !== "/") return route.abort();
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>재고 설정 검증</title><style>${fixture.css}</style><div id="root"></div><script>${fixture.script.replaceAll("</script>", "<\\/script>")}</script></html>` });
  });
  await page.goto(`http://inventory-settings.test/${query}`);
  await expect(page.getByRole("button", { name: "목록 옵션", exact: true })).toBeVisible();
}
async function settings(page: Page) {
  await page.getByRole("button", { name: "목록 옵션", exact: true }).click();
  await page.getByRole("button", { name: "앱 설정", exact: true }).click();
  await expect(page.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "목록 옵션" })).toHaveCount(0);
}

test("read-only staff can reach settings without gaining write controls", async ({ page }) => {
  await open(page, "?readonly");
  await expect(page.getByText("80개 품목 · 읽기 전용")).toBeVisible();
  await expect(page.locator(".workspace-navigation")).toHaveCount(0);
  await page.getByRole("button", { name: "목록 옵션", exact: true }).click();
  await expect(page.getByRole("button", { name: "앱 설정", exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "재고조사 모드" })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "새 품목 등록" })).toHaveCount(0);
  await page.getByRole("button", { name: "앱 설정", exact: true }).click();
  await expect(page.getByRole("button", { name: "재고로 돌아가기" })).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel("품목 검색")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("location underline follows the final selection and respects reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await open(page, "?readonly");
  const locations = page.getByRole("group", { name: "보관 장소" });
  const indicator = () => locations.evaluate(el => {
    const selected = el.querySelector('[aria-pressed="true"]')!.getBoundingClientRect();
    const line = getComputedStyle(el.querySelector("span")!);
    return { center: el.getBoundingClientRect().left + parseFloat(line.left) + 15,
      selectedCenter: selected.left + selected.width / 2, transition: line.transitionProperty };
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await locations.getByRole("button", { name: "냉동1", exact: true }).click();
  await locations.getByRole("button", { name: "샘플", exact: true }).click();
  await expect(locations.getByRole("button", { name: "샘플", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => { const line = await indicator(); return Math.abs(line.center - line.selectedCenter); }).toBeLessThan(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await locations.getByRole("button", { name: "전체", exact: true }).click();
  const line = await indicator();
  expect(Math.abs(line.center - line.selectedCenter)).toBeLessThan(1);
  expect(line.transition).toBe("none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("settings return preserves inventory filters, search and scroll without a retired sheet entry", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "냉동1", exact: true }).click();
  await page.getByLabel("품목 검색").fill("샘플");
  await expect(page.getByRole("listitem").first()).toBeVisible();
  const scroller = page.locator(".workspace-content");
  await scroller.evaluate(e => { e.scrollTop = 300; });
  await expect.poll(() => scroller.evaluate(e => e.scrollTop)).toBeGreaterThan(250);
  await page.getByRole("button", { name: "목록 옵션", exact: true }).evaluate(e => (e as HTMLElement).focus({ preventScroll: true }));
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "앱 설정", exact: true }).click();
  await expect(page.getByRole("button", { name: "재고로 돌아가기" })).toBeVisible();
  await expect.poll(() => scroller.evaluate(e => e.scrollTop)).toBe(0);
  await page.getByRole("button", { name: "재고로 돌아가기" }).click();
  await expect(page.getByLabel("품목 검색")).toHaveValue("샘플");
  await expect(page.getByRole("button", { name: "냉동1", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => scroller.evaluate(e => e.scrollTop)).toBeGreaterThan(250);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => window.history.state.onnuriwaySheet)).toBeUndefined();
});

test("settings survive reload and provide a return route", async ({ page }) => {
  await open(page, "?readonly"); await settings(page); await page.reload();
  await expect(page.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "재고로 돌아가기" }).click();
  await expect(page.getByLabel("품목 검색")).toBeVisible();
});

test("catalog failure does not remove app settings and logout retains confirmation and error recovery", async ({ page }) => {
  await open(page, "?readonly&error&logout-fail"); await settings(page);
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.getByRole("button", { name: "계속 사용하기" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.locator("html").getAttribute("data-logout-requests")).toBeNull();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.getByRole("dialog", { name: "로그아웃할까요?" }).getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.getByText("로그아웃하지 못했습니다. 잠시 후 다시 시도해주세요.")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-logout-requests", "1");
  await expect(page.getByRole("button", { name: "재고로 돌아가기" })).toBeEnabled();
});

test("inventory has no empty nav space and other modes retain navigation", async ({ page }, info) => {
  await open(page);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    await expect(page.locator(".workspace-content")).toHaveCSS("margin-left", "0px");
    const button = page.getByRole("button", { name: "새 품목 등록" });
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    expect(844 - box.y - box.height).toBeLessThan(35);
    await page.screenshot({ path: `output/inventory-settings-20261031/${width}-${info.project.name}.png` });
  }
  await page.getByRole("group", { name: "업무 모드" }).getByRole("button", { name: "학교", exact: true }).click();
  await expect(page.locator(".workspace-navigation")).toBeVisible();
});

test("inventory scrollbar appears during scrolling without shifting content", async ({ page }) => {
  await open(page);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const scroller = page.locator(".workspace-content");
    const locations = page.getByRole("group", { name: "보관 장소" });
    await scroller.evaluate(el => { el.scrollTop = 0; });
    await expect(scroller).toHaveCSS("scrollbar-color", "rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)");
    const before = (await locations.boundingBox())!;
    await scroller.evaluate(el => { el.scrollTop = 100; });
    await expect(scroller).toHaveCSS("scrollbar-color", "rgb(144, 150, 158) rgba(0, 0, 0, 0)");
    await expect(scroller).toHaveCSS("scrollbar-color", "rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)");
    const after = (await locations.boundingBox())!;
    expect(after.width).toBe(before.width);
    expect(after.x).toBe(before.x);
    await expect(scroller).toHaveCSS("scrollbar-gutter", "stable");
  }
  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.locator(".workspace-content")).toHaveCSS("scrollbar-color", "auto");
});

test("inventory controls and freshness stay above the scrolling product list", async ({ page }) => {
  await open(page);
  const toolbar = page.locator("[data-inventory-toolbar]");
  const scroller = page.locator(".workspace-content");
  for (const width of [320, 502, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await scroller.evaluate(el => { el.scrollTop = 0; });
    await expect(toolbar.locator("[data-freshness]")).toBeVisible();
    const copy = (await toolbar.locator("[data-welcome-greeting]").boundingBox())!;
    const locations = (await page.getByRole("group", { name: "보관 장소" }).boundingBox())!;
    expect(locations.y - copy.y - copy.height).toBeCloseTo(0, 1);
    for (const button of await page.getByRole("group", { name: "보관 장소" }).getByRole("button").all()) {
      expect((await button.boundingBox())!.height).toBe(48);
    }
    await scroller.evaluate(el => { el.scrollTop = 500; });
    await expect.poll(async () => (await toolbar.boundingBox())!.y).toBeCloseTo((await scroller.boundingBox())!.y, 0);
    await expect(page.getByRole("searchbox", { name: "품목 검색" })).toBeVisible();
    const header = (await toolbar.boundingBox())!;
    await expect(toolbar).toHaveCSS("background-image", "none");
    await expect(toolbar).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect.poll(() => toolbar.evaluate(el => {
      const box = el.getBoundingClientRect();
      return document.elementsFromPoint(box.x + 5, box.y + 5).some(node => node.closest("[data-inventory-results]"));
    })).toBe(false);
    const padding = await scroller.evaluate(el => parseFloat(getComputedStyle(el).scrollPaddingTop));
    expect(padding).toBeGreaterThan(header.height);
    const product = page.getByRole("list").getByRole("button").nth(25);
    await product.focus();
    expect((await product.boundingBox())!.y).toBeGreaterThanOrEqual(header.y + header.height);
    await page.screenshot({path:`output/inventory-sticky/${width}.png`});
  }
  await page.getByRole("searchbox", { name: "품목 검색" }).fill("없는테스트상품");
  await expect(toolbar).toContainText("0개 품목");
  await expect(page.getByText("조건에 맞는 품목이 없어요.", {exact:true})).toBeVisible();
});
