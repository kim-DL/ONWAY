import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { devices, expect, test as base, type BrowserContext, type Locator, type Page } from "@playwright/test";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import { buildInventoryPhotoFixture } from "../helpers/build-inventory-photo-fixture";
import { deliveryPhotoDateKey } from "../../src/features/delivery-photos/delivery-photo-memory";

// The Windows WebKit port can store IndexedDB Blob/File payloads in a persistent profile.
const test = base.extend({
  context: async ({ browserName, context, playwright }, provide, info) => {
    if (browserName !== "webkit") return provide(context);
    const persistent = await playwright.webkit.launchPersistentContext(info.outputPath("profile"), devices["iPhone 13"]);
    try { await provide(persistent); } finally { await persistent.close(); }
  },
});

const origin = "https://photo-workflow.test";
const customerId = "PREVIEW-0";
const today = deliveryPhotoDateKey();
const yesterday = deliveryPhotoDateKey(new Date(Date.now() - 86_400_000));
let html: string;
let jpeg: Buffer;
let webp: Buffer;
test.beforeAll(async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const data = JSON.stringify(fileURLToPath(new URL("./fixtures/customer-ceramic-data.ts", import.meta.url)));
  const mocks: Record<string, string> = {
    "client-only": "export {};",
    "functions": `export const httpsCallable=(_services,name)=>async input=>{const r=await fetch("/api/"+name,{method:"POST",body:JSON.stringify(input)});return {data:await r.json()}};`,
    "client": `import {session} from ${data};const user={uid:session.uid,getIdTokenResult:async()=>({claims:session.claims})};const services={auth:{currentUser:user},functions:{}};export const getFirebaseClientServices=()=>services;export const getFirebaseAuthIfInitialized=()=>services.auth;`,
    "use-delivery-photo-catalog": `import {customers} from ${data};const catalog=[{...customers[0],name:"예시 급식 납품 거래처 긴 이름 어린이 급식센터 별관"}];export const useDeliveryPhotoCatalog=()=>({customers:catalog,status:"ready",retry(){}});`,
    "planning-entry": "export default ()=>null;",
  };
  const fixture = await buildInventoryPhotoFixture("tests/e2e/fixtures/customer-photo-workflow.tsx", [{ name: "photo-workflow", setup(builder) {
    builder.onResolve({ filter: /^client-only$|^firebase\/functions$|firebase\/client$|use-delivery-photo-catalog$|planning-entry$/ },
      ({ path }) => ({ path: path.split("/").at(-1)!, namespace: "workflow" }));
    builder.onLoad({ filter: /.*/, namespace: "workflow" }, ({ path }) => ({ contents: mocks[path]!, resolveDir: root }));
  } }]);
  const { css } = await postcss([tailwindcss()]).process(fixture.css, { from: fileURLToPath(new URL("../../src/app/globals.css", import.meta.url)) });
  html = `<!doctype html><html lang="ko"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0}${css}</style><div id="root"></div><script>${fixture.script.replaceAll("</script>", "<\\/script>")}</script></html>`;
  jpeg = await sharp({ create: { width: 320, height: 240, channels: 3, background: "#579" } }).jpeg().toBuffer();
  webp = await sharp(jpeg).webp().toBuffer();
});

