import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { buildDeliveryPlanningFixture } from "../helpers/build-delivery-planning-fixture";

let fixture: Awaited<ReturnType<typeof buildDeliveryPlanningFixture>>;
test.beforeAll(async () => { fixture = await buildDeliveryPlanningFixture(); });
async function open(page: import("@playwright/test").Page, params = "") {
  await page.route("**/*", async (route) => {
    if (route.request().isNavigationRequest()) return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fixture.css}</style><div id="root"></div><script>${fixture.script}</script></html>` });
    return route.abort();
  });
  await page.goto(`http://127.0.0.1:3197/${params}`);
  await expect(page.getByRole("dialog", { name: params.includes("route") ? "인공지능 경로 추천" : "사진으로 납품 준비" })).toBeVisible();
}
async function photos(page: import("@playwright/test").Page, count: number) {
  const buffer = await sharp({ create: { width: 160, height: 120, channels: 3, background: "white" } }).jpeg().toBuffer();
  await page.getByLabel("납품처 갤러리", { exact: true }).setInputFiles(Array.from({ length: count }, (_, i) => ({ name: `example-${i}.jpg`, mimeType: "image/jpeg", buffer })));
}
async function scanStats(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as unknown as { previewScanStats: () => { requests: string[]; active: number; maxActive: number } }).previewScanStats());
}
async function recommendRequests(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as unknown as { planningRecommendRequests: () => Array<{ firstCustomerId?: string; lastCustomerId: string }> }).planningRecommendRequests());
}
async function applyRequests(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as unknown as { planningApplyRequests: () => string[] }).planningApplyRequests());
}
async function confirmRoute(page: import("@playwright/test").Page) {
  await expect(page.getByText("저장할까요?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "순서 저장", exact: true }).click();
}
async function releaseScan(page: import("@playwright/test").Page) {
  await page.evaluate(() => (window as unknown as { releasePreviewScan: () => void }).releasePreviewScan());
}

test("requires confirmation before saving a route and keeps the original order when declined", async ({ page }) => {
  await open(page, "?route");
  const currentOrder = ["예시푸드", "한빛유통", "늘봄식품", "푸른급식", "정다운푸드"];
  await page.getByRole("combobox", { name: "마지막 납품처", exact: true }).selectOption("preview-0");
  await page.getByRole("button", { name: "인공지능 경로 추천", exact: true }).click();
  await expect(page.getByText("예상 이동")).toBeVisible();
  expect(await applyRequests(page)).toEqual([]);
  await expect(page.locator('ol[aria-label="오늘 남은 납품처"] li')).toHaveText(currentOrder);
  await expect(page.getByText("저장할까요?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "창 닫기", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await applyRequests(page)).toEqual([]);
  await expect(page.getByRole("list", { name: "오늘 남은 납품처" }).getByRole("listitem")).toHaveText(currentOrder);
  await page.getByRole("button", { name: "사진으로 납품 준비", exact: true }).click();
  await page.getByRole("combobox", { name: "마지막 납품처", exact: true }).selectOption("preview-0");
  await page.getByRole("button", { name: "인공지능 경로 추천", exact: true }).click();
  await page.getByRole("button", { name: "순서 저장", exact: true }).click();
  await expect(page.getByRole("button", { name: "저장 완료", exact: true })).toBeDisabled();
  expect(await applyRequests(page)).toHaveLength(1);
  await expect(page.locator('ol[aria-label="오늘 남은 납품처"] li')).toHaveText([...currentOrder].reverse());
});

test("camera remains available while analysis drains newly appended photos in order", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await open(page, "?empty&holdScans"); await photos(page, 1);
  await expect.poll(async () => (await scanStats(page)).requests.length).toBe(1);
  await expect(page.getByRole("button", { name: "사진 촬영", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "갤러리에서 선택", exact: true })).toBeEnabled();
  const next = page.getByRole("button", { name: "다음 촬영", exact: true });
  const chooser = page.waitForEvent("filechooser"); await next.click();
  const buffer = await sharp({ create: { width: 160, height: 120, channels: 3, background: "white" } }).jpeg().toBuffer();
  await (await chooser).setFiles({ name: "next.jpg", mimeType: "image/jpeg", buffer });
  await photos(page, 1);
  const result = page.getByRole("region", { name: "사진 처리 결과" });
  await expect(result.getByRole("listitem")).toHaveCount(3);
  await expect(result.getByText("대기", { exact: true })).toHaveCount(2);
  expect((await scanStats(page)).requests).toHaveLength(1);
  expect(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `output/invoice-capture-queue/queue-${test.info().project.name}.png`, scale: "css" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "사진으로 납품 준비" })).toBeVisible();
  await releaseScan(page);
  await expect.poll(async () => (await scanStats(page)).requests.length).toBe(2);
  await expect(result.getByText("연결됨", { exact: true })).toHaveCount(1);
  await releaseScan(page);
  await expect.poll(async () => (await scanStats(page)).requests.length).toBe(3);
  await releaseScan(page);
  await expect(page.getByText("3곳 연결 완료", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
  const stats = await scanStats(page);
  expect(stats.maxActive).toBe(1); expect(new Set(stats.requests).size).toBe(3);
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: (await indexedDB.databases()).length }))).toEqual({ local: 0, session: 0, databases: 0 });
  await page.getByRole("button", { name: "창 닫기", exact: true }).click();
  await expect(page.getByRole("list", { name: "오늘 남은 납품처", exact: true }).getByRole("listitem")).toHaveText(["예시푸드", "한빛유통", "늘봄식품"]);
});

