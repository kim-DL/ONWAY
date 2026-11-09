import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { buildDeliveryPlanningFixture } from "../helpers/build-delivery-planning-fixture";

let fixture: Awaited<ReturnType<typeof buildDeliveryPlanningFixture>>;
test.beforeAll(async () => { fixture = await buildDeliveryPlanningFixture(); });
async function open(page: import("@playwright/test").Page, params = "") {
  await page.route("**/*", async (route) => route.request().isNavigationRequest()
    ? route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fixture.css}</style><div id="root"></div><script>${fixture.script}</script></html>` }) : route.abort());
  await page.goto(`http://127.0.0.1:3197/?empty&batch${params}`);
  await expect(page.getByRole("dialog", { name: "사진으로 납품 준비" })).toBeVisible();
}
async function photo(page: import("@playwright/test").Page) {
  const buffer = await sharp({ create: { width: 160, height: 120, channels: 3, background: "white" } }).jpeg().toBuffer();
  await page.getByLabel("납품처 갤러리", { exact: true }).setInputFiles({ name: "list.jpg", mimeType: "image/jpeg", buffer });
}
async function stats(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as unknown as { batchPreviewStats: () => { confirmRequests: unknown[]; aliases: { aliasText: string; customerId: string; enabled: boolean }[] } }).batchPreviewStats());
}

test("photo counts stay visible with an existing day and repeated confirmed destinations", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await open(page, "&counts"); await photo(page);
  await expect(page.getByText("새로 추가 1곳 · 이미 등록 1곳", { exact: true })).toBeVisible();
  await expect(page.getByText("2곳 연결 · 1곳 확인 필요", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "현재 오늘 납품처" }).getByRole("listitem")).toHaveText(["1예시푸드", "2푸른급식", "3한빛유통"]);
  const uncertain = page.getByRole("group", { name: "늘봄? 확인", exact: true });
  await uncertain.getByRole("textbox", { name: "기존 거래처 찾기" }).fill("한빛유통");
  await uncertain.getByRole("button", { name: /한빛유통/ }).click();
  await page.getByRole("button", { name: "선택한 1곳 등록", exact: true }).click();
  await expect(page.getByText("2곳 연결 완료", { exact: true })).toBeVisible();
  await expect(page.getByText("새로 추가 1곳 · 이미 등록 1곳", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `output/photo-batch/counts-${test.info().project.name}.png`, fullPage: true, scale: "css" });
  await photo(page);
  await expect(page.getByText("새로 추가 0곳 · 이미 등록 2곳", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "현재 오늘 납품처" }).getByRole("listitem")).toHaveText(["1예시푸드", "2푸른급식", "3한빛유통"]);
});

test("only ambiguous names are expanded and one save confirms selected names and skips unreadable rows", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await open(page); await photo(page);
  await expect(page.getByText("1곳 연결 · 2곳 확인 필요", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "한빛 확인" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("region", { name: "사진 처리 결과" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `output/photo-batch/unresolved-${test.info().project.name}.png`, scale: "css" });
  await page.setViewportSize({ width: 320, height: 760 });
  await expect(page.getByRole("group", { name: "한빛 확인" })).toBeVisible();
  await expect(page.getByRole("group", { name: "늘봄? 확인", exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "예시푸드 확인" })).toHaveCount(0);
  await page.getByText("1개 항목 연결됨", { exact: true }).click();
  await expect(page.getByRole("region", { name: "사진 처리 결과" }).getByText("예시푸드", { exact: true })).toHaveCount(2);
  const shorthand = page.getByRole("group", { name: "한빛 확인" });
  await shorthand.getByRole("button", { name: /한빛유통/ }).click();
  await expect(shorthand.getByRole("checkbox", { name: "이 줄임말 기억" })).toBeChecked();
  await page.getByRole("group", { name: "늘봄? 확인", exact: true }).getByRole("button", { name: "제외", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `output/photo-batch/review-${test.info().project.name}.png`, fullPage: true, scale: "css" });
  await page.getByRole("button", { name: "선택한 1곳 등록", exact: true }).click();
  await expect(page.getByText("2곳 연결 완료", { exact: true })).toBeVisible();
  expect((await stats(page)).confirmRequests).toHaveLength(1);
  expect((await stats(page)).aliases).toMatchObject([{ aliasText: "한빛", customerId: "preview-1", enabled: true }]);
  await photo(page);
  await expect(page.getByText("2곳 연결 · 1곳 확인 필요", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "한빛 확인" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "늘봄? 확인", exact: true })).toBeVisible();
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: (await indexedDB.databases()).length }))).toEqual({ local: 0, session: 0, databases: 0 });
});

test("uncertain handwriting is not remembered unless its spelling is explicitly confirmed", async ({ page }) => {
  await open(page); await photo(page);
  const uncertain = page.getByRole("group", { name: "늘봄? 확인", exact: true });
  await uncertain.getByRole("button", { name: /늘봄식품/ }).click();
  await expect(uncertain.getByRole("checkbox", { name: "이 줄임말 기억" })).not.toBeChecked();
  await uncertain.getByRole("checkbox", { name: "이 줄임말 기억" }).check();
  await uncertain.getByRole("textbox", { name: "기억할 이름" }).fill("늘봄");
  await page.getByRole("button", { name: "선택한 1곳 등록", exact: true }).click();
  await expect(page.getByText("2곳 연결 · 1곳 확인 필요", { exact: true })).toBeVisible();
  expect((await stats(page)).aliases).toMatchObject([{ aliasText: "늘봄", customerId: "preview-2" }]);
});

