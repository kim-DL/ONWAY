import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import sharp from "sharp";
import { PlanningService } from "../functions/src/delivery-planning/planning-service";
import type { CustomerActor } from "../functions/src/customer/customer-authorization";
import { DEFAULT_DELIVERY_VEHICLE, DEFAULT_ORIGIN_POINT, type InvoiceFields, type PlanningSettings } from "../functions/src/delivery-planning/planning-contract";
import type { PlanningProviders } from "../functions/src/delivery-planning/planning-providers";

if (!/^(127\.0\.0\.1|localhost):\d+$/u.test(process.env.FIRESTORE_EMULATOR_HOST ?? "")
  || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_TOKEN) throw new Error("Only a local emulator without credentials is allowed.");
const db = getFirestore(initializeApp({ projectId: "demo-onnuriway" }, `planning-${randomUUID()}`));
const prefix = `planning-${randomUUID().slice(0, 8)}`; const date = "2026-11-07";
let clock = Timestamp.fromDate(new Date(`${date}T00:00:00Z`));
const a = `${prefix}-a`, b = `${prefix}-b`, c = `${prefix}-c`;
const customers = [a, b, c].map((customerId, i) => ({ customerId, companyId: "onnuri", name: `예시식품${i}`, officialAddress: `예시동 ${i + 1}`, deliveryAddress: "", status: "active", revision: 1, deliveryPoint: { latitude: 36.3 + i / 100, longitude: 127.4 + i / 100 } }));
for (const customer of customers) await db.doc(`companies/onnuri/customers/${customer.customerId}`).set(customer);
const makeActor = async (admin = false): Promise<CustomerActor> => {
  const employeeId = `${prefix}-${randomUUID().slice(0, 8)}`;
  const actor = { uid: `uid-${employeeId}`, employeeId, roleScopes: [admin ? "admin" : "delivery"], isAdmin: admin, sessionVersion: 1, permissionsVersion: 1 };
  await db.doc(`authz/${actor.uid}`).set({ employeeId, active: true, sessionVersion: 1, permissionsVersion: 1 });
  await db.doc(`employees/${employeeId}`).set({ employeeId, firebaseUid: actor.uid, roleScopes: actor.roleScopes, status: "active" });
  return actor;
};
const image = await sharp({ create: { width: 120, height: 80, channels: 3, background: "white" } }).jpeg().toBuffer();
const input = () => ({ requestId: randomUUID(), deliveryDateKey: date, contentType: "image/jpeg" as const, fileBase64: image.toString("base64") });
const fieldsFor = (index: number): InvoiceFields => ({ recipientName: customers[index]!.name, recipientAddress: customers[index]!.officialAddress, invoiceDate: date, uncertain: false });
let reads = 0, optimizations = 0; let fields = fieldsFor(0);
const providers: PlanningProviders = {
  async readInvoice() { reads++; return fields; },
  async optimize(routeSettings, stops, last) { assert.deepEqual(routeSettings.vehicle, DEFAULT_DELIVERY_VEHICLE); optimizations++; return { customerIds: [...stops.filter((s) => s.customerId !== last).map((s) => s.customerId), last], totalSeconds: 1500, totalMeters: 8500 }; },
};
const service = new PlanningService(providers, db, () => clock);
let passed = 0; const test = async (name: string, run: () => Promise<void>) => { await run(); passed++; console.log(`PASS ${name}`); };
const routeRef = (actor: CustomerActor) => db.doc(`companies/onnuri/deliveryPhotoRoutes/${actor.employeeId}`);
const dayRef = (actor: CustomerActor) => db.doc(`companies/onnuri/deliveryPhotoDays/${actor.employeeId}_${date}`);
const actor = await makeActor(); const admin = await makeActor(true);
await db.doc("deliveryPlanningRates/scan_company").set({ date, count: 0 }); await db.doc("deliveryPlanningRates/route_company").set({ date, count: 0 });
const settings: PlanningSettings = { revision: 1, originAddress: "예시 회사", originPoint: { latitude: 36.2, longitude: 127.3 }, vehicle: DEFAULT_DELIVERY_VEHICLE };
await test("new installations receive the truck defaults without creating a settings document", async () => {
  assert.equal((await db.doc("secureSettings/deliveryPlanning").get()).exists, false);
  const context = await service.context(actor);
  assert.deepEqual(context.settings.vehicle, DEFAULT_DELIVERY_VEHICLE); assert.deepEqual(context.settings.originPoint, DEFAULT_ORIGIN_POINT); assert.equal(context.settings.revision, null);
  assert.equal((await db.doc("secureSettings/deliveryPlanning").get()).exists, false);
});
await db.doc("secureSettings/deliveryPlanning").set(settings);

