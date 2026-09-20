import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

test.setTimeout(60_000);

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
  await expect(page.locator("[data-delivery-brief]")).toBeVisible();
}

test("delivery detail exposes the field brief, photo metadata, directions, and accessible controls", async ({ page }) => {
  await openCompleteSchool(page);

  const brief = page.locator("[data-delivery-brief]");
  await expect(brief).toHaveCount(1);
  await expect(brief.getByRole("heading", { name: "납품 현장정보", exact: true })).toBeVisible();
  await expect(brief).toContainText("07:30 – 08:10");
  await expect(brief.getByLabel("납품 장비")).toContainText("대차필요");
  await expect(brief.getByLabel("납품 장비")).toContainText("엘리베이터있음");
  await expect(brief.getByText("본관 · 1층", { exact: true })).toBeVisible();
  await expect(brief.getByText("정문에서 오른쪽 통로 끝", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "차량과 하역" })).toHaveCount(0);
  await expect(brief).not.toContainText("계단");
  await expect(brief).not.toContainText("01 · LOCATION");
  await expect(page.getByText("급식실 출입구", { exact: true })).toBeVisible();

  const direction = page.getByRole("link", { name: "길안내" }).first();
  await expect(direction).toHaveAttribute("href", /https:\/\/map\.kakao\.com\/link\/to\//);
  await expect(direction).toHaveAttribute("target", "_blank");

  await brief.getByRole("button", { name: "정보 수정", exact: true }).click();
  const completeEditor = page.getByRole("dialog", { name: "현장정보 한 번에 입력" });
  await expect(completeEditor.getByLabel("급식실 위치")).toBeVisible();
  await expect(completeEditor.getByLabel("검수 시작")).toBeVisible();
  await expect(completeEditor.getByLabel("대차 필요")).toBeVisible();
  await expect(completeEditor.getByLabel("엘리베이터")).toBeVisible();
  await expect(completeEditor.getByLabel("하역 위치")).toHaveCount(0);
  await expect(completeEditor.getByLabel(/계단/)).toHaveCount(0);
  await expect(completeEditor.getByLabel("현장 특이사항")).toBeVisible();
  await completeEditor.getByRole("button", { name: "닫기" }).click();

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

  await expect(page.locator("[data-delivery-brief]")).toContainText("07:30 – 08:10");
  await expect(
    page.getByLabel("대전온누리고등학교").getByText("오프라인 · 저장된 정보를 표시하고 있습니다."),
  ).toBeVisible();
});

test("unified field updates use the callable and stale revisions surface a recoverable conflict", async ({ page, context }) => {
  await openCompleteSchool(page);
  await page.locator("[data-delivery-brief]").getByRole("button", { name: "정보 수정", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "현장정보 한 번에 입력", exact: true });
  await expect(editor).toBeVisible();
  const inspectionNote = editor.getByRole("textbox", { name: "추가 설명" });
  await inspectionNote.fill("");
  await inspectionNote.pressSequentially("학생 이동 시간 주의");
  await expect(inspectionNote).toHaveValue("학생 이동 시간 주의");

  const concurrentPage = await context.newPage();
  await openCompleteSchool(concurrentPage, false);
  await concurrentPage.locator("[data-delivery-brief]").getByRole("button", { name: "정보 수정", exact: true }).click();
  const concurrentEditor = concurrentPage.getByRole("dialog", { name: "현장정보 한 번에 입력", exact: true });
  await concurrentEditor.getByRole("textbox", { name: "현장 특이사항" }).fill("Phase 7 동시 수정 검증");
  await concurrentEditor.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(concurrentPage.getByText("현장정보를 저장했습니다.")).toBeVisible();
  await concurrentPage.close();

  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.getByLabel("검수 시작").fill("07:35");
  await editor.getByRole("button", { name: "변경사항 저장" }).click();
  await expect(editor.getByRole("alert")).toContainText("다른 직원이 먼저 수정했습니다. 최신 정보를 불러왔습니다.");
  await expect(editor.getByRole("textbox", { name: "현장 특이사항" })).toHaveValue("Phase 7 동시 수정 검증");
  await editor.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.locator("[data-delivery-brief]")).toContainText("Phase 7 동시 수정 검증");
});
