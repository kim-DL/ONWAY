import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

const PROJECT_ID = "demo-onnuriway";
const SCHOOL_ID = "SCH-NEIS-G100000001";
const SCHOOL_NAME = "대전온누리고등학교";
const ORIGINAL_VISIT_ID = "VISIT-20260820-001";
let database: Firestore;
let originalVisitUpdateTime = 0;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Phase 11 E2E setup is restricted to Firebase emulators.");
  }
  const app = getApps().find((candidate) => candidate.name === "phase11-e2e-control")
    ?? initializeApp({ projectId: PROJECT_ID }, "phase11-e2e-control");
  database = getFirestore(app);
  const [originalVisit, rateLimits] = await Promise.all([
    database.doc(`salesVisits/${ORIGINAL_VISIT_ID}`).get(),
    database.collection("loginRateLimits").get(),
  ]);
  if (!originalVisit.exists) throw new Error("Phase 11 E2E requires the seeded visit.");
  originalVisitUpdateTime = originalVisit.updateTime?.toMillis() ?? 0;

  const batch = database.batch();
  for (const snapshot of rateLimits.docs) batch.delete(snapshot.ref);
  for (let index = 1; index <= 7; index += 1) {
    const visitId = `VISIT-PHASE11-${String(index).padStart(3, "0")}`;
    const visitedAt = Timestamp.fromDate(new Date(`2026-08-${String(20 - index).padStart(2, "0")}T03:00:00.000Z`));
    batch.set(database.doc(`salesVisits/${visitId}`), {
      ...originalVisit.data(),
      visitId,
      visitedAt,
      summary: `과거 방문 맥락 ${index}`,
      followUp: index === 1
        ? { required: true, dueDate: "2026-08-26", summary: "이전 후속 일정 확인" }
        : { required: false, dueDate: null, summary: null },
      createdAt: visitedAt,
      updatedAt: visitedAt,
    });
  }
  await batch.commit();
});

async function login(page: Page, pin: string) {
  await page.goto("/");
  await page.getByLabel("직원 PIN").fill(pin);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  await expect(page.getByRole("heading", { name: /오늘 움직일.*학교의 흐름/ })).toBeVisible({ timeout: 15_000 });
}

async function openTeamSchool(page: Page) {
  await page.getByRole("group", { name: "학교 범위" }).getByRole("button", { name: "전체 보기" }).click();
  await page.locator(".assignment-card", { hasText: SCHOOL_NAME }).click();
  await expect(page.getByRole("heading", { name: SCHOOL_NAME })).toBeVisible();
  await expect(page.getByRole("heading", { name: "이전 대화가, 다음 방문의 맥락이 됩니다." })).toBeVisible();
}

async function emulatorIdToken(uid: string) {
  const app = getApps().find((candidate) => candidate.name === "phase11-e2e-control");
  if (!app) throw new Error("Phase 11 control app is missing.");
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

test("sales B reads sales A history progressively but cannot edit the school memory", async ({ page }) => {
  await login(page, PHASE3_TEST_PINS.salesB);
  await openTeamSchool(page);

  const collaboration = page.locator(".sales-collaboration");
  const history = page.locator(".sales-history");
  await expect(collaboration.getByText("자료 전달 후 연락")).toBeVisible();
  await expect(collaboration.getByText("상세 자료 선호")).toBeVisible();
  await expect(collaboration.getByText(/팀 기록은 읽을 수 있지만/)).toBeVisible();
  await expect(collaboration.getByRole("button", { name: "업무 참고 편집" })).toHaveCount(0);
  await expect(history.locator(".visit-timeline-item")).toHaveCount(3);
  await expect(history.getByText("샘플 반응이 좋아 다음 주 상세 자료 전달 예정")).toBeVisible();
  await expect(history.getByRole("button", { name: /수정|삭제/ })).toHaveCount(0);

  await history.getByRole("button", { name: "전체 기록 보기" }).click();
  await expect(history.locator(".visit-timeline-item")).toHaveCount(8);
  await expect(history.getByText("마지막 기록까지 모두 확인했습니다.")).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).include(".sales-collaboration").include(".sales-history").analyze();
  expect(accessibility.violations).toEqual([]);
  const undersizedTargets = await page.locator(".sales-collaboration button:visible, .sales-history button:visible").evaluateAll((targets) =>
    targets.flatMap((target) => {
      const bounds = target.getBoundingClientRect();
      return bounds.width < 44 || bounds.height < 44
        ? [{ label: target.textContent?.trim() ?? target.getAttribute("aria-label"), width: bounds.width, height: bounds.height }]
        : [];
    }),
  );
  expect(undersizedTargets).toEqual([]);

  const token = await emulatorIdToken("uid-sales-b");
  const response = await fetch(`http://127.0.0.1:5001/${PROJECT_ID}/asia-northeast3/updateSalesProfile`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ data: {
      cycleId: "2026-08",
      schoolId: SCHOOL_ID,
      expectedAssignmentRevision: 1,
      expectedSalesRevision: 1,
      communicationTagIds: ["COMM-TEXT"],
      requestId: "13f1c067-51d3-455d-879e-222d4cb2a45b",
      appVersion: "phase11-e2e",
    } }),
  });
  const body = await response.json() as { error?: { status?: string } };
  expect(body.error?.status).toBe("PERMISSION_DENIED");
});

