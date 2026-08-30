import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

const PROJECT_ID = "demo-onnuriway";
const UI_CLAIM_SCHOOL_ID = "SCH-CLAIM-UI";
const UI_CLAIM_SCHOOL_NAME = "대전미배정초등학교";

test.setTimeout(90_000);

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

  const schoolSnapshots = await database.collection("schools").limit(1).get();
  const templateSchool = schoolSnapshots.docs[0];
  if (!templateSchool) throw new Error("A school template is required for the assignment UI test.");
  const templateData = templateSchool.data();
  await database.doc(`schools/${UI_CLAIM_SCHOOL_ID}`).set({
    ...templateData,
    schoolId: UI_CLAIM_SCHOOL_ID,
    name: UI_CLAIM_SCHOOL_NAME,
    shortName: "미배정초",
    source: { ...templateData.source, schoolCode: "G-CLAIM-UI" },
  });
  const catalogSnapshots = await database.collection("searchCatalogs").get();
  const targetCatalog = catalogSnapshots.docs.find((snapshot) => snapshot.get("district") === templateData.district);
  if (!targetCatalog) throw new Error("A district search catalog is required for the assignment UI test.");
  const catalogItems = targetCatalog.get("items") as Record<string, unknown>[];
  if (!catalogItems.some((item) => item.schoolId === UI_CLAIM_SCHOOL_ID)) {
    await Promise.all([
      targetCatalog.ref.update({
        itemCount: catalogItems.length + 1,
        items: [...catalogItems, {
          schoolId: UI_CLAIM_SCHOOL_ID,
          name: UI_CLAIM_SCHOOL_NAME,
          shortName: "미배정초",
          normalizedName: UI_CLAIM_SCHOOL_NAME,
          initials: "ㄷㅈㅁㅂㅈㅊㄷㅎㄱ",
          aliases: [],
          schoolType: "elementary",
          district: templateData.district,
          addressSummary: "대전광역시 테스트구 온누리로 18",
          operationalStatus: "active",
          photoCount: 0,
          fieldInfoAvailable: false,
        }],
      }),
      database.doc("catalogMeta/current").update({
        commonCatalogItemCount: catalogItems.length + 1
          + catalogSnapshots.docs
            .filter((snapshot) => snapshot.id !== targetCatalog.id)
            .reduce((count, snapshot) => count + Number(snapshot.get("itemCount") ?? 0), 0),
      }),
    ]);
  }
});

async function login(page: Page, pin: string) {
  const pinInput = page.getByLabel("직원 PIN");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    try {
      await pinInput.waitFor({ state: "visible", timeout: 15_000 });
      break;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  await pinInput.fill(pin);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  await expect(page.getByRole("heading", { name: /오늘 움직일.*학교의 흐름/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("2026년 8월")).toBeVisible();
}

test("sales A defaults to only their schools and can explicitly open the whole team", async ({ page }) => {
  await login(page, PHASE3_TEST_PINS.salesA);

  await expect(page.getByRole("group", { name: "학교 범위" }).getByRole("button", { name: "내 학교" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".assignment-card")).toHaveCount(2);
  await expect(page.getByRole("button", { name: /대전온누리고등학교, 서구, 담당 영업 A/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /대전새빛고등학교, 동구, 담당 영업 A/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "모두가 함께 쓰는 학교 정보" })).toHaveCount(0);
  await expect(page.locator(".school-card")).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "담당 학교 작업" }).getByRole("button", { name: /학교 찾기/ })).toBeVisible();
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
  await page.getByRole("button", { name: "유성구", exact: true }).click();
  await expect(page.locator(".assignment-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /대전새봄초등학교, 유성구, 담당 영업 C/ })).toBeVisible();

  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "활동" }).click();
  await expect(page.getByRole("heading", { name: /확인하고.*바로 움직이기/ })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: /함께 이어가는.*팀의 흐름/ })).toBeVisible();
});

