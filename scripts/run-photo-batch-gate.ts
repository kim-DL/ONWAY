import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import sharp from "sharp";
import { PlanningService } from "../functions/src/delivery-planning/planning-service";
import { photoAliasKey } from "../functions/src/delivery-planning/photo-batch-matching";
import type { PhotoBatchDecision, PhotoBatchResult, PhotoExtraction, PhotoExtractionRow } from "../functions/src/delivery-planning/photo-batch-contract";
import { createPlanningProviders, type PlanningProviders } from "../functions/src/delivery-planning/planning-providers";
import type { CustomerActor } from "../functions/src/customer/customer-authorization";

if (!/^(127\.0\.0\.1|localhost):\d+$/u.test(process.env.FIRESTORE_EMULATOR_HOST ?? "")
  || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_TOKEN) throw new Error("Only a local emulator without credentials is allowed.");
const db = getFirestore(initializeApp({ projectId: "demo-onnuriway" }, `photo-batch-${randomUUID()}`));
const prefix = `batch-${randomUUID().slice(0, 8)}`; const date = "2026-11-08";
let clock = Timestamp.fromDate(new Date(`${date}T00:00:00Z`));
const ids = [0, 1, 2].map((index) => `${prefix}-${index}`);
const catalog = ids.map((customerId, index) => ({ customerId, companyId: "onnuri", name: `일괄식품${prefix}${index}`,
  officialAddress: `대전 대덕구 예시로 ${10 + index}`, deliveryAddress: "", status: "active", revision: 1, district: "대덕구" }));
for (const customer of catalog) await db.doc(`companies/onnuri/customers/${customer.customerId}`).set(customer);
const makeActor = async (): Promise<CustomerActor> => {
  const employeeId = `${prefix}-${randomUUID().slice(0, 8)}`;
  const actor = { uid: `uid-${employeeId}`, employeeId, roleScopes: ["delivery"], isAdmin: false, sessionVersion: 1, permissionsVersion: 1 };
  await db.doc(`authz/${actor.uid}`).set({ employeeId, active: true, sessionVersion: 1, permissionsVersion: 1 });
  await db.doc(`employees/${employeeId}`).set({ employeeId, firebaseUid: actor.uid, roleScopes: actor.roleScopes, status: "active" });
  return actor;
};
const row = (rawName: string, changes: Partial<PhotoExtractionRow> = {}): PhotoExtractionRow => ({ rawName, address: "", date: null, dateUncertain: false, uncertain: false, ...changes });
const document = (rows: PhotoExtractionRow[], kind: PhotoExtraction["kind"] = "customer_list"): PhotoExtraction => ({ kind, rows, truncated: false });
let extraction = document([]); let reads = 0;
const providers: PlanningProviders = {
  readInvoice: async () => { throw new Error("Batch gate must not use the legacy provider"); },
  readPhotoBatch: async () => { reads++; return extraction; },
  resolveAddress: async () => null, optimize: async () => { throw new Error("Batch gate must not call routing"); },
};
const service = new PlanningService(providers, db, () => clock);
const image = await sharp({ create: { width: 120, height: 80, channels: 3, background: "white" } }).jpeg().toBuffer();
const input = () => ({ requestId: randomUUID(), deliveryDateKey: date, contentType: "image/jpeg" as const, fileBase64: image.toString("base64") });
const connect = (rowId: string, customerId: string, aliasText = "unused", rememberAlias = false, expectedAliasRevision: number | null = null): PhotoBatchDecision =>
  ({ rowId, action: "connect", customerId, rememberAlias, aliasText, expectedAliasRevision });
const confirm = (scan: PhotoBatchResult, decisions: PhotoBatchDecision[], dateConfirmed = false) => ({ requestId: randomUUID(), scanId: scan.scanId,
  deliveryDateKey: date, expectedScanRevision: scan.revision, dateConfirmed, decisions });
