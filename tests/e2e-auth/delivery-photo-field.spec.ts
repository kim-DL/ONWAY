import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import sharp from "sharp";

import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";
import { customerSchema, getCustomerChoseong, normalizeCustomerName } from "../../src/domain/customer";
import { deliveryDateKeyInSeoul } from "../../functions/src/delivery-photo/delivery-photo-service";

const project = "demo-onnuriway";
const customerPath = "companies/onnuri/customers";
const routePath = "companies/onnuri/deliveryPhotoRoutes/EMP-DELIVERY";
const photoPath = "companies/onnuri/deliveryPhotos/fed0b3f0-5b10-41d1-9bc3-e67d304fd283";
const names = ["한빛유통", "대전식품", "푸른상회", "새봄마트",
  ...Array.from({ length: 16 }, (_, index) => `테스트거래처${index + 1}`)];
const ids = names.map((_, index) => `DP-FIELD-${String(index + 1).padStart(2, "0")}`);
const appName = "delivery-photo-field-e2e";
const db = () => getFirestore(getApps().find((app) => app.name === appName) ?? initializeApp({ projectId: project }, appName));
const now = new Date();
const dateKey = deliveryDateKeyInSeoul(now);

test.setTimeout(120_000);
test.beforeAll(async () => {
  if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== project
    || !/^(127\.0\.0\.1|localhost):/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "")
    || !/^(127\.0\.0\.1|localhost):/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "")) {
    throw new Error("Delivery photo E2E may run only on the demo emulators.");
  }
  const batch = db().batch();
  for (const [index, id] of ids.entries()) {
    const name = names[index]!;
    const customer = customerSchema.parse({
      customerId: id, companyId: "onnuri", name, normalizedName: normalizeCustomerName(name),
      choseongName: getCustomerChoseong(name), district: "서구", administrativeDong: "탄방동",
      officialAddress: "", deliveryAddress: "", deliveryPoint: null,
      accessPassword: "", accessPasswordState: "none", deliveryLocationDescription: "",
      contacts: [], status: "active", noticeType: "none", changeNote: "", revision: 1,
      createdAt: "2026-09-06T00:00:00.000Z", updatedAt: "2026-09-06T00:00:00.000Z",
      createdBy: "EMP-ADMIN", updatedBy: "EMP-ADMIN",
    });
    batch.set(db().doc(`${customerPath}/${id}`), { ...customer,
      createdAt: Timestamp.fromDate(new Date(customer.createdAt)),
      updatedAt: Timestamp.fromDate(new Date(customer.updatedAt)) });
  }
  batch.set(db().doc(routePath), { employeeId: "EMP-DELIVERY", customerIds: ids.slice(0, 3),
    revision: 1, updatedAt: Timestamp.fromDate(now), updatedByEmployeeId: "EMP-DELIVERY" });
  const photoId = "fed0b3f0-5b10-41d1-9bc3-e67d304fd283";
  const token = "66558a67-cc4d-4000-8852-3b887f584ad0";
  const prefix = `delivery-photos/${dateKey}/${photoId}/attempts/${token}/`;
  const object = (variant: "evidence" | "thumbnail") => ({
    objectPath: `${prefix}${variant}.webp`, generation: "1", uploadAttemptToken: token,
    contentType: "image/webp", byteSize: 100, width: 640, height: 480,
  });
  batch.set(db().doc(photoPath), {
    photoId, customerId: ids[0], deliveryDateKey: dateKey, source: "camera", status: "active",
    createdAt: Timestamp.fromDate(now), createdByUid: "uid-delivery", createdByEmployeeId: "EMP-DELIVERY",
    createdByName: "납품 담당", expiresAt: Timestamp.fromDate(new Date(now.valueOf() + 7 * 86_400_000)),
    evidence: object("evidence"), thumbnail: object("thumbnail"),
  });
  await batch.commit();
});

async function login(page: Page) {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.delivery);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  const trigger = page.getByRole("button", { name: /^업무 모드 변경, 현재 / });
  await expect(trigger.or(page.getByRole("group", { name: "업무 모드" }))).toBeVisible({ timeout: 30_000 });
  if (await trigger.isVisible()) {
    await trigger.click();
    const picker = page.getByRole("dialog", { name: "업무 모드 선택", exact: true });
    await picker.locator('button[data-mode="customer"]').click();
  } else {
    await page.getByRole("group", { name: "업무 모드" }).locator('button[data-mode="customer"]').click();
  }
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "납품사진" }).click();
  await expect(page.getByRole("heading", { name: "납품사진" })).toBeVisible();
}