test("sales B and C receive distinct own-school snapshots", async ({ browser }) => {
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

test("salesperson can search, preserve selection, and bulk-claim an unassigned school on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, PHASE3_TEST_PINS.salesA);
  const navigationStyle = await page.locator(".workspace-navigation").evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    radius: getComputedStyle(element).borderRadius,
  }));
  expect(navigationStyle).toEqual({ background: "rgba(248, 250, 255, 0.88)", radius: "0px" });

  const schoolCommands = page.getByRole("toolbar", { name: "담당 학교 작업" });
  await expect(schoolCommands).toBeVisible();
  const commandBoxes = await schoolCommands.getByRole("button").evaluateAll((buttons) => buttons.map((button) => {
    const bounds = button.getBoundingClientRect();
    return { top: Math.round(bounds.top), height: Math.round(bounds.height) };
  }));
  expect(commandBoxes).toHaveLength(3);
  expect(Math.max(...commandBoxes.map(({ top }) => top)) - Math.min(...commandBoxes.map(({ top }) => top))).toBeLessThanOrEqual(2);
  expect(commandBoxes.every(({ height }) => height >= 44 && height <= 68)).toBe(true);

  await page.getByRole("button", { name: "학교 추가" }).click();
  const dialog = page.getByRole("dialog", { name: "담당 학교 가져오기" });
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: /오늘 움직일.*학교의 흐름/ })).toBeVisible();
  await page.getByRole("button", { name: "학교 추가" }).click();
  await dialog.getByRole("searchbox", { name: "학교 검색" }).fill("미배정");
  const schoolCheckbox = dialog.getByRole("checkbox", { name: new RegExp(UI_CLAIM_SCHOOL_NAME) });
  await expect(schoolCheckbox).toBeAttached();
  await schoolCheckbox.locator("xpath=ancestor::label").click();
  await dialog.getByLabel("학교급").selectOption("elementary");
  await expect(schoolCheckbox).toBeChecked();

  const accessibility = await new AxeBuilder({ page }).include("[role=dialog]").analyze();
  expect(accessibility.violations).toEqual([]);
  const undersizedTargets = await dialog.locator("button:visible, input:not([type=checkbox]):visible, select:visible").evaluateAll((targets) =>
    targets.flatMap((target) => {
      const bounds = target.getBoundingClientRect();
      return bounds.width < 44 || bounds.height < 44
        ? [{ label: target.getAttribute("aria-label") ?? target.textContent?.trim(), width: bounds.width, height: bounds.height }]
        : [];
    }),
  );
  expect(undersizedTargets).toEqual([]);

  await dialog.getByRole("button", { name: "1곳 내 담당으로 가져오기" }).click();
  await expect(page.getByText("1개 학교를 내 담당으로 가져왔습니다.")).toBeVisible();
  await expect(page.locator(".assignment-card", { hasText: UI_CLAIM_SCHOOL_NAME })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "내 학교 정리" }).click();
  await page.getByRole("checkbox", { name: `${UI_CLAIM_SCHOOL_NAME} 담당 학교에서 제외 선택` }).check();
  await page.getByRole("button", { name: "내 담당에서 제외" }).click();
  const releaseDialog = page.getByRole("dialog", { name: "1개 학교를 제외할까요?" });
  await releaseDialog.getByRole("button", { name: "담당에서 제외" }).click();
  await expect(page.getByText("1개 학교를 내 담당에서 제외했습니다.")).toBeVisible();
  await expect(page.locator(".assignment-card", { hasText: UI_CLAIM_SCHOOL_NAME })).toHaveCount(0, { timeout: 15_000 });
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

