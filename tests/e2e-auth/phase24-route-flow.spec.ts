import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

const appName = "phase24-route-control";
const extraIds = Array.from({ length: 38 }, (_, index) => `SCH-ROUTE-LARGE-${index}`);
test.setTimeout(120_000);

test.beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Route fixtures are restricted to emulators.");
  }
  const app = getApps().find(candidate => candidate.name === appName)
    ?? initializeApp({ projectId: "demo-onnuriway" }, appName);
  const db = getFirestore(app);
  const school = (await db.doc("schools/SCH-NEIS-G100000001").get()).data()!;
  const assignment = (await db.doc("salesCycles/2026-08/assignments/SCH-NEIS-G100000001").get()).data()!;
  const batch = db.batch();
  for (const [index, schoolId] of extraIds.entries()) {
    batch.set(db.doc(`schools/${schoolId}`), { ...school, schoolId,
      name: index === 5 ? "대전선화초등학교" : index === 36 ? "대전외국어고등학교" : `동선확인${String(index).padStart(2, "0")}초등학교`,
      source: { ...school.source, schoolCode: schoolId },
      location: { ...school.location, latitude: 36.31 + Math.floor(index / 10) * .008, longitude: 127.32 + (index % 10) * .01, matchStatus: "confirmed" },
    });
    batch.set(db.doc(`salesCycles/2026-08/assignments/${schoolId}`), { ...assignment, schoolId, monthlyStatus: "before",
      latestVisitId: null, latestVisitedAt: null, brochureStatus: "unknown", sampleStatus: "unknown",
    });
  }
  await batch.commit();
});

test.afterAll(async () => {
  const app = getApps().find(candidate => candidate.name === appName);
  if (!app) return;
  const db = getFirestore(app);
  const batch = db.batch();
  for (const schoolId of extraIds) {
    batch.delete(db.doc(`schools/${schoolId}`));
    batch.delete(db.doc(`salesCycles/2026-08/assignments/${schoolId}`));
  }
  await batch.commit();
});

test("forty schools calculate through the real callable from both reported first schools and persist all stops", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.salesA);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  await expect(page.locator(".assignment-card")).toHaveCount(40);
  const untouched = page.locator(".assignment-card", { hasText: "대전선화초등학교" });
  await expect(untouched).not.toContainText(/홍보지 미확인|샘플 미확인/);
  await page.getByRole("button", { name: /방문 동선/ }).click();
  const dialog = page.getByRole("dialog", { name: "방문 동선 만들기" });
  // Updated selectors are kept semantic so first-school presentation can change.
  await dialog.getByRole("button", { name: /전체.*40/ }).click();
  await expect(dialog.locator("input[type=checkbox]:checked")).toHaveCount(40);

  for (const name of ["대전선화초등학교", "대전외국어고등학교"]) {
    const row = dialog.locator(".sales-route-candidates > li", { hasText: name });
    await row.getByRole("button", { name: /첫 학교/ }).click();
    const calculate = dialog.getByRole("button", { name: /가까운 순서 계산/ });
    await expect(calculate).toBeInViewport({ ratio: 1 });
    const [response] = await Promise.all([
      page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/optimizeSalesRoute")),
      calculate.click(),
    ]);
    expect(response.status()).toBe(200);
    const data = (await response.json()).result;
    expect(data.orderedSchoolIds).toHaveLength(40);
    expect(new Set(data.orderedSchoolIds).size).toBe(40);
    expect(data.metrics).toHaveLength(1560);
    await expect(dialog.locator(".sales-route-order > li")).toHaveCount(40);
    await expect(dialog.locator(".sales-route-order > li").first()).toContainText(name);
    expect(await dialog.evaluate(element => element.scrollHeight <= element.clientHeight + 2)).toBe(true);
    await expect(dialog.getByRole("button", { name: "이 순서로 보기" })).toBeInViewport({ ratio: 1 });
    if (name === "대전선화초등학교") await dialog.getByRole("button", { name: /학교 다시 선택/ }).click();
  }
  expect((await new AxeBuilder({ page }).include("dialog[open]").analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("forty-school-route.png"), fullPage: false });
  await dialog.getByRole("button", { name: "이 순서로 보기" }).click();
  await expect(page.getByRole("region", { name: "적용 중인 방문 동선" })).toBeVisible();
  await expect(page.locator(".assignment-card").first()).toHaveAccessibleName(/동선 1번째.*대전외국어고등학교/);
  await page.reload();
  await expect(page.locator(".assignment-card")).toHaveCount(40);
  await expect(page.locator(".assignment-card").first()).toHaveAccessibleName(/동선 1번째.*대전외국어고등학교/);
  expect(errors).toEqual([]);
});
