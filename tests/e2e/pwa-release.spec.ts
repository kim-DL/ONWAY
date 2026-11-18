import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { build } from "esbuild";
import { expect, test as base, type Page } from "@playwright/test";
import { buildInventoryPhotoFixture } from "../helpers/build-inventory-photo-fixture";
import { appRelease, releaseNotesRequest } from "../../src/features/pwa/release-notes";

let appHtml: string;
let currentWorker: string;
const legacyWorker = `self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("message",e=>{if(e.data?.type==="SKIP_WAITING")e.waitUntil(self.skipWaiting())});`;
const legacyHtml = `<!doctype html><html lang="ko"><meta charset="utf-8"><button hidden>업데이트</button><script>
navigator.serviceWorker.register("/sw.js").then(reg=>{
const button=document.querySelector("button");let accepted=false;
button.onclick=()=>{accepted=true;reg.waiting?.postMessage({type:"SKIP_WAITING"})};
navigator.serviceWorker.addEventListener("controllerchange",()=>{if(accepted)location.reload()});
reg.addEventListener("updatefound",()=>{const sw=reg.installing;sw.addEventListener("statechange",()=>{if(reg.waiting)button.hidden=false})});
});</script></html>`;

type Site = { url: string; serve: (page: "legacy" | "current", worker: string) => void };
const test = base.extend<{ site: Site }>({
  site: async ({}, runTest) => {
    let html = appHtml; let worker = currentWorker;
    const http = createServer((req, res) => {
      const path = req.url?.split("?")[0];
      res.setHeader("Cache-Control", "no-store");
      if (path === "/api/connectivity") { res.writeHead(204); res.end(); return; }
      if (path === "/sw.js") { res.setHeader("Content-Type", "application/javascript"); res.end(worker); return; }
      if (path === "/") { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(html); return; }
      res.writeHead(404); res.end();
    });
    await new Promise<void>((ready) => http.listen(0, "127.0.0.1", ready));
    try {
      await runTest({ url: `http://127.0.0.1:${(http.address() as AddressInfo).port}`,
        serve: (version, script) => { html = version === "legacy" ? legacyHtml : appHtml; worker = script; } });
    } finally { http.closeAllConnections(); await new Promise<void>((done) => http.close(() => done())); }
  },
});
test.beforeAll(async () => {
  const fixture = await buildInventoryPhotoFixture("tests/e2e/fixtures/pwa-release.tsx", [{ name: "production-pwa", setup(builder) {
    builder.initialOptions.define!["process.env.NODE_ENV"] = '"production"';
  } }]);
  appHtml = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${fixture.css}</style></head><body><div id="root"></div><script>${fixture.script.replaceAll("</script>", "<\\/script>")}</script></body></html>`;
  const result = await build({ entryPoints: ["src/app/sw.ts"], bundle: true, write: false, define: { "process.env.NODE_ENV": '"production"' } });
  currentWorker = result.outputFiles[0]!.text;
});

async function update(page: Page) {
  await page.evaluate(async () => (await navigator.serviceWorker.ready).update().then(() => undefined));
}
const ready = (page: Page) => page.getByTestId("pwa-update-ready");
const installed = (page: Page) => page.getByTestId("pwa-update-installed");

test("first install is quiet and a waiting worker supplies its own notes without disturbing a draft", async ({ page, site }) => {
  await page.goto(site.url);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("onnuriway.pwa.release"))).toBe(appRelease.id);
  await expect(installed(page)).toHaveCount(0);
  const memo = page.getByRole("textbox", { name: "현장 메모" }); await memo.fill("납품 메모");
  const future = { ...appRelease, id: "next-fixture", changes: [{ title: "배송 시간표", text: "다음 버전의 안내입니다." }] };
  site.serve("current", legacyWorker + `self.addEventListener("message",e=>{if(e.data===${JSON.stringify(releaseNotesRequest)})e.ports[0].postMessage(${JSON.stringify(future)})})`);
  await update(page);
  await expect(ready(page)).toContainText("다음 버전의 안내입니다.");
  await expect(memo).toBeFocused();
  await ready(page).getByRole("button", { name: "나중에" }).click();
  await expect(ready(page)).toHaveCount(0); await expect(memo).toHaveValue("납품 메모");
  expect(await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).waiting))).toBe(true);
});

test("this release is shown once after accepting the previous production-style prompt", async ({ page, site }) => {
  site.serve("legacy", legacyWorker);
  await page.goto(site.url); await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  site.serve("current", currentWorker);
  await update(page); await page.getByRole("button", { name: "업데이트", exact: true }).click();
  await expect(installed(page)).toContainText("급식길을 업데이트했어요");
  await expect(installed(page).getByText("카카오맵", { exact: true })).toBeVisible();
  await installed(page).getByRole("button", { name: "확인" }).click();
  await page.reload(); await expect(page.getByRole("textbox")).toBeVisible();
  await expect(installed(page)).toHaveCount(0);
});

test("only the accepting tab reloads and update controls fit narrow and enlarged screens", async ({ page, context, site }) => {
  site.serve("current", legacyWorker);
  await page.goto(site.url); await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const other = await context.newPage(); await other.goto(site.url);
  const memo = page.getByRole("textbox"); await memo.fill("계속 작성 중");
  site.serve("current", currentWorker); await update(other);
  await expect(ready(page)).toContainText("연속 촬영"); await expect(ready(other)).toContainText("납품 순서");
  for (const width of [320, 390, 430, 1280]) {
    await other.setViewportSize({ width, height: 800 });
    for (const size of ["100%", "200%"]) {
      await other.evaluate((value) => { document.documentElement.style.fontSize = value; }, size);
      expect(await ready(other).evaluate((element) => element.scrollWidth <= element.clientWidth + 1
        && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const action of await ready(other).getByRole("button").all()) {
        const bounds = await action.boundingBox(); expect(bounds!.height).toBeGreaterThanOrEqual(44);
      }
    }
  }
  await ready(other).getByRole("button", { name: "지금 업데이트" }).click();
  await expect(installed(other)).toContainText("급식길을 업데이트했어요");
  await expect(ready(page)).toHaveCount(0); await expect(memo).toHaveValue("계속 작성 중");
});
