import { createHash, randomUUID } from "node:crypto";

import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { getAdminFirestore } from "../shared/firebase-admin.js";
import type { UpdateSalesProfileInput } from "./sales-profile-contract.js";

const timestampSchema = z.custom<Timestamp>((value) => value instanceof Timestamp);
const profileSchema = z.object({
  schoolId: z.string(),
  interestScore: z.union([z.literal(0), z.literal(20), z.literal(40), z.literal(60), z.literal(80), z.literal(100)]),
  interestEvaluated: z.boolean(),
  interestedProductIds: z.array(z.string()).max(100),
  communicationTagIds: z.array(z.string()).max(100),
  latestVisit: z.object({
    visitId: z.string().nullable(),
    visitedAt: timestampSchema.nullable(),
    visitedBy: z.string().nullable(),
  }).strict(),
  followUp: z.object({
    required: z.boolean(),
    dueDate: z.string().nullable(),
    summary: z.string().nullable(),
  }).strict(),
  nextAction: z.object({ dueDate: z.string().nullable(), summary: z.string().nullable() }).strict(),
  salesRevision: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  updatedBy: z.string(),
}).strict();
const assignmentSchema = z.object({
  schoolId: z.string(),
  cycleId: z.string(),
  assigneeIds: z.array(z.string()).min(1),
  revision: z.number().int().positive(),
}).passthrough();
const cycleSchema = z.object({ status: z.enum(["draft", "active", "closed"]) }).passthrough();
const settingsSchema = z.object({ currentSalesCycleId: z.string() }).passthrough();
const resultSchema = z.object({
  salesRevision: z.number().int().positive(),
  communicationTagIds: z.array(z.string()),
}).strict();
const requestLockSchema = z.object({
  operation: z.literal("updateSalesProfile"),
  actorUid: z.string(),
  fingerprint: z.string().length(64),
  result: resultSchema,
}).passthrough();

export type SalesProfileActor = {
  uid: string;
  employeeId: string;
  roleScopes: string[];
};

export class SalesProfileRequestCollisionError extends Error {}
export class SalesProfileCycleError extends Error {}
export class SalesProfileAssignmentNotFoundError extends Error {}
export class SalesProfilePermissionError extends Error {}
export class SalesProfileReferenceError extends Error {}
export class SalesProfileRevisionConflictError extends Error {
  constructor(readonly actualRevision: number) {
    super("Sales profile revision conflict.");
  }
}
export class SalesProfileAssignmentRevisionConflictError extends Error {
  constructor(readonly actualRevision: number) {
    super("Sales profile assignment revision conflict.");
  }
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export class SalesProfileService {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async update(input: UpdateSalesProfileInput, actor: SalesProfileActor) {
    const lockRef = this.db.doc(`requestLocks/sales-profile-${input.requestId}`);
    const profileRef = this.db.doc(`salesProfiles/${input.schoolId}`);
    const assignmentRef = this.db.doc(`salesCycles/${input.cycleId}/assignments/${input.schoolId}`);
    const inputFingerprint = fingerprint({ ...input, actorUid: actor.uid });

    return this.db.runTransaction(async (transaction) => {
      const tagRefs = input.communicationTagIds.map((tagId) => this.db.doc(`communicationTags/${tagId}`));
      const [
        lockSnapshot,
        settingsSnapshot,
        cycleSnapshot,
        assignmentSnapshot,
        profileSnapshot,
        schoolSnapshot,
        tagSnapshots,
      ] = await Promise.all([
        transaction.get(lockRef),
        transaction.get(this.db.doc("appSettings/public")),
        transaction.get(this.db.doc(`salesCycles/${input.cycleId}`)),
        transaction.get(assignmentRef),
        transaction.get(profileRef),
        transaction.get(this.db.doc(`schools/${input.schoolId}`)),
        tagRefs.length > 0 ? transaction.getAll(...tagRefs) : Promise.resolve([]),
      ]);

      if (lockSnapshot.exists) {
        const lock = requestLockSchema.parse(lockSnapshot.data());
        if (lock.actorUid !== actor.uid || lock.fingerprint !== inputFingerprint) {
          throw new SalesProfileRequestCollisionError();
        }
        return { ...lock.result, replayed: true };
      }

      if (
        !settingsSnapshot.exists
        || settingsSchema.parse(settingsSnapshot.data()).currentSalesCycleId !== input.cycleId
        || !cycleSnapshot.exists
        || cycleSchema.parse(cycleSnapshot.data()).status !== "active"
      ) {
        throw new SalesProfileCycleError();
      }
      if (!schoolSnapshot.exists) throw new SalesProfileReferenceError("학교를 찾을 수 없습니다.");
      if (!assignmentSnapshot.exists) throw new SalesProfileAssignmentNotFoundError();
      if (tagSnapshots.some((snapshot) => !snapshot.exists || snapshot.get("active") !== true)) {
        throw new SalesProfileReferenceError("활성 커뮤니케이션 태그만 선택할 수 있습니다.");
      }

      const assignment = assignmentSchema.parse(assignmentSnapshot.data());
      if (!actor.roleScopes.includes("admin") && !assignment.assigneeIds.includes(actor.employeeId)) {
        throw new SalesProfilePermissionError();
      }
      if (assignment.revision !== input.expectedAssignmentRevision) {
        throw new SalesProfileAssignmentRevisionConflictError(assignment.revision);
      }

      const currentProfile = profileSnapshot.exists ? profileSchema.parse(profileSnapshot.data()) : null;
      const currentRevision = currentProfile?.salesRevision ?? 0;
      if (currentRevision !== input.expectedSalesRevision) {
        throw new SalesProfileRevisionConflictError(currentRevision);
      }

      const now = Timestamp.now();
      const nextProfile = profileSchema.parse({
        schoolId: input.schoolId,
        interestScore: currentProfile?.interestScore ?? 0,
        interestEvaluated: currentProfile?.interestEvaluated ?? false,
        interestedProductIds: currentProfile?.interestedProductIds ?? [],
        communicationTagIds: input.communicationTagIds,
        latestVisit: currentProfile?.latestVisit ?? { visitId: null, visitedAt: null, visitedBy: null },
        followUp: currentProfile?.followUp ?? { required: false, dueDate: null, summary: null },
        nextAction: currentProfile?.nextAction ?? { dueDate: null, summary: null },
        salesRevision: currentRevision + 1,
        createdAt: currentProfile?.createdAt ?? now,
        updatedAt: now,
        updatedBy: actor.employeeId,
      });
      const result = resultSchema.parse({
        salesRevision: nextProfile.salesRevision,
        communicationTagIds: nextProfile.communicationTagIds,
      });
      const auditId = randomUUID();

      transaction.set(profileRef, nextProfile);
      transaction.create(this.db.doc(`auditLogs/${auditId}`), {
        logId: auditId,
        eventType: "SALES_PROFILE_UPDATED",
        actorUid: actor.uid,
        actorEmployeeId: actor.employeeId,
        targetType: "salesProfile",
        targetId: input.schoolId,
        schoolId: input.schoolId,
        cycleId: input.cycleId,
        changedFields: ["communicationTagIds"],
        changeReason: "학교 커뮤니케이션 참고 태그 수정",
        requestId: input.requestId,
        appVersion: input.appVersion,
        createdAt: now,
      });
      transaction.create(lockRef, {
        operation: "updateSalesProfile",
        actorUid: actor.uid,
        fingerprint: inputFingerprint,
        result,
        createdAt: now,
      });
      return { ...result, replayed: false };
    });
  }
}
