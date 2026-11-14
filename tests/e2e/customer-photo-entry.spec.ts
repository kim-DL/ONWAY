import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { buildCustomerCeramicFixture } from "../helpers/build-customer-ceramic-fixture";

let fixture: Awaited<ReturnType<typeof buildCustomerCeramicFixture>>;
let disabledFixture: typeof fixture;
test.beforeAll(async () => { [fixture, disabledFixture] = await Promise.all([buildCustomerCeramicFixture(true, true), buildCustomerCeramicFixture(false, true)]); });

async function openDetail(page: Page, query = "", width = 390, photosEnabled = true) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://photo-entry.test") {
      errors.push(`Unexpected network request: ${url.origin}`);
      return route.abort();
    }
    if (url.pathname.startsWith("/ui/") || url.pathname.startsWith("/brand/")) {
      return route.fulfill({ contentType: url.pathname.endsWith(".svg") ? "image/svg+xml" : "image/webp",
        body: readFileSync(new URL(`../../public${url.pathname}`, import.meta.url)) });
    }
    if (url.pathname !== "/") return route.abort();
    const source = photosEnabled ? fixture : disabledFixture;
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>거래처 납품사진 연결 검증</title><style>${source.css}</style><div id="root"></div><script>${source.script.replaceAll("</script>", "<\\/script>")}</script></html>` });
  });
  await page.goto(`http://photo-entry.test/${query}`);
  await page.getByRole("button", { name: /다시 열기$/ }).first().click();
  await expect(page.locator("[data-customer-detail]")).toBeVisible();
  return errors;
}

