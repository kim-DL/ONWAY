import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

import { AdminService } from "../functions/src/admin/admin-service.js";
import { EmployeePinService, type EmployeePinActor } from "../functions/src/auth/employee-pin-service.js";
import { EmployeeLoginService } from "../functions/src/auth/login-service.js";
import { LoginRepository } from "../functions/src/auth/login-repository.js";
import { createPinLookupKey, hashPin } from "../functions/src/auth/pin-crypto.js";

const projectId = process.env.GCLOUD_PROJECT ?? "demo-onnuriway";
if (!projectId.startsWith("demo-") || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Employee PIN checks require a demo project and Auth/Firestore emulators.");
}
const app = initializeApp({ projectId }, `employee-pin-${randomUUID()}`);
const db = getFirestore(app);
const auth = getAuth(app);
const lookupSecret = "synthetic-employee-pin-gate-lookup-secret-2026";
const pinPepper = "synthetic-employee-pin-gate-pepper-secret-2026";
const nowDate = new Date("2026-11-14T12:00:00.000Z");
const now = Timestamp.fromDate(nowDate);
const pinService = new EmployeePinService({ db, lookupSecret, pinPepper, now: () => nowDate });
const adminService = new AdminService({ db, auth, lookupSecret, pinPepper, now: () => nowDate });
const prefix = `pin-gate-${randomUUID()}`;
const adminActor = { uid: `${prefix}-admin`, employeeId: `${prefix}-ADMIN`, email: "pin-gate@example.test", sessionVersion: 1, permissionsVersion: 1 };
const priorAccess = await db.doc("secureSettings/adminAccess").get();
let cases = 0;

