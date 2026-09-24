import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test";
import { build } from "esbuild";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import sharp from "sharp";
import { PHASE3_TEST_PINS } from "../../scripts/fixtures/phase3-auth";
import { assertInventoryE2EEnvironment, groupInventoryE2EPageSequences, INVENTORY_E2E_ORIGIN, INVENTORY_E2E_PROJECT } from "../../scripts/inventory-e2e-safety";
import { INVENTORY_PRODUCT_PATH, INVENTORY_SETTINGS_PATH, inventoryListPageSchema, inventoryLocationMap, inventoryLotSchema, inventoryProductDetailSchema, inventoryProductSchema, inventorySettingsSchema, type InventoryProduct } from "../../src/domain/inventory";
import { normalizeInventoryManufacturerName } from "../../src/domain/inventory-manufacturer";

const productName = "에뮬레이터 검증 만두";
let productId = "";
let firstPhotoId = "";
let firstPhoto: Buffer;
let replacementPhoto: Buffer;
let adminSdkLoginBundle = "";
const allowedOrigins = new Set([INVENTORY_E2E_ORIGIN, "http://127.0.0.1:9099", "http://127.0.0.1:8080", "http://127.0.0.1:5001", "http://127.0.0.1:9199"]);
const control = () => {
  assertInventoryE2EEnvironment();
  return getApps().find((app) => app.name === "inventory-ui-control") ?? initializeApp({ projectId: INVENTORY_E2E_PROJECT }, "inventory-ui-control");
};
const db = () => getFirestore(control());
const manufacturerReservationId = (normalizedName: string) => createHash("sha256").update(normalizedName).digest("hex");
async function storedProduct() {
  return (await db().doc(`${INVENTORY_PRODUCT_PATH}/${productId}`).get()).data() as InventoryProduct;
}
async function call(name: string, token: string | null, data: unknown) {
  assertInventoryE2EEnvironment();
  const response = await fetch(`http://127.0.0.1:5001/${INVENTORY_E2E_PROJECT}/asia-northeast3/${name}`, {
    method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: token } : {}) }, body: JSON.stringify({ data }), signal: AbortSignal.timeout(30_000),
  });
  return { status: response.status, cache: response.headers.get("cache-control"), body: await response.json() as { result?: unknown; error?: { status: string } } };
}
async function chooseMode(page: Page, mode: string) {
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
  await expect(page.locator("main.workspace-shell")).toHaveAttribute("data-mode", mode);
}
async function waitForAuthenticatedBoundary(page: Page) {
  const modeUi = page.getByRole("button", { name: /^업무 모드 변경, 현재 / })
    .or(page.getByRole("group", { name: "업무 모드" }));
  const authenticatedShellFallback = page.getByRole("status")
    .filter({ hasText: "저장된 업무 화면을 여는 중이에요." });
  const authFailure = page.locator("#pin-error").filter({ hasText: /\S/ });

  // The emulator's first callable can take 4–5 seconds. Wait for AuthGate to
  // leave PIN/resolving state before starting the unchanged 5-second mode UI
  // assertion. A failure alert ends readiness immediately with its message.
  await expect(modeUi.or(authenticatedShellFallback).or(authFailure))
    .toBeVisible({ timeout: 10_000 });
  if (await authFailure.isVisible()) {
    throw new Error(`Employee authentication failed: ${(await authFailure.innerText()).trim()}`);
  }
}
function expiryAfter(days: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(Date.parse(`${today}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
async function login(page: Page, pin: string) {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.getByLabel("직원 PIN").fill(pin);
  const contextResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/getInventoryContext"));
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  await waitForAuthenticatedBoundary(page);
  await chooseMode(page, "inventory");
  await expect(page.getByRole("navigation").getByRole("button", { name: "실사", exact: true })).toHaveCount(0);
  const response = await contextResponse;
  expect(response.ok()).toBe(true);
  const authorization = response.request().headers().authorization;
  expect(authorization).toMatch(/^Bearer /);
  await expect(page.getByRole("region", { name: "재고 관리", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "재고를 불러오고" })).toHaveCount(0);
  return authorization!;
}
async function loginAdmin(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.context().grantPermissions(["local-network-access"], { origin: INVENTORY_E2E_ORIGIN });
  await page.route("**/inventory-admin-auth", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body>Local inventory admin sign-in fixture</body></html>" }));
  await page.goto("/inventory-admin-auth");
  await page.addScriptTag({ content: adminSdkLoginBundle });
  const token = await page.evaluate(() => (window as unknown as { __inventoryAdminFixture: Promise<string> }).__inventoryAdminFixture);
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "관리자 주요 메뉴" });
  await expect(navigation).toBeVisible({ timeout: 20_000 });
  const contextResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/getInventoryContext"));
  await navigation.getByRole("button", { name: /^재고 관리/ }).click();
  expect((await contextResponse).ok()).toBe(true);
  await expect(page.getByRole("region", { name: "재고 관리", exact: true })).toBeVisible();
  return `Bearer ${token}`;
}
async function openListOptions(page: Page) {
  await page.getByRole("button", { name: "목록 옵션", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "목록 옵션", exact: true });
  await expect(sheet).toBeVisible();
  return sheet;
}
async function closeListOptions(sheet: Locator) {
  await sheet.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(sheet).toHaveCount(0);
}
async function capture(page: Page, info: TestInfo, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
}
async function captureInventoryList(page: Page, info: TestInfo, name: string) {
  const workspace = page.getByRole("region", { name: "재고 관리", exact: true });
  await expect(workspace).toHaveClass(/shell-page/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Screenshots should show the heading and list context, not the scroll offset
  // left by an earlier button interaction. This does not change production UX.
  await page.locator(".workspace-content").evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
  const geometry = await workspace.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const paddingLeft = parseFloat(style.paddingLeft);
    const paddingRight = parseFloat(style.paddingRight);
    return {
      viewport: innerWidth, left: rect.left, right: rect.right, paddingLeft, paddingRight,
      contentLeft: rect.left + parseFloat(style.borderLeftWidth) + paddingLeft,
      contentRight: rect.right - parseFloat(style.borderRightWidth) - paddingRight,
      paddingBottom: parseFloat(style.paddingBottom),
      actionInset: parseFloat(style.getPropertyValue("--inventory-action-inset")),
      writer: element.hasAttribute("data-write-actions"),
      cards: Array.from(element.querySelectorAll("article"), (card) => {
        const box = card.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      }),
    };
  });
  const path = info.outputPath(`${name}-geometry.json`);
  await writeFile(path, JSON.stringify(geometry, null, 2));
  await info.attach(`${name}-geometry`, { path, contentType: "application/json" });
  expect(geometry.paddingLeft, "inventory needs a visible left gutter").toBeGreaterThan(0);
  expect(geometry.paddingRight, "inventory needs a visible right gutter").toBeGreaterThan(0);
  expect(geometry.paddingLeft).toBeCloseTo(geometry.paddingRight, 1);
  expect(geometry.cards.length).toBeGreaterThan(0);
  for (const card of geometry.cards) {
    expect(card.width).toBeGreaterThan(0);
    expect(card.left).toBeGreaterThanOrEqual(geometry.contentLeft - 0.5);
    expect(card.right).toBeLessThanOrEqual(geometry.contentRight + 0.5);
  }
  if (geometry.writer) expect(geometry.paddingBottom, "sticky action must leave final rows reachable").toBeGreaterThanOrEqual(geometry.actionInset + 16);
  const controls = await workspace.evaluate((element) => {
    const search = element.querySelector('input[aria-label="품목 검색"]')!.closest("label")!.getBoundingClientRect();
    const options = element.querySelector('button[aria-label="목록 옵션"]')!.getBoundingClientRect();
    return {
      search: search.toJSON(), options: options.toJSON(),
    };
  });
  expect(controls.search.height).toBeGreaterThanOrEqual(48);
  expect(controls.options.width).toBeGreaterThanOrEqual(48);
  expect(controls.options.height).toBeGreaterThanOrEqual(48);
  expect(controls.search.right).toBeLessThanOrEqual(controls.options.left);
  expect(controls.options.right).toBeLessThanOrEqual(geometry.contentRight + 0.5);
  await capture(page, info, name);
}
async function verifyFloatingAction(page: Page, cards: Locator, info: TestInfo, name: string) {
  const scroller = page.locator(".workspace-content");
  const fab = page.getByRole("button", { name: "새 품목 등록", exact: true });
  await scroller.evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
  const before = await fab.boundingBox();
  expect(before).not.toBeNull();
  await scroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "instant" }));
  const after = await fab.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.x).toBeCloseTo(before!.x, 1);
  expect(after!.y).toBeCloseTo(before!.y, 1);
  expect(after!.height).toBeGreaterThanOrEqual(48);
  const finalCard = cards.last();
  const last = await finalCard.boundingBox();
  expect(last).not.toBeNull();
  expect(last!.y + last!.height, "final card must scroll above the floating action").toBeLessThanOrEqual(after!.y);
  await finalCard.click({ trial: true });
  const more = page.getByRole("button", { name: "품목 더 보기", exact: true });
  const moreBox = await more.count() ? await more.boundingBox() : null;
  if (moreBox) {
    expect(moreBox.y + moreBox.height, "load more must not sit behind the floating action").toBeLessThanOrEqual(after!.y);
    await more.click({ trial: true });
  }
  await info.attach(name, { body: JSON.stringify({ viewport: page.viewportSize(), before, after, last, more: moreBox }, null, 2), contentType: "application/json" });
}
async function verifyDetailActions(detail: Locator) {
  const actions = await Promise.all(["출고", "입고", "조정", "품목 정보 수정"].map(async (name) => {
    const button = detail.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    return button.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color, rect: rect.toJSON(), icons: element.querySelectorAll("svg").length };
    });
  }));
  expect(new Set(actions.map((action) => action.background)).size, "each inventory action has a distinct surface color").toBe(4);
  expect(new Set(actions.map((action) => action.color)).size, "each inventory action has a distinct ink color").toBe(4);
  for (const [index, action] of actions.entries()) {
    expect(action.rect.height).toBeGreaterThanOrEqual(44);
    expect(action.icons).toBe(1);
    if (index > 0) expect(actions[index - 1]!.rect.right).toBeLessThanOrEqual(action.rect.left);
  }
  const secondary = [detail.getByRole("button", { name: "수량 일치 확인", exact: true }), detail.getByRole("button", { name: "더보기", exact: true })];
  const positions = await Promise.all(secondary.map((button) => button.boundingBox()));
  expect(positions[0]!.y).toBeGreaterThanOrEqual(actions[0]!.rect.bottom);
  expect(positions[0]!.x + positions[0]!.width).toBeLessThanOrEqual(positions[1]!.x);
  for (const name of ["품목 삭제", "비활성화", "입출고·실사 이력"]) await expect(detail.getByRole("button", { name, exact: true })).toHaveCount(0);
  await detail.locator(".bottom-sheet__body").evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "instant" }));
  for (const [index, button] of secondary.entries()) {
    const after = await button.boundingBox();
    expect(after!.y).toBeCloseTo(positions[index]!.y, 1);
    expect(after!.height).toBeGreaterThanOrEqual(44);
    if (await button.isEnabled()) await button.click({ trial: true });
  }
  await detail.locator(".bottom-sheet__body").evaluate((element) => element.scrollTo({ top: 0, behavior: "instant" }));
}
async function captureOfflineAccessibility(page: Page, info: TestInfo, name: string) {
  if (process.env.INVENTORY_E2E_DEBUG_OFFLINE !== "true") return;
  const dom = await page.locator("dialog").evaluateAll((dialogs) => dialogs.map((dialog) => {
    const style = (element: Element) => {
      const computed = getComputedStyle(element);
      return { tag: element.tagName, id: element.id, ariaHidden: element.getAttribute("aria-hidden"),
        display: computed.display, visibility: computed.visibility, contentVisibility: computed.contentVisibility,
        opacity: computed.opacity, rect: element.getBoundingClientRect().toJSON() };
    };
    const heading = dialog.querySelector("h2");
    return { modal: dialog.matches(":modal"), labelledBy: dialog.getAttribute("aria-labelledby"),
      heading: heading?.outerHTML, name: dialog.getAttribute("aria-label"),
      styles: [dialog, ...dialog.querySelectorAll("header, h2, label, textarea")].map(style) };
  }));
  const session = await page.context().newCDPSession(page);
  const tree = await session.send("Accessibility.getFullAXTree");
  await session.detach();
  const ax = tree.nodes.filter((node) => ["dialog", "heading", "textbox"].includes(String(node.role?.value)))
    .map((node) => ({ role: node.role?.value, name: node.name, ignored: node.ignored, ignoredReasons: node.ignoredReasons }));
  await writeFile(info.outputPath(`${name}.json`), JSON.stringify({
    dom, ax, snapshot: await page.locator("dialog").ariaSnapshot(),
    namedDialogs: await page.getByRole("dialog", { name: "새 품목 등록", exact: true }).count(),
    allDialogs: await page.getByRole("dialog").count(),
  }, null, 2));
}
async function submitMutation(page: Page, dialog: Locator, label: string, callable: string) {
  // Each actual callable may cold-start independently. Wait for its response,
  // while asserting the production UI prevents duplicate submissions in flight.
  const completed = page.waitForResponse((response) => response.request().method() === "POST"
    && new URL(response.url()).pathname.endsWith(`/${callable}`), { timeout: 60_000 });
  const returnsDetail = ["recordInventoryMovement", "recordInventoryCount", "updateInventoryLot"].includes(callable);
  const detailReads: Request[] = [];
  const observe = (request: Request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/getInventoryProduct")) detailReads.push(request);
  };
  page.on("request", observe);
  try {
    await dialog.getByRole("button", { name: label, exact: true }).click();
    await expect(dialog.locator('button[type="submit"]')).toBeDisabled();
    const response = await completed;
    expect(response.ok(), callable).toBe(true);
    const body = await response.json() as { result?: { product?: unknown; detail?: unknown; replayed?: boolean } };
    const input = response.request().postDataJSON().data as Record<string, unknown>;
    expect(input.includeSummary).toBe(true);
    if (returnsDetail) {
      expect(input.includeDetail).toBe(true);
      if (callable === "recordInventoryCount") { expect(input.matchOnly).toBe(true); expect(input.reason).toBe(""); }
      expect(body.result?.replayed).toBe(false);
      const snapshot = inventoryProductDetailSchema.parse(body.result?.detail);
      expect(snapshot.product).toEqual(inventoryProductSchema.parse(body.result?.product));
    }
    await expect(dialog).toHaveCount(0);
    if (returnsDetail) {
      const product = inventoryProductSchema.parse(body.result?.product);
      const parent = page.getByRole("dialog", { name: product.name, exact: true });
      await expect(parent.getByRole("status").filter({ hasText: "최신 재고" })).toHaveCount(0);
      await expect(parent.getByRole("button", { name: "입고", exact: true })).toBeEnabled();
      // Flush React's committed effects, without adding an arbitrary sleep.
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(detailReads, "a confirmed mutation snapshot must avoid another product-detail RPC").toHaveLength(0);
    }
    return { input, result: body.result };
  } finally { page.off("request", observe); }
}
async function openMore(page: Page, detail: Locator) {
  await detail.getByRole("button", { name: "더보기", exact: true }).click();
  const more = page.getByRole("dialog", { name: "품목 더보기", exact: true });
  await expect(more.getByRole("button", { name: "입출고·실사 이력", exact: true })).toBeVisible();
  return more;
}
async function expectReadOnlyCount(dialog: Locator, lotCount: number) {
  await expect(dialog.locator('input, select, textarea')).toHaveCount(0);
  await expect(dialog.getByRole("list", { name: "확인할 유통기한별 재고", exact: true }).getByRole("listitem")).toHaveCount(lotCount);
  await expect(dialog.getByText(lotCount > 1 ? "유통기한별 재고가 실제 수량과 일치하나요?" : "재고 수량과 실제 수량이 일치하나요?", { exact: true })).toBeVisible();
}
async function openProduct(page: Page) {
  await page.getByRole("button", { name: new RegExp(`${productName}, .*상세 보기`) }).click();
  const detail = page.getByRole("dialog", { name: productName, exact: true });
  await expect(detail.getByRole("button", { name: "입고", exact: true })).toBeVisible();
  return detail;
}

test.skip(process.env.INVENTORY_E2E !== "true", "Run with the guarded inventory emulator launcher.");
test.use({ actionTimeout: 20_000, navigationTimeout: 60_000 });
test.setTimeout(180_000);
test.beforeAll(async () => {
  assertInventoryE2EEnvironment();
  firstPhoto = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#9ecfc3" } }).jpeg().toBuffer();
  replacementPhoto = await sharp({ create: { width: 480, height: 640, channels: 3, background: "#e4b9ad" } }).jpeg().toBuffer();
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), contents: `
      import { initializeApp } from "firebase/app";
      import { getAuth, connectAuthEmulator, setPersistence, browserLocalPersistence, GoogleAuthProvider, signInWithCredential } from "firebase/auth";
      import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
      if (location.origin !== "${INVENTORY_E2E_ORIGIN}") throw new Error("Inventory admin fixture is local only.");
      window.__inventoryAdminFixture = (async () => {
        const app = initializeApp({ apiKey:"demo-api-key", authDomain:"${INVENTORY_E2E_PROJECT}.firebaseapp.com", projectId:"${INVENTORY_E2E_PROJECT}", appId:"1:1234567890:web:${INVENTORY_E2E_PROJECT}" });
        const auth = getAuth(app); connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});
        const functions = getFunctions(app,"asia-northeast3"); connectFunctionsEmulator(functions,"127.0.0.1",5001);
        await setPersistence(auth,browserLocalPersistence);
        const credential = await signInWithCredential(auth,GoogleAuthProvider.credential(JSON.stringify({sub:"inventory-m3-admin",email:"admin@onnuriway.test",email_verified:true,name:"재고 M3 관리자"})));
        await httpsCallable(functions,"activateAdminSession")({appVersion:"inventory-m3-e2e"});
        return credential.user.getIdToken(true);
      })();
    ` }, bundle: true, write: false, platform: "browser", format: "iife", logLevel: "silent",
  });
  adminSdkLoginBundle = bundle.outputFiles[0]!.text;
});
test.beforeEach(async ({ context }) => {
  assertInventoryE2EEnvironment();
  // Observe only the test page's sheet bookkeeping, never tokens or data stores.
  // This preserves native history behavior while retaining evidence of a
  // save/close race that may otherwise disappear before the failure screenshot.
  await context.addInitScript(() => {
    const trace: Array<Record<string, unknown>> = [];
    const debug = window as typeof window & { __inventorySheetTrace?: typeof trace; __inventoryCaptureSheetState?: (event: string) => void };
    debug.__inventorySheetTrace = trace;
    const nodeIds = new WeakMap<Node, number>();
    let nextNodeId = 0;
    const nodeId = (node: Node | null) => { if (!node) return null; if (!nodeIds.has(node)) nodeIds.set(node, ++nextNodeId); return nodeIds.get(node); };
    const elementInfo = (node: Element) => ({ node: nodeId(node), tag: node.tagName, id: node.id,
      className: node.getAttribute("class"), hidden: node.getAttribute("aria-hidden"), inert: node.hasAttribute("inert") });
    const dialogsState = () => Array.from(document.querySelectorAll("dialog"), (dialog) => {
      const label = dialog.getAttribute("aria-labelledby");
      const target = label ? document.getElementById(label) : null;
      const heading = dialog.querySelector("h2");
      const ancestors = [];
      for (let ancestor = dialog.parentElement; ancestor; ancestor = ancestor.parentElement) ancestors.push(elementInfo(ancestor));
      return { node: nodeId(dialog), parent: nodeId(dialog.parentNode), open: dialog.hasAttribute("open"),
        modal: dialog.matches(":modal"), connected: dialog.isConnected,
        labelledBy: label, labelExists: !!target, labelText: target?.textContent?.trim() ?? null,
        headingId: heading?.id ?? null, headingText: heading?.textContent?.trim() ?? null, ancestors };
    });
    const record = (event: string, stack?: string) => {
      trace.push({ event, at: Math.round(performance.now()), online: navigator.onLine,
        activeElement: document.activeElement ? elementInfo(document.activeElement) : null,
        sheet: history.state?.onnuriwaySheet ?? null, dialogs: dialogsState(),
        ...(stack ? { stack, url: location.href } : {}) });
      if (trace.length > 250) trace.shift();
    };
    debug.__inventoryCaptureSheetState = record;
    const push = history.pushState.bind(history);
    history.pushState = (...args: Parameters<History["pushState"]>) => { record("push.before"); push(...args); record("push.after"); };
    const replace = history.replaceState.bind(history);
    history.replaceState = (...args: Parameters<History["replaceState"]>) => { record("replace.before", new Error("Test-only history caller").stack); replace(...args); record("replace.after"); };
    const back = history.back.bind(history);
    history.back = () => { record("back"); back(); };
    window.addEventListener("popstate", () => record("popstate"));
    for (const event of ["online", "offline"]) window.addEventListener(event, () => {
      record(event); requestAnimationFrame(() => record(`${event}.rendered`));
    });
    window.addEventListener("DOMContentLoaded", () => {
      let signature = "";
      const observer = new MutationObserver(() => {
        const next = JSON.stringify(dialogsState());
        if (next !== signature) { signature = next; record("dialogs"); }
      });
      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["open", "id", "aria-labelledby", "aria-hidden", "inert"] });
    });
  });
  // Test guard, not a fake app response: all actual application/emulator HTTP
  // responses pass through unchanged. External calls can never leave the test.
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (allowedOrigins.has(url.origin) || ["blob:", "data:"].includes(url.protocol)) await route.continue();
    else await route.abort("blockedbyclient");
  });
});

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || page.isClosed()) return;
  const trace = await page.evaluate(() => {
    const debug = window as typeof window & { __inventorySheetTrace?: unknown; __inventoryCaptureSheetState?: (event: string) => void };
    debug.__inventoryCaptureSheetState?.("test.failed.final");
    return debug.__inventorySheetTrace;
  }).catch(() => null);
  if (trace) {
    const path = info.outputPath("inventory-sheet-history.json");
    await writeFile(path, JSON.stringify(trace, null, 2));
    await info.attach("inventory-sheet-history", { path, contentType: "application/json" });
  }
});

test("360px list options keep readable row toggles and a persistent count-mode segment", async ({ page }, info) => {
  const consoleIssues: string[] = [];
  page.on("console", (message) => { if (["warning", "error"].includes(message.type())) consoleIssues.push(message.text()); });
  page.on("pageerror", (error) => consoleIssues.push(error.message));
  await login(page, PHASE3_TEST_PINS.delivery);

  let sheet = await openListOptions(page);
  let inactive = sheet.getByRole("checkbox", { name: "비활성 품목 보기", exact: true });
  let urgent = sheet.getByRole("checkbox", { name: "임박 상품만 보기 D-100일", exact: true });
  let countMode = sheet.getByRole("switch", { name: "재고조사 모드", exact: true });
  const geometry = await sheet.evaluate((dialog) => {
    const inputs = [...dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    const rows = inputs.map((input) => {
      const row = input.closest("label")!;
      const label = row.querySelector(":scope > span:not([aria-hidden])")!;
      const rowRect = row.getBoundingClientRect();
      const inputRect = input.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      return { height: rowRect.height, inputLeft: inputRect.left, labelLeft: labelRect.left, fontSize: parseFloat(getComputedStyle(label).fontSize) };
    });
    const control = inputs.find((input) => input.getAttribute("role") === "switch")!.closest("label")!.lastElementChild!;
    return {
      rows,
      segmentWidth: control.getBoundingClientRect().width,
      segmentTargets: [...control.children].map((child) => child.getBoundingClientRect().height),
      sheetFits: dialog.scrollWidth <= dialog.clientWidth,
      pageFits: document.documentElement.scrollWidth <= innerWidth,
    };
  });
  expect(geometry.sheetFits).toBe(true);
  expect(geometry.pageFits).toBe(true);
  expect(geometry.rows.slice(0, 2).every((row) => row.height >= 56 && row.inputLeft < row.labelLeft && row.fontSize >= 16)).toBe(true);
  expect(geometry.rows[2]!.height).toBeGreaterThanOrEqual(64);
  expect(geometry.segmentWidth).toBeGreaterThanOrEqual(150);
  expect(geometry.segmentTargets.every((height) => height >= 40)).toBe(true);

  await inactive.locator("..").click(); await expect(inactive).toBeChecked();
  await inactive.locator("..").click(); await expect(inactive).not.toBeChecked();
  await urgent.locator("..").click(); await expect(urgent).toBeChecked();
  await countMode.locator("..").click(); await expect(countMode).toBeChecked();
  await capture(page, info, "inventory-list-options-360");
  await closeListOptions(sheet);
  await expect(page.getByRole("status").filter({ hasText: "재고조사 ON" })).toBeVisible();

  sheet = await openListOptions(page);
  inactive = sheet.getByRole("checkbox", { name: "비활성 품목 보기", exact: true });
  urgent = sheet.getByRole("checkbox", { name: "임박 상품만 보기 D-100일", exact: true });
  countMode = sheet.getByRole("switch", { name: "재고조사 모드", exact: true });
  await expect(inactive).not.toBeChecked();
  await expect(urgent).toBeChecked();
  await expect(countMode).toBeChecked();
  await urgent.uncheck();
  await countMode.uncheck();
  await closeListOptions(sheet);
  await expect(page.getByRole("status").filter({ hasText: "재고조사 ON" })).toHaveCount(0);
  expect(consoleIssues).toEqual([]);
});

test("admin manages manufacturers through the real callable without changing the current draft", async ({ page }) => {
  const token = await loginAdmin(page);
  await page.setViewportSize({ width: 360, height: 800 });
  const suffix = randomUUID().slice(0, 8);
  const originalName = `M3 관리 ${suffix}`;
  const renamedName = `M3 변경 ${suffix}`;
  const duplicateName = `M3 중복 ${suffix}`;
  const createdResponse = await call("createInventoryManufacturer", token, { requestId: randomUUID(), name: originalName });
  const duplicateResponse = await call("createInventoryManufacturer", token, { requestId: randomUUID(), name: duplicateName });
  expect(createdResponse.status).toBe(200); expect(duplicateResponse.status).toBe(200);
  const created = createdResponse.body.result as { manufacturerId: string; revision: number; normalizedName: string };

  await page.getByRole("button", { name: "새 품목 등록", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "새 품목 등록", exact: true });
  await editor.getByRole("button", { name: "제조사 선택", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "제조사 선택", exact: true });
  const search = picker.getByRole("combobox", { name: "제조사 검색", exact: true });
  await search.fill(originalName);
  let manage = picker.getByRole("button", { name: `${originalName} 관리`, exact: true });
  await expect(manage).toBeVisible();
  const geometry = await picker.evaluate((dialog) => ({
    sheetFits: dialog.scrollWidth <= dialog.clientWidth,
    pageFits: document.documentElement.scrollWidth <= innerWidth,
  }));
  expect(geometry).toEqual({ sheetFits: true, pageFits: true });
  const manageGeometry = await manage.evaluate((button) => ({ tag: button.tagName, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height }));
  expect(manageGeometry.tag).toBe("BUTTON");
  expect(manageGeometry.width).toBeGreaterThanOrEqual(44); expect(manageGeometry.height).toBeGreaterThanOrEqual(44);

  await manage.click();
  let management = page.getByRole("dialog", { name: "제조사 관리", exact: true });
  await expect(management).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(management).toHaveCount(0); await expect(picker).toBeVisible();
  await expect(editor.getByRole("button", { name: "제조사 선택", exact: true })).toBeVisible();

  await manage.click(); management = page.getByRole("dialog", { name: "제조사 관리", exact: true });
  await expect(management).toBeVisible();
  await page.goBack();
  await expect(management).toHaveCount(0); await expect(picker).toBeVisible();

  await manage.click();
  await page.getByRole("dialog", { name: "제조사 관리", exact: true }).getByRole("button", { name: "이름 수정", exact: true }).click();
  let renameSheet = page.getByRole("dialog", { name: "제조사 이름 수정", exact: true });
  await expect(renameSheet).toContainText("기존 품목에 저장된 제조사명은 변경되지 않습니다.");
  const renameInput = renameSheet.getByLabel("수정할 제조사명", { exact: true });
  await expect(renameInput).toBeFocused(); await renameInput.fill(renamedName);
  let updateRequest: { requestId: string; manufacturerId: string; expectedRevision: number; name?: string; active?: false } | undefined;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/updateInventoryManufacturer")) {
      updateRequest = (request.postDataJSON() as { data: typeof updateRequest }).data;
    }
  });
  const renameResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/updateInventoryManufacturer"));
  await renameSheet.getByRole("button", { name: "이름 수정", exact: true }).click();
  expect((await renameResponse).ok()).toBe(true);
  await expect(renameSheet).toHaveCount(0);
  expect(updateRequest).toMatchObject({ manufacturerId: created.manufacturerId, expectedRevision: created.revision, name: renamedName });
  const renameRequestId = updateRequest!.requestId;
  await expect(picker.getByRole("status").filter({ hasText: "기존 품목의 제조사명은 그대로 유지됩니다." })).toBeVisible();
  await expect(editor.getByRole("button", { name: "제조사 선택", exact: true })).toBeVisible();

  const oldReservation = await db().doc(`companies/onnuri/inventoryManufacturerNames/${manufacturerReservationId(created.normalizedName)}`).get();
  const newNormalizedName = normalizeInventoryManufacturerName(renamedName);
  const newReservation = await db().doc(`companies/onnuri/inventoryManufacturerNames/${manufacturerReservationId(newNormalizedName)}`).get();
  expect(oldReservation.data()).toMatchObject({ manufacturerId: created.manufacturerId, active: false });
  expect(newReservation.data()).toMatchObject({ manufacturerId: created.manufacturerId, active: true });
  expect((await db().doc(`auditLogs/inventory-${renameRequestId}`).get()).data()).toMatchObject({
    eventType: "INVENTORY_MANUFACTURER_UPDATED", targetId: created.manufacturerId, changedFields: ["name"],
  });

  await search.fill(renamedName);
  manage = picker.getByRole("button", { name: `${renamedName} 관리`, exact: true });
  await manage.click();
  await page.getByRole("dialog", { name: "제조사 관리", exact: true }).getByRole("button", { name: "이름 수정", exact: true }).click();
  renameSheet = page.getByRole("dialog", { name: "제조사 이름 수정", exact: true });
  await renameSheet.getByLabel("수정할 제조사명", { exact: true }).fill(duplicateName);
  await renameSheet.getByRole("button", { name: "이름 수정", exact: true }).click();
  await expect(renameSheet.getByRole("alert")).toContainText("기존 제조사를 사용해주세요");
  await expect(renameSheet.getByLabel("수정할 제조사명", { exact: true })).toHaveValue(duplicateName);
  await page.keyboard.press("Escape"); await expect(renameSheet).toHaveCount(0); await expect(picker).toBeVisible();

  await search.fill(renamedName); manage = picker.getByRole("button", { name: `${renamedName} 관리`, exact: true });
  await manage.click();
  management = page.getByRole("dialog", { name: "제조사 관리", exact: true });
  await management.getByRole("button", { name: "비활성화", exact: true }).click();
  const deactivateSheet = page.getByRole("dialog", { name: "제조사 비활성화", exact: true });
  await expect(deactivateSheet).toContainText("기존 품목의 제조사명과 연결은 유지됩니다.");
  await expect(deactivateSheet).toContainText("다시 활성화할 수 없어요");
  updateRequest = undefined;
  const deactivateResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/updateInventoryManufacturer"));
  await deactivateSheet.getByRole("button", { name: "비활성화", exact: true }).click();
  expect((await deactivateResponse).ok()).toBe(true);
  expect(updateRequest).toMatchObject({ manufacturerId: created.manufacturerId, expectedRevision: 2, active: false });
  await expect(deactivateSheet).toHaveCount(0);
  await expect(picker.getByRole("button", { name: `${renamedName} 관리`, exact: true })).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "제조사 선택", exact: true })).toBeVisible();
  expect((await db().doc(`companies/onnuri/inventoryManufacturers/${created.manufacturerId}`).get()).data()).toMatchObject({
    name: renamedName, active: false, revision: 3,
  });
  expect((await db().doc(`auditLogs/inventory-${updateRequest!.requestId}`).get()).data()).toMatchObject({
    eventType: "INVENTORY_MANUFACTURER_UPDATED", targetId: created.manufacturerId, changedFields: ["active"],
  });
});

test.describe("registered product and access controls", () => {
test.describe.configure({ mode: "serial" });

test("PIN user registers a photographed product, receives/counts/issues stock, and replaces/removes its private photo", async ({ page }, info) => {
  const token = await login(page, PHASE3_TEST_PINS.delivery);
  let listOptions = await openListOptions(page);
  await expect(listOptions.getByRole("switch", { name: "재고조사 모드", exact: true })).not.toBeChecked();
  await closeListOptions(listOptions);
  await page.getByRole("button", { name: "새 품목 등록", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "새 품목 등록", exact: true });
  await editor.getByLabel(/품목명/).fill(productName);
  let manufacturerListRequests = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname.endsWith("/listInventoryManufacturers")) manufacturerListRequests += 1; });
  await editor.getByRole("button", { name: "제조사 선택", exact: true }).click();
  let manufacturerPicker = page.getByRole("dialog", { name: "제조사 선택", exact: true });
  const manufacturerSearch = manufacturerPicker.getByRole("combobox", { name: "제조사 검색", exact: true });
  await expect(manufacturerSearch).toBeVisible();
  await expect(manufacturerPicker.getByRole("button", { name: / 관리$/ })).toHaveCount(0);
  await expect(manufacturerSearch).not.toBeFocused();
  await expect.poll(() => manufacturerListRequests).toBe(1);
  await manufacturerSearch.fill("테스트 제조사");
  await expect.poll(() => manufacturerListRequests).toBe(1);
  const pickerGeometry = await manufacturerPicker.evaluate((dialog) => ({ scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth,
    targets: Array.from(dialog.querySelectorAll("button, input"), (element) => element.getBoundingClientRect().height) }));
  expect(pickerGeometry.scrollWidth).toBeLessThanOrEqual(pickerGeometry.clientWidth);
  expect(pickerGeometry.targets.every((height) => height >= 44)).toBe(true);
  await manufacturerPicker.getByRole("button", { name: /테스트 제조사.*새 제조사로 추가/ }).click();
  const addManufacturer = page.getByRole("dialog", { name: "새 제조사 추가", exact: true });
  const manufacturerName = addManufacturer.getByLabel("제조사명", { exact: true });
  await expect(manufacturerName).toBeFocused();
  await expect(manufacturerName).toHaveValue("테스트 제조사");
  const createResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/createInventoryManufacturer"));
  await addManufacturer.getByRole("button", { name: "추가 후 선택", exact: true }).click();
  expect((await createResponse).ok()).toBe(true);
  await expect(addManufacturer).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "테스트 제조사", exact: true })).toBeVisible();
  const originChoices = editor.getByRole("group", { name: "원산지", exact: true });
  const unitChoices = editor.getByRole("group", { name: "기준 단위 (필수)", exact: true });
  await expect(originChoices.getByRole("radio")).toHaveCount(4);
  await expect(unitChoices.getByRole("radio")).toHaveCount(5);
  await expect(unitChoices.getByRole("radio", { name: "낱개", exact: true })).toBeChecked();
  await expect(unitChoices.getByRole("radio", { name: "봉", exact: true })).toBeVisible();
  await expect(unitChoices.getByRole("radio", { name: "팩", exact: true })).toBeVisible();
  const bottleUnit = unitChoices.getByRole("radio", { name: "병", exact: true });
  const customUnit = unitChoices.getByRole("radio", { name: "직접입력", exact: true });
  await expect(bottleUnit).toBeVisible();
  await expect(customUnit).toBeVisible();
  const unitLayout = await Promise.all([bottleUnit, customUnit].map((radio) => radio.evaluate((input) => input.closest("label")!.getBoundingClientRect().toJSON())));
  expect(Math.abs(unitLayout[0]!.top - unitLayout[1]!.top)).toBeLessThanOrEqual(1);
  expect(unitLayout[1]!.width).toBeGreaterThanOrEqual(unitLayout[0]!.width * 1.9);
  await originChoices.getByRole("radio", { name: "직접입력", exact: true }).check();
  const customOrigin = editor.getByLabel("원산지 직접입력", { exact: true });
  await expect(customOrigin).toBeFocused();
  await customOrigin.fill("대한민국");
  await originChoices.getByRole("radio", { name: "국내산", exact: true }).check();
  await expect(customOrigin).toHaveCount(0);
  await expect(editor.getByLabel("원산지 직접입력", { exact: true })).toHaveCount(0);
  await unitChoices.getByRole("radio", { name: "봉", exact: true }).check();
  await expect(unitChoices.getByRole("radio", { name: "봉", exact: true })).toBeFocused();
  await editor.getByRole("button", { name: "규격 · 선택", exact: true }).click();
  const specificationPicker = page.getByRole("dialog", { name: "규격 선택", exact: true });
  await expect(specificationPicker.getByRole("textbox")).toHaveCount(0);
  await expect(specificationPicker.getByRole("radio")).toHaveCount(11);
  const pickerTargets = await specificationPicker.getByRole("radio").evaluateAll((radios) => radios.map((radio) => radio.closest("label")!.getBoundingClientRect().height));
  expect(pickerTargets.every((height) => height >= 44)).toBe(true);
  await specificationPicker.getByRole("radio", { name: "1000g", exact: true }).click();
  await expect(specificationPicker).toHaveCount(0);
  const specificationTrigger = editor.getByRole("button", { name: "규격 · 1000g", exact: true });
  await specificationTrigger.click(); await page.goBack();
  await expect(specificationPicker).toHaveCount(0); await expect(specificationTrigger).toBeVisible();
  const choiceGeometry = await editor.getByRole("radio").evaluateAll((radios) => radios.map((radio) => {
    const box = radio.closest("label")!.getBoundingClientRect(); return { height: box.height, left: box.left, right: box.right };
  }));
  expect(choiceGeometry.every(({ height, left, right }) => height >= 44 && left >= 0 && right <= 360)).toBe(true);
  expect(await editor.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
  await expect(editor.getByLabel(/한 박스에 몇/)).toHaveCount(0);
  await editor.getByRole("spinbutton", { name: "초기 수량 (필수) (봉)", exact: true }).fill("1");
  const firstExpiry = expiryAfter(100);
  await editor.getByLabel("첫 유통기한 날짜", { exact: true }).fill("20280229");
  await expect(editor.getByLabel("첫 유통기한 날짜", { exact: true })).toHaveValue("2028-02-29");
  await editor.getByRole("button", { name: /^첫 유통기한 날짜 달력 열기/ }).click();
  const calendar = page.getByRole("dialog", { name: "첫 유통기한 날짜 선택", exact: true });
  await expect(calendar.getByRole("grid")).toBeVisible();
  await calendar.getByRole("button", { name: "2028년 2월 28일", exact: true }).click();
  await expect(calendar).toHaveCount(0);
  await expect(editor.getByLabel("첫 유통기한 날짜", { exact: true })).toHaveValue("2028-02-28");
  await editor.getByRole("button", { name: /^첫 유통기한 날짜 달력 열기/ }).click();
  await page.goBack(); await expect(calendar).toHaveCount(0); await expect(editor).toBeVisible();
  await editor.getByLabel("첫 유통기한 날짜", { exact: true }).fill(firstExpiry);
  await expect(editor.getByLabel("제품 사진 직접 촬영")).toHaveAttribute("capture", "environment");
  await expect(editor.locator('input[type="file"]')).toHaveCount(1);
  await expect(editor.getByRole("button", { name: /앨범|파일에서 선택/ })).toHaveCount(0);
  await editor.getByLabel("제품 사진 직접 촬영").setInputFiles({ name: "inventory-demo.jpg", mimeType: "image/jpeg", buffer: firstPhoto });
  await expect(editor.getByRole("img", { name: "저장할 제품 사진 미리보기" })).toBeVisible();
  await capture(page, info, "new-product-360");
  await page.setViewportSize({ width: 768, height: 900 });
  await capture(page, info, "new-product-768");
  await page.setViewportSize({ width: 360, height: 800 });
  await submitMutation(page, editor, "품목 등록", "saveInventoryProduct");
  let detail = page.getByRole("dialog", { name: productName, exact: true });
  await expect(detail.getByRole("img", { name: `${productName} 제품 사진` })).toBeVisible({ timeout: 30_000 });
  const photoButton = detail.getByRole("button", { name: `${productName} 제품 사진 크게 보기`, exact: true });
  const photoHint = photoButton.locator("span");
  await expect(photoHint).toBeVisible();
  const hintGeometry = await photoButton.evaluate((button) => {
    const hint = button.querySelector("span")!;
    return { button: button.getBoundingClientRect().toJSON(), hint: hint.getBoundingClientRect().toJSON(), position: getComputedStyle(hint).position };
  });
  expect(hintGeometry.position).toBe("absolute");
  expect(hintGeometry.hint.right).toBeLessThanOrEqual(hintGeometry.button.right);
  expect(hintGeometry.hint.bottom).toBeLessThanOrEqual(hintGeometry.button.bottom);
  expect(hintGeometry.hint.left).toBeGreaterThan(hintGeometry.button.left + hintGeometry.button.width / 2);
  expect(hintGeometry.hint.top).toBeGreaterThan(hintGeometry.button.top + hintGeometry.button.height / 2);
  await verifyDetailActions(detail);
  await expect(detail.getByRole("button", { name: "수량 일치 확인", exact: true })).toBeDisabled();
  await expect(detail.getByText("실사 모드에서 사용", { exact: true })).toBeVisible();
  await expect(detail.getByRole("group", { name: "상세 보관 장소", exact: true })).toHaveCount(0);
  await expect(detail.getByRole("combobox", { name: "상세 보관 장소", exact: true })).toHaveCount(0);
  await photoButton.click();
  const photoViewer = page.getByRole("dialog", { name: `${productName} 제품 사진`, exact: true });
  await expect(photoViewer.getByRole("region", { name: "제품 사진 보기", exact: true })).toBeVisible();
  await photoViewer.getByRole("button", { name: "2배 확대", exact: true }).click();
  await expect(photoViewer.getByRole("button", { name: "전체 보기", exact: true })).toBeVisible();
  await capture(page, info, "inventory-photo-viewer-360");
  await page.goBack(); await expect(photoViewer).toHaveCount(0); await expect(detail).toBeVisible();
  const products = await db().collection(INVENTORY_PRODUCT_PATH).where("name", "==", productName).get();
  expect(products.size).toBe(1); productId = products.docs[0]!.id;
  firstPhotoId = (await storedProduct()).photo!.photoId;
  expect((await storedProduct()).quantityByLocation.refrigerated).toBe(1);
  expect(await storedProduct()).toMatchObject({ manufacturer: "테스트 제조사", manufacturerId: expect.any(String) });
  await expect(detail.getByText("D-100", { exact: true })).toHaveAttribute("data-urgent", "true");
  await capture(page, info, "product-detail-360");
  await page.setViewportSize({ width: 768, height: 900 });
  await capture(page, info, "product-detail-768");
  await page.setViewportSize({ width: 360, height: 800 });
  expect((await call("getInventoryPhoto", token, { productId, photoId: firstPhotoId, variant: "preview" })).cache).toContain("no-store");
  await detail.getByRole("button", { name: "닫기", exact: true }).click();
  listOptions = await openListOptions(page);
  const urgentToggle = listOptions.getByRole("checkbox", { name: /임박 상품만/ });
  await expect(urgentToggle).toHaveAccessibleName("임박 상품만 보기 D-100일");
  await urgentToggle.check();
  await closeListOptions(listOptions);
  const registeredCard = page.getByRole("button", { name: new RegExp(`${productName}, .*상세 보기`) });
  await expect(registeredCard).toBeVisible();
  await expect(registeredCard.getByText(/유통기한별 수량/)).toHaveCount(0);
  await expect(registeredCard.locator('[data-inventory-photo="ready"] img')).toBeVisible();
  await captureInventoryList(page, info, "inventory-d100-filter-360");
  listOptions = await openListOptions(page);
  await listOptions.getByRole("checkbox", { name: /임박 상품만/ }).uncheck();
  await closeListOptions(listOptions);
  detail = await openProduct(page);

  await detail.getByRole("button", { name: "입고", exact: true }).click();
  const receiving = page.getByRole("dialog", { name: "입고 기록", exact: true });
  await receiving.locator("summary").filter({ hasText: "추가 구분명 (선택)" }).click();
  await receiving.getByLabel("재고 구분명", { exact: true }).fill("첫 입고");
  const expiry = expiryAfter(5);
  await receiving.getByLabel("유통기한 날짜", { exact: true }).fill(expiry);
  await receiving.getByRole("spinbutton", { name: "입고 수량 (봉)", exact: true }).fill("18");
  await expect(receiving.getByLabel("박스", { exact: true })).toHaveCount(0);
  await capture(page, info, "receive-360");
  await submitMutation(page, receiving, "입고 기록", "recordInventoryMovement");
  await expect.poll(async () => (await storedProduct()).quantityByLocation.refrigerated).toBe(19);
  await detail.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(registeredCard.getByText(/유통기한별 수량/)).toHaveText("유통기한별 수량 2");
  listOptions = await openListOptions(page);
  await listOptions.getByRole("switch", { name: "재고조사 모드", exact: true }).check();
  await closeListOptions(listOptions);
  detail = await openProduct(page);
  await detail.getByRole("button", { name: "수량 일치 확인", exact: true }).click();
  const count = page.getByRole("dialog", { name: "실물 수량 확인", exact: true });
  await expectReadOnlyCount(count, 2);
  await capture(page, info, "count-360");
  await page.setViewportSize({ width: 768, height: 900 });
  await capture(page, info, "count-768");
  await page.setViewportSize({ width: 360, height: 800 });
  await submitMutation(page, count, "수량 일치 · 실사 완료", "recordInventoryCount");
  await expect(detail.getByText("이번 주 확인", { exact: true })).toBeVisible();
  await expect.poll(async () => (await storedProduct()).lastCountByLocation.refrigerated?.changed).toBe(false);
  await expect(page.locator('article[data-count-state="done"]').filter({ hasText: productName })).toHaveAttribute("data-count-highlight", "done");

  await detail.getByRole("button", { name: "출고", exact: true }).click();
  const issue = page.getByRole("dialog", { name: "출고 기록", exact: true });
  await issue.getByRole("combobox", { name: "유통기한 선택", exact: true }).selectOption({ label: `${expiry.replaceAll("-", ".")} · 18 봉 · 첫 입고` });
  await issue.getByRole("spinbutton", { name: "출고 수량 (봉)", exact: true }).fill("4");
  await submitMutation(page, issue, "출고 기록", "recordInventoryMovement");
  await expect.poll(async () => (await storedProduct()).quantityByLocation.refrigerated).toBe(15);
  await expect(detail.getByText("이번 주 확인", { exact: true })).toBeVisible();
  const lotsAfterIssue = await db().collection(`${INVENTORY_PRODUCT_PATH}/${productId}/lots`).get();
  expect(lotsAfterIssue.docs.find((lot) => lot.get("expiryDate") === firstExpiry)?.get("quantity")).toBe(1);
  expect(lotsAfterIssue.docs.find((lot) => lot.get("expiryDate") === expiry)?.get("quantity")).toBe(14);

  await expect(detail.getByRole("button", { name: "보관 장소 이동", exact: true })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "계산기", exact: true })).toHaveCount(0);
  await detail.getByRole("button", { name: "조정", exact: true }).click();
  const adjustment = page.getByRole("dialog", { name: "수량 조정", exact: true });
  await adjustment.getByRole("combobox", { name: "유통기한 선택", exact: true }).selectOption({ label: `${expiry.replaceAll("-", ".")} · 14 봉 · 첫 입고` });
  await adjustment.getByRole("spinbutton", { name: "조정 후 최종 수량 (봉)", exact: true }).fill("11");
  await expect(adjustment.getByRole("textbox", { name: /사유|메모/ })).toHaveCount(0);
  await capture(page, info, "adjustment-360");
  const adjusted = await submitMutation(page, adjustment, "수량 조정", "recordInventoryMovement");
  expect(adjusted.input.reason).toBe("");
  await expect.poll(async () => (await storedProduct()).quantityByLocation).toMatchObject({ refrigerated: 12, sample: 0 });

  await detail.getByRole("button", { name: `${firstExpiry.replaceAll("-", ".")} 유통기한 수정`, exact: true }).click();
  const lotEditor = page.getByRole("dialog", { name: "유통기한 수정", exact: true });
  await expect(lotEditor.getByRole("radio")).toHaveCount(2);
  await expect(lotEditor.getByRole("radio", { name: "날짜 입력", exact: true })).toBeChecked();
  await expect(lotEditor.getByRole("radio", { name: "미확인", exact: true })).not.toBeChecked();
  await expect(lotEditor.getByRole("combobox", { name: "유통기한 상태", exact: true })).toHaveCount(0);
  await expect(lotEditor.getByRole("textbox", { name: /수정 사유/ })).toHaveCount(0);
  const changedExpiry = expiryAfter(101);
  await lotEditor.getByLabel("유통기한 날짜", { exact: true }).fill(changedExpiry);
  for (const name of ["출고", "입고", "조정"]) await expect(lotEditor.getByRole("button", { name, exact: true })).toBeDisabled();
  await submitMutation(page, lotEditor, "변경 저장", "updateInventoryLot");
  await expect.poll(async () => (await storedProduct()).quantityByLocation.refrigerated).toBe(12);
  const dateAudit = await db().collection("auditLogs").where("targetId", "==", productId).where("eventType", "==", "INVENTORY_LOT_UPDATE").get();
  expect(dateAudit.size).toBe(1);
  expect(dateAudit.docs[0]!.get("changeReason")).toBeNull();
  expect(dateAudit.docs[0]!.get("inventoryLotChange.after.expiryDate")).toBe(changedExpiry);

  // A saved date is reused by all three lot-specific actions, never silently
  // switched to the first/earliest lot. Back keeps the detail underneath.
  for (const [button, title] of [["출고", "출고 기록"], ["입고", "입고 기록"], ["조정", "수량 조정"]] as const) {
    await detail.getByRole("button", { name: `${changedExpiry.replaceAll("-", ".")} 유통기한 수정`, exact: true }).click();
    await lotEditor.getByRole("button", { name: button, exact: true }).click();
    const movement = page.getByRole("dialog", { name: title, exact: true });
    await expect(movement.getByRole("combobox", { name: "유통기한 선택", exact: true })).toHaveCount(0);
    await expect(movement.getByText(changedExpiry.replaceAll("-", "."), { exact: true })).toBeVisible();
    if (button === "조정") await expect(movement.getByRole("spinbutton", { name: "조정 후 최종 수량 (봉)", exact: true })).toHaveValue("1");
    await page.goBack(); await expect(movement).toHaveCount(0); await expect(detail).toBeVisible();
  }
  await (await openMore(page, detail)).getByRole("button", { name: "입출고·실사 이력", exact: true }).click();
  const historyDialog = page.getByRole("dialog", { name: "입출고·실사 기록", exact: true });
  await expect(historyDialog.getByText("실사 · 수량 일치", { exact: true })).toBeVisible();
  await capture(page, info, "inventory-history-360");
  await page.goBack();
  await expect(historyDialog).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "입고", exact: true })).toBeVisible();

  await detail.getByRole("button", { name: "품목 정보 수정", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "품목 정보 수정", exact: true });
  const lockedUnits = edit.getByRole("group", { name: "기준 단위 (필수)", exact: true }).getByRole("radio");
  await expect(lockedUnits).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) await expect(lockedUnits.nth(index)).toBeDisabled();
  await expect(edit.locator('input[type="file"]')).toHaveCount(1);
  await edit.getByLabel("제품 사진 직접 촬영").setInputFiles({ name: "inventory-demo-replacement.jpg", mimeType: "image/jpeg", buffer: replacementPhoto });
  await expect(edit.getByRole("img", { name: "저장할 제품 사진 미리보기" })).toBeVisible();
  await submitMutation(page, edit, "변경 저장", "saveInventoryProduct");
  await expect.poll(async () => (await storedProduct()).photo?.photoId).not.toBe(firstPhotoId);
  expect(await storedProduct()).toMatchObject({ manufacturer: "테스트 제조사", manufacturerId: expect.any(String) });
  await expect(detail.getByRole("img", { name: `${productName} 제품 사진` })).toBeVisible();
  expect((await call("getInventoryPhoto", token, { productId, photoId: firstPhotoId, variant: "preview" })).body.error?.status).toBe("NOT_FOUND");
  expect((await db().doc(`inventoryPhotoUploads/${firstPhotoId}`).get()).get("state")).toBe("retired");
  await capture(page, info, "product-replaced-photo-360");
  await detail.getByRole("button", { name: "품목 정보 수정", exact: true }).click();
  await edit.getByRole("button", { name: "사진 제거", exact: true }).click();
  await edit.getByRole("button", { name: "테스트 제조사", exact: true }).click();
  manufacturerPicker = page.getByRole("dialog", { name: "제조사 선택", exact: true });
  await expect(manufacturerPicker.getByText("최근 사용", { exact: true })).toBeVisible();
  await manufacturerPicker.getByRole("option", { name: "제조사 없음", exact: true }).click();
  await submitMutation(page, edit, "변경 저장", "saveInventoryProduct");
  await expect.poll(async () => (await storedProduct()).photo).toBeNull();
  await expect.poll(async () => (await storedProduct()).manufacturer).toBe("");
  expect(await storedProduct()).not.toHaveProperty("manufacturerId");
  await expect(detail.getByRole("img")).toHaveCount(0);
  await detail.getByRole("button", { name: "닫기", exact: true }).click();
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await captureInventoryList(page, info, `inventory-list-${width}`);
  }
  const events = await db().collection(`${INVENTORY_PRODUCT_PATH}/${productId}/events`).get();
  expect(events.docs.map((entry) => entry.get("kind")).sort()).toEqual(["adjust", "count_match", "issue", "lot_update", "receive", "receive"]);
  const persisted = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, state: history.state, url: location.href }));
  expect(persisted).not.toContain(productName);
  expect(persisted).not.toContain(firstPhotoId);
});

test("viewer uses the same PIN UI but all stock/photo/admin writes are denied by real callables", async ({ page }, info) => {
  const token = await login(page, PHASE3_TEST_PINS.salesB);
  await expect(page.getByText(/개 품목 · 읽기 전용/)).toBeVisible();
  await expect(page.getByRole("button", { name: "새 품목 등록", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "목록 옵션", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: new RegExp(`${productName}, .*상세 보기`) }).click();
  const detail = page.getByRole("dialog", { name: productName, exact: true });
  await expect(detail.getByRole("button", { name: "더보기", exact: true })).toBeVisible();
  for (const name of ["입고", "출고", "품목 정보 수정", "수량 일치 확인", "품목 삭제"]) await expect(detail.getByRole("button", { name, exact: true })).toHaveCount(0);
  await capture(page, info, "viewer-detail-360");
  const more = await openMore(page, detail);
  for (const name of ["비활성화", "품목 삭제"]) await expect(more.getByRole("button", { name, exact: true })).toHaveCount(0);
  await more.getByRole("button", { name: "입출고·실사 이력", exact: true }).click();
  const history = page.getByRole("dialog", { name: "입출고·실사 기록", exact: true });
  await expect(history).toBeVisible(); await page.goBack(); await expect(history).toHaveCount(0); await expect(detail).toBeVisible();
  const before = await storedProduct();
  for (const name of ["saveInventoryProduct", "recordInventoryMovement", "recordInventoryCount", "updateInventoryLot", "uploadInventoryPhoto", "setInventoryProductStatus", "deleteInventoryProduct", "updateInventorySettings"]) {
    expect((await call(name, token, {})).body.error?.status, name).toBe("PERMISSION_DENIED");
  }
  expect(await storedProduct()).toEqual(before);
  expect((await call("getInventoryProduct", null, { productId })).body.error?.status).toBe("UNAUTHENTICATED");
});

test("staff cannot change admin settings and revoked PIN sessions cannot read private inventory", async ({ page }) => {
  const token = await login(page, PHASE3_TEST_PINS.delivery);
  expect((await call("updateInventorySettings", token, {})).body.error?.status).toBe("PERMISSION_DENIED");
  await openProduct(page);
  await db().doc("authz/uid-delivery").update({ sessionVersion: 2 });
  try {
    await expect(page.getByRole("heading", { name: /다시 로그인이 필요합니다/ })).toBeVisible();
    expect((await call("getInventoryProduct", token, { productId })).body.error?.status).toBe("FAILED_PRECONDITION");
    await expect(page.getByRole("dialog", { name: productName })).toHaveCount(0);
  } finally {
    await db().doc("authz/uid-delivery").update({ sessionVersion: 1 });
  }
  // Merely assigning an admin role to a PIN/custom token does not satisfy the
  // production Google-identity requirement. This is an emulator auth token.
  const auth = getAuth(control());
  const unsigned = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const customToken = `${unsigned({ alg: "none", typ: "JWT" })}.${unsigned({ iss: "owner", sub: "owner", aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit", iat: now, exp: now + 3600, uid: "uid-admin", claims: (await auth.getUser("uid-admin")).customClaims })}.`;
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-api-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) });
  const payload = await response.json() as { idToken: string };
  expect((await call("updateInventorySettings", `Bearer ${payload.idToken}`, { requestId: randomUUID(), expectedRevision: 0, weekday: 5, urgentDays: 7 })).body.error?.status).toBe("PERMISSION_DENIED");
});
});

