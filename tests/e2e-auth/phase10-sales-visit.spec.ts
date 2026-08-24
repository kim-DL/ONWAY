import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

const PROJECT_ID = "demo-onnuriway";
const FOLLOW_UP_SCHOOL_ID = "SCH-NEIS-G100000004";
const ZERO_INTEREST_SCHOOL_ID = "SCH-NEIS-G100000002";
let database: Firestore;

test.beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Phase 10 E2E setup is restricted to Firebase emulators.");
  }
  const app = getApps().find((candidate) => candidate.name === "phase10-e2e-control")
    ?? initializeApp({ projectId: PROJECT_ID }, "phase10-e2e-control");
  database = getFirestore(app);
});

async function login(page: Page, pin: string) {
  await page.goto("/");
  await page.getByLabel("직원 PIN").fill(pin);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  await expect(page.getByRole("heading", { name: /오늘 움직일.*학교의 흐름/ })).toBeVisible({ timeout: 15_000 });
}

async function openOwnSchool(page: Page, schoolName: string) {
  await page.locator(".assignment-card", { hasText: schoolName }).click();
  await expect(page.getByRole("heading", { name: schoolName })).toBeVisible();
  await expect(page.getByRole("heading", { name: "이번 달, 이어갈 대화." })).toBeVisible();
}

test("sales A records a complete visit with sample, hearts, tags, another visitor, and follow-up", async ({ page }) => {
  await login(page, PHASE3_TEST_PINS.salesA);
  await openOwnSchool(page, "대전새빛고등학교");
  await expect(page.getByText("아직 평가 전")).toBeVisible();

  await page.getByRole("button", { name: "방문 기록 시작" }).click();
  const sheet = page.locator(".bottom-sheet", { hasText: "방문 기록" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "방문 기록 저장" }).click();
  await expect(sheet.getByRole("alert")).toContainText("제품 관심도를 선택해주세요");

  await sheet.getByLabel(/실제 방문자/).selectOption("EMP-SALES-B");
  await sheet.getByRole("group", { name: /홍보지/ }).getByRole("radio", { name: "전달", exact: true }).click();
  await sheet.getByRole("group", { name: /샘플/ }).getByRole("radio", { name: "전달", exact: true }).click();
  await sheet.getByLabel("샘플 제품 1").selectOption("PROD-002");
  await sheet.getByLabel("샘플 수량 1").fill("2");
  await sheet.getByRole("radio", { name: /3단계, 관심 있음/ }).click();
  await sheet.getByRole("button", { name: "후속 필요", exact: true }).click();
  await sheet.getByRole("button", { name: "샘플 반응" }).click();
  await sheet.getByLabel(/방문 결과/).fill("샘플 사용 뒤 가격 자료를 다시 전달하기로 했습니다.");
  await sheet.getByRole("switch", { name: /후속 필요/ }).click();
  await sheet.getByLabel(/후속 날짜/).fill("2026-08-30");
  await sheet.getByLabel(/후속 내용/).fill("가격 자료 전달 후 반응 확인");

  const accessibility = await new AxeBuilder({ page }).include(".bottom-sheet").analyze();
  expect(accessibility.violations).toEqual([]);
  const undersizedTargets = await sheet.locator("button:visible, input:visible, select:visible, textarea:visible").evaluateAll((targets) =>
    targets.flatMap((target) => {
      const bounds = target.getBoundingClientRect();
      return bounds.width < 44 || bounds.height < 44
        ? [{ label: target.textContent?.trim() || target.getAttribute("aria-label"), width: bounds.width, height: bounds.height }]
        : [];
    }),
  );
  expect(undersizedTargets).toEqual([]);

  await sheet.getByRole("button", { name: "방문 기록 저장" }).click();
  await expect(page.getByText("방문과 후속 일정을 함께 저장했습니다.")).toBeVisible();
  await expect(sheet).toHaveCount(0);
  const schoolBrief = page.locator(".sales-school-brief");
  await expect(schoolBrief.getByText("관심 있음", { exact: true })).toBeVisible();
  await expect(schoolBrief.getByText("가격 자료 전달 후 반응 확인", { exact: true })).toBeVisible();
  await expect(schoolBrief.getByText("후속 필요", { exact: true })).toBeVisible();

  const [visits, profile, assignment, teamStats] = await Promise.all([
    database.collection("salesVisits").where("schoolId", "==", FOLLOW_UP_SCHOOL_ID).get(),
    database.doc(`salesProfiles/${FOLLOW_UP_SCHOOL_ID}`).get(),
    database.doc(`salesCycles/2026-08/assignments/${FOLLOW_UP_SCHOOL_ID}`).get(),
    database.doc("salesCycles/2026-08/stats/team").get(),
  ]);
  expect(visits.size).toBe(1);
  expect(visits.docs[0]?.data()).toMatchObject({
    visitedBy: "EMP-SALES-B",
    recordedBy: "EMP-SALES-A",
    interest: { score: 60, explicitlySelected: true },
    activityTagIds: ["ACT-FOLLOWUP", "ACT-SAMPLE"],
  });
  expect(profile.data()).toMatchObject({ interestScore: 60, interestEvaluated: true, followUp: { required: true } });
  expect(assignment.data()).toMatchObject({ monthlyStatus: "followUp", brochureStatus: "delivered", sampleStatus: "delivered", revision: 2 });
  expect(teamStats.data()).toMatchObject({ totalSchoolCount: 5, followUpCount: 1 });
});