test("sales A updates persistent communication tags without mutating visit events", async ({ page }) => {
  await login(page, PHASE3_TEST_PINS.salesA);
  await page.locator(".assignment-card", { hasText: SCHOOL_NAME }).click();
  await expect(page.getByRole("heading", { name: SCHOOL_NAME })).toBeVisible();
  await expect(page.getByText("다음 달에도 유지됩니다.")).toBeVisible();

  await page.getByRole("button", { name: "업무 참고 편집" }).click();
  const editor = page.locator(".bottom-sheet", { hasText: "커뮤니케이션 참고" });
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "문자 연락 선호" }).click();
  await expect(editor.getByRole("button", { name: "문자 연락 선호" })).toHaveAttribute("aria-pressed", "true");
  const editorAccessibility = await new AxeBuilder({ page }).include(".bottom-sheet").analyze();
  expect(editorAccessibility.violations).toEqual([]);
  await editor.getByRole("button", { name: "업무 참고 저장" }).click();

  await expect(page.getByText("커뮤니케이션 참고를 저장했습니다.")).toBeVisible();
  await expect(page.locator(".sales-collaboration").getByText("문자 연락 선호")).toBeVisible();
  const [profile, originalVisit, visits, audits] = await Promise.all([
    database.doc(`salesProfiles/${SCHOOL_ID}`).get(),
    database.doc(`salesVisits/${ORIGINAL_VISIT_ID}`).get(),
    database.collection("salesVisits").where("schoolId", "==", SCHOOL_ID).get(),
    database.collection("auditLogs").where("eventType", "==", "SALES_PROFILE_UPDATED").get(),
  ]);
  expect(profile.data()).toMatchObject({
    communicationTagIds: ["COMM-DETAIL", "COMM-TEXT"],
    nextAction: { dueDate: "2026-08-27", summary: "자료 전달 후 연락" },
    salesRevision: 2,
  });
  expect(originalVisit.get("summary")).toBe("샘플 반응이 좋아 다음 주 상세 자료 전달 예정");
  expect(originalVisit.updateTime?.toMillis()).toBe(originalVisitUpdateTime);
  expect(visits.size).toBe(8);
  expect(audits.size).toBe(1);
});

test("delivery mode never loads or reveals the sales archive", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.delivery);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  await expect(page.getByRole("heading", { name: /학교를 찾고.*현장으로/ })).toBeVisible();
  await page.getByRole("button", { name: /학교 이름으로 찾기/ }).click();
  await page.getByRole("combobox", { name: "학교명 검색" }).fill("온누리고");
  await page.getByRole("option", { name: /대전온누리고등학교/ }).click();
  await expect(page.getByRole("heading", { name: SCHOOL_NAME })).toBeVisible();
  await expect(page.locator(".sales-history")).toHaveCount(0);
  await expect(page.locator(".sales-collaboration")).toHaveCount(0);
});
