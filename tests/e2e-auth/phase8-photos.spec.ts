import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import sharp from "sharp";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

const PROJECT_ID = "demo-onnuriway";
const SCHOOL_ID = "SCH-NEIS-G100000001";
const VISUALS = "output/playwright/phase8-visuals";

test.beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Phase 8 E2E setup is restricted to Firebase emulators.");
  }
  const app = getApps().find((candidate) => candidate.name === "phase8-e2e-control")
    ?? initializeApp({ projectId: PROJECT_ID }, "phase8-e2e-control");
  const database = getFirestore(app);
  const auth = getAuth(app);
  const snapshots = await database.collection("loginRateLimits").get();
  const batch = database.batch();
  for (const snapshot of snapshots.docs) batch.delete(snapshot.ref);
  await batch.commit();

  await auth.createUser({ uid: "uid-phase8-viewer", displayName: "사진 조회자" }).catch(() => undefined);
  await auth.setCustomUserClaims("uid-phase8-viewer", {
    employeeId: "EMP-PHASE8-VIEWER",
    roleScopes: ["viewer"],
    sessionVersion: 1,
    permissionsVersion: 1,
  });
  await Promise.all([
    database.doc("employees/EMP-PHASE8-VIEWER").set({
      employeeId: "EMP-PHASE8-VIEWER",
      firebaseUid: "uid-phase8-viewer",
      roleScopes: ["viewer"],
      status: "active",
      sessionVersion: 1,
    }),
    database.doc("authz/uid-phase8-viewer").set({
      employeeId: "EMP-PHASE8-VIEWER",
      active: true,
      sessionVersion: 1,
      permissionsVersion: 1,
      updatedAt: Timestamp.now(),
    }),
  ]);
});

async function openCompleteSchool(page: Page) {
  await page.goto("/");
  await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.delivery);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  await expect(page.getByRole("heading", { name: /학교를 찾고.*현장으로/ })).toBeVisible();
  await page.getByRole("button", { name: /학교 이름으로 찾기/ }).click();
  await page.getByRole("combobox", { name: "학교명 검색" }).fill("온누리고");
  await page.getByRole("option", { name: /대전온누리고등학교/ }).click();
  await expect(page.getByRole("heading", { name: "도착 전에 보는 현장" })).toBeVisible();
}

test("gallery loads preview/thumbnail only and produces the desktop checkpoint", async ({ page }) => {
  const photoRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("getSchoolPhoto")) photoRequests.push(request.postData() ?? "");
  });
  await openCompleteSchool(page);
  await expect(page.locator(".photo-card img")).toHaveCount(3);
  await expect(page.getByText("사진 준비 완료")).toBeVisible();
  expect(photoRequests.some((body) => body.includes('"variant":"original"'))).toBe(false);

  const scan = await new AxeBuilder({ page }).include(".school-photo-gallery").analyze();
  expect(scan.violations).toEqual([]);
  const undersized = await page.locator(".school-photo-gallery button:visible").evaluateAll((targets) =>
    targets.flatMap((target) => {
      const bounds = target.getBoundingClientRect();
      return bounds.width < 44 || bounds.height < 44 ? [{ width: bounds.width, height: bounds.height, label: target.getAttribute("aria-label") ?? target.textContent }] : [];
    }),
  );
  expect(undersized).toEqual([]);
  await page.addStyleTag({ content: ".detail-sticky-header,.floating-context-bar{display:none!important}" });
  await page.locator(".school-photo-gallery").screenshot({ path: `${VISUALS}/01-photo-gallery-desktop.png` });
});