await test("automatic scan commits both lists; same receipt does not call provider again", async () => {
  const request = input(); const one = await service.analyze(request, actor); const before = reads;
  const two = await service.analyze(request, actor);
  assert.deepEqual(one, two); assert.equal(reads, before); assert.equal(one.status, "saved");
  assert.deepEqual((await routeRef(actor).get()).get("customerIds"), [a]); assert.deepEqual((await dayRef(actor).get()).get("customerIds"), [a]);
});
await test("parallel additions retain both customers with atomic revisions", async () => {
  const staff = await makeActor();
  await Promise.all([0, 1].map((i) => new PlanningService({ ...providers, readInvoice: async () => fieldsFor(i) }, db, () => clock).analyze(input(), staff)));
  assert.deepEqual(new Set((await routeRef(staff).get()).get("customerIds")), new Set([a, b]));
  assert.deepEqual(new Set((await dayRef(staff).get()).get("customerIds")), new Set([a, b]));
});
await test("first scan excludes unselected default stops and preserves photo/customer/inventory history", async () => {
  const staff = await makeActor();
  await routeRef(staff).set({ employeeId: staff.employeeId, customerIds: [a, b], revision: 7, updatedAt: clock, updatedByEmployeeId: staff.employeeId });
  const photo = { customerId: c, deliveryDateKey: date, createdByEmployeeId: staff.employeeId, status: "active", expiresAt: Timestamp.fromMillis(clock.toMillis() + 86400_000), marker: "untouched-photo" };
  const photoRef = db.doc(`companies/onnuri/deliveryPhotos/${prefix}-photo`); await photoRef.set(photo);
  const history = db.doc(`companies/onnuri/inventoryEvents/${prefix}-history`); await history.set({ marker: "untouched-history" });
  fields = fieldsFor(0); const result = await service.analyze(input(), staff);
  assert.deepEqual(new Set(result.lists!.day.customerIds), new Set([a, c])); assert.deepEqual(result.lists!.route.customerIds, [a, b]);
  assert.equal(result.lists!.route.revision, 7); assert.deepEqual((await photoRef.get()).data(), photo); assert.equal((await history.get()).get("marker"), "untouched-history");
});
await test("wrong invoice date requires explicit confirmation; other employee cannot claim scan", async () => {
  fields = { ...fieldsFor(1), invoiceDate: "2026-11-09" }; const request = input(); const result = await service.analyze(request, actor);
  assert.equal(result.status, "review");
  const confirm = { requestId: randomUUID(), scanId: request.requestId, deliveryDateKey: date, customerId: b, dateConfirmed: false };
  await assert.rejects(service.confirm(confirm, actor), /오늘 납품/);
  await assert.rejects(service.confirm({ ...confirm, dateConfirmed: true }, await makeActor()), /오늘 분석/);
  assert.equal((await service.confirm({ ...confirm, dateConfirmed: true }, actor)).status, "saved");
});
await test("duplicate invoices do not increment lists or create duplicate customers", async () => {
  const before = (await dayRef(actor).get()).data(); fields = fieldsFor(0); await service.analyze(input(), actor);
  assert.deepEqual((await dayRef(actor).get()).data(), before);
});
await test("request ID collision rejects different image/date inputs", async () => {
  const request = input(); await service.analyze(request, actor);
  const other = await sharp(image).negate().jpeg().toBuffer();
  await assert.rejects(service.analyze({ ...request, fileBase64: other.toString("base64") }, actor), /다른 입력/);
});
await test("permission revoked during external call prevents all list writes", async () => {
  const staff = await makeActor();
  const revoked = new PlanningService({ ...providers, readInvoice: async () => { await db.doc(`authz/${staff.uid}`).update({ active: false }); return fieldsFor(0); } }, db, () => clock);
  await assert.rejects(revoked.analyze(input(), staff), /만료/); assert.equal((await routeRef(staff).get()).exists, false); assert.equal((await dayRef(staff).get()).exists, false);
});
await test("midnight crossing does not write yesterday or today unexpectedly", async () => {
  const staff = await makeActor(); const old = clock;
  const midnight = new PlanningService({ ...providers, readInvoice: async () => { clock = Timestamp.fromDate(new Date("2026-11-08T00:00:00Z")); return fieldsFor(0); } }, db, () => clock);
  try { await assert.rejects(midnight.analyze(input(), staff), /날짜가 바뀌/); assert.equal((await routeRef(staff).get()).exists, false); } finally { clock = old; }
});
await test("no image, base64 payload or key persists in Firestore receipts", async () => {
  const docs = await db.collection("requestLocks").where("employeeId", "==", actor.employeeId).get();
  for (const doc of docs.docs) { const json = JSON.stringify(doc.data()); assert.ok(!json.includes(image.toString("base64"))); assert.ok(!json.includes("fileBase64")); assert.ok(!json.includes("data:image")); }
});
await test("admin settings revision and authorization enforced", async () => {
  const draft = { originAddress: settings.originAddress, originPoint: settings.originPoint };
  const request = { requestId: randomUUID(), expectedRevision: 1, draft };
  await assert.rejects(service.saveSettings(request, actor), /관리자만/);
  const saved = await service.saveSettings(request, admin);
  assert.equal(saved.revision, 2); assert.deepEqual(saved.vehicle, DEFAULT_DELIVERY_VEHICLE);
  assert.equal((await service.saveSettings(request, admin)).revision, 2);
  await assert.rejects(service.saveSettings({ ...request, requestId: randomUUID() }, admin), /바뀌/);
});
const routeStaff = await makeActor(); fields = fieldsFor(0); await service.analyze(input(), routeStaff); fields = fieldsFor(1); await service.analyze(input(), routeStaff);
await test("legacy empty or custom vehicle data uses fixed defaults without changing stored records", async () => {
  const old = (await db.doc("secureSettings/deliveryPlanning").get()).data()!;
  try {
    for (const vehicle of [null, { ...DEFAULT_DELIVERY_VEHICLE, heightCm: 200 }]) {
      await db.doc("secureSettings/deliveryPlanning").update({ vehicle });
      assert.deepEqual((await service.context(routeStaff)).settings.vehicle, DEFAULT_DELIVERY_VEHICLE);
      const before = optimizations;
      await service.recommend({ requestId: randomUUID(), deliveryDateKey: date, expectedDayRevision: 2, lastCustomerId: a }, routeStaff);
      assert.equal(optimizations, before + 1);
      assert.deepEqual((await db.doc("secureSettings/deliveryPlanning").get()).get("vehicle"), vehicle);
    }
  } finally { await db.doc("secureSettings/deliveryPlanning").set(old); }
});
await test("missing company coordinates still block route calculation before paid call", async () => {
  const before = optimizations; const old = (await db.doc("secureSettings/deliveryPlanning").get()).data()!;
  await db.doc("secureSettings/deliveryPlanning").update({ originPoint: null });
  try { await assert.rejects(service.recommend({ requestId: randomUUID(), deliveryDateKey: date, expectedDayRevision: 2, lastCustomerId: a }, routeStaff), /회사 출발 위치/); assert.equal(optimizations, before); }
  finally { await db.doc("secureSettings/deliveryPlanning").set(old); }
});
await test("fixed last stop recommendation only changes today's order when applied", async () => {
  const before = (await routeRef(routeStaff).get()).data();
  const recommendation = await service.recommend({ requestId: randomUUID(), deliveryDateKey: date, expectedDayRevision: 2, lastCustomerId: a }, routeStaff);
  assert.deepEqual(recommendation.customerIds, [b, a]); assert.deepEqual((await dayRef(routeStaff).get()).get("customerIds"), [a, b]);
  const request = { requestId: randomUUID(), recommendationId: recommendation.recommendationId, deliveryDateKey: date };
  const result = await service.apply(request, routeStaff); assert.deepEqual(result.customerIds, [b, a]);
  assert.deepEqual(await service.apply(request, routeStaff), result); assert.deepEqual((await routeRef(routeStaff).get()).data(), before);
});
await test("customer location changes invalidate previous recommendation", async () => {
  const recommendation = await service.recommend({ requestId: randomUUID(), deliveryDateKey: date, expectedDayRevision: 3, lastCustomerId: a }, routeStaff);
  await db.doc(`companies/onnuri/customers/${a}`).update({ revision: 2 });
  await assert.rejects(service.apply({ requestId: randomUUID(), recommendationId: recommendation.recommendationId, deliveryDateKey: date }, routeStaff), /바뀌/);
});
await test("shared daily TMAP cap blocks calls", async () => {
  const before = optimizations; await db.doc("deliveryPlanningRates/route_company").set({ date, count: 45 });
  await assert.rejects(service.recommend({ requestId: randomUUID(), deliveryDateKey: date, expectedDayRevision: 3, lastCustomerId: a }, routeStaff), /한도/);
  assert.equal(optimizations, before);
});
console.log(`Delivery planning emulator gate: ${passed} passed. No production services or external API calls used.`);
await db.terminate();
