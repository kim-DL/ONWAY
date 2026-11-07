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
  await expect(page.getByRole("dialog", { name: "명세서로 납품 준비" })).toBeVisible();
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
  await page.getByRole("button", { name: "이 순서를 오늘 목록에 적용" }).click();
  await expect(page.getByRole("button", { name: "오늘 순서에 적용했어요" })).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { planningPreviewStats: () => { recommendCount: number } }).planningPreviewStats().recommendCount)).toBe(1);
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: (await indexedDB.databases()).length }))).toEqual({ local: 0, session: 0, databases: 0 });
});
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