function gate() {
  let release!: () => void;
  const wait = new Promise<void>((done) => { release = done; });
  return { wait, release };
}
function photo(date: string, photoId = randomUUID()) {
  return { photoId, customerId, deliveryDateKey: date, source: "album", createdByName: "합성 직원", createdByEmployeeId: "PREVIEW",
    createdAt: new Date(`${date}T12:00:00+09:00`).toISOString(), expiresAt: new Date(Date.now() + 6 * 86_400_000).toISOString(), thumbnail: { width: 320, height: 240 } };
}
async function install(context: BrowserContext, hold: { today?: Promise<void>; date?: Promise<void>; upload?: Promise<void> } = {}) {
  const uploads: string[] = [];
  const history = [...Array.from({ length: 30 }, () => photo(today)), photo(yesterday)];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "map.kakao.com" && url.pathname.startsWith("/link/to/")) return route.fulfill({ contentType: "text/html", body: "<title>Synthetic map destination</title>" });
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    if (url.pathname === "/ui/customer-ceramic-camera-v1.webp") return route.fulfill({ contentType: "image/webp", body: readFileSync(new URL("../../public/ui/customer-ceramic-camera-v1.webp", import.meta.url)) });
    const name = url.pathname.split("/").pop();
    const input = route.request().postDataJSON();
    if (name === "getDeliveryPhotoRoute") return route.fulfill({ body: "null", contentType: "application/json" });
    if (name === "getDeliveryPhotoDay") return route.fulfill({ json: { deliveryDateKey: today, isOverride: true, revision: 1, customerIds: [customerId] } });
    if (name === "listDeliveryPhotos" && input.scope === "today") {
      await hold.today;
      return route.fulfill({ json: { scope: "today", deliveryDateKey: today, truncated: false, photos: [], customers: [] } });
    }
    if (name === "listDeliveryPhotos") {
      if (input.deliveryDateKey === yesterday) await hold.date;
      return route.fulfill({ json: { scope: "customer", customerId, fromDateKey: deliveryPhotoDateKey(new Date(Date.now() - 7 * 86_400_000)),
        photos: history.filter((item) => !input.deliveryDateKey || item.deliveryDateKey === input.deliveryDateKey).slice(0, input.limit) } });
    }
    if (name === "getDeliveryPhoto") return route.fulfill({ json: { ...input, contentType: "image/webp", byteSize: webp.length, fileBase64: webp.toString("base64") } });
    if (name === "createDeliveryPhoto") {
      uploads.push(input.requestId); await hold.upload;
      return route.fulfill({ json: { ...photo(today, input.requestId), source: input.source } });
    }
    if (name === "searchCustomerLocations") return route.fulfill({ json: [{ id: "address", name: input.query, address: input.query, point: { latitude: 36.4, longitude: 127.5 } }] });
    return route.abort();
  });
  return uploads;
}
const camera = (page: Page) => page.getByRole("region", { name: "오늘 남은 납품처" }).getByRole("button", { name: /카메라 촬영$/ });
const file = () => ({ name: "sample.jpg", mimeType: "image/jpeg", buffer: jpeg });

test("one tap on the remaining row hands off its verified delivery address", async ({ page, context, isMobile }) => {
  await install(context);
  const lookups: string[] = [];
  context.on("request", (request) => { if (request.url().endsWith("/api/searchCustomerLocations")) lookups.push(request.postDataJSON().query); });
  await page.goto(origin);
  const destination = isMobile ? Promise.resolve(page) : context.waitForEvent("page");
  await page.getByRole("region", { name: "오늘 남은 납품처" }).getByRole("link", { name: /길안내$/ }).click();
  await expect(await destination).toHaveURL(/https:\/\/map\.kakao\.com\/link\/to\/[^/]+,36\.4,127\.5$/);
  expect(lookups).toEqual(["대전광역시 서구 예시로 1"]);
});

