import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, setDoc, Timestamp, updateDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let environment: RulesTestEnvironment;
const path = "companies/onnuri/customers/customer-one";
const now = Timestamp.fromDate(new Date("2026-09-06T00:00:00Z"));
const data = { customerId: "customer-one", companyId: "onnuri", name: "테스트 거래처", accessPassword: "00123*", contacts: [], status: "active" };

function db(role = "delivery", overrides: Record<string, unknown> = {}) {
  return environment.authenticatedContext(`uid-${role}`, {
    employeeId: `EMP-${role}`, roleScopes: [role], sessionVersion: 1, permissionsVersion: 1,
    ...(role === "admin" ? { adminApproved: true, firebase: { sign_in_provider: "google.com" } } : {}),
    ...overrides,
  }).firestore() as unknown as Firestore;
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({ projectId: "demo-onnuriway", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") } });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const store = context.firestore() as unknown as Firestore;
    await setDoc(doc(store, path), data);
    await setDoc(doc(store, "companies/another/customers/customer-one"), { ...data, companyId: "another" });
    await setDoc(doc(store, "auditLogs/customer-audit"), { eventType: "CUSTOMER_UPDATED", actorEmployeeId: "EMP-delivery", targetId: "customer-one", changedFields: ["deliveryAddress"] });
    await setDoc(doc(store, "requestLocks/customer-request"), { operation: "saveCustomer", actorUid: "uid-delivery", customerId: "customer-one" });
    for (const role of ["delivery", "sales", "viewer", "admin"]) {
      await setDoc(doc(store, `authz/uid-${role}`), { employeeId: `EMP-${role}`, active: true, sessionVersion: 1, permissionsVersion: 1, updatedAt: now });
      await setDoc(doc(store, `employees/EMP-${role}`), { employeeId: `EMP-${role}`, firebaseUid: `uid-${role}`, status: "active", roleScopes: [role] });
    }
  });
});
afterAll(async () => { await environment.cleanup(); });

describe("company customer Rules boundary", () => {
  it.each(["delivery", "sales", "viewer", "admin"])("allows active %s member read and list", async (role) => {
    await assertSucceeds(getDoc(doc(db(role), path)));
    await assertSucceeds(getDocs(collection(db(role), "companies/onnuri/customers")));
  });
  it("rejects anonymous, unknown and stale sessions", async () => {
    const anonymous = environment.unauthenticatedContext().firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(anonymous, path)));
    await assertFails(getDocs(collection(anonymous, "companies/onnuri/customers")));
    await assertFails(getDoc(doc(db("outsider"), path)));
    await assertFails(getDoc(doc(db("delivery", { sessionVersion: 2 }), path)));
    await assertFails(getDoc(doc(db("delivery", { permissionsVersion: 2 }), path)));
  });
  it("rejects disabled employees even when an authz document has not yet changed", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore() as unknown as Firestore, "employees/EMP-delivery"), { status: "disabled" });
    });
    await assertFails(getDoc(doc(db(), path)));
  });
  it("rejects authz revocation and employee UID substitution", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const store = context.firestore() as unknown as Firestore;
      await updateDoc(doc(store, "authz/uid-sales"), { active: false });
      await updateDoc(doc(store, "employees/EMP-delivery"), { firebaseUid: "uid-other" });
    });
    await assertFails(getDoc(doc(db("sales"), path)));
    await assertFails(getDoc(doc(db(), path)));
  });
  it("rejects another company and collection-group queries, including admin", async () => {
    for (const role of ["delivery", "admin"]) {
      await assertFails(getDoc(doc(db(role), "companies/another/customers/customer-one")));
      await assertFails(getDocs(collection(db(role), "companies/another/customers")));
      await assertFails(getDocs(collectionGroup(db(role), "customers")));
    }
  });
  it.each(["delivery", "sales", "viewer", "admin"])("rejects all direct %s creates, updates, deletes and escalation", async (role) => {
    const store = db(role);
    await assertFails(setDoc(doc(store, "companies/onnuri/customers/new"), data));
    await assertFails(updateDoc(doc(store, path), { accessPassword: "0000", companyId: "other", revision: 999 }));
    await assertFails(deleteDoc(doc(store, path)));
    await assertFails(setDoc(doc(store, "employees/new-admin"), { roleScopes: ["admin"] }));
  });
  it.each(["delivery", "sales", "viewer", "admin"])("keeps customer audit and idempotency records server-owned for %s", async (role) => {
    const store = db(role);
    await assertFails(setDoc(doc(store, "auditLogs/forged-customer-audit"), { eventType: "CUSTOMER_CREATED", actorEmployeeId: "EMP-admin" }));
    await assertFails(updateDoc(doc(store, "auditLogs/customer-audit"), { actorEmployeeId: "EMP-admin", changedFields: [] }));
    await assertFails(deleteDoc(doc(store, "auditLogs/customer-audit")));
    await assertFails(getDoc(doc(store, "requestLocks/customer-request")));
    await assertFails(setDoc(doc(store, "requestLocks/customer-request"), { actorUid: "uid-admin" }));
    await assertFails(deleteDoc(doc(store, "requestLocks/customer-request")));
    if (role === "admin") await assertSucceeds(getDoc(doc(store, "auditLogs/customer-audit")));
    else await assertFails(getDoc(doc(store, "auditLogs/customer-audit")));
  });
  it("rejects unverified admin provider and missing employee membership", async () => {
    await assertFails(getDoc(doc(db("admin", { firebase: { sign_in_provider: "custom" } }), path)));
    await environment.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore() as unknown as Firestore, "employees/EMP-viewer"));
    });
    await assertFails(getDoc(doc(db("viewer"), path)));
  });
});
