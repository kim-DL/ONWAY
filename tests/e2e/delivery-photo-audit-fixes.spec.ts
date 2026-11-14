import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { expect, test, type Page } from "@playwright/test";
import type {} from "./fixtures/delivery-photo-audit-fixes";

let script = "";
test.beforeAll(async () => {
  const mocks: Record<string, string> = {
    "delivery-photo-history-repository": `export const deliveryPhotoHistoryRepository={load:(photoId,variant,session,signal)=>new Promise(resolve=>window.__deliveryAudit.images.push({photoId,resolve,signal}))};export const deliveryPhotoHistoryErrorMessage=()=>"사진 오류";`,
    "delivery-photo-repository": `const day=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
      export const deliveryPhotoErrorKind=error=>error?.code==="permission-denied"?"auth":"retryable";
      export const deliveryPhotoRepository={getRoute:async()=>{window.__deliveryAudit.calls.route++;return {customerIds:["customer-a"]}},
        getDay:async()=>{window.__deliveryAudit.calls.day++;return {deliveryDateKey:day(),customerIds:["customer-a"]}},
        listToday:()=>{window.__deliveryAudit.calls.today++;const date=day();return new Promise((resolve,reject)=>window.__deliveryAudit.reads.push({reject,resolve:count=>resolve({deliveryDateKey:date,photos:[],customers:[{customerId:"customer-a",count,latest:null}]})}))}};`,
    "private-client-state": `export const registerPrivateBlobUrl=url=>url;export const forgetPrivateBlobUrl=url=>{window.__deliveryAudit.revoked.push(url);URL.revokeObjectURL(url)};`,
    "private-client-cleanup-registry": "export const registerPrivateClientCleanup=()=>{};",
    "performance-monitor": "export const recordPerformanceMetric=()=>{};",
  };
  const result = await build({
    absWorkingDir: fileURLToPath(new URL("../../", import.meta.url)),
    entryPoints: ["tests/e2e/fixtures/delivery-photo-audit-fixes.tsx"], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "delivery-audit-fixture", setup(builder) {
      builder.onResolve({ filter: /delivery-photo-history-repository$|delivery-photo-repository$|private-client-state$|private-client-cleanup-registry$|performance-monitor$/ }, args => ({ path: args.path.split("/").at(-1)!, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path]!, loader: "js" }));
    } }],
  });
  script = result.outputFiles[0]!.text;
});

async function open(page: Page, mode: Window["__deliveryAuditMode"], time = "2026-11-14T03:00:00Z") {
  await page.route("**/*", route => route.abort());
  await page.clock.install({ time: new Date(time) });
  await page.setContent('<!doctype html><html lang="ko"><meta charset="utf-8"><title>납품사진 회귀 검증</title><div id="root"></div></html>');
  await page.evaluate(value => { window.__deliveryAuditMode = value; }, mode);
  await page.addScriptTag({ content: script });
}
async function foreground(page: Page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange")); document.dispatchEvent(new Event("resume"));
  });
}
async function resolveRead(page: Page, index: number, count: number) {
  await expect.poll(() => page.evaluate(() => window.__deliveryAudit.reads.length)).toBe(index + 1);
  await page.evaluate(({ index, count }) => window.__deliveryAudit.reads[index]!.resolve(count), { index, count });
  await expect(page.getByLabel("조회 중")).toHaveText("false");
}

test("returning to a photo waits for a fresh URL after the previous URL is revoked", async ({ page }) => {
  await open(page, "image");
  await expect.poll(() => page.evaluate(() => window.__deliveryAudit.images.length)).toBe(1);
  await page.evaluate(() => window.__deliveryAudit.resolveImage(0));
  await expect(page.getByRole("img")).toBeVisible();
  const oldUrl = await page.getByRole("img").getAttribute("src");
  await page.getByRole("button", { name: "사진 전환" }).click();
  await page.getByRole("button", { name: "사진 전환" }).click();
  await expect(page.getByLabel("사진 상태")).toHaveText("loading");
  await expect(page.getByRole("img")).toHaveCount(0);
  expect(await page.evaluate(() => window.__deliveryAudit.revoked)).toContain(oldUrl);
  await page.evaluate(() => { window.__deliveryAudit.resolveImage(1); window.__deliveryAudit.resolveImage(2); });
  await expect(page.getByRole("img")).toBeVisible();
  expect(await page.getByRole("img").getAttribute("src")).not.toBe(oldUrl);
  expect(await page.evaluate(() => window.__deliveryAudit.errors)).toEqual([]);
});