async function removePilotPhotos(customerIds: readonly string[]) {
  for (const customerId of customerIds) {
    const photos = await db().collection("companies/onnuri/deliveryPhotos").where("customerId", "==", customerId).get();
    if (photos.empty) continue;
    const batch = db().batch(); for (const photo of photos.docs) batch.delete(photo.ref); await batch.commit();
  }
}

async function chooseRowPhoto(page: Page, customerName: string, source: "카메라 촬영" | "앨범 선택", buffer: Buffer, name = "delivery.jpg") {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: `${customerName} ${source}` }).click();
  await (await chooser).setFiles({ name, mimeType: "image/jpeg", buffer });
}

test("camera and album uploads stay non-blocking and merge only server-confirmed metadata", async ({ page }) => {
  await removePilotPhotos([ids[1]!, ids[2]!, ids[3]!]);
  const errors: string[] = []; const warnings: string[] = []; const directWrites: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") warnings.push(message.text()); });
  await login(page);
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes(":9199") || /documents:commit/u.test(url)) directWrites.push(url);
  });
  const oriented = await sharp({ create: { width: 1_200, height: 800, channels: 3, background: "#a7c5b1" } })
    .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "private-exif-marker" } } }).jpeg().toBuffer();
  const regular = await sharp({ create: { width: 960, height: 640, channels: 3, background: "#7da6be" } }).jpeg().toBuffer();
  const requests: Array<{ requestId: string; customerId: string; source: string; contentType: string; fileBase64: string }> = [];
  let releaseFirst!: () => void; const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let callIndex = 0;
  await page.route("**/createDeliveryPhoto", async (route) => {
    const body = route.request().postDataJSON() as { data: typeof requests[number] };
    requests.push(body.data); const current = callIndex; callIndex += 1;
    if (current === 0) await firstGate;
    await route.continue();
  });
  try {
    const search = page.getByRole("searchbox", { name: "납품사진 거래처 검색" });
    await search.fill("새봄");
    const unsupportedChooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "새봄마트 앨범 선택" }).click();
    await (await unsupportedChooser).setFiles({ name: "unsupported.heic", mimeType: "image/heic", buffer: Buffer.from("unsupported") });
    await expect(page.getByText(/HEIC\/HEIF 사진은 지원하지 않아요/u)).toBeVisible();
    await search.fill("");

    const cancelledChooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "대전식품 카메라 촬영" }).click();
    await cancelledChooser;
    await page.getByLabel("납품사진 카메라 촬영").dispatchEvent("cancel");
    const firstChooser = page.waitForEvent("filechooser");
    const cameraButton = page.getByRole("button", { name: "대전식품 카메라 촬영" });
    let rapidChooserCount = 0; const countRapidChooser = () => { rapidChooserCount += 1; };
    page.on("filechooser", countRapidChooser);
    await cameraButton.click(); await cameraButton.click();
    await (await firstChooser).setFiles({ name: "oriented.jpg", mimeType: "image/jpeg", buffer: oriented });
    await expect.poll(() => rapidChooserCount).toBe(1); page.off("filechooser", countRapidChooser);
    await expect.poll(() => requests.length).toBe(1);
    await expect(page.getByText("업로드 중", { exact: true })).toBeVisible();
    await search.fill("새봄"); await expect(page.getByText("새봄마트")).toBeVisible(); await search.fill("");

    await chooseRowPhoto(page, "푸른상회", "앨범 선택", regular, "album.jpg");
    await expect(page.getByText("남음 1곳 · 기록완료 2곳")).toBeVisible({ timeout: 30_000 });
    releaseFirst();
    await expect(page.getByText("남음 0곳 · 기록완료 3곳")).toBeVisible({ timeout: 30_000 });
    expect(requests.slice(0, 2).map((request) => request.source)).toEqual(["camera", "album"]);
    expect(requests[0]).toMatchObject({ customerId: ids[1], contentType: "image/webp" });
    expect(requests[0]).not.toHaveProperty("thumbnail");
    const transportMetadata = await sharp(Buffer.from(requests[0]!.fileBase64, "base64")).metadata();
    expect(transportMetadata).toMatchObject({ format: "webp", width: 800, height: 1_200 });
    expect(transportMetadata.exif).toBeUndefined(); expect(transportMetadata.orientation).toBeUndefined();

    await page.locator("details").getByText("기록완료 3곳").click();
    await chooseRowPhoto(page, "대전식품", "카메라 촬영", regular, "additional.jpg");
    await expect(page.locator("details").getByText("사진 2장")).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "납품사진" }).click();
    await expect(page.getByRole("heading", { name: "납품사진" })).toBeVisible();
    await expect(page.getByText("남음 0곳 · 기록완료 3곳")).toBeVisible();
    await page.locator("details").getByText("기록완료 3곳").click();
    await expect(page.locator("details").getByText("사진 2장")).toBeVisible();
    const persisted = await page.evaluate(async () => ({
      local: Object.values(localStorage).join("\n"), session: Object.values(sessionStorage).join("\n"),
      databases: typeof indexedDB.databases === "function" ? (await indexedDB.databases()).map((item) => item.name ?? "") : [],
      caches: "caches" in window ? await caches.keys() : [],
    }));
    expect(`${persisted.local}\n${persisted.session}`).not.toMatch(/fileBase64|delivery-photo.*(?:job|requestId)|data:image/iu);
    expect(persisted.databases).not.toContain("delivery-photo");
    expect(persisted.caches.some((name) => /delivery-photo.*upload/iu.test(name))).toBe(false);
    expect(directWrites).toEqual([]); expect(errors).toEqual([]); expect(warnings).toEqual([]);
  } finally {
    releaseFirst(); await page.unroute("**/createDeliveryPhoto"); await removePilotPhotos([ids[1]!, ids[2]!, ids[3]!]);
  }
});

