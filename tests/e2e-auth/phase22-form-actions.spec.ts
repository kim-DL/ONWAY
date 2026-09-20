import { expect, test, type Locator, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import sharp from "sharp";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";

const SCHOOL_ID = "SCH-NEIS-G100000001";
const SCHOOL_NAME = "대전온누리고등학교";
let database: Firestore;

test.setTimeout(90_000);
test.use({ viewport: { width: 390, height: 640 } });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test.beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Phase 22 form-action tests are restricted to Firebase emulators.");
  }
  const app = getApps().find((candidate) => candidate.name === "phase22-form-actions")
    ?? initializeApp({ projectId: "demo-onnuriway" }, "phase22-form-actions");
  database = getFirestore(app);
});

async function login(page: Page, mode: "delivery" | "sales") {
  await page.clock.setFixedTime(new Date("2026-08-24T05:30:00.000Z"));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const pin = page.getByLabel("직원 PIN");
  await expect(pin).toBeVisible({ timeout: 15_000 });
  await pin.fill(mode === "delivery" ? PHASE3_TEST_PINS.delivery : PHASE3_TEST_PINS.salesA);
  const response = page.waitForResponse((candidate) =>
    candidate.request().method() === "POST" && candidate.url().includes("/employeeLogin"),
  );
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  expect((await response).ok()).toBe(true);
  await expect(page.getByRole("heading", {
    name: mode === "delivery" ? /학교를 찾고.*현장으로/ : /오늘 움직일.*학교의 흐름/,
  })).toBeVisible({ timeout: 30_000 });
}

async function openSchool(page: Page, mode: "delivery" | "sales", schoolName = SCHOOL_NAME) {
  await login(page, mode);
  if (mode === "delivery") {
    await page.getByRole("button", { name: /학교 이름으로 찾기/ }).click();
    await page.getByRole("combobox", { name: "학교명 검색" }).fill("온누리고");
    await page.getByRole("option", { name: /대전온누리고등학교/ }).click();
  } else {
    await page.locator(".assignment-card", { hasText: schoolName }).click();
  }
  await expect(page.getByRole("heading", { name: schoolName, exact: true })).toBeVisible();
  await expect(page.locator(mode === "delivery" ? "[data-delivery-brief]" : ".sales-school-brief"))
    .toBeVisible({ timeout: 15_000 });
}

async function expectReachableAction(sheet: Locator, action: Locator) {
  await expect(action).toBeVisible();
  await expect(action).toBeInViewport({ ratio: 1 });
  expect(await action.evaluate((button) => Boolean(button.closest(".bottom-sheet__footer")))).toBe(true);
  expect(await action.evaluate((button) => Boolean(button.closest(".bottom-sheet__body")))).toBe(false);
  const bounds = await action.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  await expect(sheet.locator(".bottom-sheet__close")).toBeInViewport({ ratio: 1 });
}

async function expectNativeFormAssociation(sheet: Locator, action: Locator, formClass: string) {
  const form = sheet.locator(`form.${formClass}`);
  const formId = await form.getAttribute("id");
  expect(formId).toBeTruthy();
  await expect(action).toHaveAttribute("type", "submit");
  await expect(action).toHaveAttribute("form", formId!);
  expect(await action.evaluate((button, expectedClass) => {
    const submit = button as HTMLButtonElement;
    return submit.form?.classList.contains(expectedClass) === true && !submit.form.contains(submit);
  }, formClass)).toBe(true);
}

