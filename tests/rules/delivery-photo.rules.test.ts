import { readFileSync } from "node:fs";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let environment: RulesTestEnvironment;
const roles = ["delivery", "sales", "viewer", "admin"] as const;
const paths = [
  "companies/onnuri/deliveryPhotoRoutes/EMP-delivery",
  "companies/onnuri/deliveryPhotoDays/EMP-delivery_2026-09-22",
  "companies/onnuri/deliveryPhotos/00000000-0000-4000-8000-000000000000",
];

function firestoreFor(role: typeof roles[number]) {
  return environment.authenticatedContext(`uid-${role}`, {
    employeeId: `EMP-${role}`, roleScopes: [role], sessionVersion: 1, permissionsVersion: 1,
    ...(role === "admin" ? { adminApproved: true, firebase: { sign_in_provider: "google.com" } } : {}),
  }).firestore() as unknown as Firestore;
}

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-onnuriway",
    firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const store = context.firestore() as unknown as Firestore;
    for (const path of paths) await setDoc(doc(store, path), { serverOwned: true });
    await setDoc(doc(store, "requestLocks/delivery-photo-request"), { operation: "createDeliveryPhoto", state: "complete" });
    await setDoc(doc(store, "deliveryPhotoUploadRates/uid-delivery"), { window: 1, count: 1 });
  });
});

afterAll(async () => { await environment.cleanup(); });

describe("delivery photo Callable-only Firestore boundary", () => {
  it.each(roles)("denies direct %s reads, lists, writes and deletes", async (role) => {
    const store = firestoreFor(role);
    for (const path of paths) {
      await assertFails(getDoc(doc(store, path)));
      await assertFails(setDoc(doc(store, `${path}-forged`), { actorUid: `uid-${role}`, objectPath: "attacker/path" }));
      await assertFails(updateDoc(doc(store, path), { status: "active", role: "admin" }));
      await assertFails(deleteDoc(doc(store, path)));
    }
    await assertFails(getDocs(collection(store, "companies/onnuri/deliveryPhotos")));
  });

  it.each(roles)("keeps %s idempotency and rate records server-only", async (role) => {
    const store = firestoreFor(role);
    for (const path of ["requestLocks/delivery-photo-request", "deliveryPhotoUploadRates/uid-delivery"]) {
      await assertFails(getDoc(doc(store, path)));
      await assertFails(setDoc(doc(store, `${path}-forged`), { state: "complete", count: 0 }));
      await assertFails(deleteDoc(doc(store, path)));
    }
  });

  it("denies unauthenticated access", async () => {
    const store = environment.unauthenticatedContext().firestore() as unknown as Firestore;
    for (const path of paths) await assertFails(getDoc(doc(store, path)));
  });
});