for (const failure of ["failScan", "lostScanResponse"]) {
  test(`${failure}: a failed photo does not stop later photos and retry keeps its request ID`, async ({ page }) => {
    await open(page, `?empty&${failure}`); await photos(page, 2);
    await expect(page.getByText("1곳 연결 · 1장 재확인", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "사진 촬영", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "저장 결과 다시 확인", exact: true }).click();
    await expect(page.getByText("2곳 연결 완료", { exact: true })).toBeVisible();
    const stats = await scanStats(page);
    expect(stats.requests).toHaveLength(3); expect(stats.requests[2]).toBe(stats.requests[0]); expect(stats.maxActive).toBe(1);
  });
}

test("queue limits include photos added during processing; unmount prevents remaining uploads", async ({ page }) => {
  await open(page, "?empty&holdScans");
  await photos(page, 20);
  await expect.poll(async () => (await scanStats(page)).requests.length).toBe(1);
  await photos(page, 20); await photos(page, 20); await photos(page, 1);
  await expect(page.getByRole("region", { name: "사진 처리 결과" }).getByRole("listitem")).toHaveCount(60);
  await expect(page.getByRole("alert")).toContainText("최대 60장");
  await expect(page.getByRole("button", { name: "다음 촬영", exact: true })).toBeDisabled();
  await page.evaluate(() => (window as unknown as { unmountPlanningPreview: () => void }).unmountPlanningPreview());
  await releaseScan(page);
  await expect.poll(async () => (await scanStats(page)).active).toBe(0);
  expect((await scanStats(page)).requests).toHaveLength(1);
});
test("scanning auto saves; last stop remains fixed; repeated viewing does not call TMAP", async ({ page }) => {
  await open(page, "?empty"); await photos(page, 3);
  await expect(page.getByText("3곳 연결 완료")).toBeVisible();
  await page.getByRole("combobox", { name: "마지막 납품처", exact: true }).selectOption("preview-0");
  await page.getByRole("button", { name: "인공지능 경로 추천" }).click();
  await expect(page.getByText("예상 이동")).toContainText("82");
  await expect(page.getByRole("list").last().getByRole("listitem").last()).toContainText("예시푸드");
  await confirmRoute(page);
  await expect(page.getByRole("button", { name: "저장 완료" })).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { planningPreviewStats: () => { recommendCount: number } }).planningPreviewStats().recommendCount)).toBe(1);
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: (await indexedDB.databases()).length }))).toEqual({ local: 0, session: 0, databases: 0 });
  await page.getByRole("button", { name: "창 닫기", exact: true }).click();
  await expect(page.getByRole("list", { name: "오늘 남은 납품처", exact: true }).getByRole("listitem")).toHaveText(["늘봄식품", "한빛유통", "예시푸드"]);
});

test("confirmed recommendation waits for server save and preserves photo-completed stops", async ({ page }) => {
  await open(page, "?route&completed&slowSave");
  await page.getByRole("combobox", { name: "마지막 납품처", exact: true }).selectOption("preview-0");
  await page.getByRole("button", { name: "인공지능 경로 추천", exact: true }).click();
  await expect(page.getByText("예상 이동")).toBeVisible();
  expect(await applyRequests(page)).toEqual([]);
  await confirmRoute(page);
  await expect(page.getByRole("button", { name: "저장 중…", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "저장 완료" })).toBeDisabled();
  await page.getByRole("button", { name: "창 닫기", exact: true }).click();
  await expect(page.getByRole("list", { name: "오늘 남은 납품처", exact: true }).getByRole("listitem")).toHaveText(["정다운푸드", "푸른급식", "늘봄식품", "예시푸드"]);
});

