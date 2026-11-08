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
  await page.getByRole("button", { name: mode === "day" ? "오늘 납품처" : "내 납품처", exact: true }).click();
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

test.describe("long welcome copy", () => {
  test.use({ timezoneId: "Asia/Seoul" });
  for (const name of ["남궁가나다라마바사아자차카타파하 팀장", "가".repeat(100)]) {
    test(`evening greeting fits with a ${name.length}-character name`, async ({ page }, info) => {
      await page.clock.setFixedTime(new Date("2026-11-08T11:00:00Z"));
      await page.emulateMedia({ reducedMotion: name.length === 100 ? "reduce" : "no-preference" });
      await openFixture(page, "day", false, false, name);
      await page.getByRole("dialog").getByRole("button", { name: "취소", exact: true }).click();
      const greeting = page.locator("header [data-greeting-visual]");
      if (name.length === 19) await expect(greeting).toHaveAttribute("data-typing", "typing");
      await expect(greeting).toHaveAttribute("data-typing", "complete", { timeout: 10_000 });
      await expect(greeting).toContainText(`${name}님 안녕하세요.`);
      await expect(greeting).toContainText("오늘도 수고 많았어요.");
      for (const width of [320, 390, 430, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        const heading = await page.getByRole("heading", { name: "납품사진", exact: true }).evaluate((element) => {
          const range = document.createRange(); range.selectNodeContents(element);
          const box = range.getBoundingClientRect(); return { x: box.x, width: box.width };
        });
        const copy = (await greeting.boundingBox())!;
        expect(copy.x).toBeGreaterThanOrEqual(heading.x + heading.width);
        expect(copy.x + copy.width).toBeLessThanOrEqual(width);
        const nameElement = page.locator("header [title]");
        expect(await nameElement.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
        expect((await page.locator("header [data-welcome-greeting]").boundingBox())!.height).toBeLessThan(55);
        await expect(page.locator("header [data-greeting-accessible]")).toContainText(name);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (width === 320) await page.screenshot({ path: `output/delivery-toolbar/long-welcome-${name.length}-${info.project.name}.png` });
      }
    });
  }
});

test("welcome types the employee greeting and completes without repeating", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openFixture(page, "day", false, false);
  const greeting = page.locator("header [data-greeting-visual]");
  await expect(greeting).toHaveAttribute("data-typing", "typing");
  expect(await greeting.locator('[data-greeting-character][style*="hidden"]').count()).toBeGreaterThan(0);
  await expect(greeting).toHaveAttribute("data-typing", "complete");
  await expect(greeting).toContainText("님 안녕하세요.");
  await expect(greeting.locator('[data-greeting-character][style*="hidden"]')).toHaveCount(0);
});

test("top management controls share one row and search clears without losing focus", async ({ page }) => {
  await openFixture(page, "day", false, false);
  await page.getByRole("dialog").getByRole("button", { name: "취소", exact: true }).click();
  const controls = page.getByRole("group", { name: "납품처 관리" });
  const search = page.getByRole("searchbox", { name: "납품사진 거래처 검색" });
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const buttons = await controls.getByRole("button").all();
    const bounds = await Promise.all(buttons.map((button) => button.boundingBox()));
    expect(buttons).toHaveLength(3);
    for (const box of bounds) {
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(box!.y - bounds[0]!.y)).toBeLessThan(1);
    }
    expect(bounds[2]!.y + bounds[2]!.height).toBeLessThan((await search.boundingBox())!.y);
    const heading = (await page.getByRole("heading", { name: "납품사진", exact: true }).boundingBox())!;
    const welcome = (await page.locator("header [data-welcome-greeting]").boundingBox())!;
    expect(welcome.x).toBeGreaterThanOrEqual(heading.x + heading.width);
    expect(welcome.y).toBeLessThan(heading.y + heading.height + 20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(page.getByRole("button", { name: "새로고침", exact: true })).toHaveCount(0);
  await search.fill("가람");
  await page.getByRole("button", { name: "검색어 지우기", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await controls.getByRole("button", { name: "순서 편집", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "오늘 순서 편집", exact: true })).toBeVisible();
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
}

test("recommended and manually adjusted order is reflected in the photo workspace", async ({ page }) => {
  const { dialog, errors, external } = await openFixture(page, "day", false, false);
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await page.getByRole("button", { name: "인공지능 경로 추천", exact: true }).click();
  await page.getByRole("button", { name: "납품처 추가 · 순서 편집" }).click();
  await page.getByRole("searchbox", { name: "거래처 검색", exact: true }).fill("다온");
  await page.getByRole("button", { name: "다온상회 오늘만 추가" }).click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  const planning = page.getByRole("dialog", { name: "인공지능 경로 추천", exact: true });
  await expect(planning).toBeVisible();
  await planning.getByRole("combobox", { name: "마지막 납품처", exact: true }).selectOption("EDITOR-0");
  await planning.getByRole("button", { name: "인공지능 경로 추천", exact: true }).click();
  await expect(planning.getByRole("button", { name: "오늘 순서에 적용했어요" })).toBeVisible();
  await planning.getByRole("button", { name: "완료", exact: true }).click();
  const photoNames = page.getByRole("button", { name: / 사진 기록$/ });
  await expect(photoNames).toHaveText(["다온상회둔산1동", "나래상회둔산1동", "가람상회둔산1동"]);
  await page.getByRole("button", { name: "인공지능 경로 추천", exact: true }).click();
  await page.getByRole("button", { name: "납품처 추가 · 순서 편집" }).click();
  await page.getByRole("button", { name: "가람상회 위로 이동" }).click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await planning.getByRole("button", { name: "완료", exact: true }).click();
  await expect(photoNames).toHaveText(["다온상회둔산1동", "가람상회둔산1동", "나래상회둔산1동"]);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