async function scrollBodyAndCheckAction(sheet: Locator, action: Locator, requireOverflow = false) {
  const body = sheet.locator(".bottom-sheet__body");
  if (requireOverflow) {
    expect(await body.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(100);
  }
  const initialTop = (await action.boundingBox())!.y;
  for (const position of [1, 0.5, 0]) {
    await body.evaluate((element, fraction) => {
      element.scrollTo({ top: (element.scrollHeight - element.clientHeight) * fraction, behavior: "instant" });
    }, position);
    await expectReachableAction(sheet, action);
    expect(Math.abs((await action.boundingBox())!.y - initialTop)).toBeLessThanOrEqual(1);
  }
}

test("visit save is reachable before scrolling, validates the original form, and preserves draft values", async ({ page }) => {
  await openSchool(page, "sales", "대전새빛고등학교");
  await page.getByRole("button", { name: "방문 기록 시작" }).click();
  const sheet = page.getByRole("dialog", { name: "방문 기록", exact: true });
  const save = sheet.getByRole("button", { name: "방문 기록 저장", exact: true });
  await expect(sheet).toBeVisible();
  await expect.poll(() => sheet.locator(".bottom-sheet__body").evaluate((element) => element.scrollTop)).toBe(0);
  await expectReachableAction(sheet, save);
  await expectNativeFormAssociation(sheet, save, "sales-visit-form");

  const saveRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/recordSalesVisit")) saveRequests.push(request.url());
  });
  await save.click();
  const errors = sheet.locator(".visit-form-errors");
  await expect(errors).toContainText("홍보지 전달 여부를 선택해주세요.");
  await expect(errors).toContainText("제품 관심도를 선택해주세요.");
  await expect(errors).toBeFocused();
  expect(saveRequests).toHaveLength(0);

  await sheet.getByLabel(/실제 방문자/).selectOption("EMP-SALES-B");
  await sheet.getByRole("radiogroup", { name: "홍보지 전달 여부" }).getByRole("radio", { name: "전달", exact: true }).click();
  await sheet.getByRole("radiogroup", { name: "샘플 전달 여부" }).getByRole("radio", { name: "미전달", exact: true }).click();
  await sheet.getByRole("radio", { name: /3단계, 관심 있음/ }).click();
  await sheet.getByLabel(/방문 결과/).fill("스크롤해도 작성 중인 방문 내용이 유지됩니다.");
  await sheet.getByRole("switch", { name: /후속 필요/ }).click();
  await sheet.getByLabel(/후속 날짜/).fill("2026-08-30");
  await sheet.getByLabel(/후속 내용/).fill("제품 자료 전달 후 연락");
  await scrollBodyAndCheckAction(sheet, save, true);

  await expect(sheet.getByLabel(/방문일/)).toHaveValue("2026-08-24");
  await expect(sheet.getByLabel(/실제 방문자/)).toHaveValue("EMP-SALES-B");
  await expect(sheet.getByLabel(/방문 결과/)).toHaveValue("스크롤해도 작성 중인 방문 내용이 유지됩니다.");
  await expect(sheet.getByLabel(/후속 날짜/)).toHaveValue("2026-08-30");
  await expect(sheet.getByLabel(/후속 내용/)).toHaveValue("제품 자료 전달 후 연락");
  await expect(sheet.getByRole("radio", { name: /3단계, 관심 있음/ })).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: "output/playwright/phase22-form-actions/visit-form-actions-390.png" });
  await page.route("**/recordSalesVisit", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({
      status: 503, contentType: "application/json",
      body: JSON.stringify({ error: { status: "UNAVAILABLE", message: "일시적인 연결 문제" } }),
    });
  });
  await sheet.locator(".bottom-sheet__body").evaluate((body) => { body.scrollTop = 0; });
  await save.click();
  const saveError = sheet.locator(".bottom-sheet__footer").getByRole("alert");
  await expect(saveError).toContainText("저장하지 못했어요.");
  await expect(saveError).toBeInViewport();
  await expectReachableAction(sheet, save);
  await expect(sheet.getByLabel(/방문 결과/)).toHaveValue("스크롤해도 작성 중인 방문 내용이 유지됩니다.");
  expect(saveRequests).toHaveLength(1);
  await sheet.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(sheet).not.toBeVisible();
});