test("pins a selected first and last customer and omits the first field when returning to company departure", async ({ page }) => {
  await open(page, "?route&completed");
  const first = page.getByRole("combobox", { name: "출발지", exact: true });
  const last = page.getByRole("combobox", { name: "마지막 납품처", exact: true });
  await expect(first).toHaveValue("");
  await first.selectOption("preview-1");
  await expect(page.getByText("대전 대덕구 예시로 11", { exact: true })).toBeVisible();
  await last.selectOption("preview-4");
  await page.getByRole("button", { name: "인공지능 경로 추천", exact: true }).click();
  await confirmRoute(page);
  await expect(page.getByRole("button", { name: "저장 완료" })).toBeDisabled();
  const order = page.getByRole("dialog").getByRole("list").last().getByRole("listitem");
  await expect(order.first()).toContainText("한빛유통"); await expect(order.first()).toContainText("첫 납품처");
  await expect(order.last()).toContainText("정다운푸드");
  expect((await recommendRequests(page))[0]).toMatchObject({ firstCustomerId: "preview-1", lastCustomerId: "preview-4" });
  await first.selectOption("");
  await expect(page.getByText("예상 이동")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "저장 완료" })).toHaveCount(0);
  await expect(last).toHaveValue("preview-4");
  await page.getByRole("button", { name: "인공지능 경로 추천", exact: true }).click();
  await confirmRoute(page);
  await expect(page.getByRole("button", { name: "저장 완료" })).toBeDisabled();
  expect((await recommendRequests(page))[1]).not.toHaveProperty("firstCustomerId");
  await page.getByRole("button", { name: "창 닫기", exact: true }).click();
  await expect(page.getByRole("list", { name: "오늘 남은 납품처" }).getByRole("listitem")).toHaveCount(4);
  await expect(page.getByRole("list", { name: "오늘 남은 납품처" })).not.toContainText("한빛유통");
});

test("changing the first customer clears a matching last choice and blocks the duplicate endpoint", async ({ page }) => {
  await open(page, "?route");
  const first = page.getByRole("combobox", { name: "출발지", exact: true });
  const last = page.getByRole("combobox", { name: "마지막 납품처", exact: true });
  await last.selectOption("preview-0"); await first.selectOption("preview-0");
  await expect(last).toHaveValue("");
  await expect(last.locator('option[value="preview-0"]')).toHaveJSProperty("disabled", true);
  await expect(page.getByRole("button", { name: "인공지능 경로 추천", exact: true })).toBeDisabled();
  expect(await recommendRequests(page)).toEqual([]);
  await last.selectOption("preview-1");
  await expect(page.getByRole("button", { name: "인공지능 경로 추천", exact: true })).toBeEnabled();
});

test("customer departure works without company coordinates and returning to company requires them", async ({ page }) => {
  await open(page, "?route&unconfigured");
  const first = page.getByRole("combobox", { name: "출발지", exact: true });
  await page.getByRole("combobox", { name: "마지막 납품처", exact: true }).selectOption("preview-4");
  await expect(page.getByRole("button", { name: "인공지능 경로 추천", exact: true })).toBeDisabled();
  await expect(page.getByText("회사 출발 위치를 설정해주세요.", { exact: true })).toBeVisible();
  await first.selectOption("preview-0");
  await expect(page.getByText("회사 출발 위치를 설정해주세요.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "인공지능 경로 추천", exact: true }).click();
  await confirmRoute(page);
  await expect(page.getByRole("button", { name: "저장 완료" })).toBeDisabled();
  await first.selectOption("");
  await expect(page.getByRole("button", { name: "인공지능 경로 추천", exact: true })).toBeDisabled();
});

test("long route names fit 320px with customer departure and both fixed endpoints", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 }); await open(page, "?route&longRouteName");
  await page.getByRole("combobox", { name: "출발지", exact: true }).selectOption("preview-0");
  await page.getByRole("combobox", { name: "마지막 납품처", exact: true }).selectOption("preview-4");
  await page.getByRole("button", { name: "인공지능 경로 추천", exact: true }).click();
  await confirmRoute(page);
  await expect(page.getByRole("button", { name: "저장 완료" })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const firstRow = page.getByRole("dialog").getByRole("list").last().getByRole("listitem").first();
  await expect(firstRow).toContainText("ABCDEFGHIJKLMN");
  await firstRow.scrollIntoViewIfNeeded();
  await expect(firstRow).toBeInViewport();
  const bounds = await firstRow.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
});

