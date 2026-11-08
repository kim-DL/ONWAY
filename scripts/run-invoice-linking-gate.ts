import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import sharp from "sharp";
import { PlanningService } from "../functions/src/delivery-planning/planning-service";
import type { PlanningProviders } from "../functions/src/delivery-planning/planning-providers";
import type { PhotoExtraction } from "../functions/src/delivery-planning/photo-batch-contract";
import type { AddressIdentityResolver } from "../functions/src/delivery-planning/invoice-address";
import { photoAliasKey } from "../functions/src/delivery-planning/photo-batch-matching";

if (!/^(127\.0\.0\.1|localhost):\d+$/u.test(process.env.FIRESTORE_EMULATOR_HOST ?? "")
  || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_TOKEN) throw Error("Local emulator only");
const db = getFirestore(initializeApp({ projectId: "demo-onnuriway" }, `invoice-link-${randomUUID()}`), "invoice-linking-gate");
const date = "2026-11-09", clock = Timestamp.fromDate(new Date(`${date}T00:00:00Z`));
const image = (await sharp({ create: { width: 60, height: 90, channels: 3, background: "white" } }).jpeg().toBuffer()).toString("base64");
let passed = 0;
async function fixture() {
  const id = randomUUID(), employeeId = `employee-${id}`, uid = `uid-${id}`;
  const actor = { uid, employeeId, roleScopes: ["delivery"], isAdmin: false, sessionVersion: 1, permissionsVersion: 1 };
  await db.doc(`authz/${uid}`).set({ employeeId, active: true, sessionVersion: 1, permissionsVersion: 1 });
  await db.doc(`employees/${employeeId}`).set({ employeeId, firebaseUid: uid, roleScopes: actor.roleScopes, status: "active" });
  const customerId = `customer-${id}`, name = `식품${id}`;
  const ref = db.doc(`companies/onnuri/customers/${customerId}`);
  await ref.set({ customerId, name, officialAddress: "대전 유성구 예시중앙로 96", deliveryAddress: "", district: "유성구", companyId: "onnuri", status: "active", revision: 1 });
  const extraction: PhotoExtraction = { kind: "invoice", truncated: false, rows: [{ rawName: name, address: "대전 유성구 예시동 606-3", date, dateUncertain: false, uncertain: false }] };
  let reads = 0, lookups = 0;
  let resolve: AddressIdentityResolver = async () => ({ status: "found", addresses: ["대전 유성구 예시중앙로 96", "대전 유성구 예시동 606-3"] });
  const providers: PlanningProviders = { readPhotoBatch: async () => { reads++; return extraction; },
    readInvoice: async () => { reads++; const r = extraction.rows[0]!; return { recipientName: r.rawName, recipientAddress: r.address, invoiceDate: r.date, uncertain: r.uncertain }; },
    resolveAddress: async () => null, optimize: async () => { throw Error("unused"); }, resolveInvoiceAddress: async (address) => { lookups++; return resolve(address); } };
  const service = new PlanningService(providers, db, () => clock);
  const request = { requestId: randomUUID(), deliveryDateKey: date, fileBase64: image, contentType: "image/jpeg" as const };
  return { actor, customerId, name, ref, extraction, service, request, providers, setResolver: (r: AddressIdentityResolver) => { resolve = r; }, counts: () => ({ reads, lookups }) };
}
async function test(name: string, work: () => Promise<void>) { await work(); passed++; console.log(`PASS ${name}`); }