test("a staff member deactivates, reactivates and deletes stock with history while preserving an administrator audit trail", async ({ page }, info) => {
  const token = await login(page, PHASE3_TEST_PINS.delivery);
  const name = "직원 상태변경 검증 품목";
  await page.getByRole("button", { name: "새 품목 등록", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "새 품목 등록", exact: true });
  await editor.getByLabel(/품목명/).fill(name);
  await editor.getByRole("spinbutton", { name: "초기 수량 (필수) (낱개)", exact: true }).fill("20");
  await editor.getByLabel("첫 유통기한 날짜", { exact: true }).fill(expiryAfter(30));
  await submitMutation(page, editor, "품목 등록", "saveInventoryProduct");
  const detail = page.getByRole("dialog", { name, exact: true });
  const more = await openMore(page, detail);
  await expect(more.getByRole("button", { name: "비활성화", exact: true })).toBeEnabled();
  await expect(more.getByRole("button", { name: "품목 삭제", exact: true })).toBeEnabled();
  const records = await db().collection(INVENTORY_PRODUCT_PATH).where("name", "==", name).get();
  expect(records.size).toBe(1);
  const ref = records.docs[0]!.ref;
  await more.getByRole("button", { name: "비활성화", exact: true }).click();
  const status = page.getByRole("dialog", { name: "품목 비활성화", exact: true });
  await status.getByRole("textbox", { name: "처리 사유", exact: true }).fill("잠시 보관");
  await submitMutation(page, status, "품목 비활성화", "setInventoryProductStatus");
  await expect((await openMore(page, detail)).getByRole("button", { name: "다시 활성화", exact: true })).toBeEnabled();
  await page.goBack(); await expect(more).toHaveCount(0);
  expect((await ref.get()).get("quantityByLocation.refrigerated")).toBe(20);
  await detail.getByRole("button", { name: "닫기", exact: true }).click();
  const card = page.getByRole("button", { name: new RegExp(`${name}, .*상세 보기`) });
  await expect(card).toHaveCount(0);
  const listOptions = await openListOptions(page);
  await listOptions.getByRole("checkbox", { name: "비활성 품목 보기", exact: true }).check();
  await closeListOptions(listOptions);
  await expect(card).toBeVisible(); await card.click();
  await (await openMore(page, detail)).getByRole("button", { name: "다시 활성화", exact: true }).click();
  const reactivate = page.getByRole("dialog", { name: "품목 다시 활성화", exact: true });
  await submitMutation(page, reactivate, "품목 다시 활성화", "setInventoryProductStatus");
  await expect(detail.getByRole("button", { name: "입고", exact: true })).toBeEnabled();
  await (await openMore(page, detail)).getByRole("button", { name: "품목 삭제", exact: true }).click();
  const deletion = page.getByRole("dialog", { name: "품목 삭제", exact: true });
  await deletion.getByRole("textbox", { name: "처리 사유 (필수)", exact: true }).fill("중복 품목 정리");
  await capture(page, info, "staff-delete-confirmation-360");
  await submitMutation(page, deletion, "품목 삭제", "deleteInventoryProduct");
  await expect(detail).toHaveCount(0); await expect(card).toHaveCount(0);
  const saved = (await ref.get()).data()!;
  expect(saved.status).toBe("deleted"); expect(saved.hasHistory).toBe(true); expect(saved.quantityByLocation.refrigerated).toBe(20);
  expect((await ref.collection("lots").get()).docs[0]!.get("quantity")).toBe(20);
  expect((await ref.collection("events").get()).size).toBe(1);
  const audits = await db().collection("auditLogs").where("targetId", "==", ref.id).get();
  const deleted = audits.docs.filter((log) => log.get("eventType") === "INVENTORY_PRODUCT_DELETED");
  expect(deleted).toHaveLength(1);
  expect(deleted[0]!.get("actorEmployeeId")).toBe("EMP-DELIVERY");
  expect(deleted[0]!.get("inventoryStatusChange.productName")).toBe(name);
  expect(deleted[0]!.get("inventoryStatusChange.before.quantityByLocation.refrigerated")).toBe(20);
  expect(deleted[0]!.get("inventoryStatusChange.after.status")).toBe("deleted");
  expect((await call("getInventoryProduct", token, { productId: ref.id })).body.error?.status).toBe("NOT_FOUND");
  await expect(page.getByRole("status").filter({ hasText: "재고 정보를 저장했어요." })).toHaveCount(0, { timeout: 6_000 });
});

