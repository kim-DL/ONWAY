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
  await expect(page.getByRole("dialog", { name: params.includes("route") ? "인공지능 경로 추천" : "명세서로 납품 준비" })).toBeVisible();
}
async function photos(page: import("@playwright/test").Page, count: number) {
  const buffer = await sharp({ create: { width: 160, height: 120, channels: 3, background: "white" } }).jpeg().toBuffer();
  await page.getByLabel("명세서 갤러리", { exact: true }).setInputFiles(Array.from({ length: count }, (_, i) => ({ name: `example-${i}.jpg`, mimeType: "image/jpeg", buffer })));
}
test("scanning auto saves; last stop remains fixed; repeated viewing does not call TMAP", async ({ page }) => {
  await open(page, "?empty"); await photos(page, 3);
  await expect(page.getByText("3곳 저장 완료")).toBeVisible();
  await page.getByRole("combobox", { name: "마지막 납품처", exact: true }).selectOption("preview-0");
  await page.getByRole("button", { name: "인공지능 경로 추천" }).click();
  await expect(page.getByText("예상 이동")).toContainText("82");
  await expect(page.getByRole("list").last().getByRole("listitem").last()).toContainText("예시푸드");
  await expect(page.getByRole("button", { name: "오늘 순서에 적용했어요" })).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { planningPreviewStats: () => { recommendCount: number } }).planningPreviewStats().recommendCount)).toBe(1);
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: (await indexedDB.databases()).length }))).toEqual({ local: 0, session: 0, databases: 0 });
  await page.getByRole("button", { name: "완료", exact: true }).click();
  await expect(page.getByRole("list", { name: "오늘 남은 납품처", exact: true }).getByRole("listitem")).toHaveText(["늘봄식품", "한빛유통", "예시푸드"]);
});

test("recommendation saves before completion and keeps photo-completed customers out of remaining stops", async ({ page }) => {
  await open(page, "?route&completed&slowSave");
  await page.getByRole("combobox", { name: "마지막 납품처", exact: true }).selectOption("preview-0");
  await page.getByRole("button", { name: "인공지능 경로 추천", exact: true }).click();
  await expect(page.getByText("예상 이동")).toBeVisible();
  await expect(page.getByRole("button", { name: "오늘 목록에 저장 중…" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "오늘 순서에 적용했어요" })).toBeDisabled();
  await page.getByRole("button", { name: "완료", exact: true }).click();
  await expect(page.getByRole("list", { name: "오늘 남은 납품처", exact: true }).getByRole("listitem")).toHaveText(["정다운푸드", "푸른급식", "늘봄식품", "예시푸드"]);
});

for (const failure of ["failSave", "lostResponse"]) {
  test(`${failure}: retries the same save receipt without recalculating the route`, async ({ page }) => {
    await open(page, `?route&${failure}`);
    await page.getByRole("combobox", { name: "마지막 납품처", exact: true }).selectOption("preview-0");
    await page.getByRole("button", { name: "인공지능 경로 추천", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: "오늘 순서에 적용했어요" })).toHaveCount(0);
    if (failure === "failSave") {
      await expect(page.locator('ol[aria-label="오늘 남은 납품처"] li')).toHaveText(["예시푸드", "한빛유통", "늘봄식품", "푸른급식", "정다운푸드"]);
    }
    await page.getByRole("button", { name: "오늘 목록 저장 다시 시도" }).click();
    await expect(page.getByRole("button", { name: "오늘 순서에 적용했어요" })).toBeDisabled();
    const requests = await page.evaluate(() => (window as unknown as { planningApplyRequests: () => string[] }).planningApplyRequests());
    expect(requests).toHaveLength(2); expect(requests[0]).toBe(requests[1]);
    expect(await page.evaluate(() => (window as unknown as { planningPreviewStats: () => { recommendCount: number } }).planningPreviewStats().recommendCount)).toBe(1);
    await page.getByRole("button", { name: "완료", exact: true }).click();
    await expect(page.getByRole("list", { name: "오늘 남은 납품처", exact: true }).getByRole("listitem")).toHaveText(["정다운푸드", "푸른급식", "늘봄식품", "한빛유통", "예시푸드"]);
  });
}
test("wrong date requires confirmation; only origin setup is needed with the default truck", async ({ page }) => {
  await open(page, "?empty&review&unconfigured"); await photos(page, 2);
  await expect(page.getByText("1곳 저장 · 1장 확인 필요")).toBeVisible();
  await expect(page.getByRole("button", { name: "이 거래처로 저장" })).toBeDisabled();
  await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "이 거래처로 저장" }).click();
  await expect(page.getByText("2곳 저장 완료")).toBeVisible();
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
  await page.getByLabel("명세서 갤러리", { exact: true }).setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("not an invoice") });
  await expect(page.getByRole("alert")).toContainText("JPEG·PNG·WebP");
  await expect(page.getByRole("button", { name: "완료", exact: true })).toBeEnabled();
});
test("manual search additions can be recommended and reordered without another API call", async ({ page }) => {
  await open(page, "?route&empty");
  await expect(page.getByRole("button", { name: "명세서 촬영" })).toHaveCount(0);
  await page.getByRole("button", { name: "납품처 추가 · 순서 편집" }).click();
  for (const name of ["예시푸드", "한빛유통", "늘봄식품"]) {
    await page.getByRole("searchbox", { name: "거래처 검색" }).fill(name);
    await page.getByRole("button", { name: `${name} 오늘만 추가` }).click();
  }
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("list", { name: "현재 오늘 납품처" }).getByRole("listitem")).toHaveCount(3);
  await page.getByRole("combobox", { name: "마지막 납품처", exact: true }).selectOption("preview-0");
  await page.getByRole("button", { name: "인공지능 경로 추천", exact: true }).click();
  await expect(page.getByRole("button", { name: "오늘 순서에 적용했어요" })).toBeDisabled();
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