test("a lost create response retries the same request and server replay does not duplicate the photo", async ({ page }) => {
  await removePilotPhotos([ids[1]!]); await login(page);
  const regular = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#789b7e" } }).jpeg().toBuffer();
  const requests: Array<{ requestId: string; fileBase64: string }> = []; let attempt = 0;
  await page.route("**/createDeliveryPhoto", async (route) => {
    requests.push((route.request().postDataJSON() as { data: typeof requests[number] }).data);
    attempt += 1;
    if (attempt === 1) { await route.fetch(); await route.abort("failed"); }
    else await route.continue();
  });
  try {
    await chooseRowPhoto(page, "대전식품", "카메라 촬영", regular, "response-loss.jpg");
    await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "다시 시도" }).click();
    await expect(page.getByText("남음 1곳 · 기록완료 2곳")).toBeVisible({ timeout: 30_000 });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    const photos = await db().collection("companies/onnuri/deliveryPhotos").where("customerId", "==", ids[1]).get();
    expect(photos.size).toBe(1);
  } finally {
    await page.unroute("**/createDeliveryPhoto"); await removePilotPhotos([ids[1]!]);
  }
});

test("field route, completion, search, today override and reorder survive re-entry", async ({ page }, testInfo) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") warnings.push(message.text()); });
  await login(page);
  await expect(page.getByText("남음 2곳 · 기록완료 1곳")).toBeVisible();
  const remaining = page.getByRole("region", { name: "오늘 남은 납품처" });
  await expect(remaining.getByText("대전식품")).toBeVisible();
  await expect(remaining.getByText("한빛유통")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("delivery-photo-360.png"), fullPage: true });
  await page.locator("details").getByText("기록완료 1곳").click();
  await expect(page.locator("details").getByText("사진 1장")).toBeVisible();
  await expect(page.locator("details").getByText(/마지막 등록/)).toBeVisible();
  const search = page.getByRole("searchbox", { name: "납품사진 거래처 검색" });
  const searchCalls: string[] = [];
  page.on("request", (request) => {
    if (/\/(?:getDeliveryPhotoRoute|getDeliveryPhotoDay|listDeliveryPhotos|listCustomers)$/u.test(request.url())) searchCalls.push(request.url());
  });
  await search.fill("새봄");
  await expect(page.getByText("새봄마트")).toBeVisible();
  expect(searchCalls).toEqual([]);
  await page.getByRole("button", { name: "오늘 추가", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "오늘 순서 편집" });
  await expect(editor.getByText("새봄마트")).toBeVisible();
  await editor.getByRole("button", { name: "저장", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByText("남음 3곳 · 기록완료 1곳")).toBeVisible();
  await page.getByRole("button", { name: "순서 편집" }).click();
  const reorder = page.getByRole("dialog", { name: "오늘 순서 편집" });
  await reorder.getByRole("button", { name: "대전식품 오늘만 제외" }).click();
  await reorder.getByRole("button", { name: "새봄마트 위로 이동" }).focus();
  await page.keyboard.press("Enter");
  await reorder.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("남음 2곳 · 기록완료 1곳")).toBeVisible();
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "거래처", exact: true }).click();
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "납품사진" }).click();
  await expect(page.getByText("남음 2곳 · 기록완료 1곳")).toBeVisible();
  await expect(page.getByRole("region", { name: "오늘 남은 납품처" }).getByText("대전식품")).toHaveCount(0);
  await page.getByRole("button", { name: "내 납품처 편집" }).click();
  const routeEditor = page.getByRole("dialog", { name: "내 납품처 편집" });
  await routeEditor.getByRole("searchbox", { name: "거래처 검색" }).fill("테스트거래처1");
  await routeEditor.getByRole("button", { name: "테스트거래처1 내 납품처에 추가", exact: true }).click();
  await routeEditor.getByRole("button", { name: "저장", exact: true }).click();
  await expect(routeEditor).toHaveCount(0);
  await expect(page.getByText("남음 2곳 · 기록완료 1곳")).toBeVisible();
  await page.evaluate((recentIds) => {
    localStorage.setItem("onnuriway:private:recent-customers:v1:uid-delivery:1:1", JSON.stringify(recentIds));
  }, ids);
  await page.reload();
  await page.getByRole("navigation", { name: "주요 메뉴" }).getByRole("button", { name: "납품사진" }).click();
  await expect(page.getByText("남음 2곳 · 기록완료 1곳")).toBeVisible();
  await page.getByRole("button", { name: "내 납품처 편집" }).click();
  const recentEditor = page.getByRole("dialog", { name: "내 납품처 편집" });
  await expect(recentEditor.getByText("최근 거래처")).toBeVisible();
  await expect(recentEditor.locator("ul li")).toHaveCount(16);
  await page.keyboard.press("Escape");
  await expect(recentEditor).toHaveCount(0);
  await page.getByRole("button", { name: "내 납품처 편집" }).click();
  await page.goBack();
  await expect(page.getByRole("dialog", { name: "내 납품처 편집" })).toHaveCount(0);
  for (const width of [360, 320]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (const button of await page.locator("[data-delivery-photo-workspace] button:visible").all()) {
    const box = await button.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("delivery-photo-200-percent.png"), fullPage: true });
  expect((await new AxeBuilder({ page }).include("[data-delivery-photo-workspace]").analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

test("empty route offers setup without changing the day until Save", async ({ page }) => {
  await db().doc(`companies/onnuri/deliveryPhotoDays/EMP-DELIVERY_${dateKey}`).delete();
  await db().doc(routePath).delete();
  await login(page);
  await expect(page.getByRole("button", { name: "내 납품처 설정" })).toBeVisible();
  await page.getByRole("button", { name: "내 납품처 설정" }).click();
  const editor = page.getByRole("dialog", { name: "내 납품처 편집" });
  await editor.getByRole("searchbox", { name: "거래처 검색" }).fill("한빛");
  await editor.getByRole("button", { name: "한빛유통 내 납품처에 추가" }).click();
  await editor.getByRole("button", { name: "취소" }).click();
  await expect(page.getByRole("button", { name: "내 납품처 설정" })).toBeVisible();
  await page.getByRole("button", { name: "내 납품처 설정" }).click();
  const reopened = page.getByRole("dialog", { name: "내 납품처 편집" });
  await reopened.getByRole("searchbox", { name: "거래처 검색" }).fill("한빛");
  await reopened.getByRole("button", { name: "한빛유통 내 납품처에 추가" }).click();
  await reopened.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("남음 0곳 · 기록완료 1곳")).toBeVisible();
});

test("revision conflict refreshes server state without overwriting the draft", async ({ page }) => {
  await login(page);
  await expect(page.getByText("남음 0곳 · 기록완료 1곳")).toBeVisible();
  await page.getByRole("button", { name: "내 납품처 편집" }).click();
  const editor = page.getByRole("dialog", { name: "내 납품처 편집" });
  await editor.getByRole("searchbox", { name: "거래처 검색" }).fill("푸른상회");
  await editor.getByRole("button", { name: "푸른상회 내 납품처에 추가" }).click();
  await db().doc(routePath).update({ customerIds: ids.slice(0, 2), revision: 2, updatedAt: Timestamp.now() });
  await editor.getByRole("button", { name: "저장", exact: true }).click();
  await expect(editor.getByText("다른 기기에서 목록이 바뀌었습니다.", { exact: false })).toBeVisible();
  expect((await db().doc(routePath).get()).get("customerIds")).toEqual(ids.slice(0, 2));
  await editor.getByRole("button", { name: "최신 목록 보기" }).click();
  await expect(page.getByText("남음 1곳 · 기록완료 1곳")).toBeVisible();
});