test("an offline registration draft stays in memory and saves only after an explicit retry online", async ({ page, context }, info) => {
  await login(page, PHASE3_TEST_PINS.salesA);
  const draftName = "연결 복구 검증 두부";
  const note = "연결이 끊겨도 유지할 입력";
  let saveRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/saveInventoryProduct")) saveRequests += 1;
  });
  await page.getByRole("button", { name: "새 품목 등록", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "새 품목 등록", exact: true });
  await editor.getByLabel(/품목명/).fill(draftName);
  await editor.getByRole("spinbutton", { name: "초기 수량 (필수) (낱개)", exact: true }).fill("1");
  const expiryChoices = editor.getByRole("group", { name: "유통기한 상태", exact: true });
  await expiryChoices.getByRole("radio", { name: "미확인", exact: true }).check();
  await expect(expiryChoices.getByRole("radio")).toHaveCount(2);
  await editor.locator("summary").filter({ hasText: "참고 메모 (선택)" }).click();
  const memo = editor.getByRole("textbox", { name: "메모", exact: true });
  await memo.fill(note);
  await editor.getByLabel("제품 사진 직접 촬영").setInputFiles({ name: "offline-draft.jpg", mimeType: "image/jpeg", buffer: firstPhoto });
  await expect(editor.getByRole("img", { name: "저장할 제품 사진 미리보기" })).toBeVisible();
  await captureOfflineAccessibility(page, info, "before-offline-accessibility");
  try {
    await context.setOffline(true);
    await expect(editor.getByRole("alert")).toContainText("이 창의 입력은 유지되며");
    await expect(editor.getByRole("button", { name: "품목 등록", exact: true })).toBeDisabled();
    await expect(editor.getByLabel(/품목명/)).toHaveValue(draftName);
    await expect(editor).toHaveAccessibleName("새 품목 등록");
    await expect(memo).toHaveAccessibleName("메모");
    await captureOfflineAccessibility(page, info, "during-offline-accessibility");
    // React mirrors a controlled textarea value into its text content. A raw
    // wrapping-label text match includes that content; its accessible name does not.
    try { await memo.fill(`${note} · 추가 메모`); }
    catch (error) { await captureOfflineAccessibility(page, info, "failed-offline-accessibility"); throw error; }
    await expect(editor.getByRole("img", { name: "저장할 제품 사진 미리보기" })).toBeVisible();
    await capture(page, info, "offline-draft-360");
    expect(saveRequests).toBe(0);
    expect((await db().collection(INVENTORY_PRODUCT_PATH).where("name", "==", draftName).get()).empty).toBe(true);

    // Reconnection refreshes live inventory, but must neither dismiss the draft
    // nor submit an offline command automatically behind the employee's back.
    const refreshed = page.waitForResponse((response) => response.request().method() === "POST"
      && new URL(response.url()).pathname.endsWith("/listInventoryProducts"), { timeout: 60_000 });
    await context.setOffline(false);
    expect((await refreshed).ok()).toBe(true);
    await expect(editor.getByRole("button", { name: "품목 등록", exact: true })).toBeEnabled();
    await expect(editor.getByLabel(/품목명/)).toHaveValue(draftName);
    await expect(memo).toHaveValue(`${note} · 추가 메모`);
    await expect(editor.getByRole("img", { name: "저장할 제품 사진 미리보기" })).toBeVisible();
    expect(saveRequests).toBe(0);
    expect((await db().collection(INVENTORY_PRODUCT_PATH).where("name", "==", draftName).get()).empty).toBe(true);
    await submitMutation(page, editor, "품목 등록", "saveInventoryProduct");
    await expect(page.getByRole("dialog", { name: draftName, exact: true })).toBeVisible();
    expect(saveRequests).toBe(1);
    const saved = await db().collection(INVENTORY_PRODUCT_PATH).where("name", "==", draftName).get();
    expect(saved.size).toBe(1);
    expect(saved.docs[0]!.get("note")).toBe(`${note} · 추가 메모`);
    expect(saved.docs[0]!.get("photo.photoId")).toBeTruthy();
    const persisted = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
    expect(persisted).not.toContain(draftName);
    expect(persisted).not.toContain(note);
  } finally {
    await context.setOffline(false);
  }
});

