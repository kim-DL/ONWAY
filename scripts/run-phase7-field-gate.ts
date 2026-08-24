import { randomUUID } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { updateFieldProfileInputSchema } from "../functions/src/field/profile-contract.js";
import {
  FieldProfileService,
  RequestCollisionError,
  RevisionConflictError,
} from "../functions/src/field/profile-service.js";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Phase 7 field gate is restricted to a Firestore emulator.");
}

const projectId = process.env.GCLOUD_PROJECT ?? "demo-onnuriway";
const app = getApps().find((candidate) => candidate.name === "phase7-field-gate")
  ?? initializeApp({ projectId }, "phase7-field-gate");
const database = getFirestore(app);
const service = new FieldProfileService(database);
const actor = { uid: "uid-phase7-delivery", employeeId: "EMP-PHASE7-DELIVERY" };
const schoolId = "SCH-PHASE7-001";
const requestId = randomUUID();

await database.doc(`schools/${schoolId}`).set({ schoolId, name: "Phase 7 Gate School" });
const input = updateFieldProfileInputSchema.parse({
  schoolId,
  expectedRevision: 0,
  requestId,
  appVersion: "phase7-gate",
  patch: {
    cafeteria: {
      building: "본관",
      floor: "1층",
      locationDescription: "정문 오른쪽",
      entranceDescription: "급식실 전용 출입구",
      routeDescription: "정문 진입 후 우회전",
    },
    inspection: { startTime: "07:30", endTime: "08:10", note: null },
    equipment: { cartRequired: "required", elevator: "available", stairsRequired: "notRequired" },
    vehicle: { access: "available", unloadingLocation: "본관 뒤 하역장", parking: "limited", note: null },
  },
});

const created = await service.update(input, actor);
if (created.revision !== 1 || created.replayed) throw new Error("Initial field profile update failed.");
const replayed = await service.update(input, actor);
if (replayed.revision !== 1 || !replayed.replayed) throw new Error("Idempotent replay failed.");

let collisionRejected = false;
try {
  await service.update({ ...input, patch: { fieldNotes: "different payload" } }, actor);
} catch (error) {
  if (error instanceof RequestCollisionError) collisionRejected = true;
  else throw error;
}
if (!collisionRejected) throw new Error("Request ID reuse with a different payload was not rejected.");

let conflictRevision: number | null = null;
try {
  await service.update({ ...input, requestId: randomUUID(), patch: { fieldNotes: "stale" } }, actor);
} catch (error) {
  if (error instanceof RevisionConflictError) conflictRevision = error.actualRevision;
  else throw error;
}
if (conflictRevision !== 1) throw new Error("Revision conflict was not detected.");

const updated = await service.update({
  ...input,
  expectedRevision: 1,
  requestId: randomUUID(),
  patch: { fieldNotes: "Gate update" },
}, actor);
if (updated.revision !== 2) throw new Error("Second revision was not committed.");

const [profileSnapshot, lockSnapshot, auditSnapshot] = await Promise.all([
  database.doc(`schoolFieldProfiles/${schoolId}`).get(),
  database.doc(`requestLocks/field-${requestId}`).get(),
  database.collection("auditLogs").where("schoolId", "==", schoolId).get(),
]);
if (profileSnapshot.get("revision") !== 2 || profileSnapshot.get("fieldNotes") !== "Gate update") {
  throw new Error("Final field profile state is inconsistent.");
}
if (!lockSnapshot.exists || lockSnapshot.get("revision") !== 1) {
  throw new Error("Idempotency lock was not committed with the first update.");
}
if (auditSnapshot.size !== 2) {
  throw new Error(`Expected exactly two audit records, received ${auditSnapshot.size}.`);
}

console.log(JSON.stringify({
  status: "phase7-field-gate-passed",
  revision: profileSnapshot.get("revision"),
  replayed: replayed.replayed,
  collisionRejected,
  conflictRevision,
  auditCount: auditSnapshot.size,
}));
