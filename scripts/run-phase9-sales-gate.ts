import { randomUUID } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";

import {
  changeSalesAssignmentInputSchema,
  claimSalesAssignmentsInputSchema,
  createSalesAssignmentsInputSchema,
  createSalesCycleInputSchema,
  releaseSalesAssignmentsInputSchema,
} from "../functions/src/sales/sales-cycle-contract.js";
import {
  SalesAssignmentReleasePermissionError,
  SalesAssignmentRevisionConflictError,
  SalesActiveCycleRequiredError,
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
for (const schoolId of ["SCH-001", "SCH-002", "SCH-003", "SCH-004", "SCH-005"]) {
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

const claimInput = claimSalesAssignmentsInputSchema.parse({
  cycleId: "2026-08",
  schoolIds: ["SCH-004"],
  requestId: randomUUID(),
  appVersion: "phase9-gate",
});
const salesAActor = { uid: "uid-sales-a", employeeId: "EMP-SALES-A", roleScopes: ["sales"] };
const claimed = await service.claimAssignments(claimInput, salesAActor);
const replayedClaim = await service.claimAssignments(claimInput, salesAActor);
if (claimed.createdCount !== 1 || claimed.zoneId !== null || claimed.replayed) {
  throw new Error("Direct self assignment failed.");
}
if (!replayedClaim.replayed || replayedClaim.createdCount !== 1) {
  throw new Error("Direct self assignment replay failed.");
}

const salesBActor = { uid: "uid-sales-b", employeeId: "EMP-SALES-B", roleScopes: ["sales"] };
const salesBClaim = await service.claimAssignments(claimSalesAssignmentsInputSchema.parse({
  cycleId: "2026-08",
  schoolIds: ["SCH-005"],
  requestId: randomUUID(),
  appVersion: "phase9-gate",
}), salesBActor);
if (salesBClaim.createdCount !== 1 || salesBClaim.zoneId !== null) {
  throw new Error("A salesperson could not select an unassigned school directly.");
}

let foreignReleaseRejected = false;
try {
  await service.releaseAssignments(releaseSalesAssignmentsInputSchema.parse({
    cycleId: "2026-08",
    schoolIds: ["SCH-005"],
    reason: "타 직원 배정 제외 시도",
    requestId: randomUUID(),
    appVersion: "phase9-gate",
  }), salesAActor);
} catch (error) {
  if (error instanceof SalesAssignmentReleasePermissionError) foreignReleaseRejected = true;
  else throw error;
}
if (!foreignReleaseRejected) throw new Error("A salesperson removed another employee's school.");

const releaseInput = releaseSalesAssignmentsInputSchema.parse({
  cycleId: "2026-08",
  schoolIds: ["SCH-005"],
  reason: "담당 학교 직접 정리",
  requestId: randomUUID(),
  appVersion: "phase9-gate",
});
const released = await service.releaseAssignments(releaseInput, salesBActor);
const replayedRelease = await service.releaseAssignments(releaseInput, salesBActor);
if (released.removedCount !== 1 || released.replayed || !replayedRelease.replayed) {
  throw new Error("Direct assignment release or replay failed.");
}

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
if (copiedCycle.status !== "draft" || copiedCycle.copiedAssignmentCount !== 4) throw new Error("Cycle copy failed.");

let draftClaimRejected = false;
try {
  await service.claimAssignments(claimSalesAssignmentsInputSchema.parse({
    cycleId: "2026-09",
    schoolIds: ["SCH-005"],
    requestId: randomUUID(),
    appVersion: "phase9-gate",
  }), salesAActor);
} catch (error) {
  if (error instanceof SalesActiveCycleRequiredError) draftClaimRejected = true;
  else throw error;
}
if (!draftClaimRejected) throw new Error("A salesperson claimed a school into a draft cycle.");

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
if (audits.size !== 7) throw new Error(`Expected seven audit logs, received ${audits.size}.`);

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
  foreignReleaseRejected,
  draftClaimRejected,
  claimedAssignmentCount: claimed.createdCount,
  releasedAssignmentCount: released.removedCount,
  auditCount: audits.size,
}));