test("detail places an independent record action below readable photo history", async ({ page }, info) => {
  const errors = await openDetail(page);
  const section = page.getByRole("region", { name: "납품사진 기록", exact: true });
  const history = section.getByRole("button", { name: /납품사진 기록,/ });
  const record = section.getByRole("button", { name: /납품사진 기록하기$/ });
  await expect(history).toContainText("최근 7일 · 사진 1장");
  await expect(history).toContainText("최근 등록");
  await expect(history).toContainText("예시 직원");
  await expect(history).toContainText(/\d+월\s*\d+일/);
  await expect(record).toBeVisible();
  await expect(record).toBeEnabled();
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await record.scrollIntoViewIfNeeded();
    const historyBox = (await history.boundingBox())!;
    const recordBox = (await record.boundingBox())!;
    expect(recordBox.y).toBeGreaterThanOrEqual(historyBox.y + historyBox.height);
    expect(recordBox.height).toBeGreaterThanOrEqual(48);
    expect(await section.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(history.locator("strong").first()).toHaveCSS("font-size", "16px");
    expect(await history.locator("svg").count()).toBeGreaterThan(0);
    expect(await record.locator("svg").count()).toBeGreaterThan(0);
    await page.screenshot({ path: `output/customer-detail-photo-entry/detail-${width}-${info.project.name}.png`, scale: "css" });
  }
  await history.click();
  await expect(page.getByRole("dialog", { name: "예시 거래처 가 납품사진", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(record).toBeVisible();
  expect(errors).toEqual([]);
});

test("record entry preserves its customer and picker selection never changes delivery lists", async ({ page }) => {
  const errors = await openDetail(page);
  await page.getByRole("button", { name: /납품사진 기록하기$/ }).click();
  const camera = page.getByRole("button", { name: /사진 촬영$/, exact: false });
  const album = page.getByRole("button", { name: /앨범에서 선택$/, exact: false });
  await expect(camera).toBeVisible();
  await expect(album).toBeVisible();
  await expect(camera).toBeEnabled();
  expect(await page.evaluate(() => window.__customerPhotoEntryFixture.captures)).toEqual([]);
  expect(await page.evaluate(() => window.__customerPhotoEntryFixture.writes)).toEqual([]);
  const chooser = await Promise.all([page.waitForEvent("filechooser"), camera.click()]).then(([value]) => value);
  await chooser.setFiles({ name: "synthetic-camera.png", mimeType: "image/png", buffer: Buffer.from("synthetic") });
  await expect.poll(() => page.evaluate(() => window.__customerPhotoEntryFixture.captures))
    .toEqual([{ customerId: "PREVIEW-0", source: "camera", fileName: "synthetic-camera.png" }]);
  const albumChooser = await Promise.all([page.waitForEvent("filechooser"), album.click()]).then(([value]) => value);
  await albumChooser.setFiles({ name: "synthetic-album.png", mimeType: "image/png", buffer: Buffer.from("synthetic") });
  await expect.poll(() => page.evaluate(() => window.__customerPhotoEntryFixture.captures))
    .toEqual([{ customerId: "PREVIEW-0", source: "camera", fileName: "synthetic-camera.png" },
      { customerId: "PREVIEW-0", source: "album", fileName: "synthetic-album.png" }]);
  expect(await page.evaluate(() => window.__customerPhotoEntryFixture.writes)).toEqual([]);
  await page.goBack();
  await expect(page.locator("[data-customer-detail]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "예시 거래처 가", exact: true })).toBeVisible();
  await page.goForward();
  await expect(camera).toBeVisible();
  await page.goBack();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "예시 거래처 나 다시 열기", exact: true }).click();
  await page.getByRole("button", { name: /납품사진 기록하기$/ }).click();
  await expect(page.getByRole("button", { name: "예시 거래처 나 사진 촬영", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "예시 거래처 가 사진 촬영", exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const state of ["empty", "error", "loading"]) {
  test(`history ${state} does not block a new photo entry`, async ({ page }) => {
    await openDetail(page, `?history=${state}`);
    const record = page.getByRole("button", { name: /납품사진 기록하기$/ });
    await expect(record).toBeEnabled();
    await record.click();
    await expect(page.getByRole("button", { name: /사진 촬영$/ })).toBeVisible();
    expect(await page.evaluate(() => window.__customerPhotoEntryFixture.writes)).toEqual([]);
  });
}

test("closed customers retain history but cannot start a new photo record", async ({ page }) => {
  await openDetail(page, "?closed");
  await expect(page.getByRole("button", { name: /납품사진 기록하기$/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /납품사진 기록,/ })).toBeEnabled();
});

test("camera and album wait for upload storage without blocking the entry", async ({ page }) => {
  await openDetail(page, "?uploadLoading");
  const record = page.getByRole("button", { name: /납품사진 기록하기$/ });
  await record.focus();
  await page.keyboard.press("Enter");
  const camera = page.getByRole("button", { name: /사진 촬영$/ });
  const album = page.getByRole("button", { name: /앨범에서 선택$/ });
  await expect(camera).toBeVisible();
  await expect(camera).toBeDisabled();
  await expect(album).toBeDisabled();
  await page.evaluate(() => window.__customerPhotoEntryFixture.setUploadReady(true));
  await expect(camera).toBeEnabled();
  await expect(album).toBeEnabled();
  expect(await page.evaluate(() => window.__customerPhotoEntryFixture.captures)).toEqual([]);
  expect(await page.evaluate(() => window.__customerPhotoEntryFixture.writes)).toEqual([]);
});

test("long Korean names remain readable with enlarged text and visible focus", async ({ page }) => {
  await openDetail(page, "?longName", 320);
  await page.evaluate(() => { document.documentElement.style.fontSize = "20px"; });
  const section = page.getByRole("region", { name: "납품사진 기록", exact: true });
  const record = section.getByRole("button", { name: /납품사진 기록하기$/ });
  await section.getByRole("button", { name: /납품사진 기록,/ }).focus();
  await page.keyboard.press("Tab");
  await expect(record).toBeFocused();
  expect(await record.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
  expect(await section.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await record.press("Enter");
  const camera = page.getByRole("button", { name: /사진 촬영$/ });
  await expect(camera).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ forcedColors: "active" });
  await expect(camera).toHaveText(/사진 촬영/);
});

test("directory details return from photo entry without leaving an orphan overlay", async ({ page }) => {
  await openDetail(page);
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "전체보기", exact: true }).click();
  const directory = page.getByRole("dialog", { name: "거래처 전체보기", exact: true });
  await expect(directory).toBeVisible();
  await directory.locator("[data-customer-card]").first().getByRole("button").first().click();
  await page.getByRole("button", { name: /납품사진 기록하기$/ }).click();
  await expect(page.getByRole("button", { name: "예시 거래처 가 사진 촬영", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "예시 거래처 가", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).last().click();
  const remaining = await page.getByRole("dialog").count();
  if (remaining) await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "전체보기", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__customerPhotoEntryFixture.writes)).toEqual([]);
});

test("a target missing from the latest catalog never falls back to another customer", async ({ page }) => {
  await openDetail(page, "?missingTarget");
  await page.getByRole("button", { name: /납품사진 기록하기$/ }).click();
  await expect(page.locator("[data-delivery-photo-workspace]")).toBeVisible();
  await expect(page.getByRole("button", { name: /사진 촬영$/ }).and(page.locator("button:enabled"))).toHaveCount(0);
  expect(await page.evaluate(() => window.__customerPhotoEntryFixture.captures)).toEqual([]);
  expect(await page.evaluate(() => window.__customerPhotoEntryFixture.writes)).toEqual([]);
});

test("the delivery photo feature flag hides both history and the new entry", async ({ page }) => {
  await openDetail(page, "", 390, false);
  await expect(page.getByRole("region", { name: "납품사진 기록", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /납품사진 기록하기$/ })).toHaveCount(0);
});

test("a focused customer has no duplicate row or empty search and remaining list", async ({ page }) => {
  await openDetail(page, "?targetOnly");
  await page.getByRole("button", { name: /납품사진 기록하기$/ }).click();
  const remaining = page.getByRole("region", { name: "오늘 남은 납품처", exact: true });
  await expect(remaining).toContainText("위 촬영 영역");
  await expect(remaining.getByRole("list")).toHaveCount(0);
  await page.getByRole("searchbox", { name: "납품사진 거래처 검색" }).fill("예시 거래처 가");
  const search = page.getByRole("region", { name: "거래처 검색 결과", exact: true });
  await expect(search).toContainText("위 촬영 영역");
  await expect(search.getByRole("list")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "예시 거래처 가 사진 촬영", exact: true })).toHaveCount(1);
});

test("the explicit return action and customer header both restore the same detail", async ({ page }) => {
  await openDetail(page);
  for (const returnName of ["거래처 상세로 돌아가기", "거래처"]) {
    await page.getByRole("button", { name: /납품사진 기록하기$/ }).click();
    await expect(page.getByRole("region", { name: "납품사진 기록 대상", exact: true })).toBeVisible();
    await page.getByRole("button", { name: returnName, exact: true }).click();
    await expect(page.getByRole("heading", { name: "예시 거래처 가", exact: true })).toBeVisible();
    await expect(page.locator("[data-customer-detail]")).toBeVisible();
  }
});

test("a detail dismissed from the photo screen stays closed after a mode round trip", async ({ page }) => {
  await openDetail(page);
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "납품사진", exact: true }).click();
  await page.getByRole("searchbox", { name: "납품사진 거래처 검색" }).fill("예시 거래처 나");
  await page.getByRole("button", { name: "예시 거래처 나 더보기", exact: true }).click();
  await page.getByRole("button", { name: "거래처 상세정보", exact: true }).click();
  await expect(page.getByRole("heading", { name: "예시 거래처 나", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "재고", exact: true }).click();
  await expect(page.locator(".workspace-shell")).toHaveAttribute("data-mode", "inventory");
  await page.goBack();
  await expect(page.locator(".workspace-shell")).toHaveAttribute("data-mode", "customer");
  await expect(page.getByRole("button", { name: "예시 거래처 나 다시 열기", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "예시 거래처 나 다시 열기", exact: true })).toBeInViewport();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