test("all locations sum one product and require each location's count, with progress only on the configured count day", async ({ page }, info) => {
  assertInventoryE2EEnvironment();
  const settingsRef = db().doc(INVENTORY_SETTINGS_PATH);
  const originalSettings = await settingsRef.get();
  const today = expiryAfter(0);
  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  const settings = inventorySettingsSchema.parse({ weekday, urgentDays: 100, revision: 0,
    pendingWeekday: null, effectiveDate: null, pendingCycleStartDate: null, updatedAt: null, updatedBy: null });
  const fixtureId = "inventory-multi-location-e2e";
  const fixtureName = "여러 구역 합산 검증 상품";
  const now = new Date().toISOString();
  const fixture = inventoryProductSchema.parse({
    productId: fixtureId, companyId: "onnuri", name: fixtureName, manufacturer: "합산 검증", specification: "1kg", origin: "대한민국", note: "",
    unitLabel: "봉", unitsPerBox: 12, defaultLocationId: "refrigerated", urgent: false,
    status: "active", revision: 1, stockRevision: 1, hasHistory: true,
    quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 5, freezer1: 7 },
    nearestExpiryByLocation: { ...inventoryLocationMap(null), refrigerated: expiryAfter(20), freezer1: expiryAfter(4) },
    lastCountByLocation: inventoryLocationMap(null), photo: null,
    createdAt: now, updatedAt: now, createdBy: "EMP-SALES-A", updatedBy: "EMP-SALES-A",
  });
  const productRef = db().doc(`${INVENTORY_PRODUCT_PATH}/${fixtureId}`);
  const batch = db().batch();
  batch.set(settingsRef, settings);
  batch.create(productRef, fixture);
  for (const locationId of ["refrigerated", "freezer1"] as const) {
    const lotId = `multi-${locationId}`;
    batch.create(productRef.collection("lots").doc(lotId), inventoryLotSchema.parse({
      lotId, originLotId: lotId, productId: fixtureId, locationId, label: "",
      expiryState: "dated", expiryDate: fixture.nearestExpiryByLocation[locationId],
      quantity: fixture.quantityByLocation[locationId], revision: 1, createdAt: now, updatedAt: now,
    }));
  }
  await batch.commit();
  try {
    await login(page, PHASE3_TEST_PINS.salesA);
    const locations = page.getByRole("group", { name: "보관 장소", exact: true });
    await expect(locations.getByRole("button", { name: "전체", exact: true })).toHaveAttribute("aria-pressed", "true");
    const card = page.getByRole("button", { name: `${fixtureName}, 12 봉, 상세 보기`, exact: true });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("냉장/냉동1");
    await expect(card).toContainText("D-4");
    const article = page.locator("article").filter({ has: card });
    await expect(article).toHaveAttribute("data-count-state", "pending");
    await expect(article).toHaveAttribute("data-count-highlight", "pending");
    const progress = page.getByRole("progressbar");
    await expect(page.getByText("오늘은 재고조사일", { exact: true })).toBeVisible();
    const initialComplete = await progress.evaluate((element) => (element as HTMLProgressElement).value);
    await capture(page, info, "all-locations-before-count-360");
    let listOptions = await openListOptions(page);
    await expect(listOptions.getByRole("switch", { name: "재고조사 모드", exact: true })).not.toBeChecked();
    await listOptions.getByRole("switch", { name: "재고조사 모드", exact: true }).check();
    await closeListOptions(listOptions);
    await card.click();
    let detail = page.getByRole("dialog", { name: fixtureName, exact: true });
    await expect(detail.getByRole("combobox", { name: "상세 보관 장소", exact: true })).toHaveValue("refrigerated");
    await expect(detail.getByRole("combobox", { name: "상세 보관 장소", exact: true }).getByRole("option")).toHaveCount(2);
    await detail.getByRole("button", { name: "수량 일치 확인", exact: true }).click();
    const firstCount = page.getByRole("dialog", { name: "실물 수량 확인", exact: true });
    await expectReadOnlyCount(firstCount, 1);
    await capture(page, info, "single-lot-match-only-360");
    await submitMutation(page, firstCount, "일치 확인", "recordInventoryCount");
    // Firestore stores Timestamp objects; callable wire timestamps are already
    // schema-validated in submitMutation. Inspect the stored stock/count fields.
    let stored = (await productRef.get()).data() as InventoryProduct;
    expect(stored.lastCountByLocation.refrigerated?.cycleId).toBe(`week-${today}`);
    expect(stored.lastCountByLocation.freezer1).toBeNull();
    expect(stored.quantityByLocation).toEqual(fixture.quantityByLocation);
    await detail.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(card).toHaveCount(1);
    await expect(article).toHaveAttribute("data-count-state", "pending");
    await expect(progress).toHaveJSProperty("value", initialComplete);
    await locations.getByRole("button", { name: "냉장", exact: true }).click();
    const refrigerated = page.getByRole("button", { name: `${fixtureName}, 5 봉, 상세 보기`, exact: true });
    await expect(page.locator("article").filter({ has: refrigerated })).toHaveAttribute("data-count-state", "done");
    await locations.getByRole("button", { name: "전체", exact: true }).click();
    await card.click();
    detail = page.getByRole("dialog", { name: fixtureName, exact: true });
    await detail.getByRole("combobox", { name: "상세 보관 장소", exact: true }).selectOption("freezer1");
    await detail.getByRole("button", { name: "수량 일치 확인", exact: true }).click();
    const secondCount = page.getByRole("dialog", { name: "실물 수량 확인", exact: true });
    await expectReadOnlyCount(secondCount, 1);
    await submitMutation(page, secondCount, "일치 확인", "recordInventoryCount");
    stored = (await productRef.get()).data() as InventoryProduct;
    expect(stored.lastCountByLocation.freezer1?.cycleId).toBe(`week-${today}`);
    expect(stored.quantityByLocation).toEqual(fixture.quantityByLocation);
    await detail.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(article).toHaveAttribute("data-count-state", "done");
    await expect(article).toHaveAttribute("data-count-highlight", "done");
    await expect(progress).toHaveJSProperty("value", initialComplete + 1);
    await capture(page, info, "all-locations-completed-360");
    const events = await productRef.collection("events").get();
    expect(events.docs.map((doc) => doc.data().kind)).toEqual(["count_match", "count_match"]);

    // A warm remount must show the snapshot without a context/list request.
    // Then simulate a real reconnect to force the changed demo configuration.
    await settingsRef.set({ ...settings, weekday: (weekday + 1) % 7, revision: 1 });
    listOptions = await openListOptions(page);
    await listOptions.getByRole("switch", { name: "재고조사 모드", exact: true }).uncheck();
    await closeListOptions(listOptions);
    await chooseMode(page, "sales");
    let warmContextRequests = 0;
    const countWarmContext = (request: Request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/getInventoryContext")) warmContextRequests += 1;
    };
    page.on("request", countWarmContext);
    await chooseMode(page, "inventory");
    await expect(card).toHaveCount(1);
    await page.waitForTimeout(150);
    expect(warmContextRequests).toBe(0);
    page.off("request", countWarmContext);

    const refreshed = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/getInventoryContext"));
    await page.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      window.dispatchEvent(new Event("offline"));
      Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
      window.dispatchEvent(new Event("online"));
    });
    expect((await refreshed).ok()).toBe(true);
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await expect(page.getByText("오늘은 재고조사일", { exact: true })).toHaveCount(0);
    await expect(article).toHaveAttribute("data-count-highlight", "neutral");
    await capture(page, info, "all-locations-non-count-day-360");
  } finally {
    if (originalSettings.exists) await settingsRef.set(originalSettings.data()!);
    else await settingsRef.delete();
  }
});

