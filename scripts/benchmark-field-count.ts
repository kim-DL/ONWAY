import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore, type Transaction } from "firebase-admin/firestore";
import { InventoryService, summarizeInventoryLots } from "../functions/src/inventory/inventory-service.js";
import { summarizeInventoryLotGroups } from "../functions/src/inventory/inventory-stock-summary.js";
import { persisted } from "../functions/src/inventory/inventory-document-codec.js";
import { INVENTORY_PRODUCT_PATH, inventoryProductDraftSchema, type InventoryLot } from "../functions/src/inventory/inventory-contract.js";
import { observeFieldCount, type FieldLatency } from "../functions/src/shared/field-latency.js";

// Real SDK/Firestore transactions against a demo emulator only. The delayed
// trials add a stated, controlled delay before each read RPC; they are not
// observations of production Cloud Functions, network RTT or cold starts.
assert.equal(process.env.GCLOUD_PROJECT, "demo-onnuriway");
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^(127\.0\.0\.1|localhost):\d+$/);
assert.ok(!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_TOKEN);
const db = getFirestore(initializeApp({ projectId: "demo-onnuriway" }, "field-count-benchmark"));
const BaselineService = (await import(pathToFileURL(resolve(".cache/field-p0/baseline/functions/src/inventory/inventory-service.ts")).href)).InventoryService as typeof InventoryService;
const clock = () => new Date("2026-10-18T02:00:00.000Z");
const actor = { uid: "field-count-benchmark", employeeId: "FIELD-COUNT-BENCHMARK", roleScopes: ["delivery" as const], sessionVersion: 1, permissionsVersion: 1, isAdmin: false };
await db.doc(`authz/${actor.uid}`).set({ ...actor, active: true });
await db.doc(`employees/${actor.employeeId}`).set({ employeeId: actor.employeeId, firebaseUid: actor.uid, status: "active", sessionVersion: 1, roleScopes: actor.roleScopes });
const fixtureService = new InventoryService(db, clock);
const context = await fixtureService.context();
const runs = 30;
type Counts = { batches: number; documents: number; writes: number };
function measuredDb(delayMs: number, counts: Counts): Firestore {
  return new Proxy(db, { get(target, key) {
    if (key === "runTransaction") return <T>(action: (transaction: Transaction) => Promise<T>) => target.runTransaction((transaction) => {
      const proxy = new Proxy(transaction, { get(tx, name) {
        const member: unknown = Reflect.get(tx, name, tx); if (typeof member !== "function") return member;
        return (...args: unknown[]) => {
          if (name === "get" || name === "getAll") return (async () => {
            counts.batches++; if (delayMs) await new Promise((done) => setTimeout(done, delayMs));
            const value: unknown = await Reflect.apply(member, tx, args);
            counts.documents += Array.isArray(value) ? value.length : value && typeof value === "object" && "docs" in value && Array.isArray(value.docs) ? value.docs.length : 1;
            return value;
          })();
          if (["create", "set", "update", "delete"].includes(String(name))) counts.writes++;
          const result: unknown = Reflect.apply(member, tx, args); return result === tx ? proxy : result;
        };
      } });
      return action(proxy);
    });
    const member: unknown = Reflect.get(target, key, target); return typeof member === "function" ? member.bind(target) : member;
  } });
}
async function fixture(lotCount: number) {
  const saved = await fixtureService.save({ requestId: randomUUID(), productId: null, expectedRevision: null,
    draft: inventoryProductDraftSchema.parse({ name: "합성 성능 품목", manufacturer: "합성 제조사", specification: "벤치마크", origin: "대한민국", unitLabel: "봉", unitsPerBox: 1, defaultLocationId: "freezer1", note: "", urgent: false }),
    initialStock: { quantity: 10, lot: { label: "", expiryState: "dated", expiryDate: "2026-12-31" } } }, actor);
  const detail = await fixtureService.detail(saved.productId, actor);
  const lots: InventoryLot[] = Array.from({ length: lotCount }, (_, index) => ({ ...detail.lots[0]!, lotId: `field-lot-${index}`, originLotId: `field-lot-${index}` }));
  const batch = db.batch();
  batch.delete(db.doc(`${INVENTORY_PRODUCT_PATH}/${saved.productId}/lots/${detail.lots[0]!.lotId}`));
  for (const lot of lots) batch.set(db.doc(`${INVENTORY_PRODUCT_PATH}/${saved.productId}/lots/${lot.lotId}`), persisted(lot));
  batch.set(db.doc(`${INVENTORY_PRODUCT_PATH}/${saved.productId}`), persisted({ ...detail.product, ...summarizeInventoryLots(lots), lotSummary: summarizeInventoryLotGroups(lots) }));
  await batch.commit();
  return { productId: saved.productId, revision: saved.stockRevision, counts: lots.map((lot) => ({ lotId: lot.lotId, quantity: lot.quantity })) };
}
const cases = [];
for (const lots of [1, 200]) {
  for (const readDelayMs of [0, 120]) {
    const products = { before: await fixture(lots), after: await fixture(lots) };
    const samples: Record<"before" | "after", Array<{ ms: number; counts: Counts; stages: FieldLatency }>> = { before: [], after: [] };
    for (let trial = -1; trial < runs; trial++) {
      for (const phase of trial % 2 ? ["after", "before"] as const : ["before", "after"] as const) {
        const product = products[phase]; const counts = { batches: 0, documents: 0, writes: 0 };
        const Service = phase === "before" ? BaselineService : InventoryService;
        const service = new Service(measuredDb(readDelayMs, counts), clock); let observation!: FieldLatency;
        const started = performance.now();
        const result = await observeFieldCount(() => service.count({ requestId: randomUUID(), productId: product.productId, locationId: "freezer1",
          cycleId: context.cycle.cycleId, expectedStockRevision: product.revision, counts: product.counts, reason: "", matchOnly: true, includeDetail: true }, actor), (value) => { observation = value; });
        const elapsed = performance.now() - started;
        assert.equal(result.event.kind, "count_match"); assert.equal(result.product.quantityByLocation.freezer1, lots * 10); assert.equal(result.detail?.lots.length, lots);
        if (trial >= 0) samples[phase].push({ ms: elapsed, counts, stages: observation });
      }
    }
    const percentile = (values: number[], fraction: number) => values.sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]!;
    const summary = Object.fromEntries(Object.entries(samples).map(([phase, values]) => [phase, {
      n: values.length, p50Ms: percentile(values.map((value) => value.ms), 0.5), p95Ms: percentile(values.map((value) => value.ms), 0.95),
      readBatches: [...new Set(values.map((value) => value.counts.batches))], documentReads: [...new Set(values.map((value) => value.counts.documents))],
      writeAttempts: [...new Set(values.map((value) => value.counts.writes))],
    }]));
    cases.push({ lots, readDelayMs, summary, samples }); console.log(JSON.stringify({ lots, readDelayMs, summary }));
  }
}
const hash = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");
const report = { recordedAt: new Date().toISOString(), baseline: "main 04272ec", node: process.version, runs, warmups: 1,
  scope: "Real Firestore emulator transactions. Excludes callable pre/post authorization, internet, UI and Cloud Functions cold start. Delay=120ms is explicitly injected per read RPC. Alternating phase order; synthetic records only.",
  baselineSha256: await hash(".cache/field-p0/baseline/functions/src/inventory/inventory-service.ts"), candidateSha256: await hash("functions/src/inventory/inventory-service.ts"), cases };
await mkdir("output/playwright/field-latency", { recursive: true });
await writeFile("output/playwright/field-latency/count.json", JSON.stringify(report, null, 2));
await db.terminate();
