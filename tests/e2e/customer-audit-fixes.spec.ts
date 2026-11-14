import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { buildInventoryPhotoFixture } from "../helpers/build-inventory-photo-fixture";
import type {} from "./fixtures/customer-audit-fixes";

let fixture: Awaited<ReturnType<typeof buildInventoryPhotoFixture>>;
test.beforeAll(async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const mocks: Record<string, string> = {
    "firebase-client": "export const getFirebaseClientServices=()=>window.customerAudit.services;export const getFirebaseAuthIfInitialized=()=>window.customerAudit.services.auth;",
    "firebase/functions": "export const httpsCallable=(_functions,name)=>(input)=>window.customerAudit.call(name,input);",
    "firebase/auth": "export const onAuthStateChanged=(auth,listener)=>{queueMicrotask(()=>listener(auth.currentUser));return ()=>{}};",
    "client-only": "export {};",
    "auth-context": "export const useAuth=()=>({state:{status:'authenticated',session:window.customerAudit.session}});",
    "customer-map": "export default function CustomerMap(){return <div>합성 지도</div>}export {CustomerMap};",
    "customer-photo-repository": "export const customerPhotoRepository=new Proxy({},{get:()=>async()=>{throw Error('Unexpected fixture photo request')}});export const customerPhotoErrorMessage=()=>'';export const isCustomerPhotoStageError=()=>false;",
    "private-client-state": "export const registerPrivateBlobUrl=url=>url;export const forgetPrivateBlobUrl=url=>URL.revokeObjectURL(url);",
    "delivery-photo-customer-section": "export default function DeliveryPhotoCustomerSection(){return null}",
    "initial-workspace-timing": "export const useInitialWorkspaceStartedAt=()=>null;",
  };
  fixture = await buildInventoryPhotoFixture("tests/e2e/fixtures/customer-audit-fixes.tsx", [{ name: "customer-audit-isolation", setup(builder) {
    builder.initialOptions.define = { ...builder.initialOptions.define, "process.env.NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS": '"false"' };
    builder.onResolve({ filter: /(^firebase\/(functions|auth)$)|(^client-only$)|auth-context$|customer-map$|customer-photo-repository$|private-client-state$|delivery-photo-customer-section$|initial-workspace-timing$|(^@\/lib\/firebase\/client$)/ }, (args) => ({ path: args.path === "@/lib/firebase/client" ? "firebase-client" : mocks[args.path] ? args.path : args.path.split("/").at(-1)!, namespace: "customer-audit" }));
    builder.onLoad({ filter: /.*/, namespace: "customer-audit" }, ({ path }) => ({ contents: mocks[path]!, loader: "tsx", resolveDir: root }));
  } }]);
});

async function open(page: Page, admin = false) {
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://customer-audit.test") { external.push(url.href); return route.abort(); }
    if (url.pathname.startsWith("/ui/") || url.pathname.startsWith("/brand/")) return route.fulfill({ contentType: url.pathname.endsWith(".svg") ? "image/svg+xml" : "image/png", body: readFileSync(new URL(`../../public${url.pathname}`, import.meta.url)) });
    if (url.pathname !== "/") return route.abort();
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>거래처 회귀 확인</title><style>${fixture.css}</style></head><body><div id="root"></div><script>${fixture.script.replaceAll("</script>", "<\\/script>")}</script></body></html>` });
  });
  await page.goto(`http://customer-audit.test/${admin ? "?admin=1" : ""}`);
  await expect(page.locator('[data-freshness="fresh"]')).toHaveCount(1);
  return { errors, external };
}

async function evidence(page: Page, name: string) {
  const directory = "output/mode-fixes-20261114/customers";
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
}