test("lost confirmation response locks edits and retries the exact request without registering twice", async ({ page }) => {
  await open(page, "&lostConfirm"); await photo(page);
  const shorthand = page.getByRole("group", { name: "한빛 확인" });
  await shorthand.getByRole("button", { name: /한빛유통/ }).click();
  await page.getByRole("button", { name: "선택한 1곳 등록", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("저장 응답");
  await expect(shorthand.getByRole("textbox", { name: "기억할 이름" })).toBeDisabled();
  await page.getByRole("button", { name: "저장 결과 다시 확인", exact: true }).click();
  await expect(page.getByText("2곳 연결 · 1곳 확인 필요", { exact: true })).toBeVisible();
  const state = await stats(page);
  expect(state.confirmRequests).toHaveLength(2); expect(state.confirmRequests[0]).toEqual(state.confirmRequests[1]);
  expect(state.aliases).toHaveLength(1);
});

test("remembered shorthand can be changed and forgotten without removing today's saved customers", async ({ page }) => {
  await open(page); await photo(page);
  await page.getByRole("group", { name: "한빛 확인" }).getByRole("button", { name: /한빛유통/ }).click();
  await page.getByRole("button", { name: "선택한 1곳 등록", exact: true }).click();
  await expect(page.getByText("2곳 연결 · 1곳 확인 필요", { exact: true })).toBeVisible();
  await page.getByText("기억한 줄임말", { exact: false }).click();
  await page.getByRole("button", { name: "변경", exact: true }).click();
  await page.getByRole("textbox", { name: "연결할 거래처" }).fill("푸른급식");
  await page.getByRole("button", { name: /푸른급식.*예시로/ }).click();
  await expect.poll(async () => (await stats(page)).aliases[0]?.customerId).toBe("preview-3");
  await page.getByRole("button", { name: "기억 해제", exact: true }).click();
  await expect.poll(async () => (await stats(page)).aliases[0]?.enabled).toBe(false);
  await expect(page.getByRole("list", { name: "현재 오늘 납품처" }).getByRole("listitem")).toHaveText(["1예시푸드", "2한빛유통"]);
});

test("long handwritten names fit narrow mobile review cards", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await open(page, "&longName"); await photo(page);
  await expect(page.getByText("1곳 연결 · 2곳 확인 필요", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a definitive rejected confirmation allows editing instead of locking the employee into retries", async ({ page }) => {
  await open(page, "&rejectedConfirm"); await photo(page);
  const shorthand = page.getByRole("group", { name: "한빛 확인" });
  await shorthand.getByRole("button", { name: /한빛유통/ }).click();
  await page.getByRole("button", { name: "선택한 1곳 등록", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("줄임말");
  await expect(shorthand.getByRole("checkbox", { name: "이 줄임말 기억" })).toBeEnabled();
  await shorthand.getByRole("checkbox", { name: "이 줄임말 기억" }).uncheck();
  await page.getByRole("button", { name: "선택한 1곳 등록", exact: true }).click();
  await expect(page.getByText("2곳 연결 · 1곳 확인 필요", { exact: true })).toBeVisible();
  expect((await stats(page)).aliases).toHaveLength(0);
});

test("unsupported photos are reported without a success badge or a saved delivery", async ({ page }) => {
  await open(page, "&unsupported"); await photo(page);
  await expect(page.getByText("0곳 연결 · 인식 없음 1장", { exact: true })).toBeVisible();
  await expect(page.getByText("판독 불가", { exact: true })).toBeVisible();
  await expect(page.getByText("거래처를 읽지 못했어요. 명세서나 목록을 다시 촬영해주세요.")).toBeVisible();
  await expect(page.getByRole("list", { name: "현재 오늘 납품처" }).getByRole("listitem")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "사진 촬영", exact: true })).toBeEnabled();
});

test("a corrupt image reports a Korean recovery message and the next valid photo is processed", async ({ page }) => {
  await open(page);
  await page.getByLabel("납품처 갤러리", { exact: true }).setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("not decodable") });
  await expect(page.getByText("사진을 읽지 못했어요. 원본 사진을 다시 선택해주세요.", { exact: true })).toBeVisible();
  await photo(page);
  await expect(page.getByText("1곳 연결 · 2곳 확인 필요 · 1장 재확인", { exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "한빛 확인" })).toBeVisible();
});

for (const aliasText of ["", "임시줄임말"]) {
  test(`returning to a canonical match ignores hidden alias state ${aliasText || "empty"}`, async ({ page }) => {
    await open(page, "&canonicalReview"); await photo(page);
    const row = page.getByRole("group", { name: "한빛유통 확인" });
    await row.getByRole("textbox", { name: "기존 거래처 찾기" }).fill("늘봄식품");
    await row.getByRole("button", { name: /늘봄식품/ }).click();
    await row.getByRole("textbox", { name: "기억할 이름" }).fill(aliasText);
    await row.getByRole("button", { name: "다시 선택" }).click();
    await row.getByRole("textbox", { name: "기존 거래처 찾기" }).fill("한빛유통");
    await row.getByRole("button", { name: /한빛유통/ }).click();
    await expect(row.getByRole("textbox", { name: "기억할 이름" })).toHaveCount(0);
    await page.getByRole("button", { name: "선택한 1곳 등록", exact: true }).click();
    await expect(page.getByText("2곳 연결 · 1곳 확인 필요", { exact: true })).toBeVisible();
    expect((await stats(page)).aliases).toHaveLength(0);
  });
}
