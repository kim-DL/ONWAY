import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

const PROJECT_ID = "demo-onnuriway";
let database: Firestore;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.STORAGE_EMULATOR_HOST) {
    throw new Error("Phase 12 E2E is restricted to Firebase emulators.");
  }
  const app = getApps().find((candidate) => candidate.name === "phase12-e2e-control")
    ?? initializeApp({ projectId: PROJECT_ID }, "phase12-e2e-control");
  database = getFirestore(app);
});

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.salesA);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  await expect(page.getByRole("heading", { name: /오늘 움직일.*학교의 흐름/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "활동" }).click();
  await expect(page.getByRole("heading", { name: /좋은 대화가.*기다리고 있어요/ })).toBeVisible({ timeout: 15_000 });
}

test("sales activity is an actionable own-school queue instead of an export screen", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("group", { name: "업무 상태" }).getByRole("button", { name: "방문 전" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".sales-activity-score")).toContainText("/ 2");
  await expect(page.getByRole("button", { name: "CSV 생성" })).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).include(".sales-activity-page").analyze();
  expect(accessibility.violations).toEqual([]);

  let queuedSchools = await page.locator(".sales-task-row").count();
  for (const queue of ["후속 관리", "완료"]) {
    await page.getByRole("group", { name: "업무 상태" }).getByRole("button", { name: queue }).click();
    queuedSchools += await page.locator(".sales-task-row").count();
  }
  expect(queuedSchools).toBe(2);
});

test("activity remains scoped to the employee even when a separate export permission is granted", async ({ page }) => {
  await database.doc("employees/EMP-SALES-A").update({ "permissions.exportTeam": true });
  await login(page);
  await expect(page.getByText("대전한밭중학교")).toHaveCount(0);
  await page.getByRole("group", { name: "업무 상태" }).getByRole("button", { name: "완료" }).click();
  await expect(page.getByText("대전한밭중학교")).toHaveCount(0);
});
