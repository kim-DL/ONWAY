import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

test.beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Phase 7 E2E rate-limit reset is restricted to the Firestore emulator.");
  }
  const app = getApps().find((candidate) => candidate.name === "phase7-e2e-control")
    ?? initializeApp({ projectId: "demo-onnuriway" }, "phase7-e2e-control");
  const database = getFirestore(app);
  const snapshots = await database.collection("loginRateLimits").get();
  const batch = database.batch();
  for (const snapshot of snapshots.docs) batch.delete(snapshot.ref);
  await batch.commit();
});

async function ensureDeliverySession(page: Page, authenticate: boolean) {
  await page.goto("/");
  if (authenticate) {
    await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.delivery);
    await page.getByRole("button", { name: "급식길 시작하기" }).click();
  }
  await expect(page.getByRole("heading", { name: /학교를 찾고.*현장으로/ })).toBeVisible();
}

async function openCompleteSchool(page: Page, authenticate = true) {
  await ensureDeliverySession(page, authenticate);
  await page.getByRole("button", { name: /학교 이름으로 찾기/ }).click();
  const search = page.getByRole("combobox", { name: "학교명 검색" });
  await search.fill("온누리고");
  await page.getByRole("option", { name: /대전온누리고등학교/ }).click();
  await expect(page.getByRole("heading", { name: "대전온누리고등학교" })).toBeVisible();
  await expect(page.locator(".field-priority")).toBeVisible();
}

test("delivery detail exposes the field brief, photo metadata, directions, and accessible controls", async ({ page }) => {
  await openCompleteSchool(page);

  const priority = page.locator(".field-priority");
  await expect(priority).toContainText("07:30 ~ 08:10");
  await expect(priority).toContainText("필요");
  await expect(priority).toContainText("본관 · 1층 · 정문에서 오른쪽 통로 끝");
  await expect(page.getByRole("heading", { name: "차량과 하역" })).toBeVisible();
  await expect(page.getByText("급식실 출입구", { exact: true })).toBeVisible();

  const direction = page.getByRole("link", { name: "길안내" }).first();
  await expect(direction).toHaveAttribute("href", /https:\/\/map\.kakao\.com\/link\/to\//);
  await expect(direction).toHaveAttribute("target", "_blank");

  const scan = await new AxeBuilder({ page }).include(".school-detail").analyze();
  expect(scan.violations).toEqual([]);

  const undersized = await page.locator(".school-detail button:visible, .school-detail a:visible").evaluateAll((targets) =>
    targets.flatMap((target) => {
      const bounds = target.getBoundingClientRect();
      return bounds.width < 44 || bounds.height < 44
        ? [{ label: target.textContent?.trim() ?? target.getAttribute("aria-label"), width: bounds.width, height: bounds.height }]
        : [];
    }),
  );
  expect(undersized).toEqual([]);
});

test("a previously viewed school opens from IndexedDB while offline", async ({ page, context }) => {
  await openCompleteSchool(page);
  const databases = await page.evaluate(async () => (await indexedDB.databases()).map((database) => database.name));
  expect(databases).toContain("onnuriway-school-detail-v1");

  await page.getByRole("button", { name: "학교 목록" }).click();
  await context.setOffline(true);
  await page.getByRole("button", { name: /학교 이름으로 찾기/ }).click();
  await page.getByRole("option", { name: /대전온누리고등학교/ }).click();

  await expect(page.locator(".field-priority")).toContainText("07:30 ~ 08:10");
  await expect(
    page.getByLabel("대전온누리고등학교").getByText("오프라인 · 저장된 정보를 표시하고 있습니다."),
  ).toBeVisible();
});

test("section updates use the callable and stale revisions surface a recoverable conflict", async ({ page, context }) => {
  await openCompleteSchool(page);
  await page.getByRole("button", { name: "검수시간 상세 수정" }).click();
  await expect(page.getByRole("dialog", { name: "검수시간 수정" })).toBeVisible();

  const concurrentPage = await context.newPage();
  await openCompleteSchool(concurrentPage, false);
  await concurrentPage.locator(".field-section--notes").getByRole("button", { name: "수정" }).click();
  await concurrentPage.getByRole("textbox", { name: "현장 특이사항" }).fill("Phase 7 동시 수정 검증");
  await concurrentPage.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(concurrentPage.getByText("현장정보를 저장했습니다.")).toBeVisible();
  await concurrentPage.close();

  await page.getByLabel("검수 시작").fill("07:35");
  await page.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(page.getByText("다른 직원이 먼저 수정했습니다. 최신 정보를 불러왔습니다.")).toBeVisible();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByText("현장정보 개정 2")).toBeVisible();
  await expect(page.getByText("Phase 7 동시 수정 검증")).toBeVisible();
});
