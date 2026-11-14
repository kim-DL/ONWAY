import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { buildInventoryPhotoFixture } from "../helpers/build-inventory-photo-fixture";
import type { InventoryAuditFixes } from "./fixtures/inventory-audit-fixes";

let fixture: Awaited<ReturnType<typeof buildInventoryPhotoFixture>>;
test.beforeAll(async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  fixture = await buildInventoryPhotoFixture("tests/e2e/fixtures/inventory-audit-fixes.tsx", [{ name: "inventory-audit-fixes", setup(builder) {
    builder.onResolve({ filter: /^client-only$|^firebase\/functions$|^@\/lib\/firebase\/client$|\/auth-context$|inventory-manufacturer-repository$/ }, ({ path }) => ({ path, namespace: "inventory-audit-fixes" }));
    builder.onLoad({ filter: /.*/, namespace: "inventory-audit-fixes" }, ({ path }) => ({ loader: "js", resolveDir: root, contents:
      path === "client-only" ? ""
        : path === "firebase/functions" ? "export const httpsCallable = (_functions,name) => input => window.__inventoryAuditFixes.invoke(name,input);"
          : path === "@/lib/firebase/client" ? "export const getFirebaseClientServices = () => ({auth:{currentUser:{uid:'synthetic-employee'}},functions:{}});"
            : path.endsWith("auth-context") ? "export const useAuth = () => ({state:{status:'authenticated',session:{uid:'synthetic-employee',claims:{sessionVersion:1,permissionsVersion:1}}}});"
              : `const items=[{manufacturerId:'m-a',name:'합성 제조사 A',normalizedName:'합성제조사a',active:true},{manufacturerId:'m-b',name:'합성 제조사 B',normalizedName:'합성제조사b',active:true}];
export const inventoryManufacturerRepository={cached:()=>items,list:async()=>items,reference:async()=>{window.__inventoryAuditFixes.referenceCalls++;return {product:{manufacturer:items[0].name,manufacturerId:items[0].manufacturerId}}},saveProduct:async()=>{throw Error('writes forbidden')},create:async()=>{throw Error('writes forbidden')},update:async()=>{throw Error('writes forbidden')}};`,
    }));
  } }]);
});

async function open(page: Page, scenario: string) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => new URL(route.request().url()).origin === "https://inventory-audit-fixes.test"
    ? route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>합성 재고 회귀 검사</title><style>${fixture.css}</style><div id="root"></div><script>${fixture.script.replaceAll("</script>", "<\\/script>")}</script></html>` })
    : route.abort());
  await page.goto(`https://inventory-audit-fixes.test/?scenario=${scenario}`);
  return errors;
}
async function saveEvidence(page: Page, testInfo: TestInfo, result: Record<string, unknown>) {
  await writeFile(testInfo.outputPath("result.json"), JSON.stringify({ ...result, outcome: "PASS", liveServicesUsed: false }, null, 2));
  await writeFile(testInfo.outputPath("page.txt"), await page.locator("body").ariaSnapshot());
}

test("reopening an existing product keeps a pending manufacturer and an explicit clear", async ({ page }, testInfo) => {
  const errors = await open(page, "manufacturer");
  await page.getByRole("button", { name: "합성 제조사 A", exact: true }).click();
  await expect(page.getByRole("option", { name: "합성 제조사 A", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("option", { name: "합성 제조사 B", exact: true }).click();
  await page.getByRole("button", { name: "합성 제조사 B", exact: true }).click();
  await expect(page.getByRole("option", { name: "합성 제조사 B", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option", { name: "합성 제조사 A", exact: true })).toHaveAttribute("aria-selected", "false");
  await page.screenshot({ path: testInfo.outputPath("manufacturer-pending-selection.png"), fullPage: true });
  await page.getByRole("option", { name: "제조사 없음", exact: true }).click();
  await page.getByRole("button", { name: "제조사 선택하기", exact: true }).click();
  await expect(page.getByRole("option", { name: "제조사 없음", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option", { name: "합성 제조사 A", exact: true })).toHaveAttribute("aria-selected", "false");
  const referenceCalls = await page.evaluate(() => window.__inventoryAuditFixes.referenceCalls);
  expect(referenceCalls).toBe(1);
  expect(errors).toEqual([]);
  await saveEvidence(page, testInfo, { referenceCalls, pendingSelection: "B", afterClear: "none", errors });
});

test("a failed combined catalog load stops before another page request", async ({ page }, testInfo) => {
  const errors = await open(page, "failed-context");
  await expect(page.getByRole("alert").filter({ hasText: "재고 정보를 처리하지 못했어요." })).toBeVisible();
  await page.evaluate(async () => {
    window.__inventoryAuditFixes.releaseFirstPage!();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  const calls: InventoryAuditFixes["calls"] = await page.evaluate(() => window.__inventoryAuditFixes.calls);
  expect(calls.filter((call) => call.name === "getInventoryContext")).toHaveLength(1);
  expect(calls.filter((call) => call.name === "listInventoryProducts")).toHaveLength(1);
  await expect(page.getByRole("button", { name: /page-\d, .*상세 보기/ })).toHaveCount(0);
  expect(errors).toEqual([]);
  await saveEvidence(page, testInfo, { calls, visibleProductCards: 0, errors });
});

test("an ordinary inventory reentry shares the pending traversal through its last page", async ({ page }, testInfo) => {
  const errors = await open(page, "reentry");
  await expect(page.getByRole("button", { name: /page-1, .*상세 보기/ })).toBeVisible();
  await page.waitForFunction(() => window.__inventoryAuditFixes.releaseSecondPage !== null);
  await page.getByRole("button", { name: "재고 화면 나가기" }).click();
  await expect(page.getByText("다른 화면", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "재고 화면 다시 열기" }).click();
  await page.evaluate(() => window.__inventoryAuditFixes.releaseSecondPage!());
  for (const id of ["page-1", "page-2", "page-3"]) await expect(page.getByRole("button", { name: new RegExp(`${id}, .*상세 보기`) })).toBeVisible();
  const calls: InventoryAuditFixes["calls"] = await page.evaluate(() => window.__inventoryAuditFixes.calls);
  expect(calls.filter((call) => call.name === "getInventoryContext")).toHaveLength(1);
  expect(calls.filter((call) => call.name === "listInventoryProducts").map((call) => call.afterId)).toEqual([null, "page-1", "page-2"]);
  expect(errors).toEqual([]);
  await saveEvidence(page, testInfo, { calls, visibleProductCards: 3, errors });
});
