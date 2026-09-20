import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { installCustomerMapMock } from "../e2e/fixtures/customer-map-mock";

const PROJECT_ID = "demo-onnuriway";
const EMPLOYEE_ID = "EMP-PHASE32-UI-ADMIN";
const EMAIL = "phase32-ui-admin@onnuriway.test";
const PREFIX = "관리화면검증";
let signedInUid: string | null = null;
let sdkLoginBundle = "";

function control() {
  return getApps().find((app) => app.name === "phase32-admin-ui") ?? initializeApp({ projectId: PROJECT_ID }, "phase32-admin-ui");
}
function database() { return getFirestore(control()); }
function assertEmulators() {
  if (!/^(127\.0\.0\.1|localhost):/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "")
    || !/^(127\.0\.0\.1|localhost):/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "")) throw new Error("Admin UI fixtures require local Firebase emulators.");
}

test.setTimeout(120_000);
test.beforeAll(async () => {
  assertEmulators();
  const db = database();
  const admin = (await db.doc("employees/EMP-ADMIN").get()).data();
  if (!admin) throw new Error("A seeded admin fixture is required.");
  await db.doc(`employees/${EMPLOYEE_ID}`).set({ ...admin, employeeId: EMPLOYEE_ID, firebaseUid: "phase32-ui-before-login", displayName: "거래처 검증 관리자", sessionVersion: 1, status: "active", roleScopes: ["admin"] });
  await db.runTransaction(async (tx) => {
    const ref = db.doc("secureSettings/adminAccess"); const snapshot = await tx.get(ref);
    const entries = (snapshot.get("entries") as Array<{ email: string }> ?? []).filter((entry) => entry.email !== EMAIL);
    tx.set(ref, { ...snapshot.data(), entries: [...entries, { email: EMAIL, employeeId: EMPLOYEE_ID, active: true }] });
  });
  // Test-only credential sign-in avoids the emulator popup/GAPI relay, not any
  // application permission checks. Real SDK, Admin activation and authz apply.
  // The script runs on a blank intercepted localhost page, never production.
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), contents: `
      import { initializeApp } from "firebase/app";
      import { getAuth, connectAuthEmulator, setPersistence, browserLocalPersistence, GoogleAuthProvider, signInWithCredential } from "firebase/auth";
      import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
      if (location.hostname !== "127.0.0.1" || location.port !== "3103") throw new Error("Emulator UI fixture is local only.");
      window.__customerAdminFixture = (async () => {
        const app = initializeApp({ apiKey:"demo-api-key", authDomain:"demo-onnuriway.firebaseapp.com", projectId:"demo-onnuriway", appId:"1:1234567890:web:demo-onnuriway" });
        const auth = getAuth(app); connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});
        const functions = getFunctions(app,"asia-northeast3"); connectFunctionsEmulator(functions,"127.0.0.1",5001);
        await setPersistence(auth,browserLocalPersistence);
        const credential = await signInWithCredential(auth,GoogleAuthProvider.credential(JSON.stringify({sub:"phase32-ui-admin-google",email:"${EMAIL}",email_verified:true,name:"거래처 검증 관리자"})));
        await httpsCallable(functions,"activateAdminSession")({appVersion:"phase32-admin-ui"});
        await credential.user.getIdToken(true);
        return credential.user.uid;
      })();
    ` }, bundle: true, write: false, platform: "browser", format: "iife", logLevel: "silent",
  });
  sdkLoginBundle = bundle.outputFiles[0]!.text;
});

test.afterAll(async () => {
  assertEmulators();
  const db = database();
  const allCustomers = await db.collection("companies/onnuri/customers").get();
  const batch = db.batch();
  for (const doc of allCustomers.docs) if (String(doc.get("name")).startsWith(PREFIX)) batch.delete(doc.ref);
  const audit = await db.collection("auditLogs").where("actorEmployeeId", "==", EMPLOYEE_ID).get();
  for (const doc of audit.docs) batch.delete(doc.ref);
  if (signedInUid) {
    const locks = await db.collection("requestLocks").where("actorUid", "==", signedInUid).get();
    for (const doc of locks.docs) batch.delete(doc.ref);
    batch.delete(db.doc(`authz/${signedInUid}`));
    await getAuth(control()).deleteUser(signedInUid).catch(() => {});
  }
  batch.delete(db.doc(`employees/${EMPLOYEE_ID}`));
  await batch.commit();
  await db.runTransaction(async (tx) => {
    const ref = db.doc("secureSettings/adminAccess"); const snapshot = await tx.get(ref);
    tx.update(ref, { entries: (snapshot.get("entries") as Array<{ email: string }> ?? []).filter((entry) => entry.email !== EMAIL) });
  });
});

