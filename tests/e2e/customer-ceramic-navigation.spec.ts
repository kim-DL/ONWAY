import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { buildCustomerCeramicFixture } from "../helpers/build-customer-ceramic-fixture";

let fixture: Awaited<ReturnType<typeof buildCustomerCeramicFixture>>;
let disabledFixture: typeof fixture;
test.beforeAll(async () => { [fixture, disabledFixture] = await Promise.all([buildCustomerCeramicFixture(), buildCustomerCeramicFixture(false)]); });
async function open(page: Page, query = "", photos = true) {
  const source = photos ? fixture : disabledFixture;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("http://ceramic.test/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith("/ui/") || path.startsWith("/brand/")) return route.fulfill({ contentType: path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".webp") ? "image/webp" : "image/png", body: readFileSync(new URL(`../../public${path}`, import.meta.url)) });
    if (path !== "/") return route.abort();
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>세라믹 화면 검증</title><style>${source.css}</style><div id="root"></div><script>${source.script.replaceAll("</script>", "<\\/script>")}</script></html>` });
  });
  await page.goto(`http://ceramic.test/${query}`);
  await expect(page.getByRole("group", { name: "거래처 빠른 메뉴" })).toBeVisible();
}

test("customer icons retain display dimensions before styles arrive", async ({ page }) => {
  await open(page);
  await page.locator("[data-customer-home] img").evaluateAll(async images => {
    await Promise.all(images.map(image => (image as HTMLImageElement).decode()));
    for (const sheet of Array.from(document.styleSheets)) sheet.disabled = true;
  });
  for (const icon of await page.locator("[data-customer-home] img").all()) {
    const size = (await icon.boundingBox())!;
    expect(size.width).toBe(48);
    expect(size.height).toBe(48);
  }
});

test("four centered actions fit mobile and desktop without a navigation rail or reserved gap", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await open(page);
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator(".workspace-navigation")).toHaveCount(0);
    await expect(page.locator(".workspace-content")).toHaveCSS("margin-left", "0px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    const buttons = page.getByRole("group", { name: "거래처 빠른 메뉴" }).getByRole("button");
    if (width < 740) {
      const panel = (await page.getByRole("group", { name: "거래처 빠른 메뉴" }).boundingBox())!;
      expect(panel.x).toBeGreaterThan(12);
      expect(panel.width).toBeLessThanOrEqual(288);
      const gutter = await page.locator(".workspace-content").evaluate(el => el.getBoundingClientRect().width - el.clientWidth);
      expect(width - panel.x - panel.width - gutter).toBeCloseTo(panel.x, 1);
    }
    await expect(buttons).toHaveCount(4);
    await expect(buttons).toHaveText(["이름으로 찾기", "전체보기", "납품사진", "거래처 등록"]);
    for (const button of await buttons.all()) {
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(112);
      expect(box.height).toBeLessThanOrEqual(114);
      const icon = button.locator("[data-icon]");
      const ib = (await icon.boundingBox())!;
      expect(ib.width).toBe(await icon.getAttribute("data-icon") === "camera" ? 56 : 48);
      expect(Math.abs(ib.x + ib.width / 2 - box.x - box.width / 2)).toBeLessThan(1);
      await expect(button).toHaveCSS("text-align", "center");
      expect(await icon.evaluate(async el => {
        const image = el as HTMLImageElement;
        await image.decode(); return image.naturalWidth;
      })).toBe(192);
    }
    await page.screenshot({ path: `output/customer-ceramic-20261101/${width}-${info.project.name}.png` });
  }
  expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("search, directory and registration still open their real UI", async ({ page }) => {
  await open(page);
  const search = page.getByRole("button", { name: "이름으로 찾기", exact: true });
  await search.focus(); await page.keyboard.press("Enter");
  const input = page.getByRole("searchbox", { name: "거래처명 또는 초성 검색" });
  await expect(input).toBeFocused(); await input.fill("예시");
  await expect(page.locator("[data-customer-card]")).toHaveCount(12);
  await page.getByRole("button", { name: "검색 닫기" }).click(); await expect(search).toBeFocused();
  await page.getByRole("button", { name: "전체보기", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "거래처 전체보기", exact: true })).toBeVisible();
  await expect(page.locator("[data-customer-directory] [data-customer-card]")).toHaveCount(12);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "거래처 등록", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "거래처 등록", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("home caps twelve remembered customers at ten and scrolls to the last row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const rows = page.locator("[data-customer-recents]").getByRole("button", { name: /다시 열기/ });
  await expect(rows).toHaveCount(10);
  await expect(rows.last()).toHaveAccessibleName("예시 거래처 차 다시 열기");
  await rows.last().scrollIntoViewIfNeeded();
  await expect(rows.last()).toBeInViewport();
  expect(await page.locator(".workspace-content").evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator(".workspace-content")).not.toHaveCSS("scrollbar-width", "none");
});

test("scrollbar hides at rest without changing the panel width or reserved gutter", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const scroller = page.locator(".workspace-content");
  const panel = page.getByRole("group", { name: "거래처 빠른 메뉴" });
  const before = (await panel.boundingBox())!;
  await expect(scroller).toHaveCSS("scrollbar-color", "rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)");
  await scroller.evaluate(el => { el.scrollTop = 100; });
  await expect(scroller).toHaveCSS("scrollbar-color", "rgb(144, 150, 158) rgba(0, 0, 0, 0)");
  await expect(scroller).toHaveCSS("scrollbar-color", "rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)");
  const after = (await panel.boundingBox())!;
  expect(after.width).toBe(before.width);
  expect(after.x).toBe(before.x);
  await expect(scroller).toHaveCSS("scrollbar-gutter", "stable");
});

