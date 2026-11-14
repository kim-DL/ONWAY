import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { AdminConflictError, AdminService } from "../functions/src/admin/admin-service.js";
import { GoogleAdminAccessService } from "../functions/src/admin/google-admin-access-service.js";

for (const name of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) {
  if (!/^(?:127\.0\.0\.1|localhost):\d+$/u.test(process.env[name] ?? "")) throw new Error("Access race checks require loopback emulators.");
}
const projectId = `demo-race-${randomUUID().slice(0, 8)}`;
const app = initializeApp({ projectId }, projectId);
const db = getFirestore(app);
const auth = getAuth(app);
const now = Timestamp.now();
const owner = { uid: "uid-owner", employeeId: "EMP-OWNER", email: "owner@example.test", sessionVersion: 1, permissionsVersion: 1 };
const target = { uid: "uid-target", employeeId: "EMP-TARGET", email: "target@example.test", sessionVersion: 1, permissionsVersion: 1 };
const dependencies = { db, auth, lookupSecret: "synthetic-operations-race-lookup-secret-2026", pinPepper: "synthetic-operations-race-pin-pepper-2026" };
const google = new GoogleAdminAccessService({ db, auth });
const edit = { employeeId: target.employeeId, displayName: "검증 책임자", roleScopes: ["admin", "sales"] as ("admin" | "sales")[], exportTeam: true, status: "active" as const, revokeSessions: false, reason: "업무 역할 확인", requestId: randomUUID(), appVersion: "access-race-gate" };

try {
  for (const actor of [owner, target]) {
    await auth.createUser({ uid: actor.uid, email: actor.email, emailVerified: true });
    await auth.setCustomUserClaims(actor.uid, { employeeId: actor.employeeId, roleScopes: ["admin"], sessionVersion: 1, permissionsVersion: 1, adminApproved: true });
    await db.doc(`employees/${actor.employeeId}`).set({ employeeId: actor.employeeId, firebaseUid: actor.uid, displayName: "검증 운영자", roleScopes: ["admin"], permissions: { exportTeam: true }, status: "active", sessionVersion: 1, createdAt: now, updatedAt: now });
    await db.doc(`authz/${actor.uid}`).set({ employeeId: actor.employeeId, active: true, sessionVersion: 1, permissionsVersion: 1, updatedAt: now });
  }
  await db.doc("secureSettings/adminAccess").set({ revision: 0, entries: [owner, target].map(({ uid, employeeId, email }) => ({ uid, employeeId, email, active: true })) });
  const updated = await new AdminService(dependencies).updateEmployee(edit, owner);
  assert.deepEqual(updated.roleScopes, ["admin", "sales"]);
  assert.equal(updated.permissionsVersion, 2);

  let reachedTransaction!: () => void;
  let resumeTransaction!: () => void;
  const reached = new Promise<void>((resolve) => { reachedTransaction = resolve; });
  const resume = new Promise<void>((resolve) => { resumeTransaction = resolve; });
  const pausedDb = new Proxy(db, { get(object, key) {
    if (key === "runTransaction") return async (...args: Parameters<Firestore["runTransaction"]>) => {
      reachedTransaction(); await resume; return object.runTransaction(...args);
    };
    const value = Reflect.get(object, key);
    return typeof value === "function" ? value.bind(object) : value;
  } });
  const delayed = new AdminService({ ...dependencies, db: pausedDb }).updateEmployee({ ...edit, displayName: "늦은 이름 변경", requestId: randomUUID() }, owner);
  const rejection = assert.rejects(delayed, AdminConflictError);
  await reached;
  await google.disable({ employeeId: target.employeeId, expectedRevision: 0, reason: "해제 경합 확인", requestId: randomUUID(), appVersion: "access-race-gate" }, owner);
  resumeTransaction();
  await rejection;
  const [employee, authorization] = await db.getAll(db.doc(`employees/${target.employeeId}`), db.doc(`authz/${target.uid}`));
  assert.equal(employee!.get("status"), "disabled");
  assert.equal(employee!.get("displayName"), edit.displayName);
  assert.equal(authorization!.get("active"), false);
  assert.equal(authorization!.get("sessionVersion"), 2);
  assert.equal((await db.doc(`authz/${owner.uid}`).get()).get("sessionVersion"), 1);
  console.log(JSON.stringify({ status: "operations-update-race-passed", checks: 2, disabledAccessPreserved: true, adminWorkRolesEditable: true }));
} finally { await db.terminate(); await deleteApp(app); }
