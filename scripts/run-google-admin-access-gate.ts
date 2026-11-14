import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { GoogleAdminAccessService, type GoogleAdminAccessActor } from "../functions/src/admin/google-admin-access-service.js";

for (const name of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
  if (!/^(?:127\.0\.0\.1|localhost):\d+$/u.test(process.env[name] ?? "")) {
    throw new Error("Google admin gate requires loopback Auth and Firestore emulators.");
  }
}

const projectId = `demo-google-${randomUUID().slice(0, 8)}`;
const app = initializeApp({ projectId }, projectId);
const db = getFirestore(app);
const auth = getAuth(app);
const service = new GoogleAdminAccessService({ db, auth });
const owner: GoogleAdminAccessActor = {
  uid: "uid-owner", employeeId: "EMP-OWNER", email: "owner@example.test", sessionVersion: 1, permissionsVersion: 1,
};
const manager: GoogleAdminAccessActor = {
  uid: "uid-manager", employeeId: "EMP-MANAGER", email: "manager@example.test", sessionVersion: 1, permissionsVersion: 1,
};
const timestamp = new Date("2026-11-14T10:00:00.000Z");
let checks = 0;

async function seedOperator(actor: GoogleAdminAccessActor) {
  await auth.createUser({ uid: actor.uid, email: actor.email, emailVerified: true });
  await db.doc(`employees/${actor.employeeId}`).set({
    employeeId: actor.employeeId, firebaseUid: actor.uid, displayName: "검증 운영자", roleScopes: ["admin"],
    status: "active", sessionVersion: 1, permissions: { exportTeam: true }, createdAt: timestamp, updatedAt: timestamp,
  });
  await db.doc(`authz/${actor.uid}`).set({ employeeId: actor.employeeId, active: true, sessionVersion: 1, permissionsVersion: 1 });
}

try {
  await seedOperator(owner);
  await seedOperator(manager);
  await db.doc("authz/uid-staff").set({ employeeId: "EMP-STAFF", active: true, sessionVersion: 6, permissionsVersion: 4 });
  await db.doc("secureSettings/adminAccess").set({ entries: [
    { email: owner.email, employeeId: owner.employeeId, active: true },
    { email: manager.email, employeeId: manager.employeeId, active: true },
  ] });
  const beforeSessions = JSON.stringify((await db.getAll(db.doc(`authz/${owner.uid}`), db.doc(`authz/${manager.uid}`), db.doc("authz/uid-staff"))).map((snapshot) => snapshot.data()));
  const registerInput = { email: "new.operator@example.test", displayName: "새 운영자", expectedRevision: 0, requestId: randomUUID(), appVersion: "google-access-gate" };
  const registrations = await Promise.allSettled([
    service.register(registerInput, owner), service.register({ ...registerInput, requestId: randomUUID() }, owner),
  ]);
  assert.equal(registrations.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await service.list(owner)).entries.filter((entry) => entry.email === registerInput.email).length, 1);
  assert.equal(JSON.stringify((await db.getAll(db.doc(`authz/${owner.uid}`), db.doc(`authz/${manager.uid}`), db.doc("authz/uid-staff"))).map((snapshot) => snapshot.data())), beforeSessions);
  checks += 3;

  const pending = (await service.list(owner)).entries.find((entry) => entry.email === registerInput.email)!;
  await auth.createUser({ uid: "uid-new", email: registerInput.email, emailVerified: true });
  await service.activate({ uid: "uid-new", email: registerInput.email, appVersion: "google-access-gate" });
  assert.equal((await auth.getUser("uid-new")).customClaims?.adminApproved, true);
  await assert.rejects(service.activate({ uid: "uid-other", email: registerInput.email, appVersion: "google-access-gate" }), { code: "permission-denied" });
  assert.equal((await db.doc(`employees/${pending.employeeId}`).get()).get("firebaseUid"), "uid-new");
  checks += 3;

  const revision = (await service.list(owner)).revision;
  const disableInput = { employeeId: pending.employeeId, expectedRevision: revision, reason: "검증 해제", requestId: randomUUID(), appVersion: "google-access-gate" };
  const disabled = await service.disable(disableInput, owner);
  const auditsBeforeReplay = (await db.collection("auditLogs").where("requestId", "==", disableInput.requestId).get()).size;
  assert.deepEqual(await service.disable(disableInput, owner), disabled);
  assert.equal((await db.collection("auditLogs").where("requestId", "==", disableInput.requestId).get()).size, auditsBeforeReplay);
  assert.equal((await db.doc("authz/uid-new").get()).get("active"), false);
  await assert.rejects(service.activate({ uid: "uid-new", email: registerInput.email, appVersion: "google-access-gate" }), { code: "permission-denied" });
  checks += 4;

  const raceInput = { email: "race.operator@example.test", displayName: "경합 운영자", expectedRevision: disabled.revision, requestId: randomUUID(), appVersion: "google-access-gate" };
  const raceRegistration = await service.register(raceInput, owner);
  await auth.createUser({ uid: "uid-race", email: raceInput.email, emailVerified: true });
  const raceRemoval = { employeeId: raceRegistration.employeeId, expectedRevision: raceRegistration.revision, reason: "동시 해제", requestId: randomUUID(), appVersion: "google-access-gate" };
  const race = await Promise.allSettled([
    service.activate({ uid: "uid-race", email: raceInput.email, appVersion: "google-access-gate" }),
    service.disable(raceRemoval, owner),
  ]);
  if (race[1]!.status === "rejected") {
    await service.disable({ ...raceRemoval, expectedRevision: (await service.list(owner)).revision, requestId: randomUUID() }, owner);
  }
  const afterRace = await db.doc(`employees/${raceRegistration.employeeId}`).get();
  assert.equal(afterRace.get("status"), "disabled");
  await assert.rejects(service.activate({ uid: "uid-race", email: raceInput.email, appVersion: "google-access-gate" }), { code: "permission-denied" });
  const raceAuthz = await db.doc("authz/uid-race").get();
  assert.ok(!raceAuthz.exists || raceAuthz.get("active") === false);
  checks += 3;

  const crossRevision = (await service.list(owner)).revision;
  const cross = await Promise.allSettled([
    service.disable({ employeeId: manager.employeeId, expectedRevision: crossRevision, reason: "교차 해제", requestId: randomUUID(), appVersion: "google-access-gate" }, owner),
    service.disable({ employeeId: owner.employeeId, expectedRevision: crossRevision, reason: "교차 해제", requestId: randomUUID(), appVersion: "google-access-gate" }, manager),
  ]);
  assert.equal(cross.filter((result) => result.status === "fulfilled").length, 1);
  const survivor = (await db.doc(`authz/${owner.uid}`).get()).get("active") ? owner : manager;
  const remaining = await service.list(survivor);
  assert.equal(remaining.entries.filter((entry) => entry.status === "active").length, 1);
  await assert.rejects(service.disable({ employeeId: survivor.employeeId, expectedRevision: remaining.revision, reason: "마지막 계정", requestId: randomUUID(), appVersion: "google-access-gate" }, survivor), { code: "failed-precondition" });
  assert.equal((await db.doc("authz/uid-staff").get()).get("sessionVersion"), 6);
  checks += 4;

  console.log(JSON.stringify({ status: "google-admin-access-gate-passed", checks, isolatedEmulatorProject: true }));
} finally {
  await db.terminate();
  await deleteApp(app);
}