test("foreground refreshes stale data once and an in-flight read preserves a confirmed write", async ({ page }) => {
  await open(page, "data");
  await resolveRead(page, 0, 0);
  await foreground(page);
  expect(await page.evaluate(() => window.__deliveryAudit.calls.today)).toBe(1);
  await page.clock.fastForward(65_000);
  await foreground(page);
  await expect.poll(() => page.evaluate(() => window.__deliveryAudit.calls)).toEqual({ route: 2, day: 2, today: 2 });
  await foreground(page);
  expect(await page.evaluate(() => window.__deliveryAudit.reads.length)).toBe(2);
  await resolveRead(page, 1, 1);
  await expect(page.getByLabel("사진 수")).toHaveText("1");
  await page.clock.fastForward(65_000);
  await foreground(page);
  await expect.poll(() => page.evaluate(() => window.__deliveryAudit.reads.length)).toBe(3);
  await page.getByRole("button", { name: "서버 저장 반영" }).click();
  await resolveRead(page, 2, 2);
  await expect(page.getByLabel("사진 수")).toHaveText("9");
});

test("refresh errors retain old data for retry but clear it on permission failure", async ({ page }) => {
  await open(page, "data");
  await resolveRead(page, 0, 3);
  await page.clock.fastForward(65_000);
  await foreground(page);
  await expect.poll(() => page.evaluate(() => window.__deliveryAudit.reads.length)).toBe(2);
  await page.evaluate(() => window.__deliveryAudit.reads[1]!.reject({ code: "unavailable" }));
  await expect(page.getByLabel("조회 오류")).toHaveText("최신 정보를 불러오지 못했습니다.");
  await expect(page.getByLabel("사진 수")).toHaveText("3");
  await page.getByRole("button", { name: "다시 불러오기" }).click();
  await resolveRead(page, 2, 4);
  await expect(page.getByLabel("사진 수")).toHaveText("4");
  await page.clock.fastForward(65_000);
  await foreground(page);
  await expect.poll(() => page.evaluate(() => window.__deliveryAudit.reads.length)).toBe(4);
  await page.evaluate(() => window.__deliveryAudit.reads[3]!.reject({ code: "permission-denied" }));
  await expect(page.getByLabel("사진 수")).toHaveText("none");
  await expect(page.getByLabel("조회 오류")).toContainText("사용 권한");
});

test("the visible photo day rolls over at Seoul midnight without polling renders", async ({ page }) => {
  await open(page, "data", "2026-11-14T14:59:30Z");
  await resolveRead(page, 0, 3);
  await page.clock.fastForward(31_000);
  await expect.poll(() => page.evaluate(() => window.__deliveryAudit.reads.length)).toBe(2);
  await expect(page.getByLabel("사진 수")).toHaveText("none");
  await resolveRead(page, 1, 0);
  await expect(page.getByLabel("조회 날짜")).toHaveText("2026-11-15");
});

test("idle polls retain the snapshot while cloned, changed and newly previewable jobs notify", async ({ page }) => {
  await open(page, "upload");
  await expect.poll(() => page.evaluate(() => window.__deliveryAudit.ready)).toBe(true);
  await expect(page.getByLabel("보관 사진 수")).toHaveText("0");
  await page.clock.runFor(9_000);
  expect(await page.evaluate(() => ({ reads: window.__deliveryAudit.listReads, notifications: window.__deliveryAudit.notifications, renders: window.__deliveryAudit.renders })))
    .toEqual({ reads: 4, notifications: 0, renders: 1 });
  await page.evaluate(() => {
    window.__deliveryAudit.records = [{ version: 1, owner: "audit", approvedDay: "2026-11-14", lease: null,
      source: null, prepared: null, confirmed: null,
      job: { jobId: "saved", requestId: "request", customerId: "customer-a", source: "camera", status: "failed",
        errorCategory: "permanent", message: "보관 중", durable: true, startedAt: Date.now(), updatedAt: Date.now() },
    }];
  });
  await page.clock.runFor(3_000);
  await expect(page.getByLabel("보관 사진 수")).toHaveText("1");
  const stable = await page.evaluate(() => ({ notifications: window.__deliveryAudit.notifications, renders: window.__deliveryAudit.renders }));
  await page.clock.runFor(3_000);
  expect(await page.evaluate(() => ({ notifications: window.__deliveryAudit.notifications, renders: window.__deliveryAudit.renders }))).toEqual(stable);
  await page.evaluate(() => { window.__deliveryAudit.records[0]!.job.message = "확인 필요"; });
  await page.clock.runFor(3_000);
  await expect(page.getByLabel("보관 안내")).toHaveText("확인 필요");
  await page.evaluate(() => {
    window.__deliveryAudit.records[0]!.prepared = { blob: new Blob(["preview"], { type: "image/webp" }), contentType: "image/webp", width: 1, height: 1 };
  });
  await page.clock.runFor(3_000);
  await expect(page.getByLabel("미리보기")).toHaveText("true");
});