for (const scenario of [
  { key: "scheduled-auto", scheduled: true, manual: false },
  { key: "weekday-off", scheduled: false, manual: false },
  { key: "weekday-on", scheduled: false, manual: true },
]) test(`lot-level movement confirmation: ${scenario.key}`, async ({ page }, info) => {
  assertInventoryE2EEnvironment();
  const settingsRef = db().doc(INVENTORY_SETTINGS_PATH);
  const previousSettings = await settingsRef.get();
  const today = expiryAfter(0);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  // Exercise the same branch as the default Friday without changing a live
  // server clock or requiring this test suite to run on a particular weekday.
  const settings = inventorySettingsSchema.parse({ weekday: scenario.scheduled ? weekday : (weekday + 6) % 7, urgentDays: 100, revision: 0,
    pendingWeekday: null, effectiveDate: null, pendingCycleStartDate: null, updatedAt: null, updatedBy: null });
  const fixtureId = `inventory-inspection-${scenario.key}`;
  const name = `날짜별 실사 검증 ${scenario.key}`;
  const oldDate = `${expiryAfter(-10)}T00:00:00.000Z`;
  const fixture = inventoryProductSchema.parse({
    productId: fixtureId, companyId: "onnuri", name, manufacturer: "실사 검증", specification: "1kg", origin: "대한민국", note: "",
    unitLabel: "봉", unitsPerBox: 1, defaultLocationId: "refrigerated", urgent: false, status: "active", revision: 1, stockRevision: 1, hasHistory: true,
    quantityByLocation: { ...inventoryLocationMap(0), refrigerated: 12 }, nearestExpiryByLocation: { ...inventoryLocationMap(null), refrigerated: expiryAfter(10) },
    lastCountByLocation: inventoryLocationMap(null), photo: null,
    lotSummary: { all: { lotCount: 2, expiryCount: 2 }, byLocation: { ...inventoryLocationMap({ lotCount: 0, expiryCount: 0 }), refrigerated: { lotCount: 2, expiryCount: 2 } } },
    createdAt: oldDate, updatedAt: oldDate, createdBy: "EMP-SALES-A", updatedBy: "EMP-SALES-A",
  });
  const ref = db().doc(`${INVENTORY_PRODUCT_PATH}/${fixtureId}`);
  const batch = db().batch(); batch.set(settingsRef, settings); batch.create(ref, fixture);
  for (const [index, quantity] of [5, 7].entries()) {
    const lotId = `${fixtureId}-${index}`;
    batch.create(ref.collection("lots").doc(lotId), inventoryLotSchema.parse({ lotId, originLotId: lotId, productId: fixtureId, locationId: "refrigerated", label: "",
      expiryState: "dated", expiryDate: expiryAfter(index === 0 ? 10 : 20), quantity, revision: 1, createdAt: oldDate, updatedAt: oldDate }));
  }
  const newName = `조사일 이후 신상품 ${scenario.key}`;
  if (!scenario.scheduled) batch.create(db().doc(`${INVENTORY_PRODUCT_PATH}/${fixtureId}-new`), { ...fixture,
    productId: `${fixtureId}-new`, name: newName, createdAt: new Date().toISOString(), quantityByLocation: inventoryLocationMap(0),
    nearestExpiryByLocation: inventoryLocationMap(null), lotSummary: { all: { lotCount: 0, expiryCount: 0 }, byLocation: inventoryLocationMap({ lotCount: 0, expiryCount: 0 }) } });
  await batch.commit();
  try {
    await login(page, PHASE3_TEST_PINS.salesA);
    const listOptions = await openListOptions(page);
    const mode = listOptions.getByRole("switch", { name: "재고조사 모드", exact: true });
    await expect(mode).not.toBeChecked();
    if (scenario.manual) await mode.check();
    await closeListOptions(listOptions);
    expect((await settingsRef.get()).data(), "personal inspection mode must not alter the team's scheduled count day").toEqual(settings);
    const card = page.getByRole("button", { name: new RegExp(`^${name}, .*상세 보기$`) });
    const article = page.locator("article").filter({ has: card });
    await expect(card.getByText(/유통기한별 수량/)).toHaveText("유통기한별 수량 2");
    await expect(article).toHaveAttribute("data-count-highlight", scenario.scheduled || scenario.manual ? "pending" : "neutral");
    if (!scenario.scheduled) {
      const fresh = page.getByRole("button", { name: `${newName}, 0 봉, 상세 보기`, exact: true });
      await expect(fresh).toBeVisible();
      await expect(fresh.getByText("미확인", { exact: true })).toHaveCount(0);
      await expect(page.locator("article").filter({ has: fresh })).toHaveAttribute("data-count-highlight", "neutral");
    }
    await card.click();
    const detail = page.getByRole("dialog", { name, exact: true });
    if (!scenario.manual) await expect(detail.getByRole("button", { name: "수량 일치 확인", exact: true })).toBeDisabled();
    await detail.getByRole("button", { name: `${expiryAfter(10).replaceAll("-", ".")} 유통기한 수정`, exact: true }).click();
    const lotEditor = page.getByRole("dialog", { name: "유통기한 수정", exact: true });
    await lotEditor.getByRole("button", { name: "조정", exact: true }).click();
    const adjust = page.getByRole("dialog", { name: "수량 조정", exact: true });
    await expect(adjust.getByRole("combobox")).toHaveCount(0);
    await expect(adjust.getByRole("textbox", { name: /사유|메모/ })).toHaveCount(0);
    await adjust.getByRole("spinbutton", { name: "조정 후 최종 수량 (봉)", exact: true }).fill("4");
    const first = await submitMutation(page, adjust, "수량 조정", "recordInventoryMovement");
    expect(first.input.lotId).toBe(`${fixtureId}-0`); expect(first.input.reason).toBe("");
    expect(first.input.inspectionCycleId).toBe(scenario.manual ? `week-${expiryAfter(-1)}` : undefined);
    let saved = (await ref.get()).data()!;
    expect(saved.quantityByLocation.refrigerated).toBe(11);
    expect(saved.lastCountByLocation.refrigerated, "one changed date must not confirm the other date").toBeNull();
    if (scenario.scheduled || scenario.manual) expect(saved.inspectionByLot[`${fixtureId}-0`].quantity).toBe(4);
    else expect(saved.inspectionByLot?.[`${fixtureId}-0`]).toBeUndefined();
    await detail.getByRole("button", { name: `${expiryAfter(20).replaceAll("-", ".")} 유통기한 수정`, exact: true }).click();
    await lotEditor.getByRole("button", { name: "입고", exact: true }).click();
    const receive = page.getByRole("dialog", { name: "입고 기록", exact: true });
    await expect(receive.getByRole("combobox")).toHaveCount(0);
    await receive.getByRole("spinbutton", { name: "입고 수량 (봉)", exact: true }).fill("1");
    const second = await submitMutation(page, receive, "입고 기록", "recordInventoryMovement");
    expect(second.input.lotId).toBe(`${fixtureId}-1`); expect(second.input.newLot).toBeUndefined();
    saved = (await ref.get()).data()!; expect(saved.quantityByLocation.refrigerated).toBe(12);
    if (scenario.scheduled || scenario.manual) {
      expect(saved.lastCountByLocation.refrigerated.cycleId).toBe(`week-${scenario.scheduled ? today : expiryAfter(-1)}`);
      expect(saved.lastCountByLocation.refrigerated.stockChangedSinceCount).toBe(false);
      await expect(detail.getByText("이번 주 확인", { exact: true })).toBeVisible();
    } else {
      expect(saved.lastCountByLocation.refrigerated).toBeNull();
      await expect(detail.getByText("이번 주 확인", { exact: true })).toHaveCount(0);
    }
    await detail.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(article).toHaveAttribute("data-count-highlight", scenario.scheduled || scenario.manual ? "done" : "neutral");
    await capture(page, info, `inspection-${scenario.key}-360`);
    const events = await ref.collection("events").get();
    expect(events.docs.map((event) => event.get("kind")).sort()).toEqual(["adjust", "receive"]);
  } finally {
    if (previousSettings.exists) await settingsRef.set(previousSettings.data()!);
    else await settingsRef.delete();
  }
});

