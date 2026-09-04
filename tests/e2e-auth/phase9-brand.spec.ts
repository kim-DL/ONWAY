import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { createPinLookupKey, hashPin } from "../../functions/src/auth/pin-crypto";

const BRAND_UID = "uid-brand-dual-e2e";
const BRAND_EMPLOYEE = "EMP-BRAND-DUAL-E2E";
const BRAND_PIN = "563284";
let cleanupBrandFixture: (() => Promise<void>) | undefined;

test.beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Brand fixture is restricted to Firebase emulators.");
  }
  const app = getApps().find((candidate) => candidate.name === "brand-e2e-control")
    ?? initializeApp({ projectId: "demo-onnuriway" }, "brand-e2e-control");
  const database = getFirestore(app);
  const auth = getAuth(app);
  const employee = (await database.doc("employees/EMP-SALES-A").get()).data()!;
  const authz = (await database.doc("authz/uid-sales-a").get()).data()!;
  const credential = (await database.doc("authCredentials/EMP-SALES-A").get()).data()!;
  const lookupKey = createPinLookupKey(BRAND_PIN, process.env.PIN_LOOKUP_SECRET
    ?? "demo-only-phase3-pin-lookup-secret-change-before-production-2026");
  const pinHash = await hashPin(BRAND_PIN, process.env.PIN_PEPPER
    ?? "demo-only-phase3-pin-pepper-change-before-production-2026-secret");
  const roleScopes = ["delivery", "sales"];
  const fixturePaths = [
    `employees/${BRAND_EMPLOYEE}`, `authz/${BRAND_UID}`,
    `authCredentials/${BRAND_EMPLOYEE}`, `pinIndexes/${lookupKey}`,
  ];
  await auth.createUser({ uid: BRAND_UID, displayName: "브랜드 테스트" });
  cleanupBrandFixture = async () => {
    const batch = database.batch();
    for (const path of fixturePaths) batch.delete(database.doc(path));
    await batch.commit();
    await auth.deleteUser(BRAND_UID);
  };
  await auth.setCustomUserClaims(BRAND_UID, {
    employeeId: BRAND_EMPLOYEE, roleScopes, sessionVersion: employee.sessionVersion,
    permissionsVersion: authz.permissionsVersion,
  });
  const batch = database.batch();
  batch.set(database.doc(fixturePaths[0]!), { ...employee, employeeId: BRAND_EMPLOYEE, firebaseUid: BRAND_UID, displayName: "브랜드 테스트", roleScopes });
  batch.set(database.doc(fixturePaths[1]!), { ...authz, employeeId: BRAND_EMPLOYEE });
  batch.set(database.doc(fixturePaths[2]!), { ...credential, employeeId: BRAND_EMPLOYEE, lookupKey, pinHash, failedAttemptCount: 0, lockedUntil: null });
  batch.set(database.doc(fixturePaths[3]!), { employeeId: BRAND_EMPLOYEE, createdAt: new Date() });
  await batch.commit();
});

test.afterAll(async () => { await cleanupBrandFixture?.(); });

test("company signature stays visible without crowding mobile mode controls and honors reduced motion", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const connectionEvents: Record<string, unknown>[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) connectionEvents.push({ event: "navigation", path: new URL(frame.url()).pathname });
  });
  page.on("requestfailed", (request) => connectionEvents.push({
    event: "request-failed", method: request.method(), path: new URL(request.url()).pathname,
    failure: request.failure()?.errorText,
  }));
  page.on("response", (response) => {
    if (response.url().includes("employeeLogin")) connectionEvents.push({
      event: "login-response", method: response.request().method(), status: response.status(),
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const pinInput = page.getByLabel("직원 PIN");
  await pinInput.waitFor({ state: "visible", timeout: 15_000 });
  await pinInput.fill(BRAND_PIN);
  const loginResponse = page.waitForResponse((response) => response.url().includes("employeeLogin")
    && response.request().method() === "POST", { timeout: 30_000 });
  try {
    await page.getByRole("button", { name: "급식길 시작하기" }).click();
    expect((await loginResponse).ok()).toBe(true);
  } finally {
    await testInfo.attach("brand-login-connection-events", {
      body: JSON.stringify(connectionEvents, null, 2), contentType: "application/json",
    });
  }
  // The first emulator login also cold-compiles the lazily loaded workspace in
  // next dev. Wait for that boundary before testing the header's visible state.
  await expect(page.locator(".workspace-shell")).toBeVisible({ timeout: 30_000 });
  const header = page.locator(".workspace-header");
  const modeControl = header.getByRole("group", { name: "업무 모드" });
  await expect(modeControl.getByRole("button")).toHaveCount(2);
  await modeControl.getByRole("button", { name: "영업", exact: true }).click();
  await expect(page.locator("#sales-cycle-title")).toBeVisible({ timeout: 30_000 });
  const signature = header.locator(".app-brand--signature");
  await expect(signature.getByText("온누리종합식품", { exact: true })).toBeVisible();
  await expect(signature.locator("image")).toHaveAttribute("href", "/brand/onnuri-food-logo.png");
  await expect(signature.locator(".app-brand__mark")).toHaveCSS("animation-name", "none");

  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: width > 760 ? 900 : 844 });
    const geometry = await header.evaluate((element) => {
      const brand = element.querySelector(".app-brand--signature")!.getBoundingClientRect();
      const controls = element.querySelector(".workspace-header__controls")!.getBoundingClientRect();
      const mark = element.querySelector(".app-brand__mark")!.getBoundingClientRect();
      return { brandRight: brand.right, controlsLeft: controls.left, controlsRight: controls.right, viewport: innerWidth, markWidth: mark.width };
    });
    expect(geometry.markWidth).toBeGreaterThanOrEqual(76);
    expect(geometry.brandRight + 4).toBeLessThanOrEqual(geometry.controlsLeft);
    expect(geometry.controlsRight).toBeLessThanOrEqual(geometry.viewport);
    await expect(signature.getByText("온누리종합식품", { exact: true })).toBeVisible();
    const undersizedTargets = await header.locator("button").evaluateAll((buttons) => buttons.filter((button) => {
      const box = button.getBoundingClientRect();
      return box.width < 44 || box.height < 44;
    }).map((button) => button.textContent));
    expect(undersizedTargets).toEqual([]);
    await page.screenshot({ path: `output/playwright/brand-v4/header-${width}.png`, fullPage: false });
  }

  expect((await new AxeBuilder({ page }).include(".workspace-header").analyze()).violations).toEqual([]);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(signature.locator(".app-brand__mark")).toHaveCSS("animation-name", "company-wave-arrive");
  await expect(signature.locator(".app-brand__mark")).toHaveCSS("animation-iteration-count", "1");
});
