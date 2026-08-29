import { createHash, randomUUID } from "node:crypto";

import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { getAdminFirestore } from "../shared/firebase-admin.js";
import { MAX_ASSIGNMENTS_PER_CYCLE } from "./sales-cycle-contract.js";
import type { RecordSalesVisitInput } from "./sales-visit-contract.js";

const timestampSchema = z.custom<Timestamp>((value) => value instanceof Timestamp);
const monthlyStatusSchema = z.enum(["before", "completed", "followUp", "revisit", "onHold"]);
const assignmentDeliveryStatusSchema = z.enum(["unknown", "delivered", "notDelivered"]);
const deliveryStatusSchema = z.enum(["delivered", "notDelivered"]);
const interestScoreSchema = z.union([z.literal(0), z.literal(20), z.literal(40), z.literal(60), z.literal(80), z.literal(100)]);
const nullableFollowUpSchema = z.object({
  required: z.boolean(),
  dueDate: z.string().nullable(),
  summary: z.string().nullable(),
}).strict();
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
  zoneId: z.string().nullable(),
  primaryAssigneeId: z.string(),
  assigneeIds: z.array(z.string()).min(1),
  monthlyStatus: monthlyStatusSchema,
  latestVisitId: z.string().nullable(),
  latestVisitedAt: timestampSchema.nullable(),
  brochureStatus: assignmentDeliveryStatusSchema,
  sampleStatus: assignmentDeliveryStatusSchema,
  revision: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict();