async function staff(suffix: string, pin: string): Promise<EmployeePinActor> {
  const uid = `${prefix}-${suffix}`;
  const employeeId = `${prefix}-EMP-${suffix}`;
  const lookupKey = createPinLookupKey(pin, lookupSecret);
  const token = { uid, employeeId, roleScopes: ["delivery"], sessionVersion: 1, permissionsVersion: 1 } as unknown as DecodedIdToken;
  await auth.createUser({ uid, displayName: `PIN 검증 ${suffix}` });
  await Promise.all([
    db.doc(`employees/${employeeId}`).set({ employeeId, firebaseUid: uid, displayName: `PIN 검증 ${suffix}`, status: "active", roleScopes: ["delivery"], permissions: { exportTeam: false }, sessionVersion: 1, createdAt: now, updatedAt: now }),
    db.doc(`authz/${uid}`).set({ employeeId, active: true, sessionVersion: 1, permissionsVersion: 1, updatedAt: now }),
    db.doc(`authCredentials/${employeeId}`).set({ employeeId, lookupKey, pinHash: await hashPin(pin, pinPepper), pinVersion: 1, sessionVersion: 1, failedAttemptCount: 0, lockedUntil: null, updatedAt: now }),
    db.doc(`pinIndexes/${lookupKey}`).set({ employeeId, createdAt: now, updatedAt: now }),
  ]);
  return { uid, token };
}
const input = (currentPin: string, newPin: string) => ({ currentPin, newPin, requestId: randomUUID(), appVersion: "pin-emulator-gate" });
const change = (actor: EmployeePinActor, currentPin: string, newPin: string) => pinService.changePin(input(currentPin, newPin), actor, `${prefix}-source-${actor.uid}`);
const expectError = async (work: Promise<unknown>, code: string) => {
  await assert.rejects(work, (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === code);
};
async function login(pin: string) {
  return new EmployeeLoginService({ repository: new LoginRepository(db), lookupSecret, pinPepper, now: () => nowDate,
    issueCustomToken: async (uid, claims) => JSON.stringify({ uid, claims }),
  }).login({ pin, sourceFingerprint: `${prefix}-${randomUUID()}`, requestId: randomUUID() });
}
async function onlyCurrentIndex(actor: EmployeePinActor) {
  const indexes = await db.collection("pinIndexes").where("employeeId", "==", actor.token.employeeId).get();
  const credential = await db.doc(`authCredentials/${actor.token.employeeId}`).get();
  assert.equal(indexes.size, 1);
  assert.equal(indexes.docs[0]!.id, credential.get("lookupKey"));
}

try {
  await auth.createUser({ uid: adminActor.uid, email: adminActor.email, emailVerified: true });
  await Promise.all([
    db.doc(`employees/${adminActor.employeeId}`).set({ employeeId: adminActor.employeeId, firebaseUid: adminActor.uid, displayName: "PIN 검증 운영자", status: "active", roleScopes: ["admin"], sessionVersion: 1, createdAt: now, updatedAt: now }),
    db.doc(`authz/${adminActor.uid}`).set({ employeeId: adminActor.employeeId, active: true, sessionVersion: 1, permissionsVersion: 1, updatedAt: now }),
    db.doc("secureSettings/adminAccess").set({ entries: [{ email: adminActor.email, employeeId: adminActor.employeeId, uid: adminActor.uid, active: true }], revision: 0 }),
  ]);
  const a = await staff("a", "482915");
  const b = await staff("b", "592804");
  const authzBefore = (await db.doc(`authz/${a.uid}`).get()).data();
  const employeeBefore = (await db.doc(`employees/${a.token.employeeId}`).get()).data();
  const authBefore = await auth.getUser(a.uid);
  const request = input("482915", "012804");
  assert.deepEqual(await pinService.changePin(request, a, prefix), { changed: true, pinVersion: 2 });
  assert.deepEqual((await db.doc(`authz/${a.uid}`).get()).data(), authzBefore);
  assert.deepEqual((await db.doc(`employees/${a.token.employeeId}`).get()).data(), employeeBefore);
  assert.equal((await auth.getUser(a.uid)).tokensValidAfterTime, authBefore.tokensValidAfterTime);
  await assert.rejects(login("482915"));
  assert.ok((await login("012804")).customToken.includes(a.uid));
  await onlyCurrentIndex(a);
  cases += 1;

  assert.deepEqual(await pinService.changePin(request, a, prefix), { changed: true, pinVersion: 2 });
  assert.equal((await db.collection("auditLogs").where("requestId", "==", request.requestId).get()).size, 1);
  const receipt = (await db.doc(`pinChangeRequests/${request.requestId}`).get()).data();
  assert.equal(Object.hasOwn(receipt!, "currentPin"), false);
  assert.equal(Object.hasOwn(receipt!, "newPin"), false);
  assert.equal(Object.hasOwn(receipt!, "pinHash"), false);
  await expectError(pinService.changePin({ ...request, newPin: "391705" }, a, prefix), "already-exists");
  cases += 1;

  await expectError(change(b, "592804", "012804"), "already-exists");
  await expectError(change(b, "391705", "649207"), "failed-precondition");
  await expectError(change(b, "592804", "111111"), "invalid-argument");
  await expectError(change(b, "592804", "592804"), "invalid-argument");
  cases += 1;

  const reservation = await adminService.reservePin(randomUUID(), adminActor);
  assert.equal(reservation.reservationId, createPinLookupKey(reservation.pin, lookupSecret));
  await expectError(change(b, "592804", reservation.pin), "already-exists");
  const created = await adminService.createEmployee({ reservationId: reservation.reservationId, displayName: "PIN 신규 검증", roleScopes: ["sales"], exportTeam: false, requestId: randomUUID(), appVersion: "pin-emulator-gate" }, adminActor);
  assert.ok((await login(reservation.pin)).customToken.includes(created.employeeId));
  cases += 1;

  const legacyKey = createPinLookupKey("681204", lookupSecret);
  const legacyRef = db.doc(`pinReservations/${randomUUID()}`);
  await legacyRef.set({ lookupKey: legacyKey, expiresAt: Timestamp.fromMillis(now.toMillis() + 60_000) });
  await expectError(change(b, "592804", "681204"), "already-exists");
  await legacyRef.update({ expiresAt: Timestamp.fromMillis(now.toMillis() - 1) });
  assert.equal((await change(b, "592804", "681204")).pinVersion, 2);
  cases += 1;

  const c = await staff("c", "729405");
  const d = await staff("d", "839516");
  const contenders = await Promise.allSettled([change(c, "729405", "941627"), change(d, "839516", "941627")]);
  assert.equal(contenders.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = contenders.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason.code === "already-exists");
  await onlyCurrentIndex(c);
  await onlyCurrentIndex(d);
  cases += 1;

  const e = await staff("e", "052738");
  const resetRequest = { employeeId: e.token.employeeId as string, revokeSessions: false, reason: "PIN 분실 검증", requestId: randomUUID(), appVersion: "pin-emulator-gate" };
  const race = await Promise.allSettled([change(e, "052738", "163849"), adminService.rotatePin(resetRequest, adminActor)]);
  assert.ok(race.some((result) => result.status === "fulfilled"));
  await onlyCurrentIndex(e);
  assert.equal((await db.doc(`authz/${e.uid}`).get()).get("sessionVersion"), 1);
  cases += 1;

  const f = await staff("f", "274950");
  const recoveryRequest = { ...resetRequest, employeeId: f.token.employeeId as string, requestId: randomUUID() };
  const rotated = await adminService.rotatePin(recoveryRequest, adminActor);
  await assert.rejects(login("274950"));
  assert.ok((await login(rotated.pin)).customToken.includes(f.uid));
  assert.equal((await db.doc(`authz/${f.uid}`).get()).get("sessionVersion"), 1);
  const recoveryCredential = (await db.doc(`authCredentials/${f.token.employeeId}`).get()).data();
  await assert.rejects(adminService.rotatePin(recoveryRequest, adminActor), /이미 임시 PIN을 발급했습니다/u);
  await assert.rejects(adminService.rotatePin({ ...recoveryRequest, revokeSessions: true }, adminActor), /요청 내용이 변경되었습니다/u);
  assert.deepEqual((await db.doc(`authCredentials/${f.token.employeeId}`).get()).data(), recoveryCredential);
  assert.equal((await db.collection("auditLogs").where("requestId", "==", recoveryRequest.requestId).get()).size, 1);
  const recoveryReceipt = (await db.doc(`requestLocks/pin-rotate-${recoveryRequest.requestId}`).get()).data();
  assert.equal(Object.hasOwn(recoveryReceipt!, "pin"), false);
  assert.equal(Object.hasOwn(recoveryReceipt!, "pinHash"), false);
  await change(f, rotated.pin, "385061");
  cases += 1;

  const stale = { ...a, token: { ...a.token, sessionVersion: 9 } };
  await expectError(change(stale, "012804", "496172"), "permission-denied");
  const permissions = { ...a, token: { ...a.token, permissionsVersion: 9 } };
  await expectError(change(permissions, "012804", "496172"), "permission-denied");
  const roles = { ...a, token: { ...a.token, roleScopes: ["sales"] } };
  await expectError(change(roles, "012804", "496172"), "permission-denied");
  const wrongUid = { ...a, token: { ...a.token, uid: "another-uid" } };
  await expectError(change(wrongUid, "012804", "496172"), "failed-precondition");
  await db.doc(`employees/${b.token.employeeId}`).update({ status: "disabled" });
  await expectError(change(b, "681204", "496172"), "permission-denied");
  cases += 1;

  const g = await staff("g", "507283");
  for (let index = 0; index < 4; index += 1) await expectError(change(g, "618394", "729506"), "failed-precondition");
  await expectError(change(g, "618394", "729506"), "resource-exhausted");
  await expectError(change(g, "507283", "729506"), "resource-exhausted");
  assert.equal((await db.doc(`authz/${g.uid}`).get()).get("sessionVersion"), 1);
  cases += 1;

  const h = await staff("h", "830617");
  for (let index = 0; index < 30; index += 1) {
    await expectError(pinService.changePin(input("830617", "111111"), h, `${prefix}-bounded-source-${index}`), "invalid-argument");
  }
  await expectError(change(h, "830617", "941728"), "resource-exhausted");
  cases += 1;

  for (let index = 0; index < 30; index += 1) {
    const actor = index < 20 ? a : c;
    await expectError(pinService.changePin(input("012804", "111111"), actor, `${prefix}-shared-source`), "invalid-argument");
  }
  await expectError(pinService.changePin(input("012804", "941728"), c, `${prefix}-shared-source`), "resource-exhausted");
  cases += 1;

  await db.doc(`authz/${adminActor.uid}`).update({ permissionsVersion: 2 });
  await assert.rejects(adminService.reservePin(randomUUID(), adminActor), (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "permission-denied");
  cases += 1;
  console.log(JSON.stringify({ status: "employee-pin-gate-passed", cases, preservedSessions: true, uniqueConcurrentPin: true, secretsInOutput: false }));
} finally {
  if (priorAccess.exists) await db.doc("secureSettings/adminAccess").set(priorAccess.data()!);
  else await db.doc("secureSettings/adminAccess").delete();
  await deleteApp(app);
}
