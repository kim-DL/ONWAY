import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { buildDeliveryPhotoFixture } from "../helpers/build-delivery-photo-fixture";

let fixture: Awaited<ReturnType<typeof buildDeliveryPhotoFixture>>;
test.beforeAll(async () => { fixture = await buildDeliveryPhotoFixture(); });
test.beforeEach(async ({ page }) => {
  await page.route("https://delivery-photo.fixture/**", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>납품사진 검증</title><style>${fixture.css}</style></head><body><div id="root"></div></body></html>` }));
  await page.goto("https://delivery-photo.fixture/"); await page.addScriptTag({ content: fixture.script });
});
const scale = (stage: Locator) => stage.getAttribute("data-scale").then(Number);
async function open(page: Page) {
  await page.getByRole("button", { name: "저장된 납품사진 크게 보기" }).click();
  const dialog = page.getByRole("dialog", { name: "샘플거래처 납품사진 보기", exact: true });
  const stage = dialog.getByRole("region", { name: "샘플거래처 납품사진 크게 보기", exact: true });
  await expect.poll(() => scale(stage)).toBe(1); await expect(stage).toHaveAttribute("data-photo-morph-state", "open");
  return { dialog, stage };
}
async function drag(page: Page, stage: Locator, delta = -110) {
  const box = (await stage.boundingBox())!; const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + delta, y, { steps: 8 }); await page.mouse.up();
}
test("saved evidence zoom and pan preserve the current photo; fit navigation and next reset work", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { dialog, stage } = await open(page);
  await dialog.getByRole("button", { name: "사진 1.8배 빠른 확대" }).click(); await expect.poll(() => scale(stage)).toBe(1.8);
  await drag(page, stage); await expect(dialog.getByText("1 / 2", { exact: true })).toBeVisible();
  await expect.poll(() => stage.getAttribute("data-pan-x").then(Number)).toBeLessThan(-10);
  await stage.focus(); await page.keyboard.press("ArrowRight"); await expect(dialog.getByText("1 / 2", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "다음", exact: true }).click(); await expect(dialog.getByText("2 / 2", { exact: true })).toBeVisible(); await expect.poll(() => scale(stage)).toBe(1);
  await drag(page, stage, 110); await expect(dialog.getByText("1 / 2", { exact: true })).toBeVisible(); await expect.poll(() => scale(stage)).toBe(1);
  await stage.focus(); await page.keyboard.press("ArrowRight"); await expect(dialog.getByText("2 / 2", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(page.getByRole("button", { name: "저장된 납품사진 크게 보기" })).toBeFocused();
});
test("saved evidence supports continuous wheel zoom and double-click fit", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop wheel input"); const { stage } = await open(page);
  const box = (await stage.boundingBox())!; await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, -160);
  await expect.poll(() => scale(stage)).toBeGreaterThan(1.48); expect(await scale(stage)).toBeLessThan(1.5);
  await stage.dblclick(); await expect.poll(() => scale(stage)).toBe(1);
});
test("mobile pinch and remaining-finger pan never navigate saved evidence", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Chromium native touch"); const { dialog, stage } = await open(page);
  const box = (await stage.boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 60, y, id: 1 }, { x: x + 60, y, id: 2 }] });
  await expect.poll(() => scale(stage)).toBeCloseTo(2, 2);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [{ x: x + 60, y, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 30, y, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(dialog.getByText("1 / 2", { exact: true })).toBeVisible();
  await page.touchscreen.tap(x, y); await page.touchscreen.tap(x, y); await expect.poll(() => scale(stage)).toBe(1);
  for (const [id, ending] of [[3, "touchCancel"], [4, "touchEnd"]] as const) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x + 70, y, id }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 70, y, id }] });
    await cdp.send("Input.dispatchTouchEvent", { type: ending, touchPoints: [] });
    await expect(dialog.getByText(id === 3 ? "1 / 2" : "2 / 2", { exact: true })).toBeVisible();
  }
  await cdp.detach();
});
test("local capture zoom preserves pending status until server confirmation and restores focus", async ({ page, isMobile }) => {
  const trigger = page.getByRole("button", { name: "촬영 사진 1 크게 보기" }); await trigger.click();
  const dialog = page.getByRole("dialog", { name: "촬영 사진 확인", exact: true }), stage = dialog.getByRole("region", { name: "촬영 사진 크게 보기", exact: true });
  await dialog.getByRole("button", { name: "사진 1.8배 빠른 확대" }).click(); await expect.poll(() => scale(stage)).toBe(1.8);
  if (isMobile) {
    const box = (await stage.boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 50, y, id: 1 }, { x: x + 50, y, id: 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => scale(stage)).toBeGreaterThan(2); await cdp.detach();
    await dialog.getByRole("button", { name: "사진 1.8배 빠른 확대" }).click(); await expect.poll(() => scale(stage)).toBe(1.8);
  }
  await drag(page, stage); await expect(page.getByText("✓ 저장 완료", { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("fixture:server-confirmed")));
  await expect.poll(() => scale(stage)).toBe(1.8); await dialog.getByRole("button", { name: "확인", exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused(); await expect(page.getByText("✓ 저장 완료", { exact: true })).toBeVisible();
  await trigger.click(); await expect.poll(() => scale(stage)).toBe(1); await page.goBack(); await expect(dialog).toHaveCount(0);
});
test("evidence errors retry and owned Blob URLs are revoked on navigation and close", async ({ page }) => {
  await page.evaluate(() => { (window as unknown as { __rejectEvidence: boolean }).__rejectEvidence = true; });
  await page.getByRole("button", { name: "저장된 납품사진 크게 보기" }).click();
  const dialog = page.getByRole("dialog", { name: "샘플거래처 납품사진 보기", exact: true });
  await expect(dialog.getByRole("alert")).toBeVisible(); await expect(dialog.getByLabel("사진 배율")).toHaveCount(0);
  await page.evaluate(() => { (window as unknown as { __rejectEvidence: boolean }).__rejectEvidence = false; }); await dialog.getByRole("button", { name: "사진 다시 불러오기" }).click();
  const stage = dialog.getByRole("region"); await expect.poll(() => scale(stage)).toBe(1);
  const first = await stage.locator("img").getAttribute("src"); await dialog.getByRole("button", { name: "다음", exact: true }).click();
  await expect.poll(() => scale(stage)).toBe(1); await expect.poll(() => page.evaluate((url) => (window as unknown as { __revokedPhotos: string[] }).__revokedPhotos.includes(url!), first)).toBe(true);
  const second = await stage.locator("img").getAttribute("src"); await dialog.getByLabel("닫기", { exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect.poll(() => page.evaluate((url) => (window as unknown as { __revokedPhotos: string[] }).__revokedPhotos.includes(url!), second)).toBe(true);
});
test("slow evidence uses one centered delayed indicator and releases immediately when ready", async ({ page }, testInfo) => {
  await page.clock.install();
  await page.evaluate(() => { (window as unknown as { __delayEvidence: boolean }).__delayEvidence = true; });
  await page.getByRole("button", { name: "저장된 납품사진 크게 보기" }).click();
  const dialog = page.getByRole("dialog", { name: "샘플거래처 납품사진 보기", exact: true });
  const stage = dialog.getByRole("region", { name: "샘플거래처 납품사진 크게 보기", exact: true });
  const status = stage.locator("[data-loading-status]");
  const indicator = status.locator("[data-loading-indicator]");
  await expect(status).toHaveCount(1);
  await expect(status).toContainText("원본 사진 불러오는 중");
  await expect(indicator).toHaveAttribute("data-visible", "false");
  await page.clock.fastForward(1_100);
  await expect(indicator).toHaveAttribute("data-visible", "true");
  const stageBox = (await stage.boundingBox())!, indicatorBox = (await indicator.boundingBox())!;
  expect(Math.abs(indicatorBox.x + indicatorBox.width / 2 - stageBox.x - stageBox.width / 2)).toBeLessThan(2);
  await page.clock.fastForward(2_000);
  await expect(status).toContainText("선택한 사진의 원본을 확인하고 있습니다.");
  expect((await new AxeBuilder({ page }).include("dialog[open]").analyze()).violations).toEqual([]);
  await page.screenshot({ path: `output/mobile-loading-polish-20261030/delivery-loading-${testInfo.project.name}.png`, fullPage: true });
  await page.evaluate(() => window.dispatchEvent(new Event("fixture:release-evidence")));
  await expect(stage.locator("img")).toBeVisible();
  await expect(status).toHaveCount(0);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
});
test("saved and local controls remain accessible at 320px with 200 percent text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 }); await page.addStyleTag({ content: "html{font-size:200%}button{font-size:1rem!important}" });
  await open(page);
  for (const title of ["샘플거래처 납품사진 보기", "촬영 사진 확인"]) {
    if (title === "촬영 사진 확인") await page.getByRole("button", { name: "촬영 사진 1 크게 보기" }).click();
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog.getByLabel("사진 배율")).toHaveText("100%");
    expect((await new AxeBuilder({ page }).include("dialog[open]").analyze()).violations).toEqual([]);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.getByLabel("닫기", { exact: true }).click(); await expect(dialog).toHaveCount(0);
  }
});