test("full field editor keeps save outside its long scroll and submits to the real emulator", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openSchool(page, "delivery");
  const fieldRef = database.doc(`schoolFieldProfiles/${SCHOOL_ID}`);
  const originalProfile = await fieldRef.get();
  const originalNotes = originalProfile.get("fieldNotes") as string | null;
  const originalVehicle = originalProfile.get("vehicle");
  const originalStairs = originalProfile.get("equipment.stairsRequired");
  const brief = page.locator("[data-delivery-brief]");
  await brief.getByRole("button", { name: "정보 수정", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "현장정보 한 번에 입력", exact: true });
  const save = sheet.getByRole("button", { name: "변경사항 저장", exact: true });
  await expectReachableAction(sheet, save);
  await expectNativeFormAssociation(sheet, save, "field-editor");
  await expect(sheet.getByLabel("하역 위치")).toHaveCount(0);
  await expect(sheet.getByLabel(/계단/)).toHaveCount(0);
  const fieldNotes = sheet.getByRole("textbox", { name: "현장 특이사항", exact: true });
  const savedNotes = "Phase 22 고정 저장 버튼으로 현장정보 저장 확인";
  await fieldNotes.fill(savedNotes, { timeout: 15_000 });
  await scrollBodyAndCheckAction(sheet, save, true);
  await expect(fieldNotes).toHaveValue(savedNotes);

  const response = page.waitForResponse((candidate) =>
    candidate.request().method() === "POST" && candidate.url().includes("/updateSchoolFieldProfile"),
  );
  await save.click();
  const saveResponse = await response;
  expect(saveResponse.ok()).toBe(true);
  const submitted = saveResponse.request().postDataJSON() as {
    data: { patch: { equipment: { stairsRequired: unknown }; fieldNotes: string } };
  };
  expect(submitted.data.patch).not.toHaveProperty("vehicle");
  expect(submitted.data.patch.equipment.stairsRequired).toBe(originalStairs);
  expect(submitted.data.patch.fieldNotes).toBe(savedNotes);
  await expect(sheet).not.toBeVisible();
  await expect.poll(async () => (await fieldRef.get()).get("fieldNotes")).toBe(savedNotes);
  const savedProfile = await fieldRef.get();
  expect(savedProfile.get("vehicle")).toEqual(originalVehicle);
  expect(savedProfile.get("equipment.stairsRequired")).toBe(originalStairs);
  await expect(brief).toContainText(savedNotes);

  // Restore the shared seed's content through the same UI; never rewind its revision.
  await brief.getByRole("button", { name: "정보 수정", exact: true }).click();
  await sheet.getByRole("textbox", { name: "현장 특이사항", exact: true }).fill(originalNotes ?? "", { timeout: 15_000 });
  await save.click();
  await expect(sheet).not.toBeVisible();
  await expect.poll(async () => (await fieldRef.get()).get("fieldNotes")).toBe(originalNotes);
});

test("contact editor preserves telephone fields and exposes save failures inside its fixed footer", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openSchool(page, "sales");
  await page.getByRole("button", { name: "연락처 수정", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "학교 연락처 수정", exact: true });
  const save = sheet.getByRole("button", { name: "변경사항 저장", exact: true });
  await expectReachableAction(sheet, save);
  await expectNativeFormAssociation(sheet, save, "field-editor");
  await sheet.getByLabel("영양사 선생님 전화", { exact: true }).fill("010-2345-6789");
  await sheet.getByLabel("급식실 전화", { exact: true }).fill("042-123-4567");
  await scrollBodyAndCheckAction(sheet, save);
  await expect(sheet.getByLabel("영양사 선생님 전화", { exact: true })).toHaveValue("010-2345-6789");
  await expect(sheet.getByLabel("급식실 전화", { exact: true })).toHaveValue("042-123-4567");
  expect(await sheet.locator("form").evaluate((element) => {
    const form = element as HTMLFormElement;
    return !form.noValidate && form.checkValidity();
  })).toBe(true);
  await page.route("**/updateSchoolFieldProfile", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ error: { status: "UNAVAILABLE", message: "일시적인 연결 문제" } }),
    });
  });
  await save.click();
  const saveError = sheet.locator(".bottom-sheet__footer").getByRole("alert");
  await expect(saveError).toContainText("현장정보를 저장하지 못했습니다.");
  await expect(saveError).toBeInViewport({ ratio: 1 });
  await expect(save).toBeEnabled();
  await expect(sheet.getByLabel("영양사 선생님 전화", { exact: true })).toHaveValue("010-2345-6789");
  await expect(sheet.getByLabel("급식실 전화", { exact: true })).toHaveValue("042-123-4567");
  await page.screenshot({ path: "output/playwright/phase22-form-actions/contacts-save-error-320.png" });
  await page.unroute("**/updateSchoolFieldProfile");
  await sheet.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(sheet).not.toBeVisible();
});