test("resolved administrative filters stay aligned and reopening reuses the same lookup", async ({ page }, info) => {
  const diagnostics = await open(page);
  await page.getByRole("button", { name: "전체보기", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.customerAudit.pendingRegions.length)).toBe(1);
  const directory = page.locator("[data-customer-directory]");
  await directory.getByRole("combobox", { name: "행정동", exact: true }).selectOption("행정동 미확인");
  await expect(directory.locator("[data-customer-card]")).toHaveCount(1);
  await page.evaluate(() => window.customerAudit.resolveRegions());
  await expect(directory.getByRole("combobox", { name: "행정동", exact: true })).toHaveValue("");
  await expect(directory.locator("[data-customer-card]")).toHaveCount(1);
  await expect(directory.getByRole("heading", { name: "전체 거래처", exact: true })).toBeVisible();
  await expect(directory.getByRole("button", { name: "선택 초기화", exact: true })).toHaveCount(0);
  await evidence(page, `valid-region-${info.project.name}`);
  await page.keyboard.press("Escape");
  await expect(directory).toHaveCount(0);
  await page.getByRole("button", { name: "전체보기", exact: true }).click();
  await expect(directory.locator("[data-customer-card]")).toHaveCount(1);
  await expect(directory.getByRole("combobox", { name: "행정동", exact: true }).locator("option[value='둔산2동']")).toHaveCount(1);
  expect(await page.evaluate(() => window.customerAudit.calls.filter((call) => call.name === "reverseCustomerLocation").length)).toBe(1);
  expect(diagnostics).toEqual({ errors: [], external: [] });
});

test("a removed district no longer hides refreshed customers", async ({ page }) => {
  const diagnostics = await open(page);
  await page.getByRole("button", { name: "전체보기", exact: true }).click();
  const directory = page.locator("[data-customer-directory]");
  await directory.getByRole("button", { name: /^대전광역시 서구\s*1$/ }).click();
  await page.evaluate(() => {
    const audit = window.customerAudit;
    audit.resolveRegions();
    audit.customers = audit.customers.map((customer) => ({ ...customer, district: "유성구", administrativeDong: "온천1동", deliveryAddress: "대전광역시 유성구 합성로 2" }));
    audit.nowOffset = 61_000;
    window.dispatchEvent(new Event("focus"));
  });
  await expect(directory.getByRole("button", { name: /^대전광역시 유성구\s*1$/ })).toBeVisible();
  await expect(directory.getByRole("button", { name: /^전체\s*1$/ })).toHaveAttribute("aria-pressed", "true");
  await expect(directory.getByRole("heading", { name: "전체 거래처", exact: true })).toBeVisible();
  await expect(directory.locator("[data-customer-card]")).toHaveCount(1);
  expect(diagnostics).toEqual({ errors: [], external: [] });
});

for (const admin of [false, true]) test(`${admin ? "admin" : "workspace"} retains drafts and shows stale data, last check, and a working retry`, async ({ page }, info) => {
  const diagnostics = await open(page, admin);
  await page.getByRole("button", { name: "거래처 등록", exact: true }).click();
  const editor = page.locator("[data-customer-editor]");
  await editor.locator('[name="name"]').fill("작성 중 합성 거래처");
  await page.evaluate(() => { window.customerAudit.listFailure = true; window.customerAudit.nowOffset = 61_000; window.dispatchEvent(new Event("focus")); });
  await expect(editor.getByRole("status")).toContainText("작성 중인 내용은 유지됩니다");
  await expect(editor.locator('[name="name"]')).toHaveValue("작성 중 합성 거래처");
  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  if (!admin) {
    await page.getByRole("button", { name: "이름으로 찾기", exact: true }).click();
    await page.getByRole("searchbox", { name: "거래처명 또는 초성 검색", exact: true }).fill("합성감사");
    await expect(page.locator("[data-customer-card]")).toHaveCount(1);
  }
  const freshness = page.locator('[data-freshness="stale-error"]');
  await expect(freshness).toContainText("갱신 실패 · 기존 정보 표시 · 마지막 확인");
  await expect(page.getByRole("button", { name: admin ? "합성감사 거래처 수정" : "합성감사 거래처 상세 정보", exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await evidence(page, `visible-refresh-failure-${admin ? "admin" : "workspace"}-${info.project.name}`);
  await page.evaluate(() => { window.customerAudit.listFailure = false; window.customerAudit.holdList = true; });
  await freshness.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await expect(page.locator('[data-freshness="refreshing"]')).toContainText("최신 정보 확인 중");
  await expect.poll(() => page.evaluate(() => window.customerAudit.pendingLists.length)).toBe(1);
  await page.evaluate(() => { for (const resolve of window.customerAudit.pendingLists.splice(0)) resolve(); });
  await expect(page.locator('[data-freshness="fresh"]')).toContainText("마지막 확인");
  await expect(page.getByRole("button", { name: "다시 불러오기", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.customerAudit.calls.every((call) => ["listCustomers", "reverseCustomerLocation"].includes(call.name)))).toBe(true);
  expect(diagnostics).toEqual({ errors: [], external: [] });
});
