import { createHash, randomUUID } from "node:crypto";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerActor } from "../src/customer/customer-authorization.js";
import { DEFAULT_DELIVERY_VEHICLE, recommendRouteSchema, type PlanningSettings } from "../src/delivery-planning/planning-contract.js";
import type { PlanningProviders, RouteStop } from "../src/delivery-planning/planning-providers.js";
import { PlanningService } from "../src/delivery-planning/planning-service.js";

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const date = "2026-11-08", now = Timestamp.fromDate(new Date(`${date}T00:00:00Z`));

describe.skipIf(!emulator)("route replanning with existing photos / Firestore emulator", () => {
  let app: App, db: Firestore;
  let actor: CustomerActor, ids: string[], addresses: string[];
  beforeAll(async () => {
    if (!/^(127\.0\.0\.1|localhost):\d+$/u.test(emulator ?? "") || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_TOKEN) {
      throw new Error("Only a local Firestore emulator without credentials is allowed.");
    }
    app = initializeApp({ projectId: "demo-onnuriway" }, `route-replanning-${randomUUID()}`); db = getFirestore(app);
    await db.doc("deliveryPlanningRates/route_company").set({ date, count: 0 });
  });
  afterAll(async () => { await db?.terminate(); if (app) await deleteApp(app); });
  beforeEach(async () => {
    const prefix = `replan-${randomUUID().slice(0, 8)}`;
    actor = { uid: `uid-${prefix}`, employeeId: prefix, roleScopes: ["delivery"], isAdmin: false, sessionVersion: 1, permissionsVersion: 1 };
    ids = [0, 1, 2].map(i => `${prefix}-${i}`); addresses = [0, 1, 2].map(i => `대전 대덕구 예시로 ${i + 1}`);
    const batch = db.batch();
    batch.set(db.doc(`authz/${actor.uid}`), { employeeId: actor.employeeId, active: true, sessionVersion: 1, permissionsVersion: 1 });
    batch.set(db.doc(`employees/${actor.employeeId}`), { employeeId: actor.employeeId, firebaseUid: actor.uid, status: "active", roleScopes: actor.roleScopes });
    ids.forEach((id, i) => batch.set(db.doc(`companies/onnuri/customers/${id}`), { customerId: id, companyId: "onnuri", name: `예시식품 ${i + 1}`,
      officialAddress: addresses[i], deliveryAddress: "", status: "active", revision: 1 }));
    batch.set(routeRef(), { employeeId: actor.employeeId, customerIds: ids, revision: 7, updatedAt: now, updatedByEmployeeId: actor.employeeId });
    batch.set(dayRef(), { employeeId: actor.employeeId, deliveryDateKey: date, hasOverride: true, customerIds: ids, revision: 4, updatedAt: now, updatedByEmployeeId: actor.employeeId });
    batch.set(photoRef(), photo());
    batch.set(aliasRef(), { marker: "existing-alias", revision: 2, enabled: true });
    batch.set(historyRef(), { marker: "existing-stock-history", quantity: 30 });
    batch.set(db.doc("secureSettings/deliveryPlanning"), { revision: 1, originAddress: "대전 대덕구 회사로 10", originPoint: { latitude: 36.2, longitude: 127.3 }, vehicle: DEFAULT_DELIVERY_VEHICLE });
    await batch.commit();
  });
  const routeRef = () => db.doc(`companies/onnuri/deliveryPhotoRoutes/${actor.employeeId}`);
  const dayRef = () => db.doc(`companies/onnuri/deliveryPhotoDays/${actor.employeeId}_${date}`);
  const photoRef = () => db.doc(`companies/onnuri/deliveryPhotos/${actor.employeeId}-photo`);
  const aliasRef = () => db.doc(`companies/onnuri/deliveryCustomerAliases/${actor.employeeId}/entries/existing`);
  const historyRef = () => db.doc(`companies/onnuri/inventoryEvents/${actor.employeeId}-existing`);
  const photo = () => ({ customerId: ids[0], deliveryDateKey: date, createdByEmployeeId: "another-employee", status: "active",
    expiresAt: Timestamp.fromMillis(now.toMillis() + 86400_000), marker: "existing-delivery-photo" });
  const request = (firstCustomerId?: string) => ({ requestId: randomUUID(), deliveryDateKey: date, expectedDayRevision: 4, lastCustomerId: ids[2]!, ...(firstCustomerId ? { firstCustomerId } : {}) });
  function setup(overrides: Partial<PlanningProviders> = {}) {
    const optimize = vi.fn(async (_settings: PlanningSettings, stops: RouteStop[], lastId: string, _now: Date, firstId?: string) => ({
      customerIds: [...(firstId ? [firstId] : []), ...stops.filter(stop => stop.customerId !== lastId && stop.customerId !== firstId).reverse().map(stop => stop.customerId), lastId],
      totalSeconds: 600, totalMeters: 5000,
    }));
    const resolveAddress: PlanningProviders["resolveAddress"] = async address => {
      const index = addresses.indexOf(address); return index < 0 ? null : { latitude: 36.3 + index / 100, longitude: 127.4 + index / 100 };
    };
    const providers: PlanningProviders = { optimize, resolveAddress,
      readInvoice: async () => { throw new Error("No image analysis in route tests"); }, readPhotoBatch: async () => { throw new Error("No image analysis in route tests"); }, ...overrides };
    return { service: new PlanningService(providers, db, () => now), optimize, resolveAddress };
  }
  async function protectedData() {
    return Promise.all([routeRef(), photoRef(), aliasRef(), historyRef(), ...ids.map(id => db.doc(`companies/onnuri/customers/${id}`))].map(async ref => (await ref.get()).data()));
  }
  it("recommends and applies the entire day despite another employee's existing photo", async () => {
    const { service, optimize } = setup(), before = await protectedData();
    const result = await service.recommend(request(), actor);
    expect(result.customerIds).toEqual([ids[1], ids[0], ids[2]]);
    const input = { requestId: randomUUID(), recommendationId: result.recommendationId, deliveryDateKey: date };
    const applied = await service.apply(input, actor);
    expect(applied.customerIds).toEqual(result.customerIds); expect(new Set(applied.customerIds)).toEqual(new Set(ids));
    expect(await protectedData()).toEqual(before);
    expect(await service.apply(input, actor)).toEqual(applied); expect(optimize).toHaveBeenCalledTimes(1);
  });
  it("pins a customer departure and final customer without company coordinates", async () => {
    await db.doc("secureSettings/deliveryPlanning").update({ originPoint: null });
    const { service, optimize } = setup(), before = await protectedData();
    const result = await service.recommend(request(ids[1]), actor);
    expect(result.customerIds).toEqual([ids[1], ids[0], ids[2]]); expect(optimize.mock.calls[0]?.[4]).toBe(ids[1]);
    const applied = await service.apply({ requestId: randomUUID(), recommendationId: result.recommendationId, deliveryDateKey: date }, actor);
    expect(applied.customerIds).toEqual(result.customerIds); expect(await protectedData()).toEqual(before);
    expect((await db.doc("secureSettings/deliveryPlanning").get()).get("originPoint")).toBeNull();
  });
  it("rejects a departure outside today's membership before any route call", async () => {
    const { service, optimize } = setup();
    await expect(service.recommend(request("not-in-today"), actor)).rejects.toMatchObject({ code: "aborted" });
    expect(optimize).not.toHaveBeenCalled();
  });
  it("retains old company-input hashes and reuses its cached result", async () => {
    const { service, optimize } = setup(), input = request(), parsed = recommendRouteSchema.parse(input);
    expect(parsed).toEqual(input); expect(Object.hasOwn(parsed, "firstCustomerId")).toBe(false);
    const first = await service.recommend(parsed, actor); expect(await service.recommend(parsed, actor)).toEqual(first);
    expect(optimize).toHaveBeenCalledTimes(1);
    expect((await db.doc(`requestLocks/delivery-planning-${input.requestId}`).get()).get("fingerprint")).toBe(createHash("sha256").update(JSON.stringify(input)).digest("hex"));
    await expect(service.recommend({ ...parsed, firstCustomerId: ids[0] }, actor)).rejects.toMatchObject({ code: "already-exists" });
    expect(optimize).toHaveBeenCalledTimes(1);
  });
  it("rejects registered-address changes during geocoding before the paid route call", async () => {
    const original = setup(); let changed = false;
    const { service, optimize } = setup({ resolveAddress: async address => {
      if (!changed) { changed = true; await db.doc(`companies/onnuri/customers/${ids[0]}`).update({ officialAddress: "대전 대덕구 변경로 12" }); }
      return original.resolveAddress(address);
    } });
    await expect(service.recommend(request(ids[0]), actor)).rejects.toMatchObject({ code: "aborted" });
    expect(optimize).not.toHaveBeenCalled(); expect((await dayRef().get()).get("revision")).toBe(4);
  });
  it("does not overwrite a list changed during route calculation or after a recommendation", async () => {
    const original = setup();
    const { service } = setup({ optimize: async (...args) => {
      await dayRef().update({ customerIds: [ids[0], ids[2]], revision: 5 }); return original.optimize(...args);
    } });
    await expect(service.recommend(request(ids[0]), actor)).rejects.toMatchObject({ code: "aborted" });
    expect((await dayRef().get()).get("customerIds")).toEqual([ids[0], ids[2]]);
    await dayRef().update({ customerIds: ids, revision: 4 });
    const recommended = await original.service.recommend(request(ids[0]), actor);
    await dayRef().update({ customerIds: [ids[2], ids[0]], revision: 5 });
    await expect(original.service.apply({ requestId: randomUUID(), recommendationId: recommended.recommendationId, deliveryDateKey: date }, actor)).rejects.toMatchObject({ code: "aborted" });
    expect((await dayRef().get()).get("customerIds")).toEqual([ids[2], ids[0]]);
  });
  it("keeps photos added during calculation and refuses a revoked actor", async () => {
    const original = setup(), added = db.doc(`companies/onnuri/deliveryPhotos/${actor.employeeId}-during-route`);
    const { service } = setup({ optimize: async (...args) => { await added.set({ ...photo(), customerId: ids[1] }); return original.optimize(...args); } });
    const result = await service.recommend(request(ids[0]), actor);
    await service.apply({ requestId: randomUUID(), recommendationId: result.recommendationId, deliveryDateKey: date }, actor);
    expect((await added.get()).data()).toEqual({ ...photo(), customerId: ids[1] });
    const revoked = setup({ optimize: async (...args) => { await db.doc(`authz/${actor.uid}`).update({ active: false }); return original.optimize(...args); } });
    await expect(revoked.service.recommend({ ...request(ids[0]), expectedDayRevision: 5 }, actor)).rejects.toMatchObject({ code: "permission-denied" });
  });
});
