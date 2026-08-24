import { readFile } from "node:fs/promises";

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
  await expect(page.getByRole("heading", { name: "활동", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /필요한 기록만.*정확하게/ })).toBeVisible({ timeout: 15_000 });
}

test("sales creates a filtered Korean CSV without receiving team export authority", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("group", { name: "내보내기 범위" }).getByRole("button", { name: "팀 전체" })).toHaveCount(0);
  await expect(page.locator(".export-count")).toContainText("2", { timeout: 15_000 });
  await page.getByLabel("행정구 필터").selectOption("seo");
  await expect(page.locator(".export-count")).toContainText("1", { timeout: 15_000 });

  const accessibility = await new AxeBuilder({ page }).include(".export-page").analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole("button", { name: "CSV 생성" }).click();
  await expect(page.locator(".export-paper").getByText("CSV 파일을 만들었습니다.")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".export-paper")).toContainText("1건");
  await expect(page.getByRole("button", { name: "CSV 생성" })).toHaveCount(0);

  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "파일 열기" }).click();
  const download = await downloadEvent;
  const path = await download.path();
  if (!path) throw new Error("The generated CSV download has no local path.");
  const content = await readFile(path);
  expect([...content.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const text = content.toString("utf8");
  expect(text).toContain("대전온누리고등학교");
  expect(text).not.toContain("대전새빛고등학교");

  const [jobs, audits] = await Promise.all([
    database.collection("exportJobs").where("requestedBy", "==", "EMP-SALES-A").get(),
    database.collection("auditLogs").where("eventType", "==", "CSV_EXPORTED").get(),
  ]);
  expect(jobs.size).toBe(1);
  expect(jobs.docs[0]?.data()).toMatchObject({ scope: "own", rowCount: 1, status: "completed" });
  expect(audits.size).toBe(1);
  expect(audits.docs[0]?.data()).toMatchObject({ actorEmployeeId: "EMP-SALES-A", scope: "own", rowCount: 1 });
});

test("team scope appears only after the server-held employee permission is granted", async ({ page }) => {
  await database.doc("employees/EMP-SALES-A").update({ "permissions.exportTeam": true });
  await login(page);
  const team = page.getByRole("group", { name: "내보내기 범위" }).getByRole("button", { name: "팀 전체" });
  await expect(team).toBeVisible();
  await team.click();
  await expect(page.locator(".export-count")).toContainText("5", { timeout: 15_000 });
  await expect(page.getByLabel("담당자 필터")).toBeVisible();
});