test("viewer supports navigation and requests Original only after explicit zoom", async ({ page }) => {
  await openCompleteSchool(page);
  await expect(page.locator(".photo-card img")).toHaveCount(3);
  await page.locator(".photo-card__image").first().click();
  const viewer = page.getByRole("dialog", { name: "현장 사진 크게 보기" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText("1 / 3", { exact: true })).toBeVisible();

  const originalRequest = page.waitForRequest((request) => request.url().includes("getSchoolPhoto") && (request.postData() ?? "").includes('"variant":"original"'));
  await viewer.getByRole("button", { name: "원본 확대" }).click();
  await originalRequest;
  await expect(viewer.getByRole("button", { name: "크기 복귀" })).toBeVisible();
  await viewer.getByRole("button", { name: "크기 복귀" }).click();
  await viewer.getByRole("button", { name: "다음 사진" }).click();
  await expect(viewer.getByText("2 / 3", { exact: true })).toBeVisible();
  const viewerScan = await new AxeBuilder({ page }).include(".photo-viewer").analyze();
  expect(viewerScan.violations).toEqual([]);
  await viewer.screenshot({ path: `${VISUALS}/02-photo-viewer.png` });
  await viewer.getByRole("button", { name: "사진 닫기" }).click();
  await expect(page.getByRole("heading", { name: "대전온누리고등학교" })).toBeVisible();
});

test("mobile uploader replaces a version, then soft delete can be undone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCompleteSchool(page);
  await expect(page.locator(".photo-card img")).toHaveCount(3);
  const firstCard = page.locator(".photo-card").first();
  await firstCard.getByRole("button", { name: "교체" }).click();
  const uploader = page.getByRole("dialog", { name: /학교 · 접근 사진 교체/ });
  await expect(uploader).toBeVisible();
  const uploaderScan = await new AxeBuilder({ page }).include(".bottom-sheet").analyze();
  expect(uploaderScan.violations).toEqual([]);
  await uploader.screenshot({ path: `${VISUALS}/03-photo-upload-mobile.png` });

  const replacement = await sharp({ create: { width: 1_200, height: 900, channels: 3, background: "#c76d4e" } }).png().toBuffer();
  await uploader.locator('input[type="file"]').setInputFiles({ name: "new-approach.png", mimeType: "image/png", buffer: replacement });
  await uploader.getByLabel("사진 설명").fill("새로 확인한 정문 접근로");
  await uploader.getByRole("button", { name: "새 사진으로 교체" }).click();
  await expect(page.getByText("새 버전의 사진으로 교체했습니다.")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".photo-card").first()).toContainText("사진 개정 2", { timeout: 15_000 });

  const app = getApps().find((candidate) => candidate.name === "phase8-e2e-control");
  if (!app) throw new Error("Phase 8 control app is missing.");
  const database = getFirestore(app);
  await expect.poll(async () => (await database.doc(`schools/${SCHOOL_ID}/photos/01`).get()).get("currentVersionId")).not.toBe("v001");

  await page.locator(".photo-card").first().getByRole("button", { name: "삭제" }).click();
  await expect(page.getByText("사진을 삭제했습니다.")).toBeVisible();
  await page.getByRole("button", { name: "실행 취소" }).click();
  await expect(page.getByText("사진을 다시 복구했습니다.")).toBeVisible();
  await expect.poll(async () => {
    const snapshot = await database.doc(`schools/${SCHOOL_ID}/photos/01`).get();
    return `${snapshot.get("status")}:${snapshot.get("photoRevision")}`;
  }).toBe("active:4");
});

test("viewer role can download but prepare upload is denied", async () => {
  const app = getApps().find((candidate) => candidate.name === "phase8-e2e-control");
  if (!app) throw new Error("Phase 8 control app is missing.");
  const customToken = await getAuth(app).createCustomToken("uid-phase8-viewer");
  const signIn = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const signInBody = await signIn.json() as { idToken: string };
  const photoSnapshot = await getFirestore(app).doc(`schools/${SCHOOL_ID}/photos/01`).get();
  const download = await fetch(`http://127.0.0.1:5001/${PROJECT_ID}/asia-northeast3/getSchoolPhoto`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${signInBody.idToken}` },
    body: JSON.stringify({ data: {
      schoolId: SCHOOL_ID,
      slotId: "01",
      versionId: photoSnapshot.get("currentVersionId"),
      variant: "thumbnail",
    } }),
  });
  const downloadBody = await download.json() as { result?: { contentType?: string } };
  expect(downloadBody.result?.contentType).toBe("image/webp");
  const response = await fetch(`http://127.0.0.1:5001/${PROJECT_ID}/asia-northeast3/preparePhotoUpload`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${signInBody.idToken}` },
    body: JSON.stringify({ data: {
      schoolId: SCHOOL_ID,
      slotId: "01",
      expectedRevision: 4,
      requestId: "d39426e9-1ae5-4f8d-89f1-030b79bb71b3",
      appVersion: "phase8-e2e",
      fileName: "blocked.jpg",
      contentType: "image/jpeg",
      byteSize: 100,
      caption: null,
    } }),
  });
  const body = await response.json() as { error?: { status?: string } };
  expect(body.error?.status).toBe("PERMISSION_DENIED");
});
