import { expect, test, type Page, type Request } from "@playwright/test";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

test.skip(
  process.env.PHASE16_PERFORMANCE_GATE !== "true",
  "Phase 16 performance assertions require the production-mode runner.",
);

async function waitForMetric(page: Page, name: string) {
  await expect.poll(async () => page.evaluate((metricName) => {
    const metrics = window.__ONNURIWAY_PERFORMANCE__?.snapshot().metrics ?? [];
    return [...metrics].reverse().find((metric) => metric.name === metricName) ?? null;
  }, name)).not.toBeNull();
  return page.evaluate((metricName) => {
    const metrics = window.__ONNURIWAY_PERFORMANCE__?.snapshot().metrics ?? [];
    return [...metrics].reverse().find((metric) => metric.name === metricName) ?? null;
  }, name);
}

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.delivery);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  await expect(page.getByRole("heading", { name: /학교를 찾고.*현장으로/ })).toBeVisible();
}

async function openSearch(page: Page) {
  await page.getByRole("button", { name: /학교 이름으로 찾기/ }).click();
  await expect(page.getByRole("dialog", { name: "어느 학교로 갈까요?" })).toBeVisible();
  await expect(page.getByText("로컬 검색 준비됨")).toBeVisible();
  return page.getByRole("combobox", { name: "학교명 검색" });
}

test("meets the Phase 16 perceived-performance gates on a throttled CPU", async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  await login(page);
  await openSearch(page);
  await page.evaluate(() => window.__ONNURIWAY_PERFORMANCE__?.clear());

  const requests: string[] = [];
  const capture = (request: Request) => requests.push(request.url());
  page.on("request", capture);
  const input = page.getByRole("combobox", { name: "학교명 검색" });
  for (const query of ["새", "새봄", "새봄초", "ㄷㅈㅅㅂㅊ", "새봄쵸"]) {
    await input.fill(query);
  }
  page.off("request", capture);

  const searchMetrics = await page.evaluate(() => (
    window.__ONNURIWAY_PERFORMANCE__?.snapshot().metrics
      .filter((metric) => metric.name === "searchDuration") ?? []
  ));
  expect(searchMetrics.length).toBeGreaterThanOrEqual(5);
  expect(Math.max(...searchMetrics.map((metric) => metric.durationMs))).toBeLessThan(100);
  expect(requests.filter((url) => /firestore|googleapis|open\.neis|kakao/iu.test(url))).toEqual([]);

  await input.fill("온누리고");
  await page.getByRole("option", { name: /대전온누리고등학교/ }).click();
  await expect(page.locator(".field-priority")).toBeVisible();
  await expect(page.getByText("최신 정보 확인 중")).toHaveCount(0);
  const imageMetric = await waitForMetric(page, "imagePreviewDuration");
  expect(imageMetric?.source).toMatch(/memory|indexeddb|network/u);
  await page.getByRole("button", { name: "학교 목록" }).click();

  await page.evaluate(() => window.__ONNURIWAY_PERFORMANCE__?.clear());
  await openSearch(page);
  await page.getByRole("option", { name: /대전온누리고등학교/ }).click();
  await expect(page.locator(".field-priority")).toBeVisible();
  const detailMetric = await waitForMetric(page, "schoolDetailDuration");
  expect(detailMetric?.source).toMatch(/memory|indexeddb/u);
  expect(detailMetric?.durationMs).toBeLessThan(200);
  const cachedImageMetric = await waitForMetric(page, "imagePreviewDuration");
  expect(cachedImageMetric?.source).toMatch(/memory|indexeddb/u);
  expect(cachedImageMetric?.durationMs).toBeLessThan(200);
  await expect(page.getByText("최신 정보 확인 중")).toHaveCount(0);
  const cacheSnapshot = await page.evaluate(() => window.__ONNURIWAY_PERFORMANCE__?.snapshot() ?? null);
  expect(cacheSnapshot?.cache.memory.hits).toBeGreaterThan(0);
  expect(cacheSnapshot?.cache["image-cache"].hits).toBeGreaterThan(0);
  expect(cacheSnapshot?.firestoreReads.total).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: /학교를 찾고.*현장으로/ })).toBeVisible();
  const bootMetric = await waitForMetric(page, "appBootDuration");
  expect(bootMetric?.durationMs).toBeLessThan(1_000);

  const snapshot = await page.evaluate(() => window.__ONNURIWAY_PERFORMANCE__?.snapshot() ?? null);
  expect(snapshot).not.toBeNull();
  expect(snapshot?.vitals.cumulativeLayoutShift).toBeLessThan(0.1);
  expect(JSON.stringify(snapshot)).not.toMatch(/schoolId|employeeId|query|uid/u);

  console.log(JSON.stringify({
    maximumSearchDurationMs: Math.max(...searchMetrics.map((metric) => metric.durationMs)),
    cachedDetailDurationMs: detailMetric?.durationMs,
    appBootDurationMs: bootMetric?.durationMs,
    coldImagePreviewDurationMs: imageMetric?.durationMs,
    cachedImagePreviewDurationMs: cachedImageMetric?.durationMs,
    cumulativeLayoutShift: snapshot?.vitals.cumulativeLayoutShift,
  }));
});
