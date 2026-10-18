import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { buildInventoryPhotoFixture } from "../helpers/build-inventory-photo-fixture";

let fixture: Awaited<ReturnType<typeof buildInventoryPhotoFixture>>;
test.beforeAll(async () => { fixture = await buildInventoryPhotoFixture(); });
test.beforeEach(async ({ page }) => {
  await page.route("https://inventory-photo.fixture/**", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>재고 사진 검증</title><style>${fixture.css}</style></head><body><div id="root"></div></body></html>` }));
  await page.goto("https://inventory-photo.fixture/");
  await page.addScriptTag({ content: fixture.script });
});
const scale = (stage: Locator) => stage.evaluate((element) => Number((element as HTMLElement).dataset.scale));
async function open(page: Page) {
  await page.getByRole("button", { name: "샘플 제품 사진 크게 보기" }).click();
  const dialog = page.getByRole("dialog", { name: "샘플 제품 사진", exact: true });
  const stage = dialog.getByRole("region", { name: "제품 사진 보기", exact: true });
  await expect(stage).toHaveAttribute("data-photo-morph-state", "open");
  await expect.poll(() => scale(stage)).toBe(1);
  return { dialog, stage };
}
async function assertBounds(stage: Locator) {
  const rects = await stage.evaluate((element) => {
    const frame = element.getBoundingClientRect(), image = element.querySelector("img")!.getBoundingClientRect();
    return { frame: { x: frame.x, y: frame.y, width: frame.width, height: frame.height }, image: { x: image.x, y: image.y, width: image.width, height: image.height } };
  });
  for (const [start, length] of [["x", "width"], ["y", "height"]] as const) {
    const image = rects.image, frame = rects.frame;
    if (image[length] > frame[length] + 1) {
      expect(image[start]).toBeLessThanOrEqual(frame[start] + 1);
      expect(image[start] + image[length]).toBeGreaterThanOrEqual(frame[start] + frame[length] - 1);
    } else expect(image[start] + image[length] / 2).toBeCloseTo(frame[start] + frame[length] / 2, 0);
  }
}
test("PC cursor-centred fractional wheel zoom, captured drag, bounds, double click and keyboard", async ({ page, isMobile }) => {
  test.skip(isMobile, "Desktop pointer interaction");
  const { dialog, stage } = await open(page);
  await dialog.getByRole("button", { name: "사진 1.8배 빠른 확대" }).click();
  await expect.poll(() => scale(stage)).toBeCloseTo(1.8, 4);
  const box = (await stage.boundingBox())!;
  const cursor = { x: box.x + box.width / 2 + 30, y: box.y + box.height / 2 + 20 };
  const imagePoint = () => stage.locator("img").evaluate((image, p) => { const r = image.getBoundingClientRect(); return { x: (p.x - r.x) / r.width, y: (p.y - r.y) / r.height }; }, cursor);
  const before = await imagePoint();
  await page.mouse.move(cursor.x, cursor.y); await page.mouse.wheel(0, -160);
  await expect.poll(() => scale(stage)).toBeGreaterThan(2.685);
  expect(await scale(stage)).toBeLessThan(2.686);
  const after = await imagePoint(); expect(after.x).toBeCloseTo(before.x, 3); expect(after.y).toBeCloseTo(before.y, 3);
  await page.mouse.down(); await page.mouse.move(box.x + box.width + 200, box.y + box.height + 150, { steps: 12 }); await page.mouse.up();
  await assertBounds(stage);
  await stage.dblclick(); await expect.poll(() => scale(stage)).toBe(1);
  await stage.dblclick(); await expect.poll(() => scale(stage)).toBeCloseTo(1.8, 3);
  await stage.focus(); await page.keyboard.press("+"); await expect.poll(() => scale(stage)).toBeGreaterThan(2.15);
  await page.keyboard.press("ArrowRight"); await assertBounds(stage);
  await page.keyboard.press("0"); await expect.poll(() => scale(stage)).toBe(1);
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "샘플 제품 사진 크게 보기" })).toBeFocused();
});
test("mobile native pinch, remaining-finger pan, double tap and pointer cancellation", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile native touch interaction");
  const { stage } = await open(page);
  const box = (await stage.boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", points: { x: number; y: number; id: number }[]) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await touch("touchStart", [{ x: x - 40, y, id: 1 }, { x: x + 40, y, id: 2 }]);
  await touch("touchMove", [{ x: x - 80, y, id: 1 }, { x: x + 80, y, id: 2 }]);
  await expect.poll(() => scale(stage)).toBeCloseTo(2, 2);
  // CDP touchEnd lists the released contacts; lift the right finger only.
  await touch("touchEnd", [{ x: x + 80, y, id: 2 }]);
  await touch("touchMove", [{ x: x - 45, y: y + 25, id: 1 }]); await touch("touchEnd", []);
  await expect.poll(() => stage.getAttribute("data-pan-x").then(Number)).toBeGreaterThan(30);
  await assertBounds(stage);
  await page.touchscreen.tap(x, y); await page.touchscreen.tap(x, y);
  await expect.poll(() => scale(stage)).toBe(1);
  await page.touchscreen.tap(x, y); await page.touchscreen.tap(x, y);
  await expect.poll(() => scale(stage)).toBeCloseTo(1.8, 3);
  await touch("touchStart", [{ x, y, id: 3 }]); await touch("touchCancel", []);
  await expect(stage).toHaveAttribute("data-dragging", "false");
  await touch("touchStart", [{ x, y, id: 4 }]); await touch("touchMove", [{ x: x + 25, y, id: 4 }]); await touch("touchEnd", []);
  await assertBounds(stage);
  expect(await page.evaluate(() => window.visualViewport!.scale)).toBe(1);
  await cdp.detach();
});
test("buttons, low-resolution ceiling, aspect ratios, resize, fit and Back preserve the modal", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const shape of ["small", "portrait", "panorama"]) {
    await page.getByLabel("사진 비율").selectOption(shape);
    const { dialog, stage } = await open(page);
    await expect(dialog.getByRole("button", { name: "사진 축소", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "사진 1.8배 빠른 확대" }).click();
    await expect.poll(() => scale(stage)).toBe(1.8);
    await dialog.getByRole("button", { name: "사진 확대", exact: true }).click();
    await expect.poll(() => scale(stage)).toBeGreaterThan(2.15);
    await stage.focus(); for (let i = 0; i < 8; i++) await page.keyboard.press("+");
    await expect(dialog.getByRole("button", { name: "사진 확대", exact: true })).toBeDisabled();
    if (shape === "small") expect(await scale(stage)).toBe(2.5);
    expect(await scale(stage)).toBeLessThanOrEqual(3);
    await assertBounds(stage);
    await page.setViewportSize({ width: 320, height: 568 });
    await expect(async () => { await assertBounds(stage); }).toPass({ timeout: 5000 });
    await dialog.getByRole("button", { name: "화면 맞춤", exact: true }).click(); await expect.poll(() => scale(stage)).toBe(1);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.goBack(); await expect(dialog).toHaveCount(0);
  }
});
test("accessible controls and large text remain usable at 320px; reopening resets zoom", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({ content: "html {font-size:200%} button {font-size:1rem !important}" });
  let { dialog, stage } = await open(page);
  const scan = await new AxeBuilder({ page }).include("dialog[open]").analyze(); expect(scan.violations).toEqual([]);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole("button", { name: "사진 1.8배 빠른 확대" }).click(); await expect.poll(() => scale(stage)).toBe(1.8);
  await dialog.getByRole("button", { name: "닫기", exact: true }).click(); await expect(dialog).toHaveCount(0);
  ({ dialog, stage } = await open(page)); await expect.poll(() => scale(stage)).toBe(1);
  await page.screenshot({ path: `output/playwright/inventory-pan-zoom-${test.info().project.name}.png` });
});
test("requested zoom survives compositor frame suspension and closes cleanly", async ({ page }) => {
  const { dialog, stage } = await open(page);
  await page.evaluate(() => {
    const original = window.requestAnimationFrame;
    (window as unknown as { restorePhotoFrames: () => void }).restorePhotoFrames = () => { window.requestAnimationFrame = original; };
    window.requestAnimationFrame = () => -1;
  });
  await dialog.getByRole("button", { name: "사진 1.8배 빠른 확대" }).click();
  await expect.poll(() => scale(stage)).toBe(1.8);
  await page.evaluate(() => (window as unknown as { restorePhotoFrames: () => void }).restorePhotoFrames());
  await dialog.getByRole("button", { name: "닫기", exact: true }).click(); await expect(dialog).toHaveCount(0);
  await open(page); await expect.poll(() => scale(stage)).toBe(1);
});
