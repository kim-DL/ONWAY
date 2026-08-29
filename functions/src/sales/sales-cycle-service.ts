import { createHash, randomUUID } from "node:crypto";

import { Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { getAdminFirestore } from "../shared/firebase-admin.js";
import type {
  AssignmentDraft,
  ChangeSalesAssignmentInput,
  ClaimSalesAssignmentsInput,
  CreateSalesAssignmentsInput,
  CreateSalesCycleInput,
} from "./sales-cycle-contract.js";
import { MAX_ASSIGNMENTS_PER_CYCLE } from "./sales-cycle-contract.js";

const timestampSchema = z.custom<Timestamp>((value) => value instanceof Timestamp);
const cycleSchema = z.object({
  cycleId: z.string(),
  year: z.number().int(),
  month: z.number().int(),
  status: z.enum(["draft", "active", "closed"]),
  copiedFromCycleId: z.string().nullable(),
  createdAt: timestampSchema,
  createdBy: z.string(),
  activatedAt: timestampSchema.nullable(),
  closedAt: timestampSchema.nullable(),
}).strict();
const assignmentSchema = z.object({
  schoolId: z.string(),
  cycleId: z.string(),
  zoneId: z.string(),
  primaryAssigneeId: z.string(),
  assigneeIds: z.array(z.string()).min(1),
  monthlyStatus: z.enum(["before", "completed", "followUp", "revisit", "onHold"]),
  latestVisitId: z.string().nullable(),
  latestVisitedAt: timestampSchema.nullable(),
  brochureStatus: z.enum(["unknown", "delivered", "notDelivered"]),
  sampleStatus: z.enum(["unknown", "delivered", "notDelivered"]),
  revision: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict();
const requestLockSchema = z.object({
  operation: z.enum(["createSalesCycle", "createSalesAssignments", "claimSalesAssignments", "changeSalesAssignment"]),
  actorUid: z.string(),
  fingerprint: z.string().length(64),
  result: z.record(z.string(), z.unknown()),
}).passthrough();

export type SalesAdminActor = { uid: string; employeeId: string };
export type SalesClaimActor = SalesAdminActor & { roleScopes: string[] };

export class SalesRequestCollisionError extends Error {}
export class SalesCycleNotFoundError extends Error {}
export class SalesCycleAlreadyExistsError extends Error {}
export class SalesAssignmentAlreadyExistsError extends Error {}
export class SalesAssignmentNotFoundError extends Error {}
export class SalesAssignmentClaimPermissionError extends Error {}
export class SalesActiveCycleRequiredError extends Error {}
export class SalesReferenceError extends Error {}
export class SalesCycleClosedError extends Error {}
export class SalesAssignmentRevisionConflictError extends Error {
  constructor(readonly actualRevision: number) {
    super("Sales assignment revision conflict.");
  }
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assignmentPath(cycleId: string, schoolId: string) {
  return `salesCycles/${cycleId}/assignments/${schoolId}`;
}

function auditRecord(input: {
  eventType: "SALES_CYCLE_CREATED" | "SALES_ASSIGNMENTS_CREATED" | "SALES_ASSIGNMENTS_CLAIMED" | "SALES_ASSIGNMENT_CHANGED";
  actor: SalesAdminActor;
  cycleId: string;
  targetType: "salesCycle" | "salesAssignment";
  targetId: string;
  schoolId: string | null;
  changedFields: string[];
  changeReason: string | null;
  requestId: string;
  appVersion: string;
  createdAt: Timestamp;
}) {
  const logId = randomUUID();
  return {
    logId,
    eventType: input.eventType,
    actorUid: input.actor.uid,
    actorEmployeeId: input.actor.employeeId,
    targetType: input.targetType,
    targetId: input.targetId,
    schoolId: input.schoolId,
    cycleId: input.cycleId,
    changedFields: input.changedFields,
    changeReason: input.changeReason,
    requestId: input.requestId,
    appVersion: input.appVersion,
    createdAt: input.createdAt,
  };
}

function createAssignment(
  cycleId: string,
  draft: AssignmentDraft,
  now: Timestamp,
): z.infer<typeof assignmentSchema> {
  return assignmentSchema.parse({
    ...draft,
    cycleId,
    monthlyStatus: "before",
    latestVisitId: null,
    latestVisitedAt: null,
    brochureStatus: "unknown",
    sampleStatus: "unknown",
    revision: 1,
    createdAt: now,
    updatedAt: now,
  });
}

function copyAssignment(cycleId: string, source: z.infer<typeof assignmentSchema>, now: Timestamp) {
  return createAssignment(cycleId, {
    schoolId: source.schoolId,
    zoneId: source.zoneId,
    primaryAssigneeId: source.primaryAssigneeId,
    assigneeIds: source.assigneeIds,
  }, now);
}

export class SalesCycleService {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async createCycle(input: CreateSalesCycleInput, actor: SalesAdminActor) {
    const lockRef = this.db.doc(`requestLocks/sales-cycle-${input.requestId}`);
    const cycleRef = this.db.doc(`salesCycles/${input.cycleId}`);
    const sourceRef = input.copiedFromCycleId ? this.db.doc(`salesCycles/${input.copiedFromCycleId}`) : null;
    const settingsRef = this.db.doc("appSettings/public");
    const inputFingerprint = fingerprint({ ...input, actorUid: actor.uid });

    return this.db.runTransaction(async (transaction) => {
      const [lockSnapshot, cycleSnapshot, sourceSnapshot, settingsSnapshot] = await Promise.all([
        transaction.get(lockRef),
        transaction.get(cycleRef),
        sourceRef ? transaction.get(sourceRef) : Promise.resolve(null),
        input.activate ? transaction.get(settingsRef) : Promise.resolve(null),
      ]);
      if (lockSnapshot.exists) {
        const lock = requestLockSchema.parse(lockSnapshot.data());
        if (lock.actorUid !== actor.uid || lock.fingerprint !== inputFingerprint) throw new SalesRequestCollisionError();
        return {
          cycleId: z.string().parse(lock.result.cycleId),
          copiedAssignmentCount: z.number().int().parse(lock.result.copiedAssignmentCount),
          status: z.enum(["draft", "active"]).parse(lock.result.status),
          replayed: true,
        };
      }
      if (cycleSnapshot.exists) throw new SalesCycleAlreadyExistsError();
      if (sourceRef && (!sourceSnapshot || !sourceSnapshot.exists)) throw new SalesCycleNotFoundError();

      const sourceAssignments = sourceRef
        ? await transaction.get(sourceRef.collection("assignments").limit(MAX_ASSIGNMENTS_PER_CYCLE + 1))
        : null;
      if (sourceAssignments && sourceAssignments.size > MAX_ASSIGNMENTS_PER_CYCLE) {
        throw new SalesReferenceError(`한 Cycle은 최대 ${MAX_ASSIGNMENTS_PER_CYCLE}개 학교까지 운영할 수 있습니다.`);
      }

      let previousCycleRef: DocumentReference | null = null;
      let previousCycle: z.infer<typeof cycleSchema> | null = null;
      if (input.activate && settingsSnapshot?.exists) {
        const previousCycleId = z.string().safeParse(settingsSnapshot.get("currentSalesCycleId"));
        if (previousCycleId.success && previousCycleId.data !== input.cycleId) {
          previousCycleRef = this.db.doc(`salesCycles/${previousCycleId.data}`);
          const previousSnapshot = await transaction.get(previousCycleRef);
          if (previousSnapshot.exists) previousCycle = cycleSchema.parse(previousSnapshot.data());
        }
      }

      const now = Timestamp.now();
      const [year, month] = input.cycleId.split("-").map(Number);
      const cycle = cycleSchema.parse({
        cycleId: input.cycleId,
        year,
        month,
        status: input.activate ? "active" : "draft",
        copiedFromCycleId: input.copiedFromCycleId,
        createdAt: now,
        createdBy: actor.employeeId,
        activatedAt: input.activate ? now : null,
        closedAt: null,
      });
      const copiedAssignments = sourceAssignments?.docs.map((document) =>
        copyAssignment(input.cycleId, assignmentSchema.parse(document.data()), now)
      ) ?? [];
      const result = {
        cycleId: input.cycleId,
        copiedAssignmentCount: copiedAssignments.length,
        status: input.activate ? "active" as const : "draft" as const,
      };

      transaction.create(cycleRef, cycle);
      for (const assignment of copiedAssignments) {
        transaction.create(this.db.doc(assignmentPath(input.cycleId, assignment.schoolId)), assignment);
      }
      if (input.activate) {
        if (!settingsSnapshot?.exists) throw new SalesReferenceError("Public app settings are missing.");
        transaction.update(settingsRef, { currentSalesCycleId: input.cycleId, updatedAt: now });
        if (previousCycleRef && previousCycle?.status === "active") {
          transaction.update(previousCycleRef, { status: "closed", closedAt: now });
        }
      }
      const audit = auditRecord({
        eventType: "SALES_CYCLE_CREATED",
        actor,
        cycleId: input.cycleId,
        targetType: "salesCycle",
        targetId: input.cycleId,
        schoolId: null,
        changedFields: ["status", "copiedFromCycleId", "assignments"],
        changeReason: input.copiedFromCycleId ? `전월 ${input.copiedFromCycleId} 배정 복사` : "새 월 생성",
        requestId: input.requestId,
        appVersion: input.appVersion,
        createdAt: now,
      });
      transaction.create(this.db.doc(`auditLogs/${audit.logId}`), audit);
      transaction.create(lockRef, {
        operation: "createSalesCycle",
        actorUid: actor.uid,
        fingerprint: inputFingerprint,
        result,
        createdAt: now,
      });
      return { ...result, replayed: false };
    });
  }

  async createAssignments(input: CreateSalesAssignmentsInput, actor: SalesAdminActor) {
    const lockRef = this.db.doc(`requestLocks/sales-assignments-${input.requestId}`);
    const cycleRef = this.db.doc(`salesCycles/${input.cycleId}`);
    const inputFingerprint = fingerprint({ ...input, actorUid: actor.uid });
    const assignmentRefs = input.assignments.map((assignment) => this.db.doc(assignmentPath(input.cycleId, assignment.schoolId)));
    const currentAssignmentsQuery = cycleRef.collection("assignments").limit(MAX_ASSIGNMENTS_PER_CYCLE + 1);
    const schoolRefs = input.assignments.map((assignment) => this.db.doc(`schools/${assignment.schoolId}`));
    const zoneRefs = [...new Set(input.assignments.map((assignment) => assignment.zoneId))].map((zoneId) => this.db.doc(`zones/${zoneId}`));
    const employeeRefs = [...new Set(input.assignments.flatMap((assignment) => assignment.assigneeIds))].map((employeeId) => this.db.doc(`employees/${employeeId}`));

    return this.db.runTransaction(async (transaction) => {
      const [lockSnapshot, cycleSnapshot, currentAssignments, schoolSnapshots, zoneSnapshots, employeeSnapshots] = await Promise.all([
        transaction.get(lockRef),
        transaction.get(cycleRef),
        transaction.get(currentAssignmentsQuery),
        transaction.getAll(...schoolRefs),
        transaction.getAll(...zoneRefs),
        transaction.getAll(...employeeRefs),
      ]);
      if (lockSnapshot.exists) {
        const lock = requestLockSchema.parse(lockSnapshot.data());
        if (lock.actorUid !== actor.uid || lock.fingerprint !== inputFingerprint) throw new SalesRequestCollisionError();
        return { createdCount: z.number().int().parse(lock.result.createdCount), replayed: true };
      }
      if (!cycleSnapshot.exists) throw new SalesCycleNotFoundError();
      const cycle = cycleSchema.parse(cycleSnapshot.data());
      if (cycle.status === "closed") throw new SalesCycleClosedError();
      const currentIds = new Set(currentAssignments.docs.map((snapshot) => snapshot.id));
      if (input.assignments.some((assignment) => currentIds.has(assignment.schoolId))) throw new SalesAssignmentAlreadyExistsError();
      if (currentAssignments.size + input.assignments.length > MAX_ASSIGNMENTS_PER_CYCLE) {
        throw new SalesReferenceError(`한 Cycle은 최대 ${MAX_ASSIGNMENTS_PER_CYCLE}개 학교까지 운영할 수 있습니다.`);
      }
      if (schoolSnapshots.some((snapshot) => !snapshot.exists)) throw new SalesReferenceError("존재하지 않는 학교가 포함되어 있습니다.");
      if (zoneSnapshots.some((snapshot) => !snapshot.exists || snapshot.get("active") !== true)) throw new SalesReferenceError("활성 구역만 배정할 수 있습니다.");
      if (employeeSnapshots.some((snapshot) => !snapshot.exists || snapshot.get("status") !== "active" || !(snapshot.get("roleScopes") as unknown[] | undefined)?.includes("sales"))) {
        throw new SalesReferenceError("활성 영업 직원만 배정할 수 있습니다.");
      }

      const now = Timestamp.now();
      const assignments = input.assignments.map((draft) => createAssignment(input.cycleId, draft, now));
      for (const [index, assignment] of assignments.entries()) {
        transaction.create(assignmentRefs[index]!, assignment);
      }
      const result = { createdCount: assignments.length };
      const audit = auditRecord({
        eventType: "SALES_ASSIGNMENTS_CREATED",
        actor,
        cycleId: input.cycleId,
        targetType: "salesAssignment",
        targetId: input.cycleId,
        schoolId: null,
        changedFields: assignments.map((assignment) => `assignment:${assignment.schoolId}`),
        changeReason: "월별 학교 배정 생성",
        requestId: input.requestId,
        appVersion: input.appVersion,
        createdAt: now,
      });
      transaction.create(this.db.doc(`auditLogs/${audit.logId}`), audit);
      transaction.create(lockRef, {
        operation: "createSalesAssignments",
        actorUid: actor.uid,
        fingerprint: inputFingerprint,
        result,
        createdAt: now,
      });
      return { ...result, replayed: false };
    });
  }

  async claimAssignments(input: ClaimSalesAssignmentsInput, actor: SalesClaimActor) {
    const lockRef = this.db.doc(`requestLocks/sales-assignment-claim-${input.requestId}`);
    const cycleRef = this.db.doc(`salesCycles/${input.cycleId}`);
    const settingsRef = this.db.doc("appSettings/public");
    const zoneRef = this.db.doc(`zones/${input.zoneId}`);
    const employeeRef = this.db.doc(`employees/${actor.employeeId}`);
    const currentAssignmentsQuery = cycleRef.collection("assignments").limit(MAX_ASSIGNMENTS_PER_CYCLE + 1);
    const assignmentRefs = input.schoolIds.map((schoolId) => this.db.doc(assignmentPath(input.cycleId, schoolId)));
    const schoolRefs = input.schoolIds.map((schoolId) => this.db.doc(`schools/${schoolId}`));
    const inputFingerprint = fingerprint({ ...input, actorUid: actor.uid, employeeId: actor.employeeId });

    return this.db.runTransaction(async (transaction) => {
      const [
        lockSnapshot,
        cycleSnapshot,
        settingsSnapshot,
        zoneSnapshot,
        employeeSnapshot,
        currentAssignments,
        schoolSnapshots,
      ] = await Promise.all([
        transaction.get(lockRef),
        transaction.get(cycleRef),
        transaction.get(settingsRef),
        transaction.get(zoneRef),
        transaction.get(employeeRef),
        transaction.get(currentAssignmentsQuery),
        transaction.getAll(...schoolRefs),
      ]);
      if (lockSnapshot.exists) {
        const lock = requestLockSchema.parse(lockSnapshot.data());
        if (lock.actorUid !== actor.uid || lock.fingerprint !== inputFingerprint) throw new SalesRequestCollisionError();
        return {
          createdCount: z.number().int().parse(lock.result.createdCount),
          zoneId: z.string().parse(lock.result.zoneId),
          replayed: true,
        };
      }
      if (!cycleSnapshot.exists) throw new SalesCycleNotFoundError();
      const cycle = cycleSchema.parse(cycleSnapshot.data());
      if (
        !settingsSnapshot.exists
        || settingsSnapshot.get("currentSalesCycleId") !== input.cycleId
        || cycle.status !== "active"
      ) {
        throw new SalesActiveCycleRequiredError();
      }
      if (!zoneSnapshot.exists || zoneSnapshot.get("active") !== true) {
        throw new SalesReferenceError("활성 구역만 선택할 수 있습니다.");
      }
      if (
        !actor.roleScopes.includes("sales")
        || !employeeSnapshot.exists
        || employeeSnapshot.get("status") !== "active"
        || !(employeeSnapshot.get("roleScopes") as unknown[] | undefined)?.includes("sales")
      ) {
        throw new SalesAssignmentClaimPermissionError();
      }

      const currentAssignmentsData = currentAssignments.docs.map((snapshot) => ({
        id: snapshot.id,
        assignment: assignmentSchema.parse(snapshot.data()),
      }));
      const ownsZone = currentAssignmentsData.some(({ assignment }) =>
        assignment.zoneId === input.zoneId && assignment.assigneeIds.includes(actor.employeeId)
      );
      if (!ownsZone) throw new SalesAssignmentClaimPermissionError();
      const currentIds = new Set(currentAssignmentsData.map(({ id }) => id));
      if (input.schoolIds.some((schoolId) => currentIds.has(schoolId))) throw new SalesAssignmentAlreadyExistsError();
      if (currentAssignments.size + input.schoolIds.length > MAX_ASSIGNMENTS_PER_CYCLE) {
        throw new SalesReferenceError(`한 Cycle은 최대 ${MAX_ASSIGNMENTS_PER_CYCLE}개 학교까지 운영할 수 있습니다.`);
      }
      if (schoolSnapshots.some((snapshot) => !snapshot.exists)) {
        throw new SalesReferenceError("존재하지 않는 학교가 포함되어 있습니다.");
      }

      const now = Timestamp.now();
      const assignments = input.schoolIds.map((schoolId) => createAssignment(input.cycleId, {
        schoolId,
        zoneId: input.zoneId,
        primaryAssigneeId: actor.employeeId,
        assigneeIds: [actor.employeeId],
      }, now));
      for (const [index, assignment] of assignments.entries()) {
        transaction.create(assignmentRefs[index]!, assignment);
      }
      const result = { createdCount: assignments.length, zoneId: input.zoneId };
      const audit = auditRecord({
        eventType: "SALES_ASSIGNMENTS_CLAIMED",
        actor,
        cycleId: input.cycleId,
        targetType: "salesAssignment",
        targetId: input.zoneId,
        schoolId: null,
        changedFields: assignments.map((assignment) => `assignment:${assignment.schoolId}`),
        changeReason: `${actor.employeeId} 담당 구역 셀프 배정`,
        requestId: input.requestId,
        appVersion: input.appVersion,
        createdAt: now,
      });
      transaction.create(this.db.doc(`auditLogs/${audit.logId}`), audit);
      transaction.create(lockRef, {
        operation: "claimSalesAssignments",
        actorUid: actor.uid,
        fingerprint: inputFingerprint,
        result,
        createdAt: now,
      });
      return { ...result, replayed: false };
    });
  }

  async changeAssignment(input: ChangeSalesAssignmentInput, actor: SalesAdminActor) {
    const lockRef = this.db.doc(`requestLocks/sales-assignment-change-${input.requestId}`);
    const cycleRef = this.db.doc(`salesCycles/${input.cycleId}`);
    const assignmentRef = this.db.doc(assignmentPath(input.cycleId, input.schoolId));
    const zoneRef = this.db.doc(`zones/${input.zoneId}`);
    const employeeRefs = input.assigneeIds.map((employeeId) => this.db.doc(`employees/${employeeId}`));
    const inputFingerprint = fingerprint({ ...input, actorUid: actor.uid });

    return this.db.runTransaction(async (transaction) => {
      const [lockSnapshot, cycleSnapshot, assignmentSnapshot, zoneSnapshot, employeeSnapshots] = await Promise.all([
        transaction.get(lockRef),
        transaction.get(cycleRef),
        transaction.get(assignmentRef),
        transaction.get(zoneRef),
        transaction.getAll(...employeeRefs),
      ]);
      if (lockSnapshot.exists) {
        const lock = requestLockSchema.parse(lockSnapshot.data());
        if (lock.actorUid !== actor.uid || lock.fingerprint !== inputFingerprint) throw new SalesRequestCollisionError();
        return { revision: z.number().int().parse(lock.result.revision), replayed: true };
      }
      if (!cycleSnapshot.exists) throw new SalesCycleNotFoundError();
      if (cycleSchema.parse(cycleSnapshot.data()).status === "closed") throw new SalesCycleClosedError();
      if (!assignmentSnapshot.exists) throw new SalesAssignmentNotFoundError();
      if (!zoneSnapshot.exists || zoneSnapshot.get("active") !== true) throw new SalesReferenceError("활성 구역만 배정할 수 있습니다.");
      if (employeeSnapshots.some((snapshot) => !snapshot.exists || snapshot.get("status") !== "active" || !(snapshot.get("roleScopes") as unknown[] | undefined)?.includes("sales"))) {
        throw new SalesReferenceError("활성 영업 직원만 배정할 수 있습니다.");
      }
      const current = assignmentSchema.parse(assignmentSnapshot.data());
      if (current.revision !== input.expectedRevision) throw new SalesAssignmentRevisionConflictError(current.revision);

      const now = Timestamp.now();
      const next = assignmentSchema.parse({
        ...current,
        zoneId: input.zoneId,
        primaryAssigneeId: input.primaryAssigneeId,
        assigneeIds: input.assigneeIds,
        revision: current.revision + 1,
        updatedAt: now,
      });
      const result = { revision: next.revision };
      transaction.update(assignmentRef, {
        zoneId: next.zoneId,
        primaryAssigneeId: next.primaryAssigneeId,
        assigneeIds: next.assigneeIds,
        revision: next.revision,
        updatedAt: next.updatedAt,
      });
      const audit = auditRecord({
        eventType: "SALES_ASSIGNMENT_CHANGED",
        actor,
        cycleId: input.cycleId,
        targetType: "salesAssignment",
        targetId: input.schoolId,
        schoolId: input.schoolId,
        changedFields: ["zoneId", "primaryAssigneeId", "assigneeIds", "revision"],
        changeReason: input.reason,
        requestId: input.requestId,
        appVersion: input.appVersion,
        createdAt: now,
      });
      transaction.create(this.db.doc(`auditLogs/${audit.logId}`), audit);
      transaction.create(lockRef, {
        operation: "changeSalesAssignment",
        actorUid: actor.uid,
        fingerprint: inputFingerprint,
        result,
        createdAt: now,
      });
      return { ...result, replayed: false };
    });
  }
}

export { createAssignment, copyAssignment };
