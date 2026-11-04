import { expect, test as base, type BrowserContext, type Page } from "@playwright/test";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { buildInventoryPhotoFixture } from "../helpers/build-inventory-photo-fixture";
import type { PhotoDurabilityFixture } from "./fixtures/delivery-photo-durability";
import type { PhotoStoreFixture } from "./fixtures/delivery-photo-store";

declare global { interface Window { __photoDurability: PhotoDurabilityFixture; __photoStore: PhotoStoreFixture } }

const test = base.extend({
  context: async ({ playwright, browserName, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch }, provide, testInfo) => {
    const context = await playwright[browserName].launchPersistentContext(testInfo.outputPath("profile"), {
      viewport, ...(userAgent === undefined ? {} : { userAgent }), ...(deviceScaleFactor === undefined ? {} : { deviceScaleFactor }),
      isMobile, hasTouch, serviceWorkers: "block",
    });
    const audit: Array<{ type: string; detail: string }> = [];
    context.on("page", (page) => {
      page.on("console", (message) => { if (message.type() === "error") audit.push({ type: "console-error", detail: message.text() }); });
      page.on("requestfailed", (request) => audit.push({ type: "request-failed", detail: `${request.url()} ${request.failure()?.errorText}` }));
      page.on("response", (response) => { if (response.status() >= 400) audit.push({ type: "http-error", detail: `${response.url()} ${response.status()}` }); });
    });
    try { await provide(context); }
    finally {
      await testInfo.attach("console-network-audit", { body: JSON.stringify(audit, null, 2), contentType: "application/json" });
      await context.close();
      const interruptedUpload = testInfo.title.includes("lost server response") || testInfo.title.includes("version 1 retryable photo");
      expect(audit.filter((entry) => !interruptedUpload || (entry.type === "console-error"
        ? !entry.detail.startsWith("Failed to load resource:")
        : !entry.detail.startsWith("https://photo-durability.test/upload "))), "Unexpected console or network failure").toEqual([]);
    }
  },
});

let fixture: Awaited<ReturnType<typeof buildInventoryPhotoFixture>>;
let storeFixture: Awaited<ReturnType<typeof buildInventoryPhotoFixture>>;
let jpeg: Buffer;
test.beforeAll(async () => {
  jpeg = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#157ca1" } }).jpeg().toBuffer();
  storeFixture = await buildInventoryPhotoFixture("tests/e2e/fixtures/delivery-photo-store.ts");
  fixture = await buildInventoryPhotoFixture("tests/e2e/fixtures/delivery-photo-durability.tsx", [{
    name: "durability-io", setup(builder) {
      builder.onResolve({ filter: /delivery-photo-create-repository$|auth\/private-client-state$/ }, (args) => ({ path: args.path, namespace: "durability-io" }));
      builder.onLoad({ filter: /.*/, namespace: "durability-io" }, ({ path }) => ({ loader: "js", contents: path.endsWith("private-client-state")
        ? "export const registerPrivateBlobUrl=url=>url;export const forgetPrivateBlobUrl=url=>URL.revokeObjectURL(url);"
        : `export const deliveryPhotoCreateRepository={async create(input){window.__photoDurability.requests.push(input);let response;try{response=await fetch('/upload',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});}catch{throw Object.assign(Error('fixture connection interrupted'),{code:'unavailable'})}if(!response.ok)throw Object.assign(Error('fixture unavailable'),{code:'unavailable'});return response.json();}};` }));
    },
  }]);
  fixture.css = fixture.css.replace(/^@import "tailwindcss" source\("\.\.\/"\);$/m, "");
});

