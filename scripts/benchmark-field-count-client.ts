import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { INVENTORY_PRODUCT_PATH, inventoryProductSchema, inventoryLotSchema, inventoryLocationMap } from "../src/domain/inventory";
import { PHASE3_TEST_PINS } from "./fixtures/phase3-auth";
import { assertInventoryE2EEnvironment, INVENTORY_E2E_ORIGIN } from "./inventory-e2e-safety";

assertInventoryE2EEnvironment();
const label = process.env.INVENTORY_BENCHMARK_LABEL ?? "after";
assert.match(label, /^[a-z0-9-]+$/);
const db = getFirestore(getApps().find((app) => app.name === "phase1-seed")!);
const productId = "field-count-client";
const name = "현장 성능 검증 합성 품목";
const quantities = inventoryLocationMap(0); quantities.freezer1 = 10;
const expiry = inventoryLocationMap<string | null>(null); expiry.freezer1 = "2026-12-31";
const at = "2026-10-01T02:00:00.000Z";
const product = inventoryProductSchema.parse({ productId, companyId: "onnuri", name, manufacturer: "합성", specification: "1kg", origin: "대한민국",
  unitLabel: "봉", unitsPerBox: 1, defaultLocationId: "freezer1", urgent: false, status: "active", note: "", revision: 1, stockRevision: 1,
  hasHistory: false, quantityByLocation: quantities, nearestExpiryByLocation: expiry, lastCountByLocation: inventoryLocationMap(null), photo: null,
  createdAt: at, updatedAt: at, createdBy: "EMP-DELIVERY", updatedBy: "EMP-DELIVERY" });
const lot = inventoryLotSchema.parse({ lotId: "field-count-lot", originLotId: "field-count-lot", productId, locationId: "freezer1",
  quantity: 10, label: "합성", expiryState: "dated", expiryDate: "2026-12-31", revision: 1, createdAt: at, updatedAt: at });
await db.doc(`${INVENTORY_PRODUCT_PATH}/${productId}`).set(product);
await db.doc(`${INVENTORY_PRODUCT_PATH}/${productId}/lots/${lot.lotId}`).set(lot);
const browser = await chromium.launch({ headless: true });
const samples = [];
try {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: "block" });
  await context.grantPermissions(["local-network-access"], { origin: INVENTORY_E2E_ORIGIN });
  const page = await context.newPage(); page.setDefaultTimeout(30_000);
  const cdp = await context.newCDPSession(page); await cdp.send("Network.enable");
  let detailCalls = 0, countCalls = 0;
  page.on("request", (request) => { if (request.method() === "POST") {
    if (request.url().endsWith("/getInventoryProduct")) detailCalls++;
    if (request.url().endsWith("/recordInventoryCount")) countCalls++;
  } });
  await page.goto(INVENTORY_E2E_ORIGIN);
  await page.getByLabel("직원 PIN").fill(PHASE3_TEST_PINS.delivery);
  await page.getByRole("button", { name: "급식길 시작하기" }).click();
  const trigger = page.getByRole("button", { name: /^업무 모드 변경, 현재 / });
  await expect(trigger.or(page.getByRole("group", { name: "업무 모드" }))).toBeVisible({ timeout: 30_000 });
  if (await trigger.isVisible()) { await trigger.click(); await page.getByRole("dialog", { name: "업무 모드 선택" }).locator('button[data-mode="inventory"]').click(); }
  else await page.getByRole("group", { name: "업무 모드" }).locator('button[data-mode="inventory"]').click();
  await page.getByRole("button", { name: "목록 옵션", exact: true }).click();
  const options = page.getByRole("dialog", { name: "목록 옵션", exact: true });
  await options.getByRole("switch", { name: "재고조사 모드", exact: true }).check();
  await options.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("searchbox", { name: "품목 검색", exact: true }).fill(name);
  const row = page.getByRole("button", { name: new RegExp(`^${name}, .*상세 보기$`) });
  await expect(row).toBeVisible();
  // Setup/login/catalog startup are outside the click-to-confirm experiment.
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 120, downloadThroughput: 200000, uploadThroughput: 100000 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  for (let trial = -1; trial < 30; trial++) {
    await row.click(); const detail = page.getByRole("dialog", { name, exact: true });
    await detail.getByRole("button", { name: "수량 일치 확인", exact: true }).click();
    const count = page.getByRole("dialog", { name: "실물 수량 확인", exact: true });
    const submit = count.getByRole("button", { name: "일치 확인", exact: true });
    await submit.evaluate((button) => button.addEventListener("click", () => {
      (window as unknown as { fieldCountClick: number }).fieldCountClick = performance.now();
    }, { once: true }));
    const initialDetails = detailCalls, initialCounts = countCalls;
    const response = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/recordInventoryCount"));
    await submit.click(); const saved = await (await response).json();
    assert.equal(saved.result?.event?.kind, "count_match");
    const responseMs = await page.evaluate(() => performance.now() - (window as unknown as { fieldCountClick: number }).fieldCountClick);
    await expect(count).toHaveCount(0); await expect(detail).toHaveCount(0);
    const completedMs = await page.evaluate(() => performance.now() - (window as unknown as { fieldCountClick: number }).fieldCountClick);
    assert.equal(detailCalls - initialDetails, 0); assert.equal(countCalls - initialCounts, 1);
    if (trial >= 0) samples.push({ responseMs, completedMs, extraDetailCalls: 0, countCalls: 1 });
  }
  const percentile = (values: number[], fraction: number) => values.sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
  const summary = { n: samples.length, responseP50Ms: percentile(samples.map((sample) => sample.responseMs), .5), responseP95Ms: percentile(samples.map((sample) => sample.responseMs), .95),
    completedP50Ms: percentile(samples.map((sample) => sample.completedMs), .5), completedP95Ms: percentile(samples.map((sample) => sample.completedMs), .95) };
  mkdirSync("output/playwright/field-latency", { recursive: true });
  writeFileSync(`output/playwright/field-latency/count-client-${label}.json`, JSON.stringify({ label, recordedAt: new Date().toISOString(), browser: browser.version(),
    scope: "Production-mode PWA with real demo callable and Firestore emulator. Trusted click to observed response/DOM; includes polling, excludes real device and Cloud Functions cold start.",
    cpuThrottle: 4, rttMs: 120, downloadBytesPerSecond: 200000, uploadBytesPerSecond: 100000, warmups: 1, summary, samples }, null, 2));
  console.log(JSON.stringify({ label, summary }));
} finally { await browser.close(); }
