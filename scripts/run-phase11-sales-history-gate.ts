import { randomUUID } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore, Timestamp } from "firebase-admin/firestore";

import { updateSalesProfileInputSchema } from "../functions/src/sales/sales-profile-contract.js";
import {
  SalesProfileAssignmentRevisionConflictError,
  SalesProfilePermissionError,
  SalesProfileRequestCollisionError,
  SalesProfileRevisionConflictError,
  SalesProfileService,
} from "../functions/src/sales/sales-profile-service.js";
import { buildPhase1SeedDocuments, createPhase1Seed } from "../src/seed/phase1.js";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Phase 11 history gate is restricted to a Firestore emulator.");
}

const projectId = process.env.GCLOUD_PROJECT ?? "demo-onnuriway";
const app = getApps().find((candidate) => candidate.name === "phase11-sales-history-gate")
  ?? initializeApp({ projectId }, "phase11-sales-history-gate");
const database = getFirestore(app);
const service = new SalesProfileService(database);
const schoolId = "SCH-NEIS-G100000001";
const seed = createPhase1Seed();

for (const document of buildPhase1SeedDocuments(seed)) {
  await database.doc(document.path).set(document.data);
}

const originalVisit = seed.salesVisits[0];
if (!originalVisit) throw new Error("Phase 11 gate requires a seeded visit.");
for (let index = 1; index <= 7; index += 1) {
  const visitedAt = Timestamp.fromDate(new Date(`2026-08-${String(20 - index).padStart(2, "0")}T03:00:00.000Z`));
  const visitId = `VISIT-HISTORY-${String(index).padStart(3, "0")}`;
  await database.doc(`salesVisits/${visitId}`).set({
    ...originalVisit,
    visitId,
    visitedAt,
    summary: `이전 방문 맥락 ${index}`,
    followUp: index === 1
      ? { required: true, dueDate: "2026-08-26", summary: "이전 방문 후속 확인" }
      : { required: false, dueDate: null, summary: null },
    createdAt: visitedAt,
    updatedAt: visitedAt,
  });
}

const immutableVisitBefore = await database.doc(`salesVisits/${originalVisit.visitId}`).get();
const requestId = randomUUID();
const input = updateSalesProfileInputSchema.parse({
  cycleId: "2026-08",
  schoolId,
  expectedAssignmentRevision: 1,
  expectedSalesRevision: 1,
  communicationTagIds: ["COMM-DETAIL", "COMM-TEXT"],
  requestId,
  appVersion: "phase11-gate",
});
const salesA = { uid: "uid-sales-a", employeeId: "EMP-SALES-A", roleScopes: ["sales"] };
const result = await service.update(input, salesA);
const replayed = await service.update(input, salesA);
if (result.replayed || !replayed.replayed || replayed.salesRevision !== result.salesRevision) {
  throw new Error("Sales profile idempotency failed.");
}

let collisionRejected = false;
try {
  await service.update({ ...input, communicationTagIds: ["COMM-TEXT"] }, salesA);
} catch (error) {
  if (error instanceof SalesProfileRequestCollisionError) collisionRejected = true;
  else throw error;
}
if (!collisionRejected) throw new Error("A reused profile request ID accepted different content.");

let staleProfileRevision: number | null = null;
try {
  await service.update({ ...input, requestId: randomUUID() }, salesA);
} catch (error) {
  if (error instanceof SalesProfileRevisionConflictError) staleProfileRevision = error.actualRevision;
  else throw error;
}
if (staleProfileRevision !== 2) throw new Error("A stale sales profile revision was not rejected.");

let staleAssignmentRevision: number | null = null;
try {
  await service.update({ ...input, expectedAssignmentRevision: 9, expectedSalesRevision: 2, requestId: randomUUID() }, salesA);
} catch (error) {
  if (error instanceof SalesProfileAssignmentRevisionConflictError) staleAssignmentRevision = error.actualRevision;
  else throw error;
}
if (staleAssignmentRevision !== 1) throw new Error("A stale assignment revision was not rejected.");

let otherAssigneeRejected = false;
try {
  await service.update(
    { ...input, expectedSalesRevision: 2, requestId: randomUUID() },
    { uid: "uid-sales-b", employeeId: "EMP-SALES-B", roleScopes: ["sales"] },
  );
} catch (error) {
  if (error instanceof SalesProfilePermissionError) otherAssigneeRejected = true;
  else throw error;
}
if (!otherAssigneeRejected) throw new Error("A different sales employee changed the school profile.");

const historyBase = database.collection("salesVisits")
  .where("schoolId", "==", schoolId)
  .where("deleted", "==", false)
  .orderBy("visitedAt", "desc")
  .orderBy(FieldPath.documentId(), "desc");
const initialRead = await historyBase.limit(4).get();
const visibleInitial = initialRead.docs.slice(0, 3);
const cursorDocument = visibleInitial.at(-1);
if (initialRead.size !== 4 || visibleInitial.length !== 3 || !cursorDocument) {
  throw new Error("The recent-three progressive history read failed.");
}
const nextRead = await historyBase.startAfter(cursorDocument).limit(6).get();
if (nextRead.size !== 5) throw new Error(`Expected five remaining visits, received ${nextRead.size}.`);
const visitIds = [...visibleInitial, ...nextRead.docs].map((document) => document.id);
if (visitIds.length !== 8 || new Set(visitIds).size !== 8 || visitIds[0] !== originalVisit.visitId) {
  throw new Error("History cursor ordering skipped or duplicated visits.");
}

const [profile, immutableVisitAfter, audits] = await Promise.all([
  database.doc(`salesProfiles/${schoolId}`).get(),
  database.doc(`salesVisits/${originalVisit.visitId}`).get(),
  database.collection("auditLogs").where("eventType", "==", "SALES_PROFILE_UPDATED").get(),
]);
if (
  profile.get("salesRevision") !== 2
  || profile.get("nextAction.summary") !== "자료 전달 후 연락"
  || profile.get("followUp.summary") !== "상세 자료 전달"
  || profile.get("latestVisit.visitId") !== originalVisit.visitId
  || profile.get("interestScore") !== 80
) {
  throw new Error("The persistent school profile lost visit or next-action context.");
}
if (
  immutableVisitAfter.get("summary") !== immutableVisitBefore.get("summary")
  || immutableVisitAfter.get("revision") !== immutableVisitBefore.get("revision")
  || immutableVisitAfter.updateTime?.toMillis() !== immutableVisitBefore.updateTime?.toMillis()
) {
  throw new Error("Updating communication tags mutated an immutable visit event.");
}
if (audits.size !== 1) throw new Error(`Expected one profile audit, received ${audits.size}.`);

console.log(JSON.stringify({
  status: "phase11-sales-history-gate-passed",
  salesRevision: result.salesRevision,
  communicationTagIds: result.communicationTagIds,
  recentVisitCount: visibleInitial.length,
  loadedVisitCount: visitIds.length,
  nextAction: profile.get("nextAction.summary"),
  replayed: replayed.replayed,
  collisionRejected,
  staleProfileRevision,
  staleAssignmentRevision,
  otherAssigneeRejected,
  immutableVisitPreserved: true,
  auditCount: audits.size,
}));