test("selected day waits for its own query and finds a photo beyond the first thirty", async ({ page, context }) => {
  const day = gate(); await install(context, { date: day.wait });
  await page.goto(origin); await page.getByRole("button", { name: / 사진 기록$/ }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button", { name: /등록자 합성 직원/ })).toHaveCount(30);
  await sheet.getByRole("button", { name: "어제", exact: true }).click();
  await expect(sheet.getByText("이 날짜의 사진을 불러오는 중")).toBeVisible();
  await expect(sheet.getByText(/기록이 없습니다/)).toHaveCount(0);
  day.release();
  await expect(sheet.getByRole("region", { name: yesterday + " 사진 기록" }).getByRole("listitem")).toHaveCount(1);
});

test("detail can open both pickers while today's aggregate is pending", async ({ page, context }) => {
  const today = gate(); await install(context, { today: today.wait });
  await page.goto(origin + "/?detail");
  for (const name of [/ 사진 촬영$/, / 앨범에서 선택$/]) {
    const button = page.getByRole("button", { name });
    const chooser = page.waitForEvent("filechooser"); await button.click();
    await (await chooser).setFiles([]);
  }
  await expect(page.getByText("오늘 납품처 불러오는 중", { exact: true })).toBeVisible();
  today.release();
});

test("cancelling keeps the row, finishing during upload preserves focus and one server confirmation", async ({ page, context }) => {
  const uploading = gate(); const uploads = await install(context, { upload: uploading.wait });
  await page.goto(origin);
  const pin = page.getByRole("region", { name: "추가 촬영 납품처" });
  let picker = page.waitForEvent("filechooser"); await camera(page).click(); await (await picker).setFiles([]);
  await expect(pin).toHaveCount(0);
  await expect(camera(page)).toBeFocused();
  const more = page.getByRole("button", { name: / 더보기$/ });
  await more.click(); picker = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "앨범에서 사진 추가" }).click(); await (await picker).setFiles([]);
  await expect(pin).toHaveCount(0); await expect(more).toBeFocused();
  picker = page.waitForEvent("filechooser"); await camera(page).click(); await (await picker).setFiles(file());
  await expect(pin).toBeVisible(); await expect.poll(() => uploads.length).toBe(1);
  await pin.getByRole("button", { name: "연속 촬영 마치기" }).click();
  await expect(camera(page)).toBeFocused(); await expect(page.locator("summary")).toHaveText("기록완료 0곳");
  uploading.release();
  await expect(page.locator("summary")).toHaveText("기록완료 1곳");
  await page.locator("summary").click();
  await expect(page.getByRole("button", { name: / 사진 기록$/ })).toContainText("사진 1장");
  expect(uploads).toHaveLength(1);
});

test("a second tab's stored photo is discovered and a failed reopening recovers the same request", async ({ page, context }) => {
  const uploads = await install(context);
  await page.goto(origin); await expect(camera(page)).toBeEnabled();
  const other = await context.newPage(); await other.goto(origin + "/?seed");
  await other.locator("input").setInputFiles(file()); await expect(other.locator("output")).not.toBeEmpty();
  const id = await other.locator("output").innerText(); await other.close();
  await expect(page.getByRole("button", { name: "날짜 확인 필요" })).toBeVisible({ timeout: 8000 });
  await page.addInitScript(() => {
    const read = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name === "jobs" && this.transaction.db.name.includes("delivery-photo-outbox")) {
        IDBObjectStore.prototype.getAll = read;
        throw new DOMException("Synthetic first read failure", "UnknownError");
      }
      return read.apply(this, args);
    };
  });
  await page.reload(); await expect(camera(page)).toBeDisabled();
  await page.getByRole("button", { name: "보관함 다시 읽기" }).click();
  await page.getByRole("button", { name: "날짜 확인 필요" }).click();
  const item = page.locator(`#photo-job-${id}`);
  await expect(item).toBeFocused(); await expect(camera(page)).toBeEnabled();
  expect(uploads).toEqual([]);
  await item.getByRole("button", { name: "날짜 확인 후 전송" }).click();
  await expect(page.locator("summary")).toHaveText("기록완료 1곳");
  expect(uploads).toEqual([id]);
});

test("an invalid file leaves the list in place and finishing a confirmed capture focuses its new list", async ({ page, context }) => {
  const uploads = await install(context);
  await page.goto(origin);
  let chooser = page.waitForEvent("filechooser"); await camera(page).click();
  await (await chooser).setFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("invalid") });
  await expect(page.locator('[data-photo-job-status="failed"]')).toBeVisible();
  await expect(page.getByRole("region", { name: "추가 촬영 납품처" })).toHaveCount(0);
  chooser = page.waitForEvent("filechooser"); await camera(page).click();
  await (await chooser).setFiles({ name: "damaged.jpg", mimeType: "image/jpeg", buffer: Buffer.from("invalid photo bytes") });
  await expect(page.locator('[data-photo-job-status="failed"]')).toHaveCount(2);
  await expect(page.getByRole("region", { name: "추가 촬영 납품처" })).toHaveCount(0);
  expect(uploads).toEqual([]);
  chooser = page.waitForEvent("filechooser"); await camera(page).click(); await (await chooser).setFiles(file());
  await expect(page.locator("summary")).toHaveText("기록완료 1곳");
  await page.getByRole("button", { name: "연속 촬영 마치기" }).click();
  await expect(page.locator("summary")).toBeFocused();
});