async function loginAdmin(page: Page) {
  // Intercepted bootstrap pages have a public network address space in Chromium;
  // explicitly permit only this local test origin to contact emulator ports.
  await page.context().grantPermissions(["local-network-access"], { origin: "http://127.0.0.1:3103" });
  await page.route("**/customer-test-auth", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body>Local emulator sign-in fixture</body></html>" }));
  await page.goto("/customer-test-auth");
  await page.addScriptTag({ content: sdkLoginBundle });
  signedInUid = await page.evaluate(() => (window as unknown as { __customerAdminFixture: Promise<string> }).__customerAdminFixture);
  await page.goto("/");
  // The first customer callable can cold-start in the emulator. Wait for its
  // real response before asserting the separate client-side ready transition.
  // A slow/missing request or rejected payload still fails explicitly.
  const startedAt = Date.now();
  const initialList = page.waitForResponse((response) => response.request().method() === "POST"
    && new URL(response.url()).pathname.endsWith("/listCustomers"), { timeout: 15_000 });
  await page.getByRole("navigation", { name: "관리자 빠른 메뉴" }).getByRole("button", { name: /거래처/ }).click();
  await expect(page.getByRole("heading", { name: "거래처 관리", exact: true })).toBeVisible();
  const response = await initialList;
  const responseMs = Date.now() - startedAt;
  expect(response.status()).toBe(200);
  const payload = await response.json() as { result?: { customers?: unknown; nextCursor?: unknown } };
  expect(Array.isArray(payload.result?.customers)).toBe(true);
  expect(payload.result?.nextCursor).toBeNull();
  await expect(page.getByRole("button", { name: "거래처 등록", exact: true })).toBeEnabled();
  await test.info().attach("initial-customer-catalog-timing", {
    body: JSON.stringify({ responseMs, readyMs: Date.now() - startedAt, httpStatus: response.status() }),
    contentType: "application/json",
  });
  await page.screenshot({ path: test.info().outputPath("admin-catalog-ready.png"), fullPage: true });
}

test("admin customer form supports guarded dismissal, visible save, real create/edit/close and exact retry after lost response", async ({ page }) => {
  page.setDefaultTimeout(10_000);
  const reverseRequests: string[] = [];
  let reverseFails = false;
  page.on("request", (request) => { if (request.method() === "POST" && request.url().includes("/reverseCustomerLocation")) reverseRequests.push(request.url()); });
  await page.route("**/reverseCustomerLocation", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1" || url.port !== "5001" || !url.pathname.startsWith(`/${PROJECT_ID}/`)) throw new Error("Reverse-geocoding fixtures must remain on local emulators.");
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({ status: reverseFails ? 503 : 200, contentType: "application/json", headers: { "access-control-allow-origin": "http://127.0.0.1:3103" },
      body: JSON.stringify(reverseFails ? { error: { status: "UNAVAILABLE", message: "Local test geocoder unavailable." } } : { result: { district: "서구", administrativeDong: "탄방동", address: "대전광역시 서구 테스트로 1" } }) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(installCustomerMapMock);
  await loginAdmin(page);

  await page.getByRole("button", { name: "거래처 등록", exact: true }).click();
  let editor = page.getByRole("dialog", { name: "거래처 등록", exact: true });
  await editor.locator('input[name="name"]').fill(`${PREFIX}취소`);
  page.once("dialog", (dialog) => dialog.dismiss());
  await editor.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(editor).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await editor.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(editor).toBeHidden();

  // Browser/PWA Back follows the same unsaved-draft guard as the close button.
  await page.getByRole("button", { name: "거래처 등록", exact: true }).click();
  editor = page.getByRole("dialog", { name: "거래처 등록", exact: true });
  await editor.locator('input[name="name"]').fill(`${PREFIX}뒤로가기`);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.goBack();
  await expect(editor).toBeVisible();
  await expect(editor.locator('input[name="name"]')).toHaveValue(`${PREFIX}뒤로가기`);
  page.once("dialog", (dialog) => dialog.accept());
  await page.goBack();
  await expect(editor).toBeHidden();
  await expect(page.getByRole("heading", { name: "거래처 관리", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "거래처 등록", exact: true }).click();
  editor = page.getByRole("dialog", { name: "거래처 등록", exact: true });
  await editor.locator('input[name="name"]').fill(`${PREFIX}상호`);
  await expect(editor.getByLabel("자치구", { exact: true })).toHaveCount(0);
  await expect(editor.getByLabel("행정동", { exact: true })).toHaveCount(0);
  await editor.getByLabel("거래처 주소", { exact: true }).fill("대전광역시 서구 본사로 10");
  await expect(editor.getByLabel("실제 납품 주소", { exact: true })).toHaveCount(0);
  await expect(editor.getByRole("radio", { name: "비밀번호 없음", exact: true })).toBeChecked();
  await expect(editor.getByRole("group", { name: "출입 비밀번호 상태", exact: true }).getByRole("radio")).toHaveCount(2);
  await editor.getByRole("radio", { name: "비밀번호 등록", exact: true }).check();
  await editor.locator('[data-customer-field="accessPassword"]').fill("00123*");
  await editor.getByLabel("납품 위치 설명").fill("후면 왼쪽 셔터");
  await expect(editor.getByRole("button", { name: "거래처 저장", exact: true })).toBeInViewport({ ratio: 1 });
  await editor.locator("summary").filter({ hasText: "좌표 직접 입력" }).click();
  await editor.getByLabel("위도", { exact: true }).fill("36.35");
  await editor.getByLabel("경도", { exact: true }).fill("127.38");
  await editor.getByLabel("경도", { exact: true }).press("Tab");
  expect(reverseRequests).toHaveLength(0);
  await editor.getByRole("button", { name: "거래처 저장", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("이 위치로 설정");
  await editor.getByRole("button", { name: "이 위치로 설정", exact: true }).click();
  await expect(editor.locator("[data-customer-delivery-address]")).toContainText("대전광역시 서구 테스트로 1");
  await expect(editor.locator("[data-customer-delivery-address]")).toContainText("설정됨");
  await expect(editor.getByLabel("납품 주소 직접 보완 (선택)", { exact: true })).toHaveCount(0);
  await editor.getByRole("button", { name: "추가", exact: true }).click();
  await expect(editor.getByLabel("구분", { exact: true })).toHaveCount(0);
  await editor.getByLabel("이름", { exact: true }).fill("소은 부장");
  await editor.getByLabel("전화번호", { exact: true }).fill("010-0000-1234");
  await expect(editor.getByRole("button", { name: "거래처 저장", exact: true })).toBeInViewport({ ratio: 1 });
  const a11y = await new AxeBuilder({ page }).include('dialog[open]').analyze();
  expect(a11y.violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("admin-customer-editor.png"), fullPage: true });
  await editor.getByRole("button", { name: "거래처 저장", exact: true }).click();
  await expect(editor).toBeHidden();
  const row = page.getByRole("button", { name: `${PREFIX}상호 수정`, exact: true });
  await expect(row).toBeVisible();
  const savedCustomer = (await database().collection("companies/onnuri/customers").get()).docs.find((doc) => doc.get("name") === `${PREFIX}상호`);
  expect(savedCustomer?.data()).toMatchObject({ district: "서구", administrativeDong: "탄방동", officialAddress: "대전광역시 서구 본사로 10", deliveryAddress: "대전광역시 서구 테스트로 1", deliveryPoint: { latitude: 36.35, longitude: 127.38 }, contacts: [expect.objectContaining({ name: "소은 부장", role: "" })] });
  expect(reverseRequests).toHaveLength(1);
  await row.click();
  editor = page.getByRole("dialog", { name: "거래처 수정", exact: true });
  await expect(editor.locator('[data-customer-field="accessPassword"]')).toHaveValue("00123*");
  await editor.getByLabel("거래처 주소", { exact: true }).fill("대전광역시 서구 본사로 20");
  await expect(editor.locator("[data-customer-delivery-address]")).toContainText("대전광역시 서구 테스트로 1");
  await editor.locator('[data-customer-field="accessPassword"]').fill("00999#");
  await editor.getByRole("button", { name: "거래처 저장", exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(row).toContainText("정보변경");
  expect((await savedCustomer!.ref.get()).data()).toMatchObject({ officialAddress: "대전광역시 서구 본사로 20", deliveryAddress: "대전광역시 서구 테스트로 1" });
  await row.click();
  editor = page.getByRole("dialog", { name: "거래처 수정", exact: true });
  await editor.locator("select").filter({ has: page.locator('option[value="closed"]') }).selectOption("closed");
  await expect(editor.getByLabel("신규·정보변경 배지 해제")).toHaveCount(0);
  await editor.getByLabel("주의 배지", { exact: true }).selectOption("none");
  await editor.getByRole("button", { name: "거래처 저장", exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(row).toContainText("폐업");
  expect((await savedCustomer!.ref.get()).get("noticeType")).toBe("none");

  // A provider outage cannot trap staff in the editor or restore an old address.
  reverseFails = true;
  await page.getByRole("button", { name: "거래처 등록", exact: true }).click();
  editor = page.getByRole("dialog", { name: "거래처 등록", exact: true });
  await editor.locator('input[name="name"]').fill(`${PREFIX}주소보완`);
  await editor.locator("summary").filter({ hasText: "좌표 직접 입력" }).click();
  await editor.getByLabel("위도", { exact: true }).fill("36.36");
  await editor.getByLabel("경도", { exact: true }).fill("127.39");
  await editor.getByRole("button", { name: "이 위치로 설정", exact: true }).click();
  await expect(editor.getByLabel("납품 주소 직접 보완 (선택)", { exact: true })).toBeVisible();
  await editor.getByLabel("납품 주소 직접 보완 (선택)", { exact: true }).fill("현장 확인 주소 1");
  await editor.getByRole("button", { name: "거래처 저장", exact: true }).click();
  await expect(editor).toBeHidden();
  const fallbackCustomer = (await database().collection("companies/onnuri/customers").get()).docs.find((doc) => doc.get("name") === `${PREFIX}주소보완`);
  expect(fallbackCustomer?.data()).toMatchObject({ deliveryAddress: "현장 확인 주소 1", deliveryPoint: { latitude: 36.36, longitude: 127.39 } });
  expect(reverseRequests).toHaveLength(2);

  let loseNextResponse = true;
  const requestIds: string[] = [];
  await page.route("**/saveCustomer", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requestIds.push(route.request().postDataJSON().data.requestId);
    if (loseNextResponse) {
      loseNextResponse = false;
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      return route.abort("failed");
    }
    return route.continue();
  });
  await page.getByRole("button", { name: "거래처 등록", exact: true }).click();
  editor = page.getByRole("dialog", { name: "거래처 등록", exact: true });
  await editor.locator('input[name="name"]').fill(`${PREFIX}응답유실`);
  await editor.getByRole("button", { name: "거래처 저장", exact: true }).click();
  await expect(editor.getByRole("button", { name: "저장 결과 다시 확인", exact: true })).toBeVisible();
  await expect(editor.locator('input[name="name"]')).toBeDisabled();
  await editor.getByRole("button", { name: "저장 결과 다시 확인", exact: true }).click();
  await expect(editor).toBeHidden();
  expect(requestIds).toHaveLength(2); expect(requestIds[0]).toBe(requestIds[1]);
  const matching = (await database().collection("companies/onnuri/customers").get()).docs.filter((doc) => doc.get("name") === `${PREFIX}응답유실`);
  expect(matching).toHaveLength(1);
  expect(matching[0]!.get("revision")).toBe(1);
  expect(reverseRequests).toHaveLength(2);
});
