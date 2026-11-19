import { openDeliveryPhotoTool } from "../helpers/open-delivery-photo-tool";
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
    "planning-repository": `export {planningRepository,planningError} from ${data}`,
    "delivery-photo-history-loader": "export const DeliveryPhotoHistoryLoader=()=>null;",
    "delivery-photo-upload-panel": "export default ()=>null;",
    "firebase-client": "export function getFirebaseClientServices(){throw Error('Network services are disabled in the editor fixture')} export function getFirebaseAuthIfInitialized(){return null}",
  };
  fixture = await buildInventoryPhotoFixture("tests/e2e/fixtures/delivery-photo-editor-concurrency.tsx", [{
    name: "delivery-photo-editor-isolation", setup(builder) {
      builder.onResolve({ filter: /use-delivery-photo-data$|use-delivery-photo-catalog$|use-delivery-photo-uploads$|delivery-photo-repository$|planning-repository$|delivery-photo-history-loader$|delivery-photo-upload-panel$|firebase\/client$/ }, (args) => ({
        path: args.path.endsWith("firebase/client") ? "firebase-client" : args.path.split("/").at(-1)!, namespace: "editor-fixture",
      }));
      builder.onLoad({ filter: /.*/, namespace: "editor-fixture" }, ({ path }) => ({ loader: "tsx", resolveDir: root, contents: mocks[path]! }));
    },
  }]);
});

async function openFixture(page: Page, mode: "route" | "day", absent = false, edit = true, displayName = "") {
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
  await page.goto(`https://photo-editor.test/?mode=${mode}${absent ? "&absent" : ""}${displayName ? `&displayName=${encodeURIComponent(displayName)}` : ""}`);
  await openDeliveryPhotoTool(page, mode === "day" ? "오늘 납품처" : "내 납품처");
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

test("management stays beside the day summary and search restores the day list and focus", async ({ page }) => {
  const { dialog } = await openFixture(page, "day", false, false, "가".repeat(100));
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(dialog).toBeHidden();
  const workspace = page.locator("[data-delivery-photo-workspace]");
  const manage = workspace.getByRole("button", { name: "납품처 관리", exact: true });
  const search = page.getByRole("searchbox", { name: "납품사진 거래처 검색" });
  const dayList = page.getByRole("region", { name: "오늘 남은 납품처" });
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(manage).toHaveCount(1);
    const box = (await manage.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    const searchBox = (await search.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(searchBox.y + searchBox.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await search.fill("가람");
  await expect(page.getByRole("region", { name: "거래처 검색 결과" })).toBeVisible();
  await expect(dayList).toBeHidden();
  await page.getByRole("button", { name: "검색어 지우기", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(dayList).toBeVisible();
  await openDeliveryPhotoTool(page, "오늘 납품처");
  await expect(dialog).toBeVisible();
});

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
  test(`${mode} replays a lost reply and uses a fresh ID for a changed edit`, async ({ page }) => {
    for (const change of [false, true]) {
      const { dialog } = await openFixture(page, mode);
      const save = dialog.getByRole("button", { name: "저장", exact: true });
      await page.evaluate(() => window.__deliveryPhotoEditorFixture.loseNextReply());
      await save.click();
      await expect(dialog.getByRole("alert")).toContainText("저장하지 못했습니다");
      if (change) await dialog.getByRole("button", { name: /가람상회 (오늘만 제외|내 납품처에서 제외)/ }).click();
      await save.click();
      if (change) await expect(dialog.getByRole("alert")).toContainText("다른 기기");
      else await expect(dialog).toBeHidden();
      const requests = await page.evaluate(() => window.__deliveryPhotoEditorFixture.requests);
      expect(requests).toHaveLength(2);
      expect(requests[0]!.requestId === requests[1]!.requestId).toBe(!change);
    }
  });
}

test("all four dirty editor exits ask once and preserve edits when dismissed", async ({ page }) => {
  const { dialog } = await openFixture(page, "day");
  const prompts: string[] = [];
  page.on("dialog", async (prompt) => { prompts.push(prompt.message()); await prompt.dismiss(); });
  for (const exit of [
    () => dialog.getByRole("button", { name: "취소", exact: true }).click(),
    () => dialog.getByRole("button", { name: "닫기", exact: true }).click(),
    () => page.keyboard.press("Escape"), () => page.goBack(),
  ]) {
    const previous = prompts.length;
    await exit();
    await expect.poll(() => prompts.length).toBe(previous + 1);
    await expect(dialog.getByRole("listitem").first()).toContainText("나래상회");
  }
  expect(new Set(prompts)).toEqual(new Set(["저장하지 않은 변경사항을 버릴까요?"]));
});

test("recommended and manually adjusted order is reflected in the photo workspace", async ({ page }) => {
  const { dialog, errors, external } = await openFixture(page, "day", false, false);
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await openDeliveryPhotoTool(page, "인공지능 경로 추천");
  await page.getByRole("button", { name: "납품처 추가 · 순서 편집" }).click();
  await page.getByRole("searchbox", { name: "거래처 검색", exact: true }).fill("다온");
  await page.getByRole("button", { name: "다온상회 오늘만 추가" }).click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const planning = page.getByRole("dialog", { name: "인공지능 경로 추천", exact: true });
  await expect(planning).toBeVisible();
  await planning.getByRole("combobox", { name: "마지막 납품처", exact: true }).selectOption("EDITOR-0");
  const beforeRecommendation = await page.evaluate(() => window.__deliveryPhotoEditorFixture.serverIds());
  await planning.getByRole("button", { name: "인공지능 경로 추천", exact: true }).click();
  await expect(planning.getByText("저장할까요?", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__deliveryPhotoEditorFixture.serverIds())).toEqual(beforeRecommendation);
  await planning.getByRole("button", { name: "순서 저장", exact: true }).click();
  await expect(planning.getByRole("button", { name: "저장 완료", exact: true })).toBeDisabled();
  await planning.getByRole("button", { name: "창 닫기", exact: true }).click();
  const photoNames = page.getByRole("button", { name: / 사진 기록$/ });
  await expect(photoNames.locator("strong")).toHaveText(["다온상회", "나래상회", "가람상회"]);
  await openDeliveryPhotoTool(page, "인공지능 경로 추천");
  await page.getByRole("button", { name: "납품처 추가 · 순서 편집" }).click();
  await page.getByRole("button", { name: "가람상회 위로 이동" }).click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await planning.getByRole("button", { name: "창 닫기", exact: true }).click();
  await expect(photoNames.locator("strong")).toHaveText(["다온상회", "가람상회", "나래상회"]);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