test("a 1,000-product catalog fetches every server page while rendering 60 rows at a time", async ({ page }, info) => {
  assertInventoryE2EEnvironment();
  const prefix = "inventory-catalog-e2e-";
  const catalog = Array.from({ length: 1_000 }, (_, index) => {
    const number = String(index + 1).padStart(4, "0");
    return inventoryProductSchema.parse({
      productId: `${prefix}${number}`, companyId: "onnuri", name: `카탈로그 검증 제품 ${number}`,
      manufacturer: "대량 목록 검증 제조사", specification: "1kg", origin: "대한민국", note: "",
      unitLabel: "봉", unitsPerBox: 8, defaultLocationId: "freezer2", urgent: false,
      status: "active", revision: 1, stockRevision: 0, hasHistory: false,
      quantityByLocation: inventoryLocationMap(0), nearestExpiryByLocation: inventoryLocationMap(null),
      lastCountByLocation: inventoryLocationMap(null), photo: null,
      createdAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-10T00:00:00.000Z",
      createdBy: "EMP-SALES-C", updatedBy: "EMP-SALES-C",
    });
  });
  // Populate only the dedicated demo emulator. Actual app reads still pass
  // through authenticated production callables and their real page cursors.
  for (let offset = 0; offset < catalog.length; offset += 400) {
    const batch = db().batch();
    for (const product of catalog.slice(offset, offset + 400)) batch.create(db().doc(`${INVENTORY_PRODUCT_PATH}/${product.productId}`), product);
    await batch.commit();
  }
  const pageDelayMs = 150;
  await page.route("**/listInventoryProducts", async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, pageDelayMs));
    await route.fulfill({ response });
  });
  const responses: Array<Promise<{ order: number; afterId: string | null; nextCursor: string | null; page: ReturnType<typeof inventoryListPageSchema.parse> }>> = [];
  const requestOrder = new Map<Request, number>();
  let roots = 0;
  let terminalPages = 0;
  let firstCatalogRequestAt = 0;
  page.on("request", (request) => {
    if (request.method() !== "POST" || !new URL(request.url()).pathname.endsWith("/listInventoryProducts")) return;
    if (!firstCatalogRequestAt) firstCatalogRequestAt = Date.now();
    requestOrder.set(request, requestOrder.size);
    const input = request.postDataJSON() as { data: { afterId: string | null } };
    if (input.data.afterId === null) roots += 1;
  });
  page.on("response", (response) => {
    if (response.request().method() !== "POST" || !new URL(response.url()).pathname.endsWith("/listInventoryProducts")) return;
    responses.push((async () => {
      expect(response.ok()).toBe(true);
      const body = await response.json() as { result?: unknown; data?: unknown };
      const input = response.request().postDataJSON() as { data: { afterId: string | null } };
      expect(response.request().postDataJSON().data.includeSummary).toBe(true);
      const result = inventoryListPageSchema.parse(body.result ?? body.data);
      if (result.nextCursor === null) terminalPages += 1;
      return { order: requestOrder.get(response.request())!, afterId: input.data.afterId, nextCursor: result.nextCursor, page: result };
    })());
  });
  await login(page, PHASE3_TEST_PINS.salesC);
  await page.getByRole("group", { name: "보관 장소", exact: true }).getByRole("button", { name: "냉동2", exact: true }).click();
  const cards = page.getByRole("button", { name: /^카탈로그 검증 제품 \d{4}, .*상세 보기$/ });
  await expect(cards).toHaveCount(60);
  const firstPageUsableMs = Date.now() - firstCatalogRequestAt;
  expect(terminalPages).toBe(0);
  const progressiveSearch = page.getByRole("searchbox", { name: "품목 검색", exact: true });
  await progressiveSearch.fill("카탈로그 검증 제품 0001");
  await expect(cards).toHaveCount(1);
  await progressiveSearch.fill("");
  await info.attach("catalog-1000-progressive-timing", { body: JSON.stringify({ pageDelayMs, firstPageUsableMs }), contentType: "application/json" });
  await expect(page.getByText("1,000개 품목", { exact: true })).toBeVisible();
  // Development StrictMode starts two overlapping effects. Verify every
  // independent list to completion instead of assuming one global response order.
  await expect.poll(() => terminalPages, { timeout: 30_000 }).toBe(roots);
  const pages = (await Promise.all(responses)).sort((a, b) => a.order - b.order);
  const sequences = groupInventoryE2EPageSequences(pages);
  expect(sequences).toHaveLength(roots);
  for (const sequence of sequences) {
    expect(sequence.length).toBeGreaterThanOrEqual(10);
    const ids = sequence.flatMap((response) => response.page.products.map((product) => product.productId)).filter((id) => id.startsWith(prefix));
    expect(ids).toHaveLength(1_000);
    expect(new Set(ids).size).toBe(1_000);
    expect(ids).toEqual(catalog.map((product) => product.productId));
  }

  await expect(cards).toHaveCount(60);
  await captureInventoryList(page, info, "catalog-1000-initial-360");
  await verifyFloatingAction(page, cards, info, "catalog-1000-floating-360");
  const requestCount = responses.length;
  await page.getByRole("button", { name: "품목 더 보기", exact: true }).click();
  await expect(cards).toHaveCount(120);
  // The final product is searchable even when its card has never been rendered.
  await page.getByRole("searchbox", { name: "품목 검색", exact: true }).fill("카탈로그 검증 제품 1000");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAccessibleName("카탈로그 검증 제품 1000, 0 봉, 상세 보기");
  await expect(page.getByRole("button", { name: "품목 더 보기", exact: true })).toHaveCount(0);
  await verifyFloatingAction(page, cards, info, "catalog-filtered-floating-360");
  await cards.first().click();
  const detail = page.getByRole("dialog", { name: "카탈로그 검증 제품 1000", exact: true });
  for (const value of ["대량 목록 검증 제조사", "1kg", "대한민국"]) await expect(detail.locator("dd").filter({ hasText: value })).toBeVisible();
  await detail.getByRole("button", { name: "닫기", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "품목 검색", exact: true });
  await search.fill("카탈로그");
  await expect(cards).toHaveCount(60);
  await page.getByRole("button", { name: "품목 더 보기", exact: true }).click();
  await expect(cards).toHaveCount(120);
  const savedScrollTop = await page.locator(".workspace-content").evaluate((element) => {
    element.scrollTop = 600; element.dispatchEvent(new Event("scroll")); return element.scrollTop;
  });
  expect(savedScrollTop).toBeGreaterThan(0);
  const warmRequestCount = responses.length;
  await chooseMode(page, "sales");
  await chooseMode(page, "inventory");
  await expect(search).toHaveValue("카탈로그");
  await expect(page.getByRole("group", { name: "보관 장소", exact: true }).getByRole("button", { name: "냉동2", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(cards).toHaveCount(120);
  await expect.poll(() => page.locator(".workspace-content").evaluate((element) => element.scrollTop)).toBe(savedScrollTop);
  await page.waitForTimeout(150);
  expect(responses).toHaveLength(warmRequestCount);
  expect(responses).toHaveLength(requestCount);
  for (const width of [768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await captureInventoryList(page, info, `catalog-1000-${width}`);
    await verifyFloatingAction(page, cards, info, `catalog-1000-floating-${width}`);
  }
});