const profileSchema = z.object({
  schoolId: z.string(),
  interestScore: interestScoreSchema,
  interestEvaluated: z.boolean(),
  interestedProductIds: z.array(z.string()).max(100),
  communicationTagIds: z.array(z.string()).max(100),
  latestVisit: z.object({
    visitId: z.string().nullable(),
    visitedAt: timestampSchema.nullable(),
    visitedBy: z.string().nullable(),
  }).strict(),
  followUp: nullableFollowUpSchema,
  nextAction: z.object({ dueDate: z.string().nullable(), summary: z.string().nullable() }).strict(),
  salesRevision: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  updatedBy: z.string(),
}).strict();
const visitSchema = z.object({
  visitId: z.string(),
  schoolId: z.string(),
  cycleId: z.string(),
  assignmentSnapshot: z.object({
    zoneId: z.string().nullable(),
    primaryAssigneeId: z.string().nullable(),
    assigneeIds: z.array(z.string()),
  }).strict(),
  visitedAt: timestampSchema,
  visitedBy: z.string(),
  recordedBy: z.string(),
  brochure: z.object({ status: deliveryStatusSchema }).strict(),
  sample: z.object({
    status: deliveryStatusSchema,
    items: z.array(z.object({ productId: z.string(), quantity: z.number().int().positive() }).strict()),
  }).strict(),
  interest: z.object({ score: interestScoreSchema, explicitlySelected: z.literal(true) }).strict(),
  activityTagIds: z.array(z.string()),
  summary: z.string().min(1),
  followUp: nullableFollowUpSchema,
  deleted: z.literal(false),
  deletedAt: z.null(),
  deletedBy: z.null(),
  deleteReason: z.null(),
  revision: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict();
const resultSchema = z.object({
  visitId: z.string(),
  assignmentRevision: z.number().int().positive(),
  salesRevision: z.number().int().positive(),
  monthlyStatus: monthlyStatusSchema,
  visitedAt: z.string().datetime(),
}).strict();
const requestLockSchema = z.object({
  operation: z.literal("recordSalesVisit"),
  actorUid: z.string(),
  fingerprint: z.string().length(64),
  result: resultSchema,
}).passthrough();

export type SalesVisitActor = {
  uid: string;
  employeeId: string;
  roleScopes: string[];
};
type Assignment = z.infer<typeof assignmentSchema>;

export class SalesVisitRequestCollisionError extends Error {}
export class SalesVisitCycleError extends Error {}
export class SalesVisitAssignmentNotFoundError extends Error {}
export class SalesVisitPermissionError extends Error {}
export class SalesVisitReferenceError extends Error {}
export class SalesVisitChronologyError extends Error {}
export class SalesVisitAssignmentRevisionConflictError extends Error {
  constructor(readonly actualRevision: number) {
    super("Sales visit assignment revision conflict.");
  }
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function datePartsInSeoul(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function cycleIdForSeoulDate(date: Date) {
  const parts = datePartsInSeoul(date);
  return `${parts.year}-${parts.month}`;
}

function dateOnlyForSeoulDate(date: Date) {
  const parts = datePartsInSeoul(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function calculateCycleStats(assignments: Assignment[], updatedAt: Timestamp) {
  const counts = (items: Assignment[]) => ({
    completedCount: items.filter((item) => item.monthlyStatus === "completed").length,
    beforeCount: items.filter((item) => item.monthlyStatus === "before").length,
    followUpCount: items.filter((item) => item.monthlyStatus === "followUp").length,
    revisitCount: items.filter((item) => item.monthlyStatus === "revisit").length,
    onHoldCount: items.filter((item) => item.monthlyStatus === "onHold").length,
  });
  const employeeAssignments = new Map<string, Assignment[]>();
  for (const assignment of assignments) {
    for (const employeeId of assignment.assigneeIds) {
      const current = employeeAssignments.get(employeeId) ?? [];
      current.push(assignment);
      employeeAssignments.set(employeeId, current);
    }
  }
  return {
    team: {
      totalSchoolCount: assignments.length,
      ...counts(assignments),
      updatedAt,
    },
    employees: new Map([...employeeAssignments].map(([employeeId, items]) => [employeeId, {
      employeeId,
      assignedSchoolCount: items.length,
      ...counts(items),
      updatedAt,
    }])),
  };
}

export class SalesVisitService {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async record(input: RecordSalesVisitInput, actor: SalesVisitActor) {
    const lockRef = this.db.doc(`requestLocks/sales-visit-${input.requestId}`);
    const inputFingerprint = fingerprint({ ...input, actorUid: actor.uid });

    return this.db.runTransaction(async (transaction) => {
      const lockSnapshot = await transaction.get(lockRef);
      if (lockSnapshot.exists) {
        const lock = requestLockSchema.parse(lockSnapshot.data());
        if (lock.actorUid !== actor.uid || lock.fingerprint !== inputFingerprint) {
          throw new SalesVisitRequestCollisionError();
        }
        return { ...lock.result, replayed: true };
      }

      const cycleRef = this.db.doc(`salesCycles/${input.cycleId}`);
      const assignmentRef = this.db.doc(`salesCycles/${input.cycleId}/assignments/${input.schoolId}`);
      const profileRef = this.db.doc(`salesProfiles/${input.schoolId}`);
      const schoolRef = this.db.doc(`schools/${input.schoolId}`);
      const visitorRef = this.db.doc(`employees/${input.visitedBy}`);
      const visitRef = this.db.doc(`salesVisits/${input.requestId}`);
      const assignmentsQuery = this.db.collection(`salesCycles/${input.cycleId}/assignments`).limit(MAX_ASSIGNMENTS_PER_CYCLE + 1);
      const employeeStatsQuery = this.db.collection(`salesCycles/${input.cycleId}/employeeStats`).limit(101);
      const productRefs = input.sample.items.map((item) => this.db.doc(`products/${item.productId}`));
      const tagRefs = input.activityTagIds.map((tagId) => this.db.doc(`activityTags/${tagId}`));
      const [
        cycleSnapshot,
        assignmentSnapshot,
        profileSnapshot,
        schoolSnapshot,
        visitorSnapshot,
        visitSnapshot,
        assignmentSnapshots,
        employeeStatsSnapshots,
        productSnapshots,
        tagSnapshots,
      ] = await Promise.all([
        transaction.get(cycleRef),
        transaction.get(assignmentRef),
        transaction.get(profileRef),
        transaction.get(schoolRef),
        transaction.get(visitorRef),
        transaction.get(visitRef),
        transaction.get(assignmentsQuery),
        transaction.get(employeeStatsQuery),
        productRefs.length > 0 ? transaction.getAll(...productRefs) : Promise.resolve([]),
        tagRefs.length > 0 ? transaction.getAll(...tagRefs) : Promise.resolve([]),
      ]);

      if (!cycleSnapshot.exists || cycleSchema.parse(cycleSnapshot.data()).status !== "active") {
        throw new SalesVisitCycleError();
      }
      if (!assignmentSnapshot.exists) throw new SalesVisitAssignmentNotFoundError();
      if (!schoolSnapshot.exists) throw new SalesVisitReferenceError("학교를 찾을 수 없습니다.");
      if (visitSnapshot.exists) throw new SalesVisitRequestCollisionError();
      if (assignmentSnapshots.size > MAX_ASSIGNMENTS_PER_CYCLE) {
        throw new SalesVisitReferenceError(`월 배정은 최대 ${MAX_ASSIGNMENTS_PER_CYCLE}개까지 집계할 수 있습니다.`);
      }
      if (employeeStatsSnapshots.size > 100) throw new SalesVisitReferenceError("직원 통계 문서가 허용 범위를 초과했습니다.");
      if (!visitorSnapshot.exists || visitorSnapshot.get("status") !== "active" || !(visitorSnapshot.get("roleScopes") as unknown[] | undefined)?.includes("sales")) {
        throw new SalesVisitReferenceError("활성 영업 직원만 실제 방문자로 선택할 수 있습니다.");
      }
      if (productSnapshots.some((snapshot) => !snapshot.exists || snapshot.get("active") !== true)) {
        throw new SalesVisitReferenceError("활성 제품만 샘플로 기록할 수 있습니다.");
      }
      if (tagSnapshots.some((snapshot) => !snapshot.exists || snapshot.get("active") !== true)) {
        throw new SalesVisitReferenceError("활성 활동 태그만 기록할 수 있습니다.");
      }

      const assignment = assignmentSchema.parse(assignmentSnapshot.data());
      if (!actor.roleScopes.includes("admin") && !assignment.assigneeIds.includes(actor.employeeId)) {
        throw new SalesVisitPermissionError();
      }
      if (assignment.revision !== input.expectedAssignmentRevision) {
        throw new SalesVisitAssignmentRevisionConflictError(assignment.revision);
      }

      const visitedDate = new Date(input.visitedAt);
      const nowDate = new Date();
      if (Number.isNaN(visitedDate.getTime()) || visitedDate.getTime() > nowDate.getTime() + 5 * 60_000) {
        throw new SalesVisitChronologyError();
      }
      if (cycleIdForSeoulDate(visitedDate) !== input.cycleId) throw new SalesVisitChronologyError();
      if (input.followUp.required && input.followUp.dueDate! < dateOnlyForSeoulDate(visitedDate)) {
        throw new SalesVisitChronologyError();
      }

      const currentProfile = profileSnapshot.exists ? profileSchema.parse(profileSnapshot.data()) : null;
      const latestDates = [assignment.latestVisitedAt, currentProfile?.latestVisit.visitedAt ?? null]
        .filter((value): value is Timestamp => value !== null);
      if (latestDates.some((latest) => visitedDate.getTime() < latest.toMillis())) {
        throw new SalesVisitChronologyError();
      }

      const now = Timestamp.now();
      const visitedAt = Timestamp.fromDate(visitedDate);
      const visitId = input.requestId;
      const monthlyStatus = input.followUp.required ? "followUp" as const : "completed" as const;
      const visit = visitSchema.parse({
        visitId,
        schoolId: input.schoolId,
        cycleId: input.cycleId,
        assignmentSnapshot: {
          zoneId: assignment.zoneId,
          primaryAssigneeId: assignment.primaryAssigneeId,
          assigneeIds: assignment.assigneeIds,
        },
        visitedAt,
        visitedBy: input.visitedBy,
        recordedBy: actor.employeeId,
        brochure: { status: input.brochureStatus },
        sample: input.sample,
        interest: { score: input.interestScore, explicitlySelected: true },
        activityTagIds: input.activityTagIds,
        summary: input.summary,
        followUp: input.followUp,
        deleted: false,
        deletedAt: null,
        deletedBy: null,
        deleteReason: null,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      });
      const nextAssignment = assignmentSchema.parse({
        ...assignment,
        monthlyStatus,
        latestVisitId: visitId,
        latestVisitedAt: visitedAt,
        brochureStatus: input.brochureStatus,
        sampleStatus: input.sample.status,
        revision: assignment.revision + 1,
        updatedAt: now,
      });
      const interestedProductIds = [...new Set([
        ...(currentProfile?.interestedProductIds ?? []),
        ...input.sample.items.map((item) => item.productId),
      ])];
      const nextProfile = profileSchema.parse({
        schoolId: input.schoolId,
        interestScore: input.interestScore,
        interestEvaluated: true,
        interestedProductIds,
        communicationTagIds: currentProfile?.communicationTagIds ?? [],
        latestVisit: { visitId, visitedAt, visitedBy: input.visitedBy },
        followUp: input.followUp,
        nextAction: {
          dueDate: input.followUp.required ? input.followUp.dueDate : null,
          summary: input.followUp.required ? input.followUp.summary : null,
        },
        salesRevision: (currentProfile?.salesRevision ?? 0) + 1,
        createdAt: currentProfile?.createdAt ?? now,
        updatedAt: now,
        updatedBy: actor.employeeId,
      });
      const allAssignments = assignmentSnapshots.docs.map((snapshot) =>
        snapshot.id === input.schoolId ? nextAssignment : assignmentSchema.parse(snapshot.data())
      );
      const stats = calculateCycleStats(allAssignments, now);
      const result = resultSchema.parse({
        visitId,
        assignmentRevision: nextAssignment.revision,
        salesRevision: nextProfile.salesRevision,
        monthlyStatus,
        visitedAt: visitedDate.toISOString(),
      });
      const auditId = randomUUID();

      transaction.create(visitRef, visit);
      transaction.set(profileRef, nextProfile);
      transaction.set(assignmentRef, nextAssignment);
      transaction.set(this.db.doc(`salesCycles/${input.cycleId}/stats/team`), stats.team);
      for (const [employeeId, employeeStats] of stats.employees) {
        transaction.set(this.db.doc(`salesCycles/${input.cycleId}/employeeStats/${employeeId}`), employeeStats);
      }
      for (const snapshot of employeeStatsSnapshots.docs) {
        if (!stats.employees.has(snapshot.id)) transaction.delete(snapshot.ref);
      }
      transaction.create(this.db.doc(`auditLogs/${auditId}`), {
        logId: auditId,
        eventType: "SALES_VISIT_RECORDED",
        actorUid: actor.uid,
        actorEmployeeId: actor.employeeId,
        targetType: "salesVisit",
        targetId: visitId,
        schoolId: input.schoolId,
        cycleId: input.cycleId,
        changedFields: ["visit", "salesProfile", "assignmentSummary", "employeeStats", "teamStats"],
        changeReason: input.followUp.required ? "방문 기록 및 후속 활동 등록" : "방문 기록 등록",
        requestId: input.requestId,
        appVersion: input.appVersion,
        createdAt: now,
      });
      transaction.create(lockRef, {
        operation: "recordSalesVisit",
        actorUid: actor.uid,
        fingerprint: inputFingerprint,
        result,
        createdAt: now,
      });
      return { ...result, replayed: false };
    });
  }
}