test("admin manages monthly ownership while sales users can claim and release unassigned schools", async () => {
  const [adminToken, salesToken] = await Promise.all([
    emulatorGoogleIdToken("uid-admin"),
    emulatorIdToken("uid-sales-a"),
  ]);
  const base = { appVersion: "phase9-e2e" };
  const blockedTags = await callFunction("updateActivityTags", salesToken, {
    ...base,
    tags: [{ tagId: "ACT-SAMPLE", label: "샘플 반응", active: true }],
    requestId: "e6dd94b6-99c0-4b42-a6a2-d3ff6a428d61",
  });
  expect(blockedTags.error?.status).toBe("PERMISSION_DENIED");

  const updatedTags = await callFunction("updateActivityTags", adminToken, {
    ...base,
    tags: [
      { tagId: "ACT-FOLLOWUP", label: "후속 필요", active: true },
      { tagId: "ACT-SAMPLE", label: "샘플 반응", active: true },
      { tagId: null, label: "견적 요청", active: true },
    ],
    requestId: "2dfe21dc-d4df-43ca-bbeb-811da72a2179",
  });
  expect(updatedTags.result?.tags).toEqual(expect.arrayContaining([
    expect.objectContaining({ tagId: "ACT-FOLLOWUP", label: "후속 필요", displayOrder: 1 }),
    expect.objectContaining({ tagId: "ACT-SAMPLE", label: "샘플 반응", displayOrder: 2 }),
    expect.objectContaining({ label: "견적 요청", displayOrder: 3 }),
  ]));

  const blocked = await callFunction("createSalesCycle", salesToken, {
    ...base,
    cycleId: "2026-10",
    copiedFromCycleId: null,
    activate: false,
    requestId: "86e03fe2-1663-4a24-b953-fbb22e65e9b1",
  });
  expect(blocked.error?.status).toBe("PERMISSION_DENIED");

  const controlApp = getApps().find((candidate) => candidate.name === "phase9-e2e-control");
  if (!controlApp) throw new Error("Phase 9 control app is missing.");
  const database = getFirestore(controlApp);
  await Promise.all([
    database.doc("schools/SCH-CLAIM-E2E-A").set({ schoolId: "SCH-CLAIM-E2E-A", name: "셀프배정학교 A" }),
    database.doc("schools/SCH-CLAIM-E2E-B").set({ schoolId: "SCH-CLAIM-E2E-B", name: "셀프배정학교 B" }),
  ]);
  const claimed = await callFunction("claimSalesAssignments", salesToken, {
    ...base,
    cycleId: "2026-08",
    schoolIds: ["SCH-CLAIM-E2E-A"],
    requestId: "f65f95b7-1714-4cb0-8806-7e63740b05c2",
  });
  expect(claimed.result).toMatchObject({ createdCount: 1, zoneId: null, replayed: false });

  const salesBToken = await emulatorIdToken("uid-sales-b");
  const salesBClaim = await callFunction("claimSalesAssignments", salesBToken, {
    ...base,
    cycleId: "2026-08",
    schoolIds: ["SCH-CLAIM-E2E-B"],
    requestId: "d9580ae2-0571-4a89-8df4-16ca147c5df7",
  });
  expect(salesBClaim.result).toMatchObject({ createdCount: 1, zoneId: null, replayed: false });

  const foreignRelease = await callFunction("releaseSalesAssignments", salesToken, {
    ...base,
    cycleId: "2026-08",
    schoolIds: ["SCH-CLAIM-E2E-B"],
    reason: "타 직원 담당 제외 시도",
    requestId: "7d967ede-00ab-43d7-aa09-ffcc9968d33d",
  });
  expect(foreignRelease.error?.status).toBe("PERMISSION_DENIED");

  const released = await callFunction("releaseSalesAssignments", salesBToken, {
    ...base,
    cycleId: "2026-08",
    schoolIds: ["SCH-CLAIM-E2E-B"],
    reason: "담당 학교 직접 정리",
    requestId: "2b1c6d8b-e307-46ca-bcdc-dc0a38710752",
  });
  expect(released.result).toMatchObject({ removedCount: 1, replayed: false });

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
      zoneId: null,
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
    zoneId: null,
    primaryAssigneeId: "EMP-SALES-B",
    assigneeIds: ["EMP-SALES-B", "EMP-SALES-A"],
    reason: "공동 담당 일정 조정",
    requestId: "5c9b85bd-80d8-470e-af62-ad6a98155ca4",
  });
  expect(changed.result).toMatchObject({ revision: 2, replayed: false });
});
