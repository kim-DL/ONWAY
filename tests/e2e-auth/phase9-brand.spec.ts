import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
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

async function expectHeadlineMascotPlacement(page: Page) {
  const geometry = await page.locator("[data-welcome-greeting]").evaluate(element => {
    const copy = element.querySelector("[data-greeting-copy]")!.getBoundingClientRect();
    const headline = element.querySelector("[data-welcome-headline]")!.getBoundingClientRect();
    const title = element.querySelector("[data-welcome-title]")!.getBoundingClientRect();
    const lead = element.querySelector("[data-welcome-title-lead]")!.getBoundingClientRect();
    const accent = element.querySelector("[data-welcome-title-accent]")!.getBoundingClientRect();
    const mascot = element.querySelector("[data-welcome-mascot]")!.getBoundingClientRect();
    return {
      headlineBelowGreeting: headline.top >= copy.bottom - 1,
      adjacentGap: mascot.left - lead.right,
      mascotWithinHeadline: mascot.left >= headline.left && mascot.right <= headline.right + 1,
      mascotWithinFirstLine: mascot.top < lead.bottom && mascot.bottom > lead.top,
      accentBelowLead: accent.top >= lead.bottom - 1,
      accentUsesFullWidth: Math.abs(accent.width - title.width) <= 1,
      viewportOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  expect(geometry.headlineBelowGreeting).toBe(true);
  expect(geometry.mascotWithinHeadline).toBe(true);
  expect(geometry.adjacentGap).toBeGreaterThanOrEqual(3);
  expect(geometry.adjacentGap).toBeLessThanOrEqual(18);
  expect(geometry.mascotWithinFirstLine).toBe(true);
  expect(geometry.accentBelowLead).toBe(true);
  expect(geometry.accentUsesFullWidth).toBe(true);
  expect(geometry.viewportOverflow).toBeLessThanOrEqual(1);
}

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
  const mascot = page.locator("[data-welcome-mascot]");
  const cloud = mascot.locator("[data-quantum-cloud]");
  const greetingVisual = page.locator("[data-greeting-visual]");
  await expect(page.locator("#delivery-home-title")).toBeVisible();
  await expect(cloud).toHaveAttribute("data-motion", "paused");
  await expect(greetingVisual).toHaveAttribute("data-typing", "complete");
  await expect(page.locator("[data-greeting-accessible]")).toContainText("브랜드 테스트님,");
  await expect(mascot.locator("img, video, canvas")).toHaveCount(0);
  await expect(cloud.locator("[data-quantum-particle]")).toHaveCount(4);
  await expectHeadlineMascotPlacement(page);
  const modeControl = header.getByRole("group", { name: "업무 모드" });
  await expect(header.locator(".employee-avatar")).toHaveCount(0);
  await expect(modeControl.getByRole("button")).toHaveCount(2);
  await modeControl.getByRole("button", { name: "영업", exact: true }).click();
  await expect(page.locator("#sales-cycle-title")).toBeVisible({ timeout: 30_000 });
  const signature = header.locator(".app-brand--signature");
  await expect(signature.getByText("온누리종합식품", { exact: true })).toBeVisible();
  await expect(signature.locator("image")).toHaveAttribute("href", "/brand/onnuri-food-logo.png");
  await expect(signature.locator(".app-brand__mark")).toHaveCSS("animation-name", "none");
  const salesButton = modeControl.getByRole("button", { name: "영업", exact: true });
  await expect(salesButton).toHaveCSS("color", "rgb(36, 118, 71)");

  for (const width of [320, 360, 390, 430, 768, 1280]) {
    await page.setViewportSize({ width, height: width > 760 ? 900 : 844 });
    await expectHeadlineMascotPlacement(page);
    const geometry = await header.evaluate((element) => {
      const brand = element.querySelector(".app-brand--signature")!.getBoundingClientRect();
      const controls = element.querySelector(".workspace-header__controls")!.getBoundingClientRect();
      const mark = element.querySelector(".app-brand__mark")!.getBoundingClientRect();
      const symbol = element.querySelector(".app-brand__mark > svg")!.getBoundingClientRect();
      return { brandRight: brand.right, controlsLeft: controls.left, controlsRight: controls.right, viewport: innerWidth, markWidth: mark.width, symbolWidth: symbol.width };
    });
    expect(geometry.markWidth).toBeGreaterThanOrEqual(76);
    expect(geometry.symbolWidth / geometry.markWidth).toBeCloseTo(.85, 1);
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
  await expect(cloud).toHaveAttribute("data-motion", "running");
  // Turning motion back on does not erase a sentence that was already readable.
  await expect(greetingVisual).toHaveAttribute("data-typing", "complete");
  await expect.poll(() => cloud.locator("[data-quantum-particle]").evaluateAll(elements => elements.map(element => getComputedStyle(element).animationPlayState)))
    .toEqual(["running", "running", "running", "running"]);
  const navigation = page.getByRole("navigation", { name: "주요 메뉴" });
  await navigation.getByRole("button", { name: "활동", exact: true }).click();
  await expect(page.locator("#sales-activity-title")).toBeVisible();
  await expect(greetingVisual).toHaveAttribute("data-typing", /pending|typing/);
  await expect(greetingVisual).toHaveAttribute("data-typing", "complete");
  await expect(cloud).toHaveAttribute("data-motion", "running");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectHeadlineMascotPlacement(page);
  await page.screenshot({ path: "output/playwright/welcome-mascot/activity-live-app.png", fullPage: false });

  // Real page return remounts just as it does for staff, without a global replay counter.
  await navigation.getByRole("button", { name: "학교", exact: true }).click();
  await expect(page.locator("#sales-cycle-title")).toBeVisible();
  await expect(greetingVisual).toHaveAttribute("data-typing", /pending|typing/);
  await expect(greetingVisual).toHaveAttribute("data-typing", "complete");

  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "설정", exact: true }).click();
  const motionToggle = page.getByRole("switch", { name: "화면 애니메이션" });
  await expect(motionToggle).toHaveAttribute("aria-checked", "true");
  await motionToggle.click();
  await expect(motionToggle).toHaveAttribute("aria-checked", "false");
  await expect(header.locator('[data-motion="paused"]')).toHaveCount(1);
  await page.reload();
  await expect(header.locator('[data-motion="paused"]')).toHaveCount(1);
  await navigation.getByRole("button", { name: "학교", exact: true }).click();
  await expect(cloud).toHaveAttribute("data-motion", "paused");
  await expect(greetingVisual).toHaveAttribute("data-typing", "complete");
  await expect.poll(() => cloud.locator("[data-quantum-particle]").evaluateAll(elements => elements.map(element => getComputedStyle(element).animationPlayState)))
    .toEqual(["paused", "paused", "paused", "paused"]);
});
