import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type Request, type Response } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import sharp from "sharp";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";
import { customerSchema, getCustomerChoseong, normalizeCustomerName, type Customer } from "../../src/domain/customer";
import { installCustomerMapMock } from "../e2e/fixtures/customer-map-mock";

const appName = "phase32-customer-ui";
const path = "companies/onnuri/customers";
const ids = ["UI-GANGEUN", "UI-GAON", "UI-CLOSED", "UI-MISSING", "UI-HANBIT", "UI-PUREUN"];
const fixture = (id: string, name: string, changes: Partial<Customer> = {}) => customerSchema.parse({
  customerId: id, companyId: "onnuri", name,
  normalizedName: normalizeCustomerName(name), choseongName: getCustomerChoseong(name),
  district: "서구", administrativeDong: "탄방동", officialAddress: "테스트 공식 주소",
  deliveryAddress: "테스트 후면 창고 주소", deliveryPoint: { latitude: 36.35, longitude: 127.38 },
  accessPasswordState: "registered", accessPassword: "0012*", deliveryLocationDescription: "건물 뒤편 좌측 창고",
  contacts: [
    { id: "primary", name: "가상담당", role: "현장 담당자", phoneNumber: "010-0000-1234", isPrimary: true },
    { id: "office", name: "", role: "사무실", phoneNumber: "042-000-1234", isPrimary: false },
  ],
  status: "active", noticeType: "changed", changeNote: "정문에서 후면 창고로 변경",
  revision: 1, createdAt: "2026-09-06T00:00:00.000Z", updatedAt: "2026-09-06T00:00:00.000Z",
  createdBy: "EMP-ADMIN", updatedBy: "EMP-ADMIN", ...changes,
});

function db() {
  return getFirestore(getApps().find((app) => app.name === appName) ?? initializeApp({ projectId: "demo-onnuriway" }, appName));
}
test.setTimeout(90_000);
test.beforeAll(async () => {
  if (!/^(127\.0\.0\.1|localhost):/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "")
    || !/^(127\.0\.0\.1|localhost):/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "")) {
    throw new Error("Customer fixtures require local Firebase emulators.");
  }
  const batch = db().batch();
  // Suites reuse one demo emulator. Start this independent login scenario with
  // fresh test-only counters; never weaken the production login rate policy.
  const previousRateLimits = await db().collection("loginRateLimits").get();
  for (const entry of previousRateLimits.docs) batch.delete(entry.ref);
  for (const customer of [
    fixture(ids[0]!, "강은유통"),
    fixture(ids[1]!, "가온유통", { noticeType: "new", deliveryPoint: { latitude: 36.36, longitude: 127.39 } }),
    fixture(ids[2]!, "폐업유통", { status: "closed", noticeType: "none" }),
    fixture(ids[3]!, "위치없는유통", { deliveryPoint: null, contacts: [], accessPassword: "", accessPasswordState: "none", noticeType: "none" }),
    fixture(ids[4]!, "한빛상회", { district: "", administrativeDong: "", deliveryAddress: "", officialAddress: "한빛상회 공식 주소", noticeType: "none" }),
    fixture(ids[5]!, "푸른식품", { district: "", administrativeDong: "", deliveryAddress: "", officialAddress: "", noticeType: "none" }),
  ]) batch.set(db().doc(`${path}/${customer.customerId}`), { ...customer,
    createdAt: Timestamp.fromDate(new Date(customer.createdAt)), updatedAt: Timestamp.fromDate(new Date(customer.updatedAt)),
  });
  await batch.commit();
});
test.afterAll(async () => {
  const batch = db().batch();
  ids.forEach((id) => batch.delete(db().doc(`${path}/${id}`)));
  await batch.commit();
});

async function login(page: Page, mockMap = true, openSearch = true) {
  if (mockMap) await page.addInitScript(installCustomerMapMock);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.delivery);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  await chooseMode(page, "customer");
  await expect(page.getByRole("heading", { name: /거래처 정보를.*한눈에/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "최근 검색 거래처" })).toBeVisible();
  if (openSearch) await page.getByRole("button", { name: /거래처 이름으로 찾기/ }).click();
}