await test("canonical address evidence auto-saves one identity once and keeps the existing route", async () => {
  const f = await fixture(), oldId = `old-${randomUUID()}`;
  await db.doc(`companies/onnuri/deliveryPhotoRoutes/${f.actor.employeeId}`).set({ employeeId: f.actor.employeeId, customerIds: [oldId], revision: 5, updatedAt: clock, updatedByEmployeeId: f.actor.employeeId });
  const scan = await f.service.analyzePhotoBatch(f.request, f.actor);
  assert.equal(scan.rows[0]!.status, "saved"); assert.equal(scan.rows[0]!.customerId, f.customerId);
  assert.deepEqual(scan.lists!.route.customerIds, [oldId, f.customerId]); assert.equal(scan.lists!.route.revision, 6);
  const counts = f.counts(); assert.deepEqual(await f.service.analyzePhotoBatch(f.request, f.actor), scan); assert.deepEqual(f.counts(), counts);
  const receipt = await db.doc(`requestLocks/delivery-planning-${f.request.requestId}`).get();
  assert(!JSON.stringify(receipt.data()).includes(image)); assert(!JSON.stringify(receipt.data()).includes("addresses"));
});
await test("the legacy single-invoice path uses the same canonical identity", async () => {
  const f = await fixture(); const scan = await f.service.analyze(f.request, f.actor);
  assert.equal(scan.status, "saved"); assert.equal(scan.customerId, f.customerId);
  const counts = f.counts(); assert.deepEqual(await f.service.analyze(f.request, f.actor), scan); assert.deepEqual(f.counts(), counts);
});
await test("a changed customer revision/address invalidates preflight evidence", async () => {
  const f = await fixture(); let changed = false;
  f.setResolver(async () => {
    if (!changed) { changed = true; await f.ref.update({ officialAddress: "서울 중구 다른로 1", revision: 2 }); }
    return { status: "found", addresses: ["대전 유성구 예시중앙로 96", "대전 유성구 예시동 606-3"] };
  });
  const scan = await f.service.analyzePhotoBatch(f.request, f.actor);
  assert.equal(scan.rows[0]!.status, "review"); assert.equal(scan.lists, null);
});
await test("a new same-name customer during lookup prevents a stale automatic save", async () => {
  const f = await fixture(); let changed = false;
  f.setResolver(async () => {
    if (!changed) { changed = true; const id = `duplicate-${randomUUID()}`; await db.doc(`companies/onnuri/customers/${id}`).set({ ...(await f.ref.get()).data(), customerId: id }); }
    return { status: "found", addresses: ["대전 유성구 예시중앙로 96", "대전 유성구 예시동 606-3"] };
  });
  const scan = await f.service.analyzePhotoBatch(f.request, f.actor);
  assert.equal(scan.rows[0]!.status, "review"); assert.equal(scan.lists, null);
});
await test("authorization revoked during lookup blocks every list write", async () => {
  const f = await fixture(); f.setResolver(async () => {
    await db.doc(`authz/${f.actor.uid}`).update({ active: false });
    return { status: "found", addresses: ["대전 유성구 예시중앙로 96", "대전 유성구 예시동 606-3"] };
  });
  await assert.rejects(f.service.analyzePhotoBatch(f.request, f.actor));
  assert.equal((await db.doc(`companies/onnuri/deliveryPhotoRoutes/${f.actor.employeeId}`).get()).exists, false);
  assert.equal((await db.doc(`requestLocks/delivery-planning-${f.request.requestId}`).get()).get("state"), "pending");
});
await test("an unavailable address lookup preserves clear rows and reviews only unresolved rows", async () => {
  const f = await fixture(); f.setResolver(async () => { throw Error("provider unavailable"); });
  f.extraction.rows.push({ ...f.extraction.rows[0]!, address: "대전 유성구 예시중앙로 96" });
  const scan = await f.service.analyzePhotoBatch(f.request, f.actor);
  assert.deepEqual(scan.rows.map((r) => r.status), ["review", "saved"]);
  assert.deepEqual(scan.lists!.day.customerIds, [f.customerId]);
});
await test("a different invoice date never becomes an automatic delivery save", async () => {
  const f = await fixture(); f.extraction.rows[0]!.date = "2026-11-08";
  const scan = await f.service.analyzePhotoBatch(f.request, f.actor);
  assert.equal(scan.rows[0]!.dateStatus, "different"); assert.equal(scan.rows[0]!.status, "review"); assert.equal(scan.lists, null);
});
await test("a confirmed shorthand is reused across road/lot spellings without relearning or duplicate list writes", async () => {
  const f = await fixture(), shorthand = `별칭${randomUUID()}`;
  f.extraction.rows[0]!.rawName = shorthand;
  const first = await f.service.analyzePhotoBatch(f.request, f.actor);
  assert.equal(first.rows[0]!.status, "review");
  const saved = await f.service.confirmPhotoBatch({ requestId: randomUUID(), scanId: first.scanId, deliveryDateKey: date,
    expectedScanRevision: first.revision, dateConfirmed: false, decisions: [{ rowId: "row-1", action: "connect", customerId: f.customerId,
      rememberAlias: true, aliasText: shorthand, expectedAliasRevision: null }] }, f.actor);
  const next = await f.service.analyzePhotoBatch({ ...f.request, requestId: randomUUID() }, f.actor);
  assert.equal(next.rows[0]!.status, "saved"); assert.equal(next.rows[0]!.matchSource, "alias");
  assert.deepEqual(next.lists, saved.lists);
  assert.equal((await db.doc(`companies/onnuri/deliveryCustomerAliases/${f.actor.employeeId}/entries/${photoAliasKey(shorthand)}`).get()).get("revision"), 1);
});
console.log(`INVOICE_LINKING_GATE_PASS ${passed}; productionWrites=0`); await db.terminate();
