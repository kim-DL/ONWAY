import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentData } from "firebase-admin/firestore";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

const EXTRA_ROUTE_IDS = Array.from({ length: 14 }, (_, index) => `SCH-REACH-ROUTE-${index + 1}`);
const CATALOG_PREFIX = "버튼검증";
const backup = new Map<string, DocumentData>();
const appName = "phase22-action-reach-control";

test.setTimeout(90_000);

test.beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Action reach fixtures are restricted to Firebase emulators.");
  }
  const app = getApps().find((candidate) => candidate.name === appName)
    ?? initializeApp({ projectId: "demo-onnuriway" }, appName);
  const db = getFirestore(app);
  const [schoolSnapshot, assignmentSnapshot, catalogs, metadata] = await Promise.all([
    db.doc("schools/SCH-NEIS-G100000001").get(),
    db.doc("salesCycles/2026-08/assignments/SCH-NEIS-G100000001").get(),
    db.collection("searchCatalogs").get(),
    db.doc("catalogMeta/current").get(),
  ]);
  const school = schoolSnapshot.data();
  const assignment = assignmentSnapshot.data();
  if (!school || !assignment) throw new Error("Seeded sales A schools are required.");
  const catalog = catalogs.docs.find((item) => item.get("district") === school.district);
  if (!catalog || !metadata.exists) throw new Error("Seeded school catalog is required.");
  backup.set(catalog.ref.path, catalog.data());
  backup.set(metadata.ref.path, metadata.data()!);
  const items = catalog.get("items") as Record<string, unknown>[];
  const extraItems = Array.from({ length: 300 }, (_, index) => ({
    schoolId: `SCH-REACH-CATALOG-${index + 1}`,
    name: `${CATALOG_PREFIX}${String(index + 1).padStart(3, "0")}초등학교`,
    shortName: null,
    normalizedName: `${CATALOG_PREFIX}${String(index + 1).padStart(3, "0")}초등학교`,
    initials: "ㅂㅌㄱㅈ",
    aliases: [],
    schoolType: "elementary",
    district: school.district,
    addressSummary: `대전광역시 서구 버튼검증로 ${index + 1}`,
    operationalStatus: "active", photoCount: 0, fieldInfoAvailable: false,
  }));
  const batch = db.batch();
  for (const [index, schoolId] of EXTRA_ROUTE_IDS.entries()) {
    batch.set(db.doc(`schools/${schoolId}`), {
      ...school, schoolId, name: `동선버튼${index + 1}초등학교`,
      source: { ...school.source, schoolCode: schoolId },
    });
    batch.set(db.doc(`salesCycles/2026-08/assignments/${schoolId}`), { ...assignment, schoolId, monthlyStatus: "before" });
  }
  batch.update(catalog.ref, { items: [...items, ...extraItems], itemCount: items.length + extraItems.length });
  batch.update(metadata.ref, { commonCatalogItemCount: Number(metadata.get("commonCatalogItemCount")) + extraItems.length });
  await batch.commit();
});

test.afterAll(async () => {
  const app = getApps().find((candidate) => candidate.name === appName);
  if (!app) return;
  const db = getFirestore(app);
  const batch = db.batch();
  for (const schoolId of EXTRA_ROUTE_IDS) {
    batch.delete(db.doc(`schools/${schoolId}`));
    batch.delete(db.doc(`salesCycles/2026-08/assignments/${schoolId}`));
  }
  for (const [path, data] of backup) batch.set(db.doc(path), data);
  await batch.commit();
});

async function login(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.salesA);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  await expect(page.getByRole("heading", { name: /오늘 움직일.*학교의 흐름/ })).toBeVisible({ timeout: 15_000 });
}

async function assertReachable(page: Page, button: Locator) {
  await expect(button).toBeInViewport({ ratio: 1 });
  const size = page.viewportSize()!;
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
  expect(await button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === element || element.contains(hit);
  })).toBe(true);
}

async function inspectListScroll(page: Page, dialog: Locator, button: Locator, lastRow: Locator, actionSelector: string) {
  const body = dialog.locator(".bottom-sheet__body");
  expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight + 100)).toBe(true);
  for (const fraction of [0, 0.5, 1]) {
    await body.evaluate((element, value) => { element.scrollTop = (element.scrollHeight - element.clientHeight) * value; }, fraction);
    await assertReachable(page, button);
  }
  await lastRow.scrollIntoViewIfNeeded();
  await assertReachable(page, button);
  const rowBox = await lastRow.boundingBox();
  const actionBox = await dialog.locator(actionSelector).boundingBox();
  expect(rowBox!.y + rowBox!.height).toBeLessThanOrEqual(actionBox!.y + 1);
  expect(await dialog.evaluate((element) => element.scrollHeight <= element.clientHeight + 2)).toBe(true);
}

