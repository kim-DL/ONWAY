import { randomUUID } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { recordSalesVisitInputSchema } from "../functions/src/sales/sales-visit-contract.js";
import {
  SalesVisitAssignmentRevisionConflictError,
  SalesVisitPermissionError,
  SalesVisitRequestCollisionError,
  SalesVisitService,
} from "../functions/src/sales/sales-visit-service.js";
import { buildPhase1SeedDocuments, createPhase1Seed } from "../src/seed/phase1.js";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Phase 10 visit gate is restricted to a Firestore emulator.");
}

const projectId = process.env.GCLOUD_PROJECT ?? "demo-onnuriway";
const app = getApps().find((candidate) => candidate.name === "phase10-sales-visit-gate")
  ?? initializeApp({ projectId }, "phase10-sales-visit-gate");
const database = getFirestore(app);
const service = new SalesVisitService(database);
const targetSchoolId = "SCH-NEIS-G100000004";
const otherSchoolId = "SCH-NEIS-G100000002";

for (const document of buildPhase1SeedDocuments(createPhase1Seed())) {
  await database.doc(document.path).set(document.data);
}

const requestId = randomUUID();
const input = recordSalesVisitInputSchema.parse({
  cycleId: "2026-08",
  schoolId: targetSchoolId,
  expectedAssignmentRevision: 1,
  visitedAt: "2026-08-24T03:00:00.000Z",
  visitedBy: "EMP-SALES-B",
  brochureStatus: "delivered",
  sample: { status: "delivered", items: [{ productId: "PROD-002", quantity: 2 }] },
  interestScore: 60,
  activityTagIds: ["ACT-FOLLOWUP", "ACT-SAMPLE"],
  summary: "샘플 사용 뒤 가격 자료를 다시 전달하기로 함",
  followUp: { required: true, dueDate: "2026-08-30", summary: "가격 자료 전달" },
  requestId,
  appVersion: "phase10-gate",
});
const actor = { uid: "uid-sales-a", employeeId: "EMP-SALES-A", roleScopes: ["sales"] };
const result = await service.record(input, actor);
const replayed = await service.record(input, actor);
if (result.replayed || !replayed.replayed || result.visitId !== replayed.visitId) {
  throw new Error("Visit idempotency failed.");
}

let collisionRejected = false;
try {
  await service.record({ ...input, summary: "다른 내용으로 요청 ID 재사용" }, actor);
} catch (error) {
  if (error instanceof SalesVisitRequestCollisionError) collisionRejected = true;
  else throw error;
}
if (!collisionRejected) throw new Error("Visit request collision was not rejected.");

let conflictRevision: number | null = null;
try {
  await service.record({ ...input, requestId: randomUUID() }, actor);
} catch (error) {
  if (error instanceof SalesVisitAssignmentRevisionConflictError) conflictRevision = error.actualRevision;
  else throw error;
}
if (conflictRevision !== 2) throw new Error("Stale visit revision was not rejected.");

let otherZoneRejected = false;
try {
  await service.record(recordSalesVisitInputSchema.parse({
    ...input,
    schoolId: otherSchoolId,
    visitedBy: "EMP-SALES-C",
    requestId: randomUUID(),
  }), { uid: "uid-sales-c", employeeId: "EMP-SALES-C", roleScopes: ["sales"] });
} catch (error) {
  if (error instanceof SalesVisitPermissionError) otherZoneRejected = true;
  else throw error;
}
if (!otherZoneRejected) throw new Error("A non-assignee recorded another employee's visit.");

const [visits, visit, profile, assignment, teamStats, employeeStats, audits] = await Promise.all([
  database.collection("salesVisits").where("schoolId", "==", targetSchoolId).get(),
  database.doc(`salesVisits/${result.visitId}`).get(),
  database.doc(`salesProfiles/${targetSchoolId}`).get(),
  database.doc(`salesCycles/2026-08/assignments/${targetSchoolId}`).get(),
  database.doc("salesCycles/2026-08/stats/team").get(),
  database.doc("salesCycles/2026-08/employeeStats/EMP-SALES-A").get(),
  database.collection("auditLogs").where("eventType", "==", "SALES_VISIT_RECORDED").get(),
]);
if (visits.size !== 1 || !visit.exists || visit.get("recordedBy") !== "EMP-SALES-A" || visit.get("visitedBy") !== "EMP-SALES-B") {
  throw new Error("Visit event or actor separation is incorrect.");
}
if (profile.get("interestScore") !== 60 || profile.get("followUp.required") !== true || profile.get("salesRevision") !== 1) {
  throw new Error("Sales profile was not updated consistently.");
}
if (assignment.get("monthlyStatus") !== "followUp" || assignment.get("revision") !== 2 || assignment.get("latestVisitId") !== result.visitId) {
  throw new Error("Assignment summary was not updated consistently.");
}
if (teamStats.get("totalSchoolCount") !== 5 || teamStats.get("followUpCount") !== 1 || teamStats.get("beforeCount") !== 2) {
  throw new Error("Team stats were not recomputed correctly.");
}
if (employeeStats.get("assignedSchoolCount") !== 2 || employeeStats.get("followUpCount") !== 1) {
  throw new Error("Employee stats were not recomputed correctly.");
}
if (audits.size !== 1) throw new Error(`Expected one visit audit, received ${audits.size}.`);

console.log(JSON.stringify({
  status: "phase10-sales-visit-gate-passed",
  visitId: result.visitId,
  assignmentRevision: result.assignmentRevision,
  salesRevision: result.salesRevision,
  monthlyStatus: result.monthlyStatus,
  visitedBy: visit.get("visitedBy"),
  recordedBy: visit.get("recordedBy"),
  replayed: replayed.replayed,
  collisionRejected,
  conflictRevision,
  otherZoneRejected,
  visitCount: visits.size,
  auditCount: audits.size,
}));
