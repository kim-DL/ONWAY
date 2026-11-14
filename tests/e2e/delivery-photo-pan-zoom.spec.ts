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
async function originalSize(dialog: Locator, stage: Locator) {
  await dialog.getByRole("button", { name: "원본 크기", exact: true }).click();
  const width = await stage.locator("img").evaluate((image) => (image as HTMLImageElement).naturalWidth);
  await expect.poll(async () => (await stage.locator("img").boundingBox())!.width).toBeCloseTo(width, 0);
  await expect(dialog.getByLabel("사진 배율")).toHaveText("100%");
  return scale(stage);
}
test("saved evidence zoom and pan preserve the current photo; fit navigation and next reset work", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { dialog, stage } = await open(page);
  await originalSize(dialog, stage);
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

test("label inspection reaches eight-times fit with matching rendered magnification", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { dialog, stage } = await open(page);
  const expectedFit = await stage.locator("img").evaluate((image) => parseFloat(image.style.width));
  await expect.poll(async () => (await stage.locator("img").boundingBox())!.width).toBeCloseTo(expectedFit, 0);
  const fittedWidth = await stage.locator("img").evaluate((image) => image.getBoundingClientRect().width);
  await stage.focus();
  for (let step = 0; step < 40; step++) await page.keyboard.press("+");
  await expect(dialog.getByLabel("사진 배율")).toHaveText("800%");
  const finalScale = await scale(stage);
  await expect.poll(async () => (await stage.locator("img").boundingBox())!.width / fittedWidth).toBeCloseTo(finalScale, 3);
  const metrics = await stage.evaluate((element) => {
    const frame = element.getBoundingClientRect(), image = element.querySelector("img")!;
    return { scale: Number((element as HTMLElement).dataset.scale), frameWidth: frame.width, frameHeight: frame.height,
      renderedWidth: image.getBoundingClientRect().width, naturalWidth: image.naturalWidth, pixelRatio: devicePixelRatio,
      style: image.getAttribute("style"), transform: getComputedStyle(image).transform, transition: getComputedStyle(image).transition,
      animations: image.getAnimations().map((animation) => ({ type: animation.constructor.name, state: animation.playState, timing: animation.effect?.getComputedTiming() })),
      stageTransform: getComputedStyle(element).transform };
  });
  await testInfo.attach("label-inspection-geometry", { body: JSON.stringify(metrics), contentType: "application/json" });
  console.log(`label inspection ${testInfo.project.name}: ${JSON.stringify(metrics)}`);
  await page.screenshot({ path: `output/delivery-photo-inspection-20261114/label-${testInfo.project.name}.png` });
  expect(metrics.scale).toBeGreaterThanOrEqual(8);
  expect(metrics.renderedWidth / fittedWidth).toBeCloseTo(metrics.scale, 3);
  await expect(dialog.getByLabel("사진 배율")).toHaveText(`${Math.round(metrics.renderedWidth / metrics.naturalWidth * 100)}%`);
  expect(await page.evaluate(() => (window as unknown as { __evidenceLoads: { variant: string }[] }).__evidenceLoads.map((request) => request.variant))).toEqual(["evidence"]);
});

