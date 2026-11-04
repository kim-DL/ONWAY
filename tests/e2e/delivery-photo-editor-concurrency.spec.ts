import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { buildInventoryPhotoFixture } from "../helpers/build-inventory-photo-fixture";

let fixture: Awaited<ReturnType<typeof buildInventoryPhotoFixture>>;
test.beforeAll(async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const data = JSON.stringify(fileURLToPath(new URL("./fixtures/delivery-photo-editor-concurrency-data.ts", import.meta.url)));
  const mocks: Record<string, string> = {
    "use-delivery-photo-data": `export {useDeliveryPhotoData} from ${data}`,
    "use-delivery-photo-catalog": `export {useDeliveryPhotoCatalog} from ${data}`,
    "use-delivery-photo-uploads": `export {useDeliveryPhotoUploads} from ${data}`,
    "delivery-photo-repository": `export {deliveryPhotoRepository,deliveryPhotoErrorKind} from ${data}`,
    "delivery-photo-history-loader": "export const DeliveryPhotoHistoryLoader=()=>null;",
    "delivery-photo-upload-panel": "export default ()=>null;",
    "firebase-client": "export function getFirebaseClientServices(){throw Error('Network services are disabled in the editor fixture')} export function getFirebaseAuthIfInitialized(){return null}",
  };
  fixture = await buildInventoryPhotoFixture("tests/e2e/fixtures/delivery-photo-editor-concurrency.tsx", [{
    name: "delivery-photo-editor-isolation", setup(builder) {
      builder.onResolve({ filter: /use-delivery-photo-data$|use-delivery-photo-catalog$|use-delivery-photo-uploads$|delivery-photo-repository$|delivery-photo-history-loader$|delivery-photo-upload-panel$|firebase\/client$/ }, (args) => ({
        path: args.path.endsWith("firebase/client") ? "firebase-client" : args.path.split("/").at(-1)!, namespace: "editor-fixture",
      }));
      builder.onLoad({ filter: /.*/, namespace: "editor-fixture" }, ({ path }) => ({ loader: "tsx", resolveDir: root, contents: mocks[path]! }));
    },
  }]);
});

async function openFixture(page: Page, mode: "route" | "day", absent = false, edit = true) {
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", (request) => errors.push(`${request.url()} ${request.failure()?.errorText}`));
  await page.route("**/*", (request) => {
    const url = new URL(request.request().url());
    if (url.origin !== "https://photo-editor.test") { external.push(url.href); return request.abort(); }
    return request.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}*{box-sizing:border-box}${fixture.css}</style><div id="root"></div><script>${fixture.script.replaceAll("</script>", "<\\/script>")}</script></html>` });
  });
  await page.goto(`https://photo-editor.test/?mode=${mode}${absent ? "&absent" : ""}`);
  await page.getByRole("button", { name: mode === "day" ? "오늘 거래처 추가" : absent ? "내 납품처 설정" : "내 납품처 편집", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: mode === "route" ? "내 납품처 편집" : "오늘 순서 편집", exact: true });
  await expect(dialog).toBeVisible();
  if (edit && mode === "route" && absent) {
    await dialog.getByRole("searchbox").fill("가람");
    await dialog.getByRole("button", { name: "가람상회 내 납품처에 추가", exact: true }).click();
  } else if (edit) {
    await dialog.getByRole("button", { name: "나래상회 위로 이동", exact: true }).click();
  }
  return { dialog, errors, external };
}

for (const mode of ["route", "day"] as const) {
  test(`${mode} editor keeps an untouched draft clean after a background refresh`, async ({ page }) => {
    const { dialog, errors, external } = await openFixture(page, mode, false, false);
    await expect(dialog.getByRole("button", { name: "저장", exact: true })).toBeDisabled();
    await page.evaluate(() => window.__deliveryPhotoEditorFixture.externalUpdate());
    await expect(dialog.getByRole("list").locator("strong")).toHaveText(["가람상회", "나래상회"]);
    await expect(dialog.getByRole("button", { name: "저장", exact: true })).toBeDisabled();
    expect(await page.evaluate(() => window.__deliveryPhotoEditorFixture.requests)).toEqual([]);
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
  for (const absent of [false, true]) {
    test(`${mode} editor retains its opening revision ${absent ? "null" : "1"} after another device refreshes the list`, async ({ page }) => {
      const { dialog, errors, external } = await openFixture(page, mode, absent);
      const selected = dialog.getByRole("list", { name: mode === "route" ? "내 납품처 순서" : "오늘 납품 순서" });
      await expect(selected.locator("strong")).toHaveText(mode === "route" && absent ? ["가람상회"] : ["나래상회", "가람상회"]);
      await page.evaluate(() => window.__deliveryPhotoEditorFixture.externalUpdate());
      await expect(selected.locator("strong")).toHaveText(mode === "route" && absent ? ["가람상회"] : ["나래상회", "가람상회"]);
      await dialog.getByRole("button", { name: "저장", exact: true }).click();
      const requests = await page.evaluate(() => window.__deliveryPhotoEditorFixture.requests);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({ mode, expectedRevision: absent ? null : 1,
        customerIds: mode === "route" && absent ? ["EDITOR-0"] : ["EDITOR-1", "EDITOR-0"] });
      await expect(dialog.getByRole("alert")).toContainText("다른 기기에서 목록이 바뀌었습니다.");
      await expect(dialog.getByRole("button", { name: "저장", exact: true })).toBeDisabled();
      expect(await page.evaluate(() => window.__deliveryPhotoEditorFixture.serverIds())).toEqual(["EDITOR-0", "EDITOR-1", "EDITOR-2"]);
      expect(errors).toEqual([]);
      expect(external).toEqual([]);
    });
  }
  test(`${mode} editor saves normally when its opening revision remains current`, async ({ page }) => {
    const { dialog, errors, external } = await openFixture(page, mode);
    await dialog.getByRole("button", { name: "저장", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => window.__deliveryPhotoEditorFixture.serverIds())).toEqual(["EDITOR-1", "EDITOR-0"]);
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
}