test("a failed stored photo links to the item that can be retried", async ({ page, context }) => {
  const uploads = await install(context);
  await page.goto(origin + "/?seed&failed"); await page.locator("input").setInputFiles(file());
  await expect(page.locator("output")).not.toBeEmpty(); const id = await page.locator("output").innerText();
  await page.goto(origin); await page.getByRole("button", { name: "재시도 필요" }).click();
  await expect(page.locator(`#photo-job-${id}`)).toBeFocused();
  await page.getByRole("button", { name: "보관 다시 시도" }).click();
  await expect(page.locator("summary")).toHaveText("기록완료 1곳"); expect(uploads).toEqual([id]);
});

test("photo, capture, outbox, date history and editor controls fit long names at normal and doubled text size", async ({ page, context }, info) => {
  test.setTimeout(60_000);
  await install(context);
  const check = async (screen: string, root: Locator) => {
    await expect(root).toBeVisible();
    for (const width of [320, 390, 430, 1280]) {
      await page.setViewportSize({ width, height: 860 });
      for (const scale of [100, 200]) {
        await page.evaluate((scale) => { document.documentElement.style.fontSize = scale + "%"; }, scale);
        const errors = await root.evaluate((element) => {
          const failures: string[] = [];
          if (document.documentElement.scrollWidth > innerWidth || element.scrollWidth > element.clientWidth + 1) failures.push("horizontal overflow");
          for (const control of element.querySelectorAll<HTMLElement>("button, a[href], input, summary")) {
            if (control.closest("details:not([open])") && control.tagName !== "SUMMARY") continue;
            const box = control.getBoundingClientRect();
            if (box.width < 3 || box.height < 3) continue;
            const rail = control.closest('[role="group"]');
            if (rail && getComputedStyle(rail).overflowX === "auto") continue;
            if (box.left < -1 || box.right > innerWidth + 1) failures.push(control.getAttribute("aria-label") ?? control.innerText);
          }
          for (const camera of element.querySelectorAll<HTMLElement>("[data-camera-customer]")) {
            if (camera.closest("details:not([open])")) continue;
            const card = camera.closest("li")!.getBoundingClientRect();
            const more = camera.nextElementSibling!.getBoundingClientRect();
            const cameraBox = camera.getBoundingClientRect();
            const link = camera.closest("li")!.querySelector("a")?.getBoundingClientRect();
            if (cameraBox.right > more.left + 1 || (link && link.right > cameraBox.left + 1)) failures.push("overlapping row actions");
            for (const box of [cameraBox, more]) {
              if (box.width !== 48 || box.height !== 48 || Math.abs(box.y + 24 - card.y - card.height / 2) > 1) failures.push("camera or more misaligned");
            }
          }
          return failures;
        });
        expect(errors, `${screen} at ${width}px / ${scale}%`).toEqual([]);
        if (width === 390 && scale === 200) await page.screenshot({ path: `output/playwright/customer-mode-review-20261118/after-${screen}-${info.project.name}.png`, scale: "css" });
      }
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  };
  await page.goto(origin + "/?seed"); await page.locator("input").setInputFiles(file()); await expect(page.locator("output")).not.toBeEmpty();
  await page.goto(origin); await expect(page.getByRole("button", { name: "날짜 확인 필요" })).toBeVisible();
  const workspace = page.locator("[data-delivery-photo-workspace]");
  await check("outbox-list", workspace);
  await page.getByRole("button", { name: / 사진 기록$/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "어제", exact: true }).click();
  await expect(dialog.getByRole("listitem")).toHaveCount(1);
  await check("history", dialog); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "순서 편집", exact: true }).click();
  await check("editor", dialog); await page.keyboard.press("Escape");
  const chooser = page.waitForEvent("filechooser"); await camera(page).click(); await (await chooser).setFiles(file());
  const pin = page.getByRole("region", { name: "추가 촬영 납품처" });
  await check("continuous", pin);
  await page.goto(origin + "/?detail"); await expect(page.getByRole("button", { name: / 사진 촬영$/ })).toBeEnabled();
  await check("entry", page.getByRole("region", { name: "납품사진 기록 대상" }));
});