async function install(context: BrowserContext, options: { loseFirstResponse?: boolean; unavailable?: boolean } = {}) {
  const requests: Array<{ requestId: string; fileBase64: string }> = [];
  const photos = new Map<string, object>();
  const errors: string[] = [];
  const external: string[] = [];
  context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "https://photo-durability.test") { external.push(url.href); await route.abort(); return; }
    if (url.pathname === "/store") { await route.fulfill({ contentType: "text/html", body: `<input type="file"><script>${storeFixture.script.replaceAll("</script>", "<\\/script>")}</script>` }); return; }
    if (url.searchParams.has("seed")) { await route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Legacy outbox</title>" }); return; }
    if (url.pathname === "/upload") {
      const input = route.request().postDataJSON(); requests.push(input);
      if (options.unavailable) { await route.fulfill({ status: 503, body: "offline fixture" }); return; }
      if (!photos.has(input.requestId)) photos.set(input.requestId, { photoId: input.requestId, customerId: input.customerId,
        source: input.source, deliveryDateKey: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
        createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 604_800_000).toISOString(),
        createdByEmployeeId: "DURABILITY", createdByName: "합성 직원", thumbnail: { width: 160, height: 120 } });
      if (options.loseFirstResponse && requests.length === 1) { await route.abort("failed"); return; }
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(photos.get(input.requestId)) }); return;
    }
    await route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fixture.css}</style><div id="root"></div><script>${fixture.script.replaceAll("</script>", "<\\/script>")}</script></html>` });
  });
  return { requests, photos, errors, external };
}

for (const stage of ["source", "prepared"] as const) {
  test(`${stage} bytes survive repeated lease and retry state writes after reopening the page`, async ({ context }) => {
    const evidence = await install(context);
    const first = await context.newPage(); await first.goto("https://photo-durability.test/store");
    await first.locator("input").setInputFiles({ name: "state-writes.jpg", mimeType: "image/jpeg", buffer: jpeg });
    await first.evaluate(async (stage) => {
      const store = window.__photoStore; const scope = await store.activate("state-byte-check");
      const file = document.querySelector("input")!.files![0]!;
      await store.add(scope, { version: 1, owner: scope.owner, lease: null, confirmed: null, approvedDay: "2026-11-04",
        source: stage === "source" ? file : null,
        prepared: stage === "prepared" ? { blob: file, width: 1600, height: 1200, contentType: "image/jpeg" } : null,
        job: { jobId: "immutable", requestId: "same-request", customerId: "customer", source: "camera", status: "failed",
          errorCategory: "retryable", durable: true, message: "", startedAt: Date.now(), updatedAt: Date.now() } });
      document.querySelector("input")!.value = "";
    }, stage);
    await first.close();
    const page = await context.newPage(); await page.goto("https://photo-durability.test/store");
    const hashes = await page.evaluate(async (stage) => {
      const store = window.__photoStore; const scope = await store.activate("state-byte-check"); const hashes: string[] = [];
      for (let iteration = 0; iteration < 16; iteration++) {
        const record = await store.claim(scope, "immutable", "worker", stage === "source" ? "prepare" : "upload", Date.now());
        if (!record) throw Error("Photo was not claimed");
        record.lease = null; record.job = { ...record.job, attempts: iteration, updatedAt: Date.now() };
        await store.save(scope, record, "worker");
        await new Promise((resolve) => setTimeout(resolve, 50));
        const restored = (await store.list(scope))[0]!;
        const blob = restored.source ?? restored.prepared?.blob;
        if (!blob || restored.job.requestId !== "same-request") throw Error("Stored payload or request was lost");
        hashes.push(Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())), (byte) => byte.toString(16).padStart(2, "0")).join(""));
      }
      return hashes;
    }, stage);
    expect(hashes).toEqual(Array(16).fill(createHash("sha256").update(jpeg).digest("hex")));
    expect(evidence.requests).toEqual([]); expect(evidence.errors).toEqual([]); expect(evidence.external).toEqual([]);
  });
}

async function capture(page: Page, buffer = jpeg) {
  const choosing = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "납품사진 촬영", exact: true }).click();
  await (await choosing).setFiles({ name: "capture.jpg", mimeType: "image/jpeg", buffer });
  await expect.poll(() => page.evaluate(() => window.__photoDurability.coordinator.getSnapshot().length)).toBe(1);
  return page.evaluate(() => window.__photoDurability.coordinator.getSnapshot()[0]!.requestId);
}

test("a photo survives closing the page during source reading and resumes with the same request", async ({ context }) => {
  const evidence = await install(context);
  const first = await context.newPage();
  await first.goto("https://photo-durability.test/?readDelay=2500");
  const requestId = await capture(first);
  await first.waitForTimeout(250);
  const pending = await first.evaluate(async () => (await window.__photoDurability.records()).map((record) => record.job.requestId));
  await first.close();
  const resumed = await context.newPage(); await resumed.goto("https://photo-durability.test/");
  await expect(resumed.getByText("✓ 저장 완료", { exact: true })).toBeVisible({ timeout: 10_000 });
  expect(evidence.requests.map((request) => request.requestId)).toEqual([requestId]);
  expect(evidence.photos.size).toBe(1);
  expect(pending).toEqual([requestId]);
  expect(evidence.errors).toEqual([]); expect(evidence.external).toEqual([]);
});

test("a lost server response retries the same bytes without duplicate photos", async ({ context }) => {
  const evidence = await install(context, { loseFirstResponse: true });
  const page = await context.newPage(); await page.goto("https://photo-durability.test/");
  const requestId = await capture(page);
  await expect(page.getByText("✓ 저장 완료", { exact: true })).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => window.__photoDurability.storageErrors)).toEqual([]);
  expect(evidence.requests).toHaveLength(2);
  expect(evidence.requests[1]).toEqual(evidence.requests[0]);
  expect(evidence.requests[0]!.requestId).toBe(requestId);
  expect(evidence.photos.size).toBe(1);
  expect(evidence.errors).toEqual([]); expect(evidence.external).toEqual([]);
});

test("pagehide during the device write does not discard the committed photo", async ({ context }) => {
  const evidence = await install(context);
  const page = await context.newPage(); await page.goto("https://photo-durability.test/?delayStore");
  const requestId = await capture(page);
  await expect(page.getByText("기기 보관이 끝나지 않은 사진이 있어요. 보관될 때까지 잠시 화면을 유지해주세요.", { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("device-write-pending.png"), fullPage: true });
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
  await expect.poll(() => page.evaluate(async () => (await window.__photoDurability.records()).map((record) => record.job.requestId))).toEqual([requestId]);
  await page.close();
  const resumed = await context.newPage(); await resumed.goto("https://photo-durability.test/");
  try { await expect(resumed.getByText("✓ 저장 완료", { exact: true })).toBeVisible({ timeout: 10_000 }); }
  finally {
    const evidencePath = test.info().outputPath("restored-file-reads.json");
    await writeFile(evidencePath, JSON.stringify(await resumed.evaluate(() => ({ reads: window.__photoDurability.reads,
      storageErrors: window.__photoDurability.storageErrors, jobs: window.__photoDurability.coordinator.getSnapshot() })), null, 2));
    await test.info().attach("restored-file-reads", { path: evidencePath, contentType: "application/json" });
  }
  expect(evidence.photos.size).toBe(1);
  expect(evidence.requests[0]!.requestId).toBe(requestId);
  expect(evidence.errors).toEqual([]); expect(evidence.external).toEqual([]);
});

test("storage failure never claims the photo is kept or sends it to the server", async ({ context }) => {
  const evidence = await install(context);
  const page = await context.newPage(); await page.goto("https://photo-durability.test/?failStore");
  await capture(page);
  await expect(page.getByRole("button", { name: "보관 다시 시도", exact: true })).toBeVisible();
  await expect(page.getByText("기기 보관이 끝나지 않은 사진이 있어요. 보관될 때까지 잠시 화면을 유지해주세요.", { exact: true })).toBeVisible();
  await expect(page.getByText("기기 보관 완료 · 서버 저장 대기", { exact: true })).toHaveCount(0);
  await expect(page.getByText("✓ 저장 완료", { exact: true })).toHaveCount(0);
  expect(evidence.requests).toEqual([]);
  expect(await page.evaluate(() => window.__photoDurability.coordinator.canRetry(window.__photoDurability.coordinator.getSnapshot()[0]!.jobId))).toBe(true);
  await page.screenshot({ path: test.info().outputPath("device-storage-failed.png"), fullPage: true });
  expect(evidence.errors).toEqual([]); expect(evidence.external).toEqual([]);
});

for (const stage of ["source", "prepared", "retryable"] as const) {
  test(`an existing version 1 ${stage} photo survives the outbox upgrade and finishes the same request`, async ({ context }) => {
    const options = { unavailable: stage === "retryable" };
    const evidence = await install(context, options);
    const seed = await context.newPage(); await seed.goto("https://photo-durability.test/?seed");
    await seed.evaluate(async ({ bytes, stage }) => {
      const request = indexedDB.open("onnuriway:private:delivery-photo-outbox:v1", 1);
      request.onupgradeneeded = () => { request.result.createObjectStore("jobs"); request.result.createObjectStore("scope"); };
      const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const owner = JSON.stringify(["durability-user", "DURABILITY", 1, 1]);
      const file = new File([new Uint8Array(bytes)], "legacy.jpg", { type: "image/jpeg" });
      const transaction = db.transaction(["jobs", "scope"], "readwrite");
      transaction.objectStore("scope").put({ owner, token: "legacy-scope" }, "current");
      transaction.objectStore("jobs").add({ version: 1, owner, lease: null, confirmed: null,
        source: stage === "source" ? file : null,
        prepared: stage !== "source" ? { blob: file, width: 1600, height: 1200, contentType: "image/jpeg" } : null,
        approvedDay: new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }),
        job: { jobId: "legacy-job", requestId: "legacy-request", customerId: "customer", source: "camera",
          status: stage === "source" ? "preparing" : stage === "retryable" ? "failed" : "queued",
          errorCategory: stage === "retryable" ? "retryable" : null, message: "", durable: true,
          startedAt: Date.now() - 60_000, updatedAt: Date.now() - 60_000, attempts: stage === "retryable" ? 4 : 0, retryAt: 0 } }, "legacy-job");
      await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error); });
      db.close();
    }, { bytes: [...jpeg], stage });
    await seed.close();
    const page = await context.newPage(); await page.goto("https://photo-durability.test/");
    if (stage === "retryable") {
      await expect(page.getByText("전송을 마치지 못했어요. 사진은 보관 중이에요.", { exact: true })).toBeVisible();
      expect(evidence.requests).toHaveLength(1);
      options.unavailable = false;
      await page.evaluate(() => {
        const now = Date.now; Date.now = () => now() + 3_000;
        window.dispatchEvent(new Event("online")); window.dispatchEvent(new Event("focus"));
        document.dispatchEvent(new Event("visibilitychange")); document.dispatchEvent(new Event("resume"));
      });
    }
    await expect(page.getByText("✓ 저장 완료", { exact: true })).toBeVisible({ timeout: 10_000 });
    expect(evidence.requests).toHaveLength(stage === "retryable" ? 2 : 1);
    expect(evidence.requests[0]!.requestId).toBe("legacy-request");
    if (stage !== "source") expect(Buffer.from(evidence.requests[0]!.fileBase64, "base64")).toEqual(jpeg);
    if (stage === "retryable") expect(evidence.requests[1]).toEqual(evidence.requests[0]);
    expect(evidence.photos.size).toBe(1);
    expect(evidence.errors).toEqual([]); expect(evidence.external).toEqual([]);
  });
}