test("delivery photo search renders ceramic cards inside the real workspace", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("requestfailed", request => errors.push(request.url()));
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByRole("button", { name: "납품사진", exact: true }).click();
  await page.getByRole("searchbox", { name: "납품사진 거래처 검색" }).fill("예시");
  const results = page.getByRole("region", { name: "거래처 검색 결과" });
  await expect(results.getByRole("listitem")).toHaveCount(12);
  const first = results.getByRole("listitem").first();
  await expect(first.getByRole("button", { name: /카메라 촬영$/ }).locator("img")).toHaveAttribute("src", "/ui/customer-ceramic-camera-v1.webp");
  await page.getByRole("heading", { name: "검색 결과", exact: true }).click();
  await page.screenshot({ path: `output/photo-cards-20261104/workspace-${info.project.name}.png`, scale: "css" });
  await first.getByRole("button", { name: /더보기$/ }).click();
  await expect(page.getByRole("dialog", { name: "예시 거래처 가 더보기", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("searchbox", { name: "납품사진 거래처 검색" }).fill("일치하지않는이름");
  await expect(results).toContainText("일치하는 거래처가 없습니다.");
  expect(errors).toEqual([]);
});

test("delivery photo header uses the active customer mode and raised planning buttons", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("requestfailed", request => errors.push(request.url()));
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await open(page);
    await page.getByRole("button", { name: "납품사진", exact: true }).click();
    const workspace = page.locator("[data-delivery-photo-workspace]");
    const header = workspace.locator(":scope > header");
    await expect(header.getByRole("button", { name: "거래처로 돌아가기", exact: true })).toHaveCount(0);
    const back = page.getByRole("group", { name: "업무 모드" }).getByRole("button", { name: "거래처", exact: true });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("aria-pressed", "true");
    const invoice = workspace.getByRole("button", { name: "명세서로 등록", exact: true });
    const route = workspace.getByRole("button", { name: "인공지능 경로 추천", exact: true });
    for (const action of [invoice, route]) {
      await expect(action).toBeVisible();
      const box = (await action.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(48);
      expect(box.height).toBeLessThanOrEqual(56);
      expect(await action.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe("none");
      expect(await action.locator("img").evaluate(async el => { await (el as HTMLImageElement).decode(); return (el as HTMLImageElement).naturalWidth; })).toBe(32);
    }
    const first = (await invoice.boundingBox())!, second = (await route.boundingBox())!;
    expect(first.y).toBe(second.y);
    expect(second.x).toBeGreaterThan(first.x + first.width);
    expect(await workspace.evaluate(el => Number.parseFloat(getComputedStyle(el).paddingTop))).toBeLessThanOrEqual(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await back.focus();
    await expect(back).toBeFocused();
    await page.screenshot({ path: `output/playwright/photo-header-${width}-${test.info().project.name}.png` });
    if (width === 390) await page.screenshot({ path: `output/playwright/photo-header-detail-${test.info().project.name}.png`, scale: "css", clip: { x: 0, y: 0, width, height: 250 } });
    await page.keyboard.press("Enter");
    await expect(page.getByRole("group", { name: "거래처 빠른 메뉴" })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("planning cards open their tools and a populated photo screen stays compact and accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "?photoSamples");
  await page.getByRole("button", { name: "납품사진", exact: true }).click();
  const workspace = page.locator("[data-delivery-photo-workspace]");
  await expect(workspace.getByText("남음 8곳 · 기록완료 0곳", { exact: true })).toBeVisible();
  const header = workspace.locator(":scope > header");
  expect((await header.boundingBox())!.height).toBeLessThan(58);
  await expect(header.getByRole("button", { name: "순서 편집", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "거래처로 돌아가기", exact: true })).toHaveCount(0);
  for (const [button, title] of [["명세서로 등록", "명세서로 납품 준비"], ["인공지능 경로 추천", "인공지능 경로 추천"]] as const) {
    await workspace.getByRole("button", { name: button, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "완료", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  expect((await new AxeBuilder({ page }).include("[data-delivery-photo-workspace]").analyze()).violations).toEqual([]);
  await workspace.locator('img[src$=".svg"]').evaluateAll(images => Promise.all(images.map(image => (image as HTMLImageElement).decode())));
  await page.screenshot({ path: `output/delivery-planning-buttons/preview-390-${test.info().project.name}.png`, scale: "css" });
  await page.setViewportSize({ width: 320, height: 760 });
  await page.addStyleTag({ content: "html{font-size:200%}" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const name of ["명세서로 등록", "인공지능 경로 추천"]) {
    const button = workspace.getByRole("button", { name, exact: true });
    expect(await button.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  await page.emulateMedia({ forcedColors: "active" });
  const invoice = workspace.getByRole("button", { name: "명세서로 등록", exact: true });
  await invoice.focus(); await expect(invoice).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "명세서로 납품 준비", exact: true })).toBeVisible();
});

for (const target of ["납품사진"]) {
  test(`${target} supports return, browser back and restored subpage return`, async ({ page }) => {
    await open(page);
    const heading = target === "앱 설정" ? "설정" : "납품사진";
    await page.getByRole("button", { name: target, exact: true }).click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await page.getByRole("group", { name: "업무 모드" }).getByRole("button", { name: "거래처", exact: true }).click();
    await expect(page.getByRole("group", { name: "거래처 빠른 메뉴" })).toBeVisible();
    await page.getByRole("button", { name: target, exact: true }).click(); await page.goBack();
    await expect(page.getByRole("group", { name: "거래처 빠른 메뉴" })).toBeVisible();
    await page.goForward(); await page.reload();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await page.getByRole("group", { name: "업무 모드" }).getByRole("button", { name: "거래처", exact: true }).click();
    await expect(page.getByRole("group", { name: "거래처 빠른 메뉴" })).toBeVisible();
    await expect(page.locator(".workspace-navigation")).toHaveCount(0);
  });
}

test("settings remain reachable through school mode and a restored customer settings page returns home", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("button", { name: "앱 설정", exact: true })).toHaveCount(0);
  const modes = page.getByRole("group", { name: "업무 모드" });
  await modes.getByRole("button", { name: "학교", exact: true }).click();
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
  await modes.getByRole("button", { name: "거래처", exact: true }).click();
  await expect(page.locator(".workspace-navigation")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "거래처로 돌아가기" }).click();
  await expect(page.getByRole("group", { name: "거래처 빠른 메뉴" })).toBeVisible();
});

test("loading and failed catalogs do not block photos; disabled feature stays hidden", async ({ page }) => {
  for (const query of ["?loading", "?error"]) {
    await open(page, query);
    await expect(page.getByRole("button", { name: "거래처 등록", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "전체보기", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "납품사진", exact: true })).toBeEnabled();
  }
  await open(page, "", false);
  await expect(page.getByRole("button", { name: "납품사진", exact: true })).toHaveCount(0);
  await page.getByRole("group", { name: "업무 모드" }).getByRole("button", { name: "학교", exact: true }).click();
  await expect(page.locator(".workspace-navigation")).toBeVisible();
});