for (const failure of ["failSave", "lostResponse"]) {
  test(`${failure}: retries the same save receipt without recalculating the route`, async ({ page }) => {
    await open(page, `?route&${failure}`);
    await page.getByRole("combobox", { name: "마지막 납품처", exact: true }).selectOption("preview-0");
    await page.getByRole("button", { name: "인공지능 경로 추천", exact: true }).click();
    await expect(page.getByText("예상 이동")).toBeVisible();
    expect(await applyRequests(page)).toEqual([]);
    await confirmRoute(page);
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "저장 완료" })).toHaveCount(0);
    if (failure === "failSave") {
      await expect(page.locator('ol[aria-label="오늘 남은 납품처"] li')).toHaveText(["예시푸드", "한빛유통", "늘봄식품", "푸른급식", "정다운푸드"]);
    }
    await page.getByRole("button", { name: "저장 다시 확인", exact: true }).click();
    await expect(page.getByRole("button", { name: "저장 완료" })).toBeDisabled();
    const requests = await page.evaluate(() => (window as unknown as { planningApplyRequests: () => string[] }).planningApplyRequests());
    expect(requests).toHaveLength(2); expect(requests[0]).toBe(requests[1]);
    expect(await page.evaluate(() => (window as unknown as { planningPreviewStats: () => { recommendCount: number } }).planningPreviewStats().recommendCount)).toBe(1);
    await page.getByRole("button", { name: "창 닫기", exact: true }).click();
    await expect(page.getByRole("list", { name: "오늘 남은 납품처", exact: true }).getByRole("listitem")).toHaveText(["정다운푸드", "푸른급식", "늘봄식품", "한빛유통", "예시푸드"]);
  });
}
test("wrong date requires confirmation; only origin setup is needed with the default truck", async ({ page }) => {
  await open(page, "?empty&review&unconfigured"); await photos(page, 2);
  await expect(page.getByText("1곳 연결 · 1곳 확인 필요")).toBeVisible();
  await page.getByRole("button", { name: /한빛유통.*예시로/ }).click();
  await expect(page.getByRole("button", { name: "선택한 1곳 등록" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "사진의 날짜와 관계없이 오늘 납품 건으로 등록" }).check(); await page.getByRole("button", { name: "선택한 1곳 등록" }).click();
  await expect(page.getByText("2곳 연결 완료")).toBeVisible();
  await page.getByRole("combobox", { name: "마지막 납품처", exact: true }).selectOption("preview-0");
  await expect(page.getByRole("button", { name: "인공지능 경로 추천" })).toBeDisabled();
  await expect(page.getByText("봉고3 냉동탑차 · 높이 2.4m")).toBeVisible();
  await page.getByRole("button", { name: "회사 출발지 설정" }).click();
  await expect(page.getByRole("textbox")).toHaveCount(1);
  await expect(page.getByRole("textbox", { name: "회사 주소" })).toBeVisible();
  await expect(page.getByRole("button", { name: "출발지 저장" })).toBeDisabled();
  await page.getByRole("button", { name: "출발 위치 검색" }).click();
  await page.getByRole("button", { name: /예시 회사 출발지/ }).click();
  await page.getByRole("button", { name: "출발지 저장" }).click();
  await expect(page.getByRole("button", { name: "인공지능 경로 추천" })).toBeEnabled();
  await page.getByRole("button", { name: "인공지능 경로 추천" }).click();
  await expect(page.getByText("예상 이동")).toContainText("82");
});
test("mobile layout fits 320px and exposes clear errors without saving files", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 }); await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel("납품처 갤러리", { exact: true }).setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("not an invoice") });
  await expect(page.getByRole("alert")).toContainText("JPEG·PNG·WebP");
  await expect(page.getByRole("button", { name: "창 닫기", exact: true })).toBeEnabled();
});
test("manual search additions can be recommended and reordered without another API call", async ({ page }) => {
  await open(page, "?route&empty");
  await expect(page.getByRole("button", { name: "사진 촬영" })).toHaveCount(0);
  await page.getByRole("button", { name: "납품처 추가 · 순서 편집" }).click();
  for (const name of ["예시푸드", "한빛유통", "늘봄식품"]) {
    await page.getByRole("searchbox", { name: "거래처 검색" }).fill(name);
    await page.getByRole("button", { name: `${name} 오늘만 추가` }).click();
  }
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("list", { name: "현재 오늘 납품처" }).getByRole("listitem")).toHaveCount(3);
  await page.getByRole("combobox", { name: "마지막 납품처", exact: true }).selectOption("preview-0");
  await page.getByRole("button", { name: "인공지능 경로 추천", exact: true }).click();
  await confirmRoute(page);
  await expect(page.getByRole("button", { name: "저장 완료" })).toBeDisabled();
  await page.getByRole("button", { name: "순서 직접 바꾸기" }).click();
  const order = page.getByRole("list", { name: "오늘 납품 순서" });
  await expect(order.getByRole("listitem").last()).toContainText("예시푸드");
  await page.getByRole("button", { name: "예시푸드 위로 이동" }).click();
  await page.getByRole("button", { name: "예시푸드 위로 이동" }).click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("list", { name: "현재 오늘 납품처" }).getByRole("listitem").first()).toContainText("예시푸드");
  await expect(page.getByText("예상 이동")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { planningPreviewStats: () => unknown }).planningPreviewStats())).toEqual({ recommendCount: 1, analyzed: 0 });
});