const routeRef = (actor: CustomerActor) => db.doc(`companies/onnuri/deliveryPhotoRoutes/${actor.employeeId}`);
const dayRef = (actor: CustomerActor) => db.doc(`companies/onnuri/deliveryPhotoDays/${actor.employeeId}_${date}`);
const aliasesRef = (actor: CustomerActor) => db.collection(`companies/onnuri/deliveryCustomerAliases/${actor.employeeId}/entries`);
let passed = 0;
const test = async (name: string, run: () => Promise<void>) => { await run(); passed++; console.log(`PASS ${name}`); };
await db.doc("deliveryPlanningRates/scan_company").set({ date, count: 0 });
const actor = await makeActor(); const shorthand = `줄임${prefix}`;
let mixed: PhotoBatchResult; let confirmed: PhotoBatchResult;
await test("mixed rows save clear destinations once and leave ambiguous lines for review", async () => {
  extraction = document([row(catalog[0]!.name), row(catalog[1]!.name), row(shorthand), row("", { uncertain: true }), row(catalog[1]!.name)]);
  const request = input(); mixed = await service.analyzePhotoBatch(request, actor);
  assert.deepEqual(mixed.rows.map((r) => r.status), ["saved", "saved", "review", "review", "saved"]);
  assert.deepEqual(mixed.lists!.route.customerIds, ids.slice(0, 2)); assert.deepEqual(mixed.lists!.day.customerIds, ids.slice(0, 2));
  assert.equal(mixed.lists!.route.revision, 1); assert.equal(mixed.lists!.day.revision, 1);
  const before = reads; assert.deepEqual(await service.analyzePhotoBatch(request, actor), mixed); assert.equal(reads, before);
});
await test("one confirmation atomically connects, remembers, skips and replays the exact receipt", async () => {
  const request = confirm(mixed, [connect("row-3", ids[2]!, shorthand, true), { rowId: "row-4", action: "skip" }]);
  confirmed = await service.confirmPhotoBatch(request, actor);
  assert.deepEqual(confirmed.rows.map((r) => r.status), ["saved", "saved", "saved", "skipped", "saved"]);
  assert.deepEqual(confirmed.lists!.day.customerIds, ids); assert.equal(confirmed.lists!.day.revision, 2);
  const alias = (await service.photoAliases(actor))[0]!;
  assert.equal(alias.aliasText, shorthand); assert.equal(alias.customerId, ids[2]); assert.equal(alias.revision, 1);
  assert.deepEqual(await service.confirmPhotoBatch(request, actor), confirmed);
  await assert.rejects(service.confirmPhotoBatch({ ...request, dateConfirmed: true }, actor), /다른 입력/);
});
await test("a later photo reuses only the current employee's confirmed abbreviation", async () => {
  extraction = document([row(shorthand)]);
  const mine = await service.analyzePhotoBatch(input(), actor);
  assert.equal(mine.rows[0]!.status, "saved"); assert.equal(mine.rows[0]!.matchSource, "alias");
  const other = await service.analyzePhotoBatch(input(), await makeActor());
  assert.equal(other.rows[0]!.status, "review"); assert.equal(other.lists, null);
});
await test("uncertain OCR never silently uses a remembered alias", async () => {
  extraction = document([row(shorthand, { uncertain: true })]);
  assert.equal((await service.analyzePhotoBatch(input(), actor)).rows[0]!.status, "review");
});
await test("alias changes use revision checks and do not alter saved deliveries", async () => {
  const before = (await dayRef(actor).get()).data(); const current = (await service.photoAliases(actor))[0]!;
  const request = { requestId: randomUUID(), aliasKey: current.aliasKey, expectedRevision: current.revision, customerId: ids[1]! };
  const changed = await service.updatePhotoAlias(request, actor);
  assert.equal(changed.customerId, ids[1]); assert.equal(changed.revision, 2);
  assert.deepEqual(await service.updatePhotoAlias(request, actor), changed);
  await assert.rejects(service.updatePhotoAlias({ ...request, requestId: randomUUID() }, actor), /바뀌/);
  const disabled = await service.updatePhotoAlias({ requestId: randomUUID(), aliasKey: changed.aliasKey, expectedRevision: 2, customerId: null }, actor);
  assert.equal(disabled.enabled, false); assert.equal(disabled.revision, 3);
  assert.deepEqual((await dayRef(actor).get()).data(), before);
  extraction = document([row(shorthand)]);
  const scan = await service.analyzePhotoBatch(input(), actor); assert.equal(scan.rows[0]!.status, "review"); assert.equal(scan.rows[0]!.aliasRevision, 3);
  await assert.rejects(service.confirmPhotoBatch(confirm(scan, [connect("row-1", ids[2]!, shorthand, true, null)]), actor), /바뀌/);
  await service.confirmPhotoBatch(confirm(scan, [connect("row-1", ids[2]!, shorthand, true, 3)]), actor);
  assert.equal((await service.photoAliases(actor))[0]!.revision, 4);
});
await test("concurrent alias learning never silently replaces another target", async () => {
  const staff = await makeActor(); const name = `동시${prefix}`; extraction = document([row(name)]);
  const first = await service.analyzePhotoBatch(input(), staff); const second = await service.analyzePhotoBatch(input(), staff);
  await service.confirmPhotoBatch(confirm(first, [connect("row-1", ids[0]!, name, true)]), staff);
  await assert.rejects(service.confirmPhotoBatch(confirm(second, [connect("row-1", ids[1]!, name, true)]), staff), /바뀌/);
  await assert.rejects(service.confirmPhotoBatch(confirm(second, [connect("row-1", ids[1]!, name, true, 1)]), staff), /다른 거래처/);
  assert.equal((await service.photoAliases(staff))[0]!.customerId, ids[0]);
  const withoutLearning = await service.confirmPhotoBatch(confirm(second, [connect("row-1", ids[1]!, name)]), staff);
  assert.deepEqual(withoutLearning.lists!.day.customerIds, ids.slice(0, 2));
});
await test("one transaction cannot teach the same spelling two targets or shadow a canonical name", async () => {
  const staff = await makeActor(); const name = `중복${prefix}`; extraction = document([row(name), row(name)]);
  const scan = await service.analyzePhotoBatch(input(), staff);
  await assert.rejects(service.confirmPhotoBatch(confirm(scan, [connect("row-1", ids[0]!, name, true), connect("row-2", ids[1]!, name, true)]), staff), /다른 거래처/);
  await assert.rejects(service.confirmPhotoBatch(confirm(scan, [connect("row-1", ids[1]!, catalog[0]!.name, true)]), staff), /정식 상호/);
  assert.equal((await aliasesRef(staff).get()).size, 0); assert.equal((await routeRef(staff).get()).exists, false);
});
await test("renamed and inactive alias targets require fresh confirmation", async () => {
  const targetRef = db.doc(`companies/onnuri/customers/${ids[2]}`); const original = (await targetRef.get()).data()!;
  try {
    extraction = document([row(shorthand)]);
    await targetRef.update({ name: `${original.name}변경` });
    assert.equal((await service.analyzePhotoBatch(input(), actor)).rows[0]!.status, "review");
    await targetRef.update({ status: "inactive" });
    const scan = await service.analyzePhotoBatch(input(), actor); assert.equal(scan.rows[0]!.status, "review");
    await assert.rejects(service.confirmPhotoBatch(confirm(scan, [connect("row-1", ids[2]!)]), actor), /활성 거래처/);
  } finally { await targetRef.set(original); }
});
await test("foreign employees cannot confirm scans or change alias records", async () => {
  const other = await makeActor();
  await assert.rejects(service.confirmPhotoBatch(confirm(mixed, [{ rowId: "row-3", action: "skip" }]), other), /오늘 분석/);
  await assert.rejects(service.updatePhotoAlias({ requestId: randomUUID(), aliasKey: photoAliasKey(shorthand), expectedRevision: 4, customerId: null }, other), /기억한 이름/);
  assert.deepEqual(await service.photoAliases(other), []);
});
await test("parallel batches merge latest lists and duplicate scans do not bump revisions", async () => {
  const staff = await makeActor();
  await Promise.all([0, 1].map((index) => new PlanningService({ ...providers, readPhotoBatch: async () => document([row(catalog[index]!.name)]) }, db, () => clock).analyzePhotoBatch(input(), staff)));
  assert.deepEqual(new Set((await dayRef(staff).get()).get("customerIds")), new Set(ids.slice(0, 2)));
  const before = (await dayRef(staff).get()).data(); extraction = document([row(catalog[0]!.name), row(catalog[1]!.name)]);
  await service.analyzePhotoBatch(input(), staff); assert.deepEqual((await dayRef(staff).get()).data(), before);
});
await test("explicit wrong dates require one persisted confirmation for later partial decisions", async () => {
  const staff = await makeActor(); extraction = document([row(catalog[0]!.name, { date: "11-09" }), row(catalog[1]!.name, { date: "11-09" })]);
  const scan = await service.analyzePhotoBatch(input(), staff); assert.equal(scan.lists, null);
  await assert.rejects(service.confirmPhotoBatch(confirm(scan, [connect("row-1", ids[0]!)]), staff), /오늘 납품/);
  const first = await service.confirmPhotoBatch(confirm(scan, [connect("row-1", ids[0]!)], true), staff);
  assert.equal(first.dateConfirmed, true); assert.equal(first.rows[1]!.status, "review");
  const second = await service.confirmPhotoBatch(confirm(first, [connect("row-2", ids[1]!)]), staff);
  assert.deepEqual(second.lists!.day.customerIds, ids.slice(0, 2));
});
await test("partial same-day date auto-saves lists while invoice absence stays review", async () => {
  const staff = await makeActor(); extraction = document([row(catalog[0]!.name, { date: "11-08" })]);
  assert.equal((await service.analyzePhotoBatch(input(), staff)).rows[0]!.status, "saved");
  extraction = document([row(catalog[1]!.name, { address: catalog[1]!.officialAddress })], "invoice");
  assert.equal((await service.analyzePhotoBatch(input(), staff)).rows[0]!.status, "review");
});
await test("missing, duplicate and already processed row IDs cannot mutate lists", async () => {
  const staff = await makeActor(); extraction = document([row(`확인${prefix}`)]); const scan = await service.analyzePhotoBatch(input(), staff);
  await assert.rejects(service.confirmPhotoBatch(confirm(scan, [{ rowId: "unknown", action: "skip" }]), staff), /없는 항목/);
  await assert.rejects(service.confirmPhotoBatch(confirm(scan, [connect("row-1", ids[0]!), connect("row-1", ids[1]!)]), staff), /다시 선택/);
  const saved = await service.confirmPhotoBatch(confirm(scan, [connect("row-1", ids[0]!)]), staff);
  await assert.rejects(service.confirmPhotoBatch(confirm(scan, [connect("row-1", ids[1]!)]), staff), /바뀌/);
  await assert.rejects(service.confirmPhotoBatch(confirm(saved, [connect("row-1", ids[1]!)]), staff), /이미 처리/);
  assert.deepEqual((await dayRef(staff).get()).get("customerIds"), [ids[0]]);
});
await test("the 100-stop cap rolls back the whole confirmation including alias learning", async () => {
  const staff = await makeActor(); const oldIds = Array.from({ length: 99 }, (_, index) => `old-${prefix}-${index}`);
  const old = { employeeId: staff.employeeId, customerIds: oldIds, revision: 9, updatedAt: clock, updatedByEmployeeId: staff.employeeId };
  await routeRef(staff).set(old);
  extraction = document([row(`수량가${prefix}`), row(`수량나${prefix}`)]); const scan = await service.analyzePhotoBatch(input(), staff);
  await assert.rejects(service.confirmPhotoBatch(confirm(scan, [connect("row-1", ids[0]!, `수량가${prefix}`, true), connect("row-2", ids[1]!)]), staff), /최대 100/);
  assert.deepEqual((await routeRef(staff).get()).data(), old); assert.equal((await dayRef(staff).get()).exists, false);
  assert.equal((await aliasesRef(staff).get()).size, 0);
});
await test("existing selected stops, completed photos and inventory history stay intact", async () => {
  const staff = await makeActor();
  await routeRef(staff).set({ employeeId: staff.employeeId, customerIds: [ids[0]], revision: 5, updatedAt: clock, updatedByEmployeeId: staff.employeeId });
  await dayRef(staff).set({ employeeId: staff.employeeId, deliveryDateKey: date, hasOverride: true, customerIds: [ids[0]], revision: 3 });
  const photoRef = db.doc(`companies/onnuri/deliveryPhotos/${prefix}-preserved`);
  const photo = { customerId: ids[2], deliveryDateKey: date, createdByEmployeeId: staff.employeeId, status: "active", expiresAt: Timestamp.fromMillis(clock.toMillis() + 86400_000), marker: "preserved" };
  const historyRef = db.doc(`companies/onnuri/inventoryEvents/${prefix}-preserved`); await historyRef.set({ marker: "preserved-history" }); await photoRef.set(photo);
  extraction = document([row(catalog[1]!.name)]); const saved = await service.analyzePhotoBatch(input(), staff);
  assert.deepEqual(saved.lists!.day.customerIds, [ids[0], ids[2], ids[1]]); assert.deepEqual(saved.lists!.route.customerIds, ids.slice(0, 2));
  assert.deepEqual((await photoRef.get()).data(), photo); assert.deepEqual((await historyRef.get()).data(), { marker: "preserved-history" });
});
await test("revoked authority and midnight crossing during recognition prevent writes", async () => {
  const staff = await makeActor();
  const revoked = new PlanningService({ ...providers, readPhotoBatch: async () => { await db.doc(`authz/${staff.uid}`).update({ active: false }); return document([row(catalog[0]!.name)]); } }, db, () => clock);
  await assert.rejects(revoked.analyzePhotoBatch(input(), staff), /만료/); assert.equal((await routeRef(staff).get()).exists, false);
  const midnightStaff = await makeActor(); const before = clock;
  const midnight = new PlanningService({ ...providers, readPhotoBatch: async () => { clock = Timestamp.fromDate(new Date("2026-11-09T00:00:00Z")); return document([row(catalog[0]!.name)]); } }, db, () => clock);
  try { await assert.rejects(midnight.analyzePhotoBatch(input(), midnightStaff), /날짜가 바뀌/); assert.equal((await routeRef(midnightStaff).get()).exists, false); }
  finally { clock = before; }
});
await test("unsupported and truncated documents never partially add customers", async () => {
  const staff = await makeActor(); extraction = document([], "unsupported");
  const unsupported = await service.analyzePhotoBatch(input(), staff); assert.equal(unsupported.rows.length, 0); assert.ok(unsupported.message); assert.equal(unsupported.lists, null);
  extraction = { ...document([row(catalog[0]!.name)]), truncated: true };
  await assert.rejects(service.analyzePhotoBatch(input(), staff), /60곳/); assert.equal((await routeRef(staff).get()).exists, false);
});
await test("new and legacy scan APIs share paid-request counters and reject changed receipt input", async () => {
  const staff = await makeActor(); await db.doc(`deliveryPlanningRates/scan_employee_${staff.employeeId}`).set({ date, count: 60 });
  const before = reads; await assert.rejects(service.analyzePhotoBatch(input(), staff), /분석 한도/); assert.equal(reads, before);
  await assert.rejects(service.analyze(input(), staff), /분석 한도/);
  extraction = document([row(catalog[0]!.name)]); const request = input(); await service.analyzePhotoBatch(request, actor);
  await assert.rejects(service.analyze(request, actor), /다른 입력/);
  const changed = await sharp(image).negate().jpeg().toBuffer();
  await assert.rejects(service.analyzePhotoBatch({ ...request, fileBase64: changed.toString("base64") }, actor), /다른 입력/);
});
await test("receipts and aliases persist neither image bytes nor upload references", async () => {
  const receipts = await db.collection("requestLocks").where("employeeId", "==", actor.employeeId).get();
  const aliases = await aliasesRef(actor).get();
  for (const doc of [...receipts.docs, ...aliases.docs]) {
    const stored = JSON.stringify(doc.data()); assert.ok(!stored.includes(image.toString("base64")));
    for (const forbidden of ["fileBase64", "data:image", "storagePath", "downloadURL"]) assert.ok(!stored.includes(forbidden));
  }
});
await test("registered name parts save and cannot become another customer's remembered alias", async () => {
  const staff = await makeActor(); const registeredName = `등록상호${prefix}`;
  const customerRef = db.doc(`companies/onnuri/customers/${ids[0]}`);
  try {
    await customerRef.update({ name: `${catalog[0]!.name}, ${registeredName}` });
    extraction = document([row(registeredName), row(`미확인${prefix}`)]);
    const scan = await service.analyzePhotoBatch(input(), staff);
    assert.equal(scan.rows[0]!.status, "saved");
    assert.equal(scan.rows[0]!.matchSource, "registered_name"); assert.equal(scan.rows[0]!.customerId, ids[0]);
    await assert.rejects(service.confirmPhotoBatch(confirm(scan,
      [connect("row-2", ids[1]!, registeredName, true)]), staff), /정식 상호/);
    assert.equal((await aliasesRef(staff).get()).size, 0);
    assert.deepEqual((await dayRef(staff).get()).get("customerIds"), [ids[0]]);
  } finally { await customerRef.set(catalog[0]!); }
});
await test("invoice party evidence selects only the recipient before automatic registration", async () => {
  const staff = await makeActor(); let calls = 0;
  const evidence = { kind: "invoice", truncated: false, rows: [{
    supplier: { name: catalog[1]!.name, address: catalog[1]!.officialAddress, businessNumber: "111-22-33333" },
    recipient: { name: catalog[0]!.name, address: catalog[0]!.officialAddress, businessNumber: "444-55-66666" },
    recipientRole: "공급받는자", date, dateUncertain: false, uncertain: false,
  }] };
  const provider = createPlanningProviders({ openai: () => "test-key", tmap: () => "" }, async () => {
    const value = calls++ === 0 ? document([row(catalog[1]!.name)], "invoice") : evidence;
    return { ok: true, status: 200, json: async () => ({ status: "completed", output: [{ type: "message",
      content: [{ type: "output_text", text: JSON.stringify(value) }] }] }) };
  });
  const scan = await new PlanningService(provider, db, () => clock).analyzePhotoBatch(input(), staff);
  assert.equal(calls, 2); assert.equal(scan.rows[0]!.rawName, catalog[0]!.name);
  assert.deepEqual(scan.lists!.day.customerIds, [ids[0]]);
  assert.deepEqual(scan.lists!.route.customerIds, [ids[0]]);
});
await test("supplier-as-recipient failure creates no list, alias or confirmable result", async () => {
  const staff = await makeActor(); let calls = 0; const request = input();
  const party = { name: "온누리종합식품", address: "공급자 주소", businessNumber: "306-28-68765" };
  const provider = createPlanningProviders({ openai: () => "test-key", tmap: () => "" }, async () => {
    const value = calls++ === 0 ? document([row(party.name)], "invoice") : { kind: "invoice", truncated: false,
      rows: [{ supplier: party, recipient: party, recipientRole: "공급받는자", date, dateUncertain: false, uncertain: false }] };
    return { ok: true, status: 200, json: async () => ({ status: "completed", output: [{ type: "message",
      content: [{ type: "output_text", text: JSON.stringify(value) }] }] }) };
  });
  await assert.rejects(new PlanningService(provider, db, () => clock).analyzePhotoBatch(request, staff), /공급받는 자/);
  assert.equal(calls, 2); assert.equal((await dayRef(staff).get()).exists, false);
  assert.equal((await routeRef(staff).get()).exists, false); assert.equal((await aliasesRef(staff).get()).size, 0);
  const receipt = await db.doc(`requestLocks/delivery-planning-${request.requestId}`).get();
  assert.equal(receipt.get("result"), undefined); assert.notEqual(receipt.get("state"), "complete");
});
console.log(`PHOTO_BATCH_GATE_PASS ${passed}`);
await db.terminate();
