import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { expect, test, type Page } from "@playwright/test";
import type {} from "./fixtures/async-read-lifecycle";

let script = "";
test.beforeAll(async () => {
  const mocks: Record<string, string> = {
    "school-photo-repository": "export const schoolPhotoRepository={getVariant:()=>new Promise((resolve,reject)=>window.__asyncReadFixture.photos.push({resolve,reject}))};",
    "sales-history-repository": "export const salesHistoryRepository={loadPage:(schoolId,cursor=null)=>new Promise((resolve,reject)=>window.__asyncReadFixture.history.push({schoolId,cursor,resolve,reject}))};",
    "private-client-state": "export const registerPrivateBlobUrl=url=>url;export const forgetPrivateBlobUrl=url=>{window.__asyncReadFixture.revoked.push(url);URL.revokeObjectURL(url)};",
    "performance-monitor": "export const recordPerformanceMetric=()=>{};",
  };
  const result = await build({
    absWorkingDir: fileURLToPath(new URL("../../", import.meta.url)),
    entryPoints: ["tests/e2e/fixtures/async-read-lifecycle.tsx"], bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "async-read-fixture", setup(builder) {
      builder.onResolve({ filter: /school-photo-repository$|sales-history-repository$|private-client-state$|performance-monitor$/ }, args => ({ path: args.path.split("/").at(-1)!, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: mocks[args.path]!, loader: "js" }));
    } }],
  });
  script = result.outputFiles[0]!.text;
});
async function open(page: Page) {
  await page.route("**/*", route => route.abort());
  await page.setContent('<!doctype html><html lang="ko"><meta charset="utf-8"><title>읽기 수명 검증</title><div id="root"></div></html>');
  await page.addScriptTag({ content: script });
  await expect.poll(() => page.evaluate(() => window.__asyncReadFixture.photos.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__asyncReadFixture.history.length)).toBe(1);
}

test("school photo zoom waits for fresh bytes after revoking the prior original", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__asyncReadFixture.resolvePhoto(0));
  await expect(page.getByRole("img")).toBeVisible();
  const oldUrl = await page.getByRole("img").getAttribute("src");
  await page.getByRole("button", { name: "사진 확대 전환" }).click();
  expect(await page.evaluate(() => window.__asyncReadFixture.revoked)).toContain(oldUrl);
  await page.getByRole("button", { name: "사진 확대 전환" }).click();
  await expect(page.getByLabel("사진 상태")).toHaveText("loading");
  await expect(page.getByRole("img")).toHaveCount(0);
  await page.evaluate(() => window.__asyncReadFixture.resolvePhoto(1));
  await expect(page.getByRole("img")).toBeVisible();
  expect(await page.getByRole("img").getAttribute("src")).not.toBe(oldUrl);
  expect(await page.evaluate(() => window.__asyncReadFixture.errors)).toEqual([]);
});

test("school photo stays stable for the same version and hides bytes on session change", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__asyncReadFixture.resolvePhoto(0));
  await expect(page.getByRole("img")).toBeVisible();
  const oldUrl = await page.getByRole("img").getAttribute("src");
  await page.getByRole("button", { name: "사진 설명 새로고침" }).click();
  expect(await page.evaluate(() => window.__asyncReadFixture.photos.length)).toBe(1);
  await expect(page.getByRole("img")).toHaveAttribute("src", oldUrl!);
  await page.getByRole("button", { name: "세션 변경" }).click();
  await expect(page.getByLabel("사진 상태")).toHaveText("loading");
  expect(await page.evaluate(() => window.__asyncReadFixture.photoFrames.filter(frame => frame.session === "SESSION-2").every(frame => frame.url === null))).toBe(true);
  await page.getByRole("button", { name: "화면 닫기" }).click();
  await page.evaluate(() => window.__asyncReadFixture.resolvePhoto(1));
  await expect(page.getByRole("img")).toHaveCount(0);
  expect(await page.evaluate(() => window.__asyncReadFixture.revoked)).toEqual([oldUrl]);
});

for (const outcome of ["resolve", "reject"] as const) {
  test(`history ignores an older page ${outcome} after a saved visit refresh`, async ({ page }) => {
    await open(page);
    await page.evaluate(() => window.__asyncReadFixture.resolveHistory(0, "first"));
    await page.getByRole("button", { name: "기록 더 보기", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__asyncReadFixture.history.length)).toBe(2);
    await page.getByRole("button", { name: "방문 저장 후 갱신" }).click();
    await expect.poll(() => page.evaluate(() => window.__asyncReadFixture.history.length)).toBe(3);
    await page.evaluate(() => window.__asyncReadFixture.resolveHistory(2, "refreshed"));
    await expect(page.getByLabel("기록 커서")).toHaveText("refreshed");
    await page.getByRole("button", { name: "기록 더 보기", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__asyncReadFixture.history.length)).toBe(4);
    await page.evaluate(outcome => outcome === "resolve" ? window.__asyncReadFixture.resolveHistory(1, "old-page", false) : window.__asyncReadFixture.rejectHistory(1), outcome);
    await expect(page.getByLabel("기록 커서")).toHaveText("refreshed");
    await expect(page.getByLabel("추가 요청 상태")).toHaveText("true");
    await page.evaluate(() => window.__asyncReadFixture.resolveHistory(3, "fresh-page", false));
    await expect(page.getByLabel("기록 목록")).toHaveText("refreshed,fresh-page");
    await expect(page.getByLabel("다음 기록 여부")).toHaveText("false");
    expect(await page.evaluate(() => window.__asyncReadFixture.errors)).toEqual([]);
  });
}

test("history starts only one request for repeated same-tick pagination", async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.__asyncReadFixture.resolveHistory(0, "first"));
  await page.getByRole("button", { name: "연속 더 보기" }).click();
  expect(await page.evaluate(() => window.__asyncReadFixture.history.length)).toBe(2);
  await page.getByRole("button", { name: "화면 닫기" }).click();
  await page.evaluate(() => window.__asyncReadFixture.rejectHistory(1));
  expect(await page.evaluate(() => window.__asyncReadFixture.errors)).toEqual([]);
});
