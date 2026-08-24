import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { AdminService } from "../functions/src/admin/admin-service.js";
import { isForbiddenPin } from "../functions/src/auth/pin-crypto.js";
import { EmployeeLoginService, LoginRejectedError } from "../functions/src/auth/login-service.js";
import { LoginRepository } from "../functions/src/auth/login-repository.js";
import { buildPhase1SeedDocuments } from "../src/seed/phase1.js";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error("Phase 15 gate is restricted to Auth and Firestore emulators.");
}

const projectId = process.env.GCLOUD_PROJECT ?? "demo-onnuriway";
const app = getApps()[0] ?? initializeApp({ projectId });
const database = getFirestore(app);
const auth = getAuth(app);
await database.recursiveDelete(database.collection("employees"));
for (const collection of ["employeeDirectory", "authCredentials", "pinIndexes", "pinReservations", "authz", "auditLogs", "secureSettings", "appSettings", "schools", "salesCycles", "zones", "catalogMeta", "searchCatalogs"]) {
  await database.recursiveDelete(database.collection(collection));
}
for (const document of buildPhase1SeedDocuments()) await database.doc(document.path).set(document.data);

let pageToken: string | undefined;
do {
  const page = await auth.listUsers(1_000, pageToken);
  if (page.users.length) await auth.deleteUsers(page.users.map((user) => user.uid));
  pageToken = page.pageToken;
} while (pageToken);
await auth.createUser({ uid: "uid-admin", displayName: "관리자" });
await auth.createUser({ uid: "uid-google-admin", email: "admin@onnuriway.test", emailVerified: true });

const lookupSecret = "phase15-emulator-pin-lookup-secret-2026";
const pinPepper = "phase15-emulator-pin-pepper-secret-2026";
const now = new Date("2026-08-24T10:00:00.000Z");
const admin = new AdminService({ db: database, auth, lookupSecret, pinPepper, now: () => now });
const actor = { uid: "uid-admin", employeeId: "EMP-ADMIN", email: "admin@onnuriway.test" };

const reservation = await admin.reservePin(crypto.randomUUID(), actor);
if (isForbiddenPin(reservation.pin)) throw new Error("Admin generated a forbidden PIN.");
const created = await admin.createEmployee({
  reservationId: reservation.reservationId,
  displayName: "Phase 15 영업",
  roleScopes: ["sales"],
  exportTeam: false,
  requestId: crypto.randomUUID(),
  appVersion: "phase15-gate",
}, actor);
const createdEmployee = await database.doc(`employees/${created.employeeId}`).get();
const createdCredential = await database.doc(`authCredentials/${created.employeeId}`).get();
if (!createdEmployee.exists || createdCredential.get("pinHash") === reservation.pin || !createdCredential.get("lookupKey")) {
  throw new Error("Employee PIN material was not stored through the protected contract.");
}

const login = (pin: string) => new EmployeeLoginService({
  repository: new LoginRepository(database),
  lookupSecret,
  pinPepper,
  issueCustomToken: async (uid, claims) => JSON.stringify({ uid, claims }),
  now: () => now,
}).login({ pin, sourceFingerprint: `phase15-${crypto.randomUUID()}`, requestId: crypto.randomUUID() });
const initialLogin = await login(reservation.pin);
if (!initialLogin.customToken.includes(created.employeeId)) throw new Error("New employee could not log in with the issued PIN.");

const rotated = await admin.rotatePin({
  employeeId: created.employeeId,
  revokeSessions: true,
  reason: "Phase 15 PIN rotation gate",
  requestId: crypto.randomUUID(),
  appVersion: "phase15-gate",
}, actor);
let oldPinRejected = false;
try { await login(reservation.pin); }
catch (error) { if (error instanceof LoginRejectedError) oldPinRejected = true; else throw error; }
if (!oldPinRejected) throw new Error("The old PIN remained usable after rotation.");
await login(rotated.pin);

const updated = await admin.updateEmployee({
  employeeId: created.employeeId,
  displayName: "Phase 15 납품·영업",
  roleScopes: ["delivery", "sales"],
  exportTeam: true,
  status: "active",
  revokeSessions: true,
  reason: "Phase 15 role update gate",
  requestId: crypto.randomUUID(),
  appVersion: "phase15-gate",
}, actor);
if (!updated.roleScopes.includes("delivery") || updated.permissionsVersion !== 2) {
  throw new Error("Employee role or permission version was not updated.");
}
const revoked = await admin.revokeSessions({
  employeeId: created.employeeId,
  reason: "Phase 15 explicit revoke gate",
  requestId: crypto.randomUUID(),
  appVersion: "phase15-gate",
}, actor);
if (revoked.sessionVersion <= updated.sessionVersion) throw new Error("Session revoke did not advance the session version.");

await admin.updateSettings({
  minimumAppVersion: "15.0.0",
  maintenanceMode: true,
  requestId: crypto.randomUUID(),
  appVersion: "phase15-gate",
}, actor);
const workspace = await admin.workspace("2026-08");
if (!workspace.employees.some((employee) => employee.employeeId === created.employeeId) || workspace.settings.maintenanceMode !== true) {
  throw new Error("Admin workspace did not reflect employee and settings mutations.");
}

const activated = await admin.activateGoogleAdmin({
  uid: "uid-google-admin",
  email: "admin@onnuriway.test",
  appVersion: "phase15-gate",
});
const activatedUser = await auth.getUser("uid-google-admin");
const reboundEmployee = await database.doc("employees/EMP-ADMIN").get();
if (!activated.ok || activatedUser.customClaims?.adminApproved !== true || reboundEmployee.get("firebaseUid") !== "uid-google-admin") {
  throw new Error("Google allowlist activation did not bind the verified administrator.");
}

const auditCount = (await database.collection("auditLogs").get()).size;
console.log(JSON.stringify({
  status: "phase15-admin-gate-passed",
  createdEmployeeId: created.employeeId,
  initialLogin: true,
  oldPinRejected,
  rotatedLogin: true,
  sessionVersion: revoked.sessionVersion,
  workspaceEmployees: workspace.employees.length,
  googleAdminActivated: true,
  auditCount,
}));