async function chooseMode(page: Page, mode: "customer" | "delivery") {
  const trigger = page.getByRole("button", { name: /^업무 모드 변경, 현재 / });
  await expect(trigger.or(page.getByRole("group", { name: "업무 모드" }))).toBeVisible();
  if (await trigger.isVisible()) {
    await trigger.click();
    const picker = page.getByRole("dialog", { name: "업무 모드 선택", exact: true });
    await picker.locator(`button[data-mode="${mode}"]`).click();
    await expect(picker).toHaveCount(0);
  } else {
    await page.getByRole("group", { name: "업무 모드" }).locator(`button[data-mode="${mode}"]`).click();
  }
}

test("name-only search shows all field information, map controls and private selection without phone/card collision", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  const search = page.getByRole("searchbox", { name: "거래처명 또는 초성 검색" });
  await expect(page.locator("[data-customer-card]")).toHaveCount(0);
  for (const query of ["강은유통", "강은", "강 은"]) {
    await search.fill(query);
    await expect(page.locator("[data-customer-card]")).toHaveCount(1);
  }
  await search.fill("ㄱㅇㅇㅌ");
  await expect(page.locator("[data-customer-card]")).toHaveCount(2);
  for (const excluded of ["0012*", "010-0000-1234", "탄방동", "좌측 창고"]) {
    await search.fill(excluded);
    await expect(page.getByText("등록된 거래처를 찾을 수 없습니다.")).toBeVisible();
  }
  await search.fill("강은");
  const card = page.locator("[data-customer-card]");
  for (const info of ["강은유통", "테스트 후면 창고 주소", "0012*", "건물 뒤편 좌측 창고", "가상담당 현장 담당자", "010-0000-1234", "정보변경"]) await expect(card).toContainText(info);
  await expect(card).not.toContainText("탄방동");
  await page.screenshot({ path: testInfo.outputPath("customer-search-card.png"), fullPage: true });
  const phone = card.getByRole("link", { name: /전화/ });
  await expect(phone).toHaveAttribute("href", "tel:01000001234");
  // Block OS navigation in this test only. The real React click handler still runs.
  await phone.evaluate((link) => link.addEventListener("click", (event) => event.preventDefault(), { once: true }));
  await phone.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await card.getByRole("button", { name: "강은유통 상세 정보" }).click();
  const dialog = page.getByRole("dialog", { name: "강은유통", exact: true });
  const canvas = dialog.locator("[data-customer-map-canvas]");
  await expect(canvas).toHaveAttribute("data-mock-center", "36.35,127.38");
  await expect(canvas.locator("[data-mock-marker]")).toHaveCount(1);
  await expect(canvas.locator("[data-mock-marker]")).toHaveAttribute("data-mock-position", "36.35,127.38");
  await expect(canvas.locator("[data-mock-marker]")).toHaveAttribute("title", "강은유통");
  await page.screenshot({ path: testInfo.outputPath("customer-map-layout.png"), fullPage: true });
  await dialog.getByRole("button", { name: "지도 핀", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "납품지점 정보" })).toContainText("0012*");
  const footer = dialog.locator(".bottom-sheet__actions");
  await expect(footer.getByRole("link", { name: "길찾기" })).toBeInViewport({ ratio: 1 });
  const direction = await footer.getByRole("link", { name: "길찾기" }).getAttribute("href");
  expect(direction).toContain("36.35,127.38");
  expect(direction).not.toMatch(/0012|0100000|탄방동/);
  await expect(footer.getByRole("button", { name: "정보 수정", exact: true })).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByRole("region", { name: "전체 연락처" })).toContainText("042-000-1234");
  expect((await new AxeBuilder({ page }).include("dialog[open]").analyze()).violations).toEqual([]);
  const persisted = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, history: history.state, url: location.href }));
  expect(persisted).not.toMatch(/0012\*|010-0000-1234|36\.35|강은유통|테스트 후면 창고 주소/);
  expect(await page.evaluate(() => JSON.stringify({ history: history.state, url: location.href }))).not.toContain("UI-GANGEUN");
  await page.screenshot({ path: testInfo.outputPath("customer-detail.png") });
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(search).toHaveValue("강은");
  await page.reload();
  await expect(page.getByRole("heading", { name: /거래처 정보를.*한눈에/ })).toBeVisible();
  await expect(search).toHaveCount(0);
  await expect(page.getByRole("button", { name: /거래처 이름으로 찾기/ })).toBeVisible();
  await chooseMode(page, "delivery");
  await expect(page.getByRole("heading", { name: /학교를 찾고.*현장으로/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("closed-customer actions confirm and missing coordinates never invent a map pin", async ({ page }, testInfo) => {
  await login(page);
  const search = page.getByRole("searchbox", { name: "거래처명 또는 초성 검색" });
  await search.fill("폐업");
  const card = page.locator("[data-customer-card]");
  const confirmation = page.waitForEvent("dialog").then(async (prompt) => {
    expect(prompt.message()).toContain("폐업");
    await prompt.dismiss();
  });
  await card.getByRole("link", { name: /전화/ }).click();
  await confirmation;
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await search.fill("위치없는");
  await expect(card).toContainText("없음");
  await expect(card.getByRole("link", { name: /전화/ })).toHaveCount(0);
  await card.getByRole("button", { name: /상세 정보/ }).click();
  const detail = page.getByRole("dialog", { name: "위치없는유통" });
  await expect(detail).toContainText("실제 납품 위치가 등록되지 않았습니다.");
  await expect(detail.locator("[data-customer-map-canvas]")).toHaveCount(0);
  await expect(detail.getByRole("link", { name: "길찾기" })).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include("dialog[open]").analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("customer-no-location-320.png") });
});

test("map failure keeps access information, delivery address and telephone available", async ({ page }) => {
  await page.route("**/dapi.kakao.com/**", (route) => route.abort());
  await login(page, false);
  await page.getByRole("searchbox").fill("강은");
  await page.getByRole("button", { name: "강은유통 상세 정보" }).click();
  const detail = page.getByRole("dialog", { name: "강은유통" });
  await expect(detail.getByText(/지도 연결 설정이 필요합니다\.|지도를 불러오지 못했습니다\./)).toBeVisible({ timeout: 20_000 });
  for (const text of ["0012*", "건물 뒤편 좌측 창고", "테스트 후면 창고 주소"]) await expect(detail).toContainText(text);
  await expect(detail.getByRole("link", { name: /전화/ }).first()).toHaveAttribute("href", "tel:01000001234");
});

test("offline clears sensitive views and explicit logout removes customer selection", async ({ page, context }) => {
  await login(page);
  await page.getByRole("searchbox").fill("강은");
  await page.getByRole("button", { name: "강은유통 상세 정보" }).click();
  await expect(page.getByRole("dialog", { name: "강은유통" })).toBeVisible();
  await context.setOffline(true);
  await expect(page.locator("[data-customer-detail]")).toHaveCount(0);
  await expect(page.locator("[data-customer-card]")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("0012*");
  await context.setOffline(false);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.getByRole("dialog", { name: "로그아웃할까요?" }).getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.getByRole("heading", { name: /6자리 PIN/ })).toBeVisible();
  await expect(page.locator("[data-customer-workspace]")).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("onnuriway:private:")).length)).toBe(0);
});