test("stored-size labels reach every edge and resize retains the inspected size", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { dialog, stage } = await open(page);
  await originalSize(dialog, stage);
  for (const [horizontal, vertical] of [[1, 1], [-1, -1]]) {
    const box = (await stage.boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + horizontal! * 10000, y + vertical! * 10000, { steps: 8 }); await page.mouse.up();
    await expect.poll(async () => stage.evaluate((element, directions) => {
      const frame = element.getBoundingClientRect(), image = element.querySelector("img")!.getBoundingClientRect();
      return Math.max(Math.abs(directions[0]! > 0 ? image.left - frame.left : image.right - frame.right),
        Math.abs(directions[1]! > 0 ? image.top - frame.top : image.bottom - frame.bottom));
    }, [horizontal!, vertical!])).toBeLessThan(2);
  }
  const delta = await stage.evaluate((element) => {
    const frame = element.getBoundingClientRect(), image = element.querySelector("img")!.getBoundingClientRect();
    return { x: frame.x + frame.width / 2 - (image.x + image.width * 1840 / 2400),
      y: frame.y + frame.height / 2 - (image.y + image.height * 1150 / 1800) };
  });
  const box = (await stage.boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + delta.x, y + delta.y, { steps: 10 }); await page.mouse.up();
  await page.screenshot({ path: `output/delivery-photo-inspection-20261114/native-label-${testInfo.project.name}.png` });
  const centre = () => stage.evaluate((element) => {
    const frame = element.getBoundingClientRect(), image = element.querySelector("img")!.getBoundingClientRect();
    return { x: (frame.x + frame.width / 2 - image.x) / image.width, y: (frame.y + frame.height / 2 - image.y) / image.height, width: image.width };
  });
  const before = await centre();
  await page.setViewportSize({ width: 430, height: 932 });
  await expect.poll(async () => (await centre()).width).toBeCloseTo(before.width, 0);
  await expect.poll(async () => (await centre()).x).toBeCloseTo(before.x, 3);
  await expect.poll(async () => (await centre()).y).toBeCloseTo(before.y, 3);
  await dialog.getByRole("button", { name: "사진 확대", exact: true }).focus(); await page.keyboard.press("ArrowRight");
  await expect(dialog.getByText("1 / 2", { exact: true })).toBeVisible();
});

test("saved inspection fills the viewport while short and enlarged controls stay reachable", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    const { dialog, stage } = await open(page);
    const sheet = dialog.locator(":scope > .bottom-sheet"), sheetBox = (await sheet.boundingBox())!, frame = (await stage.boundingBox())!;
    expect(sheetBox.width).toBeGreaterThanOrEqual(viewport.width - 18);
    expect(sheetBox.height).toBeGreaterThanOrEqual(viewport.height - 18);
    expect(frame.width).toBeGreaterThanOrEqual(viewport.width - 36);
    console.log(`inspection frame ${testInfo.project.name} ${viewport.width}: ${JSON.stringify({ width: frame.width, height: frame.height })}`);
    await dialog.getByLabel("닫기", { exact: true }).click(); await expect(dialog).toHaveCount(0);
  }
  for (const viewport of [{ width: 320, height: 700 }, { width: 740, height: 360 }]) {
    await page.setViewportSize(viewport);
    await page.addStyleTag({ content: "html{font-size:200%}button{font-size:1rem!important}" });
    const { dialog, stage } = await open(page);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    for (const name of ["사진 확대", "원본 크기", "화면 맞춤", "다음", "닫기"]) {
      const button = dialog.getByRole("button", { name, exact: true });
      if (await button.isEnabled()) await button.scrollIntoViewIfNeeded();
      const rect = (await button.boundingBox())!;
      expect(rect.width).toBeGreaterThanOrEqual(44); expect(rect.height).toBeGreaterThanOrEqual(44);
      expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(rect.y).toBeGreaterThanOrEqual(0); expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    await originalSize(dialog, stage);
    expect((await new AxeBuilder({ page }).include("dialog[open]").analyze()).violations).toEqual([]);
    await dialog.getByLabel("닫기", { exact: true }).click(); await expect(dialog).toHaveCount(0);
  }
});

test("nested deletion keeps its own frame and busy dismissal preserves the inspected photo", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-18T04:00:00Z") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { dialog, stage } = await open(page);
  const native = await originalSize(dialog, stage);
  await dialog.getByRole("button", { name: "사진 삭제", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "이 납품사진을 삭제할까요?", exact: true });
  await expect(confirmation).toBeVisible();
  const frame = (await confirmation.locator(":scope > .bottom-sheet").boundingBox())!;
  expect(frame.height).toBeLessThan(page.viewportSize()!.height * .8);
  await confirmation.getByRole("button", { name: "사진 삭제", exact: true }).click();
  await expect(confirmation.getByRole("button", { name: "삭제 중…", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape"); await expect(confirmation).toBeVisible();
  await page.goBack(); await expect(confirmation).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("fixture:delete-failed")));
  await expect(confirmation.getByRole("alert")).toContainText("삭제하지 못했습니다");
  await confirmation.getByRole("button", { name: "취소", exact: true }).click(); await expect(confirmation).toHaveCount(0);
  await expect(dialog).toBeVisible(); await expect.poll(() => scale(stage)).toBe(native);
  await page.goBack(); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "저장된 납품사진 크게 보기" })).toBeFocused();
});

