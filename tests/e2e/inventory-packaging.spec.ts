import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { buildInventoryPhotoFixture } from "../helpers/build-inventory-photo-fixture";

let browserErrors: string[] = [];
test.beforeEach(async ({ page }) => { browserErrors = []; page.on("pageerror", error => browserErrors.push(error.message)); });
test.afterEach(() => expect(browserErrors).toEqual([]));
let fixture: Awaited<ReturnType<typeof buildInventoryPhotoFixture>>;
test.beforeAll(async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const data = JSON.stringify(fileURLToPath(new URL("./fixtures/inventory-packaging-data.ts", import.meta.url)));
  fixture = await buildInventoryPhotoFixture("tests/e2e/fixtures/inventory-packaging.tsx", [{ name: "packaging-isolation", setup(builder) {
    builder.onResolve({ filter: /(?:inventory-repository|inventory-manufacturer-repository|auth-context|use-inventory-editor-ready|lib\/firebase\/client)$/ }, args => ({ path: args.path, namespace: "packaging" }));
    builder.onLoad({ filter: /.*/, namespace: "packaging" }, ({ path }) => ({ loader: "js", resolveDir: root, contents:
      path.endsWith("inventory-repository") ? `export {inventoryRepository,inventoryErrorMessage} from ${data}` :
      path.endsWith("inventory-manufacturer-repository") ? `export const inventoryManufacturerRepository={list:async()=>[]};` :
      path.endsWith("auth-context") ? "export function useAuth(){return {state:{status:'authenticated',session:{uid:'fixture',claims:{employeeId:'fixture',sessionVersion:1,permissionsVersion:1,roleScopes:['delivery']}}}}}" :
      path.endsWith("use-inventory-editor-ready") ? "export function useInventoryEditorReady(){return true}" :
      "export function getFirebaseClientServices(){return {auth:{currentUser:{uid:'fixture'}}}}",
    }));
  } }]);
  mkdirSync("output/inventory-box-quantity", { recursive: true });
  writeFileSync("output/inventory-box-quantity/preview.html", `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>급식길 박스 수량 입력 미리보기</title><style>${fixture.css}</style><div id="root"></div><script>${fixture.script.replaceAll("</script>", "<\\/script>")}</script></html>`);
});
async function open(page: Page, screen: string) {
  await page.route("**/*", route => route.request().url().startsWith("http://localhost:3198/") ? route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fixture.css}</style><div id="root"></div><script>${fixture.script.replaceAll("</script>", "<\\/script>")}</script></html>` }) : route.abort());
  await page.goto("http://localhost:3198/");
  await page.getByRole("button", { name: screen, exact: true }).click();
}
const saved = (page: Page) => page.evaluate(() => JSON.parse(document.documentElement.dataset.saved || "null"));

test("registration uses the saved pack size and sends one computed initial receipt", async ({ page }) => {
  await open(page, "새 품목 등록");
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "제조사 선택하기", exact: true }).scrollIntoViewIfNeeded();
  await expect(sheet.getByRole("button", { name: "규격 선택하기", exact: true })).toBeVisible();
  await page.screenshot({ path: `output/inventory-box-quantity/selection-buttons-blue-${page.viewportSize()!.width}.png` });
  await sheet.getByLabel("품목명 필수").fill("테스트 만두");
  await sheet.getByLabel("박스 입수 수량", { exact: true }).fill("10");
  await sheet.getByLabel("미확인", { exact: true }).last().check();
  await sheet.getByLabel("박스 수", { exact: true }).fill("3");
  await sheet.getByRole("spinbutton", { name: "낱개", exact: true }).fill("2");
  await expect(sheet.locator("output")).toContainText("총 32 봉");
  await sheet.getByLabel("박스 입수 수량", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `output/inventory-box-quantity/registration-${page.viewportSize()!.width}.png` });
  await sheet.getByRole("button", { name: "품목 등록", exact: true }).click();
  await expect.poll(() => saved(page)).toMatchObject({ draft: { boxPackSize: 10, unitsPerBox: 1 }, initialStock: { quantity: 32, packageQuantity: { boxes: 3, unitsPerBox: 10, loose: 2 } } });
});

test("historical product can edit packaging but retains locked stock unit", async ({ page }) => {
  await open(page, "품목 정보 수정");
  await expect(page.getByRole("group", { name: "기준 단위 (필수)" }).getByRole("radio").first()).toBeDisabled();
  await page.getByLabel("박스 입수 수량", { exact: true }).fill("15");
  await page.getByRole("button", { name: "변경 저장" }).click();
  await expect.poll(() => saved(page)).toMatchObject({ draft: { boxPackSize: 15, unitsPerBox: 1 }, expectedRevision: 3 });
  expect(await saved(page)).not.toHaveProperty("initialStock");
});

test("issue calculates boxes, permits a one-time pack size and rejects excess stock", async ({ page }) => {
  await open(page, "출고");
  await expect(page.getByLabel("박스당 수량")).toHaveValue("10");
  await page.getByLabel("박스 수", { exact: true }).fill("5");
  await expect(page.getByRole("button", { name: "출고 기록", exact: true })).toBeDisabled();
  await page.getByLabel("박스 수", { exact: true }).fill("3");
  await page.getByLabel("박스당 수량").fill("12");
  await page.getByRole("spinbutton", { name: "낱개", exact: true }).fill("2");
  await expect(page.locator("output")).toContainText("총 38 봉");
  await page.getByRole("button", { name: "출고 기록", exact: true }).click();
  await expect.poll(() => saved(page)).toMatchObject({ quantity: 38, packageQuantity: { boxes: 3, unitsPerBox: 12, loose: 2 } });
});

test("mode switches retain total and zero adjustment is explicit", async ({ page }) => {
  await open(page, "수량 조정");
  await expect(page.locator("output")).toContainText("총 47 봉");
  await page.getByRole("radio", { name: "총수량 입력" }).check();
  await expect(page.getByLabel("조정 후 최종 수량 (봉)", { exact: true })).toHaveValue("47");
  await page.getByRole("radio", { name: "박스로 계산" }).check();
  await expect(page.getByLabel("박스 수", { exact: true })).toHaveValue("4");
  await page.getByLabel("박스 수", { exact: true }).fill("");
  await page.getByRole("spinbutton", { name: "낱개", exact: true }).fill("");
  await expect(page.getByRole("button", { name: "수량 조정", exact: true }).last()).toBeDisabled();
  await page.getByLabel("박스 수", { exact: true }).fill("0");
  await expect(page.locator("output")).toContainText("총 0 봉");
  await page.getByRole("button", { name: "수량 조정", exact: true }).last().click();
  await expect.poll(() => saved(page)).toMatchObject({ quantity: 0 });
});

test("invalid calculations cannot submit and mobile widths remain usable", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await open(page, "출고");
  for (const value of ["-1", "1.5", "1000000001"]) {
    await page.getByLabel("박스 수", { exact: true }).fill(value);
    await expect(page.getByRole("button", { name: "출고 기록", exact: true })).toBeDisabled();
  }
  await page.getByLabel("박스 수", { exact: true }).fill("3");
  await page.getByLabel("박스당 수량").fill("");
  await expect(page.getByRole("button", { name: "출고 기록", exact: true })).toBeDisabled();
  await page.getByLabel("박스당 수량").fill("10");
  await page.getByRole("spinbutton", { name: "낱개", exact: true }).fill("2");
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator("output")).toContainText("총 32 봉");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const title of ["박스 수", "박스당 수량", "낱개"]) {
      const field = page.getByLabel(title, { exact: true });
      const bounds = await field.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.width).toBeGreaterThan(30);
      const layout = await field.evaluate(input => {
        const frame = input.parentElement!.getBoundingClientRect();
        const suffix = input.nextElementSibling!.getBoundingClientRect();
        const value = input.getBoundingClientRect();
        return { align: getComputedStyle(input).textAlign, width: frame.width,
          inside: suffix.left >= value.right && suffix.right <= frame.right,
          centered: Math.abs((suffix.top + suffix.bottom) / 2 - (frame.top + frame.bottom) / 2) < 1 };
      });
      expect(layout.align).toBe("center");
      expect(layout.width).toBeGreaterThan(65);
      expect(layout.inside).toBe(true);
      expect(layout.centered).toBe(true);
    }
    mkdirSync("output/inventory-box-quantity", { recursive: true });
    await page.screenshot({ path: `output/inventory-box-quantity/calculator-${width}-${testInfo.project.name}.png` });
  }
});
