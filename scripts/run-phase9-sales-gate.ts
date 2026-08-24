import { randomUUID } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";

import {
  changeSalesAssignmentInputSchema,
  createSalesAssignmentsInputSchema,
  createSalesCycleInputSchema,
} from "../functions/src/sales/sales-cycle-contract.js";
import {
  SalesAssignmentRevisionConflictError,
  SalesCycleService,
  SalesRequestCollisionError,
} from "../functions/src/sales/sales-cycle-service.js";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Phase 9 sales gate is restricted to a Firestore emulator.");
}

const projectId = process.env.GCLOUD_PROJECT ?? "demo-onnuriway";
const app = getApps().find((candidate) => candidate.name === "phase9-sales-gate")
  ?? initializeApp({ projectId }, "phase9-sales-gate");
const database = getFirestore(app);
const service = new SalesCycleService(database);
const actor = { uid: "uid-phase9-admin", employeeId: "EMP-PHASE9-ADMIN" };

await database.doc("appSettings/public").set({
  currentSalesCycleId: "2026-07",
  commonCatalogVersion: 1,
  maintenanceMode: false,
  minimumAppVersion: null,
  updatedAt: Timestamp.now(),
});
for (const zoneId of ["A", "B", "C"]) {
  await database.doc(`zones/${zoneId}`).set({ zoneId, name: `${zoneId}구역`, active: true });
}
for (const employeeId of ["EMP-SALES-A", "EMP-SALES-B", "EMP-SALES-C"]) {
  await database.doc(`employees/${employeeId}`).set({ employeeId, status: "active", roleScopes: ["sales"] });
}
for (const schoolId of ["SCH-001", "SCH-002", "SCH-003"]) {
  await database.doc(`schools/${schoolId}`).set({ schoolId, name: schoolId });
}

const createCycleInput = createSalesCycleInputSchema.parse({
  cycleId: "2026-08",
  copiedFromCycleId: null,
  activate: true,
  requestId: randomUUID(),
  appVersion: "phase9-gate",
});
const createdCycle = await service.createCycle(createCycleInput, actor);
if (createdCycle.status !== "active" || createdCycle.replayed) throw new Error("Active cycle creation failed.");

const assignmentRequestId = randomUUID();
const assignmentsInput = createSalesAssignmentsInputSchema.parse({
  cycleId: "2026-08",
  requestId: assignmentRequestId,
  appVersion: "phase9-gate",
  assignments: [
    { schoolId: "SCH-001", zoneId: "A", primaryAssigneeId: "EMP-SALES-A", assigneeIds: ["EMP-SALES-A"] },
    { schoolId: "SCH-002", zoneId: "B", primaryAssigneeId: "EMP-SALES-B", assigneeIds: ["EMP-SALES-B"] },
    { schoolId: "SCH-003", zoneId: "C", primaryAssigneeId: "EMP-SALES-C", assigneeIds: ["EMP-SALES-C"] },
  ],
});
const createdAssignments = await service.createAssignments(assignmentsInput, actor);
const replayedAssignments = await service.createAssignments(assignmentsInput, actor);
if (createdAssignments.createdCount !== 3 || createdAssignments.replayed || !replayedAssignments.replayed) {
  throw new Error("Assignment creation or replay failed.");
}

let collisionRejected = false;
try {
  await service.createAssignments({
    ...assignmentsInput,
    assignments: [{ schoolId: "SCH-001", zoneId: "C", primaryAssigneeId: "EMP-SALES-C", assigneeIds: ["EMP-SALES-C"] }],
  }, actor);
} catch (error) {
  if (error instanceof SalesRequestCollisionError) collisionRejected = true;
  else throw error;
}
if (!collisionRejected) throw new Error("Request ID collision was not rejected.");

const changeInput = changeSalesAssignmentInputSchema.parse({
  cycleId: "2026-08",
  schoolId: "SCH-002",
  expectedRevision: 1,
  zoneId: "C",
  primaryAssigneeId: "EMP-SALES-C",
  assigneeIds: ["EMP-SALES-C", "EMP-SALES-B"],
  reason: "휴가 기간 공동 담당 조정",
  requestId: randomUUID(),
  appVersion: "phase9-gate",
});
const changed = await service.changeAssignment(changeInput, actor);
if (changed.revision !== 2 || changed.replayed) throw new Error("Assignment change failed.");

let conflictRevision: number | null = null;
try {
  await service.changeAssignment({ ...changeInput, requestId: randomUUID() }, actor);
} catch (error) {
  if (error instanceof SalesAssignmentRevisionConflictError) conflictRevision = error.actualRevision;
  else throw error;
}
if (conflictRevision !== 2) throw new Error("Stale assignment change was not rejected.");

const copiedCycle = await service.createCycle(createSalesCycleInputSchema.parse({
  cycleId: "2026-09",
  copiedFromCycleId: "2026-08",
  activate: false,
  requestId: randomUUID(),
  appVersion: "phase9-gate",
}), actor);
if (copiedCycle.status !== "draft" || copiedCycle.copiedAssignmentCount !== 3) throw new Error("Cycle copy failed.");

const [copiedAssignments, audits, settings] = await Promise.all([
  database.collection("salesCycles/2026-09/assignments").get(),
  database.collection("auditLogs").get(),
  database.doc("appSettings/public").get(),
]);
for (const document of copiedAssignments.docs) {
  if (
    document.get("monthlyStatus") !== "before"
    || document.get("latestVisitId") !== null
    || document.get("brochureStatus") !== "unknown"
    || document.get("sampleStatus") !== "unknown"
    || document.get("revision") !== 1
  ) {
    throw new Error(`Copied assignment ${document.id} retained monthly activity.`);
  }
}
if (settings.get("currentSalesCycleId") !== "2026-08") throw new Error("Draft copy changed the active cycle.");
if (audits.size !== 4) throw new Error(`Expected four audit logs, received ${audits.size}.`);

console.log(JSON.stringify({
  status: "phase9-sales-gate-passed",
  currentCycleId: settings.get("currentSalesCycleId"),
  assignedEmployees: ["EMP-SALES-A", "EMP-SALES-B", "EMP-SALES-C"],
  createdAssignmentCount: createdAssignments.createdCount,
  copiedAssignmentCount: copiedAssignments.size,
  changedRevision: changed.revision,
  conflictRevision,
  replayed: replayedAssignments.replayed,
  collisionRejected,
  auditCount: audits.size,
}));