test("legal-length customer titles leave close and zoom controls reachable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("https://delivery-photo.fixture/?long-title"); await page.addScriptTag({ content: fixture.script });
  await page.addStyleTag({ content: "html{font-size:200%}button{font-size:1rem!important}" });
  for (const viewport of [{ width: 320, height: 700 }, { width: 740, height: 360 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "저장된 납품사진 크게 보기" }).click();
    const dialog = page.getByRole("dialog"), stage = dialog.getByRole("region");
    await expect.poll(() => scale(stage)).toBe(1);
    await expect(dialog.getByRole("heading")).toHaveText(`${"온누리거래처".repeat(20)} 납품사진 보기`);
    const header = (await dialog.locator(":scope > .bottom-sheet > header").boundingBox())!;
    expect(header.height).toBeLessThan(viewport.height * .4);
    for (const name of ["원본 크기", "닫기"]) {
      const button = dialog.getByRole("button", { name, exact: true }); await button.scrollIntoViewIfNeeded();
      const rect = (await button.boundingBox())!;
      expect(rect.y).toBeGreaterThanOrEqual(0); expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    await originalSize(dialog, stage);
    await dialog.getByLabel("닫기", { exact: true }).click(); await expect(dialog).toHaveCount(0);
  }
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

test("mobile label pinch exceeds 250 percent and reaches 800 percent of stored pixels", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Chromium native touch");
  const { dialog, stage } = await open(page);
  await originalSize(dialog, stage);
  const box = (await stage.boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  for (const percent of ["400%", "800%"]) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x - 20, y, id: 1 }, { x: x + 20, y, id: 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 80, y, id: 1 }, { x: x + 80, y, id: 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(dialog.getByLabel("사진 배율")).toHaveText(percent);
  }
  await expect.poll(async () => stage.locator("img").evaluate((image) => image.getBoundingClientRect().width / (image as HTMLImageElement).naturalWidth)).toBeCloseTo(8, 3);
  await expect(dialog.getByText("1 / 2", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.visualViewport!.scale)).toBe(1);
  await cdp.detach();
});
test("local capture zoom preserves pending status until server confirmation and restores focus", async ({ page, isMobile }) => {
  const trigger = page.getByRole("button", { name: "촬영 사진 1 크게 보기" }); await trigger.click();
  const dialog = page.getByRole("dialog", { name: "촬영 사진 확인", exact: true }), stage = dialog.getByRole("region", { name: "촬영 사진 크게 보기", exact: true });
  const native = await originalSize(dialog, stage);
  if (isMobile) {
    const box = (await stage.boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - 50, y, id: 1 }, { x: x + 50, y, id: 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => scale(stage)).toBeGreaterThan(2); await cdp.detach();
    await originalSize(dialog, stage);
  }
  await drag(page, stage); await expect(page.getByText("✓ 저장 완료", { exact: true })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("fixture:server-confirmed")));
  await expect.poll(() => scale(stage)).toBe(native); await dialog.getByRole("button", { name: "확인", exact: true }).click();
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
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __panZoomPrepared?: boolean }).__panZoomPrepared))).toBe(true);
  await expect(stage.locator("img")).toHaveCount(0);
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
    const fittedPercent = await dialog.getByRole("region").locator("img").evaluate((image) => Math.round(image.getBoundingClientRect().width / (image as HTMLImageElement).naturalWidth * 100));
    await expect(dialog.getByLabel("사진 배율")).toHaveText(`${fittedPercent}%`);
    expect((await new AxeBuilder({ page }).include("dialog[open]").analyze()).violations).toEqual([]);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.getByLabel("닫기", { exact: true }).click(); await expect(dialog).toHaveCount(0);
  }
});