test("recent customers keep five selected results, deduplicate, survive return and clear safely", async ({ page }, testInfo) => {
  await login(page, true, false);
  await expect(page.locator("[data-customer-card]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /자주 찾는 거래처/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("customer-home-empty.png"), fullPage: true });
  await page.getByRole("button", { name: /거래처 이름으로 찾기/ }).click();
  const search = page.getByRole("searchbox", { name: "거래처명 또는 초성 검색" });
  const names = ["강은유통", "가온유통", "폐업유통", "위치없는유통", "한빛상회", "푸른식품"];
  for (const name of names) {
    await search.fill(name);
    await page.getByRole("button", { name: `${name} 상세 정보`, exact: true }).click();
    await expect(page.getByRole("dialog", { name, exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await search.fill("");
  const recents = page.locator("[data-customer-recents]");
  const rows = recents.getByRole("button", { name: /다시 열기/ });
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toHaveAccessibleName("푸른식품 다시 열기");
  await expect(rows.first()).toHaveAccessibleDescription("주소 미등록 출입비번 0012*");
  await expect(recents).not.toContainText("강은유통");
  await expect(recents).toContainText("한빛상회 공식 주소");
  await expect(recents).toContainText("주소 미등록");
  await recents.getByRole("button", { name: "한빛상회 다시 열기" }).click();
  await expect(page.getByRole("dialog", { name: "한빛상회" })).toBeVisible();
  await page.goBack();
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toHaveAccessibleName("한빛상회 다시 열기");
  await expect(rows.first()).toHaveAccessibleDescription("한빛상회 공식 주소 출입비번 0012*");
  await page.reload();
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toHaveAccessibleName("한빛상회 다시 열기");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "거래처", exact: true }).click();
  await expect(rows).toHaveCount(5);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include("[data-customer-workspace]").analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`customer-home-five-${width}.png`), fullPage: true });
  }
  const saved = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(saved).not.toMatch(/푸른식품|한빛상회|0012\*|010-0000|36\.35|탄방동/);
  page.once("dialog", (dialog) => void dialog.dismiss());
  await recents.getByRole("button", { name: "기록 지우기" }).click();
  await expect(rows).toHaveCount(5);
  page.once("dialog", (dialog) => void dialog.accept());
  await recents.getByRole("button", { name: "기록 지우기" }).click();
  await expect(rows).toHaveCount(0);
  await page.getByRole("button", { name: /거래처 이름으로 찾기/ }).click();
  await search.fill("강은유통");
  await expect(page.locator("[data-customer-card]")).toHaveCount(1);
});

