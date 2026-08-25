import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

const PROJECT_ID = "demo-onnuriway";

test.beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Phase 9 E2E setup is restricted to Firebase emulators.");
  }
  const app = getApps().find((candidate) => candidate.name === "phase9-e2e-control")
    ?? initializeApp({ projectId: PROJECT_ID }, "phase9-e2e-control");
  const database = getFirestore(app);
  const rateLimits = await database.collection("loginRateLimits").get();
  const batch = database.batch();
  for (const snapshot of rateLimits.docs) batch.delete(snapshot.ref);
  await batch.commit();
});

async function login(page: Page, pin: string) {
  await page.goto("/");
  await page.getByLabel("직원 PIN").fill(pin);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  await expect(page.getByRole("heading", { name: /오늘 움직일.*학교의 흐름/ })).toBeVisible();
  await expect(page.getByText("2026년 8월")).toBeVisible();
}

test("sales A defaults to only their schools and can explicitly open the whole team", async ({ page }) => {
  await login(page, PHASE3_TEST_PINS.salesA);

  await expect(page.getByRole("group", { name: "학교 범위" }).getByRole("button", { name: "내 구역" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".assignment-card")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /대전온누리고등학교, A구역, 담당 영업 A/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /대전새빛고등학교, A구역, 담당 영업 A/ })).toBeVisible();
  await expect(page.locator(".sales-cycle-progress")).toContainText("50");

  const accessibility = await new AxeBuilder({ page }).include(".sales-cycle-page").analyze();
  expect(accessibility.violations).toEqual([]);
  const undersizedTargets = await page.locator(".sales-cycle-page button:visible, .sales-cycle-page a:visible").evaluateAll((targets) =>
    targets.flatMap((target) => {
      const bounds = target.getBoundingClientRect();
      return bounds.width < 44 || bounds.height < 44
        ? [{ label: target.textContent?.trim() ?? target.getAttribute("aria-label"), width: bounds.width, height: bounds.height }]
        : [];
    }),
  );
  expect(undersizedTargets).toEqual([]);

  await page.getByRole("group", { name: "학교 범위" }).getByRole("button", { name: "전체 보기" }).click();
  await expect(page.getByRole("heading", { name: /함께 이어가는.*팀의 흐름/ })).toBeVisible();
  await expect(page.locator(".assignment-card")).toHaveCount(5);
  await expect(page.getByText(/순위|저성과|실적 경쟁/)).toHaveCount(0);
  await page.getByRole("button", { name: "C구역", exact: true }).click();
  await expect(page.locator(".assignment-card")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /대전새봄초등학교, C구역, 담당 영업 C/ })).toBeVisible();
});

test("sales B and C receive distinct own-zone snapshots", async ({ browser }) => {
  const cases = [
    { pin: PHASE3_TEST_PINS.salesB, schools: ["대전한밭중학교"], absent: "대전온누리고등학교" },
    { pin: PHASE3_TEST_PINS.salesC, schools: ["대전새봄초등학교", "대전푸른특수학교"], absent: "대전한밭중학교" },
  ];
  for (const scenario of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await login(page, scenario.pin);
    await expect(page.locator(".assignment-card")).toHaveCount(scenario.schools.length);
    for (const school of scenario.schools) {
      await expect(page.locator(".assignment-card", { hasText: school })).toBeVisible();
    }
    await expect(page.locator(".assignment-card", { hasText: scenario.absent })).toHaveCount(0);
    await context.close();
  }
});

async function emulatorIdToken(uid: string) {
  const app = getApps().find((candidate) => candidate.name === "phase9-e2e-control");
  if (!app) throw new Error("Phase 9 control app is missing.");
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

async function emulatorGoogleIdToken(uid: string) {
  const currentIdToken = await emulatorIdToken(uid);
  const fakeGoogleIdToken = JSON.stringify({
    sub: "phase17-admin-google",
    email: "admin@onnuriway.test",
    email_verified: true,
    name: "Phase 17 Admin",
  });
  const postBody = new URLSearchParams({
    providerId: "google.com",
    id_token: fakeGoogleIdToken,
  }).toString();
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requestUri: "http://127.0.0.1",
      postBody,
      idToken: currentIdToken,
      returnSecureToken: true,
    }),
  });
  const body = await response.json() as { idToken?: string; error?: { message?: string } };
  if (!body.idToken) {
    throw new Error(`Emulator Google sign-in failed: ${body.error?.message ?? "missing ID token"}.`);
  }
  return body.idToken;
}

async function callFunction(name: string, idToken: string, data: unknown) {
  const response = await fetch(`http://127.0.0.1:5001/${PROJECT_ID}/asia-northeast3/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  const payload = await response.json() as {
    data?: Record<string, unknown>;
    result?: Record<string, unknown>;
    error?: { status?: string };
  };
  return { result: payload.data ?? payload.result, error: payload.error };
}

test("admin callables create and change assignments while sales users are denied", async () => {
  const [adminToken, salesToken] = await Promise.all([
    emulatorGoogleIdToken("uid-admin"),
    emulatorIdToken("uid-sales-a"),
  ]);
  const base = { appVersion: "phase9-e2e" };
  const blocked = await callFunction("createSalesCycle", salesToken, {
    ...base,
    cycleId: "2026-10",
    copiedFromCycleId: null,
    activate: false,
    requestId: "86e03fe2-1663-4a24-b953-fbb22e65e9b1",
  });
  expect(blocked.error?.status).toBe("PERMISSION_DENIED");

  const cycle = await callFunction("createSalesCycle", adminToken, {
    ...base,
    cycleId: "2026-10",
    copiedFromCycleId: null,
    activate: false,
    requestId: "0b6c71d6-4830-4677-8ebc-40fa64dc09f1",
  });
  expect(cycle.result).toMatchObject({ cycleId: "2026-10", status: "draft", replayed: false });

  const created = await callFunction("createSalesAssignments", adminToken, {
    ...base,
    cycleId: "2026-10",
    requestId: "94ba125b-f35c-4519-a437-e2598fc463d9",
    assignments: [{
      schoolId: "SCH-NEIS-G100000001",
      zoneId: "A",
      primaryAssigneeId: "EMP-SALES-A",
      assigneeIds: ["EMP-SALES-A"],
    }],
  });
  expect(created.result).toMatchObject({ createdCount: 1, replayed: false });

  const changed = await callFunction("changeSalesAssignment", adminToken, {
    ...base,
    cycleId: "2026-10",
    schoolId: "SCH-NEIS-G100000001",
    expectedRevision: 1,
    zoneId: "B",
    primaryAssigneeId: "EMP-SALES-B",
    assigneeIds: ["EMP-SALES-B", "EMP-SALES-A"],
    reason: "공동 담당 일정 조정",
    requestId: "5c9b85bd-80d8-470e-af62-ad6a98155ca4",
  });
  expect(changed.result).toMatchObject({ revision: 2, replayed: false });
});