test("sixteen-school route keeps calculate/apply reachable through long lists and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const trigger = page.getByRole("button", { name: /방문 동선/ });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "방문 동선 만들기" });
  await dialog.getByRole("button", { name: /전체 선택/ }).click();
  await expect(dialog.locator("input[type=checkbox]:checked")).toHaveCount(16);
  const calculate = dialog.getByRole("button", { name: /가까운 순서 계산/ });
  await inspectListScroll(page, dialog, calculate, dialog.locator(".sales-route-candidates > li").last(), ".sales-route-planner__footer");
  await calculate.click();
  await expect(dialog.locator(".sales-route-order > li")).toHaveCount(16, { timeout: 15_000 });
  await expect(dialog.locator(".sales-route-summary")).toBeFocused();
  expect(await dialog.locator(".bottom-sheet__body").evaluate((element) => element.scrollTop)).toBe(0);
  const apply = dialog.getByRole("button", { name: "이 순서로 보기" });
  await inspectListScroll(page, dialog, apply, dialog.locator(".sales-route-order > li").last(), ".sales-route-planner__footer");
  await dialog.getByRole("button", { name: "학교 다시 선택" }).click();
  await expect(dialog.locator(".sales-route-planner__intro")).toBeFocused();
  await assertReachable(page, calculate);
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("300-school picker keeps the commit visible, survives narrow keyboard-sized viewports and traps focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const trigger = page.getByRole("button", { name: "학교 추가", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "담당 학교 가져오기" });
  const search = dialog.getByRole("searchbox", { name: "학교 검색" });
  await search.fill(CATALOG_PREFIX);
  await expect(dialog.locator(".assignment-picker__row")).toHaveCount(300);
  await dialog.getByRole("checkbox", { name: "검색 결과 전체 선택", exact: true }).locator("xpath=ancestor::label").click();
  const commit = dialog.getByRole("button", { name: "300곳 내 담당으로 가져오기" });
  await inspectListScroll(page, dialog, commit, dialog.locator(".assignment-picker__row").last(), ".assignment-picker__commit");
  await search.focus();
  for (const height of [568, 420]) {
    await page.setViewportSize({ width: 320, height });
    await assertReachable(page, commit);
    const overflow = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByRole("button", { name: "닫기" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(commit).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "닫기" })).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).include(".bottom-sheet").analyze();
  expect(accessibility.violations).toEqual([]);
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("bulk submit ignores duplicate activation and keeps the sheet/history while saving", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: "학교 추가", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "담당 학교 가져오기" });
  await dialog.getByRole("searchbox", { name: "학교 검색" }).fill(`${CATALOG_PREFIX}001`);
  await expect(dialog.locator(".assignment-picker__row")).toHaveCount(1);
  await dialog.locator(".assignment-picker__row").click();
  let requestCount = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/claimSalesAssignments", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requestCount += 1;
    await gate;
    return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { status: "FAILED_PRECONDITION", message: "다시 확인해주세요." } }) });
  });
  try {
    const commit = dialog.getByRole("button", { name: "1곳 내 담당으로 가져오기" });
    await commit.evaluate((element) => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
    await expect.poll(() => requestCount).toBe(1);
    await expect(dialog.getByRole("button", { name: "닫기" })).toBeDisabled();
    await page.goBack();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "일괄 처리 중…" })).toBeDisabled();
    release!();
    await expect(commit).toBeEnabled({ timeout: 15_000 });
    // Firebase may append its HTTP status; the actionable server reason must stay visible.
    await expect(dialog.getByRole("alert")).toContainText("다시 확인해주세요.");
    await assertReachable(page, commit);
    await expect(dialog.getByRole("checkbox", { name: new RegExp(`${CATALOG_PREFIX}001`) })).toBeChecked();
    expect(requestCount).toBe(1);
    await page.goBack();
    await expect(dialog).toBeHidden();
  } finally {
    release?.();
  }
});

test("repeated successful sheet saves consume only their own history entries", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: /대전온누리고등학교, 서구, 담당 영업 A/ }).click();
  const heading = page.getByRole("heading", { name: "대전온누리고등학교", exact: true });
  await expect(heading).toBeVisible();

  // This case exercises successful close/history, not profile persistence. Keep shared fixtures intact.
  let savedCount = 0;
  await page.route("**/updateSchoolFieldProfile", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    savedCount += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: { revision: savedCount, replayed: false } }),
    });
  });

  const trigger = page.getByRole("button", { name: "연락처 수정", exact: true });
  const dialog = page.getByRole("dialog", { name: "학교 연락처 수정" });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await trigger.click();
    await dialog.getByLabel("영양사 선생님 전화").fill("042-123-4567");
    await dialog.getByRole("button", { name: "변경사항 저장" }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.history.state?.onnuriwaySheet ?? null)).toBeNull();
    await expect(trigger).toBeFocused();
  }
  expect(savedCount).toBe(3);
  await page.goBack();
  await expect(page.getByRole("heading", { name: /오늘 움직일.*학교의 흐름/ })).toBeVisible();
  await expect(heading).toBeHidden();
});