test("active customer view disappears immediately when employee authorization is revoked", async ({ page }) => {
  await login(page);
  await page.getByRole("searchbox").fill("강은");
  await page.getByRole("button", { name: "강은유통 상세 정보" }).click();
  await expect(page.locator("[data-customer-detail]")).toBeVisible();
  await db().doc("authz/uid-delivery").update({ active: false });
  try {
    await expect(page.getByRole("heading", { name: /다시 로그인이 필요합니다/ })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("0012*");
    await expect(page.locator("[data-customer-detail]")).toHaveCount(0);
  } finally { await db().doc("authz/uid-delivery").update({ active: true }); }
});

test("employee registers and edits from customer home with audit and a single guarded sheet", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  if (!/^(127\.0\.0\.1|localhost):/.test(process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "")) throw new Error("Customer photo UI test requires local Storage emulator.");
  await login(page, true, false);
  let customerId = "";
  const uploadedIds = new Set<string>();
  const photoResponses: Response[] = [];
  const tracePhotoUpload = (request: Request) => {
    const url = new URL(request.url());
    if (request.method() !== "POST" || !["127.0.0.1", "localhost"].includes(url.hostname)
      || url.pathname !== "/demo-onnuriway/asia-northeast3/uploadCustomerPhoto") return;
    const payload = request.postDataJSON() as { data?: { uploadId?: string } };
    const id = payload.data?.uploadId;
    if (id && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)) uploadedIds.add(id);
  };
  const tracePhotoResponse = (response: Response) => {
    const url = new URL(response.url());
    if (response.request().method() === "POST" && ["127.0.0.1", "localhost"].includes(url.hostname)
      && url.pathname === "/demo-onnuriway/asia-northeast3/getCustomerPhoto") photoResponses.push(response);
  };
  page.on("request", tracePhotoUpload);
  page.on("response", tracePhotoResponse);
  const verifySavedPhoto = async (detail: Locator, photoId: string, width: number, height: number, phase: string) => {
    const image = detail.getByAltText("직원등록검증유통 전경 사진", { exact: true });
    const matchingResponses = () => photoResponses.filter((response) => {
      const payload = response.request().postDataJSON() as { data?: { photoId?: string; variant?: string } };
      return payload.data?.photoId === photoId && payload.data.variant === "preview";
    });
    try {
      await detail.locator("[data-customer-photo]").scrollIntoViewIfNeeded();
      // The image node is created only after authenticated fetch + blob validation.
      // Do not spend a five-second dimension poll waiting for that node to exist.
      await expect(image).toBeVisible({ timeout: 15_000 });
      await expect.poll(() => matchingResponses().some((response) => response.ok()), { timeout: 15_000, message: `${phase}: preview callable returns HTTP success` }).toBe(true);
      const dimensions = await image.evaluate(async (element: HTMLImageElement) => {
        await element.decode();
        return { complete: element.complete, width: element.naturalWidth, height: element.naturalHeight, src: element.currentSrc };
      });
      expect(dimensions, `${phase}: decoded saved photo dimensions`).toEqual({ complete: true, width, height, src: expect.stringMatching(/^blob:/) });
      const payload = await matchingResponses().at(-1)!.json() as { error?: unknown; result?: unknown; data?: unknown };
      expect(payload.error, `${phase}: preview callable has no application error`).toBeUndefined();
      expect(payload.result ?? payload.data, `${phase}: preview callable supplies authenticated image data`).toBeTruthy();
    } finally {
      await testInfo.attach(`customer-photo-${phase}-decode`, { contentType: "application/json", body: JSON.stringify({
        expected: { photoId, width, height },
        images: await image.evaluateAll((elements) => elements.map((element) => {
          const current = element as HTMLImageElement;
          return { complete: current.complete, naturalWidth: current.naturalWidth, naturalHeight: current.naturalHeight, src: current.currentSrc || current.src };
        })).catch(() => []),
        calls: matchingResponses().map((response) => ({ status: response.status(), success: response.ok() })),
      }) });
    }
  };
  const firstPng = await sharp({ create: { width: 120, height: 90, channels: 3, background: "#246b76" } }).png().toBuffer();
  const secondPng = await sharp({ create: { width: 160, height: 100, channels: 3, background: "#c68852" } }).png().toBuffer();
  try {
    await page.getByRole("button", { name: "거래처 등록", exact: true }).click();
    let editor = page.getByRole("dialog", { name: "거래처 등록", exact: true });
    await editor.locator('input[name="name"]').fill("직원등록검증유통");
    await editor.getByLabel("거래처 주소", { exact: true }).fill("직원 등록 테스트 주소");
    await expect(editor.locator('input[name="deliveryAddress"]')).toHaveCount(0);
    await editor.getByLabel("납품 위치 설명").fill("후문 창고로 납품");
    await editor.getByLabel("거래처 전경사진 선택", { exact: true }).setInputFiles({ name: "employee-front.png", mimeType: "image/png", buffer: firstPng });
    const selectedPhoto = editor.getByAltText("선택한 거래처 전경사진 미리보기", { exact: true });
    await expect(selectedPhoto).toBeVisible();
    await expect.poll(() => selectedPhoto.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth)).toBe(120);
    await expect(editor.getByRole("button", { name: "거래처 저장", exact: true })).toBeInViewport({ ratio: 1 });
    await editor.getByRole("button", { name: "거래처 저장", exact: true }).click();
    const detail = page.getByRole("dialog", { name: "직원등록검증유통", exact: true });
    await expect(detail).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    const record = (await db().collection(path).where("name", "==", "직원등록검증유통").get()).docs[0]!;
    customerId = record.id;
    expect(record.get("createdBy")).toBe("EMP-DELIVERY");
    const firstPhotoId = record.get("overviewPhoto.photoId") as string;
    expect(uploadedIds.has(firstPhotoId)).toBe(true);
    expect(record.get("overviewPhoto")).toEqual({ photoId: firstPhotoId, width: 120, height: 90 });
    expect((await db().doc(`customerPhotoUploads/${firstPhotoId}`).get()).get("state")).toBe("attached");
    const savedPhoto = detail.getByAltText("직원등록검증유통 전경 사진", { exact: true });
    await verifySavedPhoto(detail, firstPhotoId, 120, 90, "created");
    await page.screenshot({ path: testInfo.outputPath("customer-employee-photo-created.png") });
    await detail.getByRole("button", { name: "정보 수정", exact: true }).click();
    editor = page.getByRole("dialog", { name: "거래처 수정", exact: true });
    await expect(editor.getByLabel("납품 위치 설명")).toHaveValue("후문 창고로 납품");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await editor.getByLabel("납품 위치 설명").fill("오른쪽 셔터로 변경");
    await editor.getByLabel("거래처 전경사진 선택", { exact: true }).setInputFiles({ name: "employee-front-replaced.png", mimeType: "image/png", buffer: secondPng });
    await expect(editor.getByRole("button", { name: "앨범에서 선택", exact: true })).toBeVisible();
    await expect(editor.getByRole("button", { name: "직접 촬영", exact: true })).toBeVisible();
    page.once("dialog", (prompt) => void prompt.dismiss());
    await page.goBack();
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel("납품 위치 설명")).toHaveValue("오른쪽 셔터로 변경");
    await editor.getByRole("button", { name: "거래처 저장", exact: true }).click();
    await expect(detail).toContainText("오른쪽 셔터로 변경");
    const replaced = await db().doc(`${path}/${customerId}`).get();
    const secondPhotoId = replaced.get("overviewPhoto.photoId") as string;
    expect(secondPhotoId).not.toBe(firstPhotoId);
    expect(uploadedIds.has(secondPhotoId)).toBe(true);
    expect(replaced.get("overviewPhoto")).toEqual({ photoId: secondPhotoId, width: 160, height: 100 });
    expect((await db().doc(`customerPhotoUploads/${firstPhotoId}`).get()).get("state")).toBe("retired");
    expect((await db().doc(`customerPhotoUploads/${secondPhotoId}`).get()).get("state")).toBe("attached");
    await verifySavedPhoto(detail, secondPhotoId, 160, 100, "replaced");
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      expect((await new AxeBuilder({ page }).include("dialog[open]").analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(detail.getByRole("button", { name: "정보 수정", exact: true })).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: testInfo.outputPath(`customer-employee-detail-${width}.png`) });
    }
    await detail.getByRole("button", { name: "정보 수정", exact: true }).click();
    editor = page.getByRole("dialog", { name: "거래처 수정", exact: true });
    await editor.getByRole("button", { name: "사진 제거", exact: true }).click();
    await expect(editor.getByText("저장하면 전경사진이 제거됩니다.", { exact: true })).toBeVisible();
    await editor.getByRole("button", { name: "거래처 저장", exact: true }).click();
    await expect(detail).toBeVisible();
    await expect(savedPhoto).toHaveCount(0);
    expect((await db().doc(`${path}/${customerId}`).get()).get("overviewPhoto")).toBeNull();
    expect((await db().doc(`customerPhotoUploads/${secondPhotoId}`).get()).get("state")).toBe("retired");
    expect(uploadedIds.size).toBe(2);
    const audit = await db().collection("auditLogs").where("targetId", "==", customerId).get();
    expect(audit.docs.map((doc) => doc.get("eventType")).sort()).toEqual(["CUSTOMER_CREATED", "CUSTOMER_UPDATED", "CUSTOMER_UPDATED"]);
    for (const entry of audit.docs) {
      expect(entry.get("actorEmployeeId")).toBe("EMP-DELIVERY");
      expect(entry.get("changedFields")).toContain("overviewPhoto");
    }
    await testInfo.attach("customer-photo-lifecycle", { body: JSON.stringify({ customerId, firstPhotoId, secondPhotoId, uploads: uploadedIds.size, auditedChanges: audit.size, finalPhoto: null }), contentType: "application/json" });
    await detail.getByRole("button", { name: "정보 수정", exact: true }).click();
    await page.goBack();
    await expect(detail).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    page.off("request", tracePhotoUpload);
    page.off("response", tracePhotoResponse);
    if (getApps().find((app) => app.name === appName)?.options.projectId !== "demo-onnuriway"
      || !/^(127\.0\.0\.1|localhost):/.test(process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "")) throw new Error("Photo fixture cleanup is restricted to the demo project and local Storage.");
    const batch = db().batch();
    if (customerId) {
      batch.delete(db().doc(`${path}/${customerId}`));
      for (const log of (await db().collection("auditLogs").where("targetId", "==", customerId).get()).docs) batch.delete(log.ref);
      for (const lock of (await db().collection("requestLocks").where("customerId", "==", customerId).get()).docs) batch.delete(lock.ref);
    }
    for (const photoId of uploadedIds) {
      batch.delete(db().doc(`customerPhotoUploads/${photoId}`));
      for (const variant of ["thumbnail", "preview"]) await getStorage(getApps().find((app) => app.name === appName)!).bucket("demo-onnuriway.appspot.com")
        .file(`companies/onnuri/customerPhotos/${photoId}/${variant}.webp`).delete({ ignoreNotFound: true });
    }
    await batch.commit();
  }
});
