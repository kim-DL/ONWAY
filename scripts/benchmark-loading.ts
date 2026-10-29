import { chromium, expect as baseExpect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { PHASE3_TEST_PINS } from "./fixtures/phase3-auth";
import { assertInventoryE2EEnvironment, INVENTORY_E2E_ORIGIN } from "./inventory-e2e-safety";

assertInventoryE2EEnvironment();
const expect = baseExpect.configure({ timeout: 30_000 });
if (process.env.INVENTORY_E2E_STATIC !== "true") throw new Error("Loading measurement requires the isolated static demo build.");
const label = process.env.INVENTORY_BENCHMARK_LABEL;
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error("A safe loading comparison label is required.");
const output = `output/loading-experience-20261029/${label}`;
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
type Timings = { firstSurface?: number; firstStableSurface?: number; pinReady?: number; shellReady?: number; workReady?: number; stages: { name: string; at: number }[] };
const samples: { iteration: number; journey: string; timings: Timings }[] = [];
async function ready(page: Page) {
  const search = page.getByLabel("품목 검색", { exact: true });
  await expect(search).toBeEditable({ timeout: 30_000 });
  await search.fill("검증");
  await expect(search).toHaveValue("검증");
  await search.fill("");
}
try {
  for (let iteration = -1; iteration < 5; iteration++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, serviceWorkers: "block" });
    await context.grantPermissions(["local-network-access"], { origin: INVENTORY_E2E_ORIGIN });
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      return ["127.0.0.1", "localhost"].includes(url.hostname) || ["data:", "blob:"].includes(url.protocol) ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await page.addInitScript(() => {
      const state: Timings = { stages: [] };
      (window as unknown as { loadingTimings: typeof state }).loadingTimings = state;
      let last = "";
      let brandBounds = "";
      let stableFrames = 0;
      const frame = () => {
        const now = Math.round(performance.now());
        const brand = document.querySelector(".auth-brand, .workspace-header");
        if (brand) {
          state.firstSurface ??= now;
          const bounds = JSON.stringify(brand.getBoundingClientRect().toJSON());
          stableFrames = bounds === brandBounds ? stableFrames + 1 : 1;
          brandBounds = bounds;
          if (stableFrames >= 3) state.firstStableSurface ??= now;
        }
        if (document.querySelector<HTMLInputElement>("#employee-pin:not(:disabled)")) state.pinReady ??= now;
        if (document.querySelector(".workspace-header")) state.shellReady ??= now;
        const mode = document.querySelector("main.workspace-shell")?.getAttribute("data-mode");
        const ready = mode === "inventory" && document.querySelector('input[aria-label="품목 검색"]:not(:disabled)');
        if (ready) state.workReady ??= now;
        const stage = ready ? "work-ready" : document.querySelector("[data-workspace-loading], .shell-feature-loading") ? "workspace-placeholder" : document.querySelector(".workspace-header") ? "shell" : document.querySelector("#employee-pin") ? "pin" : document.querySelector(".auth-brand") ? "launch" : "document";
        if (stage !== last) { state.stages.push({ name: stage, at: now }); last = stage; }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 120, downloadThroughput: 200_000, uploadThroughput: 100_000 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.goto(INVENTORY_E2E_ORIGIN);
    await expect(page.getByLabel("직원 PIN")).toBeEditable();
    if (iteration === 0) {
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await page.screenshot({ path: `${output}/pin-${width}.png`, fullPage: true });
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    const anonymous = await page.evaluate(() => (window as unknown as { loadingTimings: Timings }).loadingTimings);
    await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.delivery);
    await page.getByRole("button", { name: "급식길 시작하기", exact: true }).click();
    await expect(page.locator(".school-search-trigger")).toBeEnabled();
    const trigger = page.getByRole("button", { name: /^업무 모드 변경, 현재 / });
    await trigger.click();
    await page.getByRole("dialog", { name: "업무 모드 선택", exact: true }).locator('button[data-mode="inventory"]').click();
    await ready(page);
    await cdp.send("Network.clearBrowserCache");
    // Request interception intentionally blocks external hosts and disables HTTP cache.
    // The second navigation repeats in the same authenticated context; it is not a cache-warm claim.
    for (const journey of ["resume-cold-assets", "resume-repeat"]) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await ready(page);
      const timings = await page.evaluate(() => (window as unknown as { loadingTimings: Timings }).loadingTimings);
      if (iteration >= 0) samples.push({ iteration, journey, timings });
      if (iteration === 0) await page.screenshot({ path: `${output}/${journey}.png`, fullPage: true });
    }
    if (iteration >= 0) samples.push({ iteration, journey: "anonymous-cold", timings: anonymous });
    await context.close();
    console.log(`Loading comparison ${label}: ${iteration < 0 ? "warmup" : iteration + 1} complete`);
  }
  writeFileSync(`${output}/timings.json`, JSON.stringify({ method: { source: "isolated static demo build, real emulator authentication", browser: browser.version(), viewport: [390, 844], cpu: 4, latencyMs: 120, downloadBytesPerSecond: 200_000, serviceWorker: "blocked for asset comparison", httpCache: "disabled by local-host-only request interception; repeat is the same context, not warm HTTP cache", samplesPerJourney: 5, warmup: "one excluded journey", timing: "requestAnimationFrame DOM observation from navigation; firstSurface is the brand appearing, firstStableSurface is its rectangle unchanged for three consecutive animation frames, shellReady is the header, workReady is inventory search input (fill and clear verified), not data freshness or all-workflow readiness", limitations: "Synthetic local data, emulator warmed; not real-device or production p75 evidence." }, samples }, null, 2));
} finally { await browser.close(); }