test("sales B must explicitly choose zero interest and no delivery defaults are preselected", async ({ page }) => {
  await login(page, PHASE3_TEST_PINS.salesB);
  await openOwnSchool(page, "대전한밭중학교");
  await page.getByRole("button", { name: "방문 기록 시작" }).click();
  const sheet = page.locator(".bottom-sheet", { hasText: "방문 기록" });
  await expect(sheet.getByRole("group", { name: /홍보지/ }).getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(sheet.getByRole("group", { name: /샘플/ }).getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(sheet.getByRole("radiogroup", { name: "제품 관심도" }).getByRole("radio", { checked: true })).toHaveCount(0);

  await sheet.getByRole("group", { name: /홍보지/ }).getByRole("radio", { name: "미전달" }).click();
  await sheet.getByRole("group", { name: /샘플/ }).getByRole("radio", { name: "미전달" }).click();
  await sheet.getByRole("radio", { name: "관심도 미확인 선택" }).click();
  await sheet.getByLabel(/방문 결과/).fill("담당자 부재로 자료를 전달하지 못했습니다.");
  await sheet.getByRole("button", { name: "방문 기록 저장" }).click();
  await expect(page.getByText("방문 기록을 저장했습니다.")).toBeVisible();
  await expect(page.locator(".sales-school-brief").getByText("관심도 미확인", { exact: true })).toBeVisible();

  const [visits, profile] = await Promise.all([
    database.collection("salesVisits").where("schoolId", "==", ZERO_INTEREST_SCHOOL_ID).get(),
    database.doc(`salesProfiles/${ZERO_INTEREST_SCHOOL_ID}`).get(),
  ]);
  expect(visits.size).toBe(1);
  expect(visits.docs[0]?.get("interest.score")).toBe(0);
  expect(profile.data()).toMatchObject({ interestScore: 0, interestEvaluated: true });
});

async function emulatorIdToken(uid: string) {
  const app = getApps().find((candidate) => candidate.name === "phase10-e2e-control");
  if (!app) throw new Error("Phase 10 control app is missing.");
  const customToken = await getAuth(app).createCustomToken(uid);
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const body = await response.json() as { idToken?: string };
  if (!body.idToken) throw new Error("Emulator custom-token sign-in failed.");
  return body.idToken;
}

test("team assignments are read-only and delivery users cannot call recordSalesVisit", async ({ page }) => {
  await login(page, PHASE3_TEST_PINS.salesA);
  await page.getByRole("group", { name: "학교 범위" }).getByRole("button", { name: "전체 보기" }).click();
  await page.locator(".assignment-card", { hasText: "대전새봄초등학교" }).click();
  await expect(page.getByRole("button", { name: "조회 전용" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "방문 기록 시작" })).toHaveCount(0);

  const token = await emulatorIdToken("uid-delivery");
  const response = await fetch(`http://127.0.0.1:5001/${PROJECT_ID}/asia-northeast3/recordSalesVisit`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ data: {
      cycleId: "2026-08",
      schoolId: FOLLOW_UP_SCHOOL_ID,
      expectedAssignmentRevision: 2,
      visitedAt: "2026-08-24T05:00:00.000Z",
      visitedBy: "EMP-SALES-A",
      brochureStatus: "notDelivered",
      sample: { status: "notDelivered", items: [] },
      interestScore: 0,
      activityTagIds: [],
      summary: "권한 없는 저장 시도",
      followUp: { required: false, dueDate: null, summary: null },
      requestId: "a22fba24-bd80-4e8a-ac3c-211581414810",
      appVersion: "phase10-e2e",
    } }),
  });
  const body = await response.json() as { error?: { status?: string } };
  expect(body.error?.status).toBe("PERMISSION_DENIED");
});