test("photo footer stays reachable before selection and retains the selected file and caption", async ({ page }) => {
  await openSchool(page, "delivery");
  await page.locator(".photo-card").first().getByRole("button", { name: "학교 · 접근 사진 교체", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "학교 · 접근 사진 교체", exact: true });
  const save = sheet.getByRole("button", { name: "새 사진으로 교체", exact: true });
  await expectReachableAction(sheet, save);
  await expect(save).toBeDisabled();
  await expectNativeFormAssociation(sheet, save, "photo-uploader");

  await sheet.getByLabel("앨범에서 사진 선택").setInputFiles({
    name: "invalid-photo.png", mimeType: "image/png", buffer: Buffer.from("not-a-decodable-image"),
  });
  const uploadError = sheet.locator(".bottom-sheet__footer").getByRole("alert");
  await expect(uploadError).toBeVisible({ timeout: 15_000 });
  await expect(uploadError).toBeInViewport({ ratio: 1 });
  await expect(save).toBeDisabled();

  const fixtureImage = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#e8eef5" } }).png().toBuffer();
  await sheet.getByLabel("앨범에서 사진 선택").setInputFiles({ name: "phase22-caption.png", mimeType: "image/png", buffer: fixtureImage });
  await expect(save).toBeEnabled({ timeout: 15_000 });
  await expect(uploadError).toHaveCount(0);
  await sheet.getByLabel("사진 설명", { exact: true }).fill("스크롤 후에도 유지되는 정문 사진 설명");
  await scrollBodyAndCheckAction(sheet, save);
  await expect(sheet.getByLabel("사진 설명", { exact: true })).toHaveValue("스크롤 후에도 유지되는 정문 사진 설명");
  await expect(sheet.locator(".photo-dropzone")).toHaveAttribute("data-has-file", "true");
  await expect(sheet.getByRole("img", { name: "업로드할 사진 미리보기" })).toHaveAttribute("src", /^blob:/);
  await expect(save).toBeEnabled();
  await page.route("**/preparePhotoUpload", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ error: { status: "UNAVAILABLE", message: "사진 업로드 연결을 다시 확인해주세요." } }),
    });
  });
  await save.click();
  await expect(uploadError).toBeVisible();
  await expect(uploadError).toBeInViewport({ ratio: 1 });
  await expect(save).toBeEnabled();
  await expect(sheet.getByLabel("사진 설명", { exact: true })).toHaveValue("스크롤 후에도 유지되는 정문 사진 설명");
  await expect(sheet.locator(".photo-dropzone")).toHaveAttribute("data-has-file", "true");
  await page.screenshot({ path: "output/playwright/phase22-form-actions/photo-upload-error-390.png" });
  await page.unroute("**/preparePhotoUpload");
  await sheet.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(sheet).not.toBeVisible();
});

test("communication footer preserves tag selection through scrolling and cancel remains independent of form submit", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await openSchool(page, "sales");
  await page.getByRole("button", { name: "업무 참고 편집", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "커뮤니케이션 참고", exact: true });
  const save = sheet.getByRole("button", { name: "업무 참고 저장", exact: true });
  await expectReachableAction(sheet, save);
  await expect(save).toHaveAttribute("type", "button");
  const tag = sheet.getByRole("button", { name: "문자 연락 선호", exact: true });
  const originalSelection = await tag.getAttribute("aria-pressed");
  await tag.click();
  await scrollBodyAndCheckAction(sheet, save);
  await expect(tag).toHaveAttribute("aria-pressed", originalSelection === "true" ? "false" : "true");
  await sheet.getByRole("button", { name: "취소", exact: true }).click();
  await expect(sheet).not.toBeVisible();
  await page.getByRole("button", { name: "업무 참고 편집", exact: true }).click();
  await expect(tag).toHaveAttribute("aria-pressed", originalSelection!);
  await sheet.getByRole("button", { name: "취소", exact: true }).click();
  await expect(sheet).not.toBeVisible();
});
