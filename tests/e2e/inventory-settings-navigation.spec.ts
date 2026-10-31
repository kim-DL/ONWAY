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
