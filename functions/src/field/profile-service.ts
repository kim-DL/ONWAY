import { createHash, randomUUID } from "node:crypto";

import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { getAdminFirestore } from "../shared/firebase-admin.js";
import {
  EMPTY_FIELD_PROFILE,
  fieldProfileSchema,
  type FieldProfile,
  type FieldProfilePatch,
  type UpdateFieldProfileInput,
} from "./profile-contract.js";

const requestLockSchema = z.object({
  operation: z.literal("updateSchoolFieldProfile"),
  actorUid: z.string().min(1),
  schoolId: z.string().min(1),
  revision: z.number().int().positive(),
  requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).passthrough();

export class RevisionConflictError extends Error {
  constructor(readonly actualRevision: number) {
    super("School field profile has changed.");
  }
}

export class SchoolNotFoundError extends Error {}
export class RequestCollisionError extends Error {}

function requestFingerprint(input: UpdateFieldProfileInput) {
  return createHash("sha256")
    .update(JSON.stringify({
      schoolId: input.schoolId,
      expectedRevision: input.expectedRevision,
      appVersion: input.appVersion,
      patch: input.patch,
    }))
    .digest("hex");
}

function hasText(value: string | null) {
  return value !== null && value.trim().length > 0;
}

export function calculateFieldProfileCompleteness(profile: Pick<
  FieldProfile,
  "cafeteria" | "inspection" | "equipment" | "vehicle"
>) {
  const answers = [
    hasText(profile.cafeteria.building),
    hasText(profile.cafeteria.floor),
    hasText(profile.cafeteria.locationDescription),
    hasText(profile.cafeteria.entranceDescription),
    hasText(profile.cafeteria.routeDescription),
    profile.inspection.startTime !== null,
    profile.inspection.endTime !== null,
    profile.equipment.cartRequired !== "unknown",
    profile.equipment.elevator !== "unknown",
    profile.equipment.stairsRequired !== "unknown",
    profile.vehicle.access !== "unknown",
    hasText(profile.vehicle.unloadingLocation),
    profile.vehicle.parking !== "unknown",
  ];
  return Math.round((answers.filter(Boolean).length / answers.length) * 100);
}

export function mergeFieldProfile(
  current: FieldProfile | null,
  input: { schoolId: string; employeeId: string; patch: FieldProfilePatch; now: Timestamp },
): FieldProfile {
  const base = current ?? {
    schoolId: input.schoolId,
    ...EMPTY_FIELD_PROFILE,
    completeness: 0,
    reviewRequired: true,
    revision: 0,
    createdAt: input.now,
    createdBy: input.employeeId,
    updatedAt: input.now,
    updatedBy: input.employeeId,
  };
  const merged = {
    ...base,
    cafeteria: input.patch.cafeteria ?? base.cafeteria,
    inspection: input.patch.inspection ?? base.inspection,
    equipment: input.patch.equipment ?? base.equipment,
    vehicle: input.patch.vehicle ?? base.vehicle,
    fieldNotes: input.patch.fieldNotes !== undefined ? input.patch.fieldNotes : base.fieldNotes,
    schoolId: input.schoolId,
    revision: base.revision + 1,
    updatedAt: input.now,
    updatedBy: input.employeeId,
  };
  const completeness = calculateFieldProfileCompleteness(merged);
  return fieldProfileSchema.parse({
    ...merged,
    completeness,
    reviewRequired: completeness < 100,
  });
}

export class FieldProfileService {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async update(input: UpdateFieldProfileInput, actor: { uid: string; employeeId: string }) {
    const profileRef = this.db.doc(`schoolFieldProfiles/${input.schoolId}`);
    const schoolRef = this.db.doc(`schools/${input.schoolId}`);
    const lockRef = this.db.doc(`requestLocks/field-${input.requestId}`);
    const fingerprint = requestFingerprint(input);

    return this.db.runTransaction(async (transaction) => {
      const lockSnapshot = await transaction.get(lockRef);
      if (lockSnapshot.exists) {
        const lock = requestLockSchema.safeParse(lockSnapshot.data());
        if (
          !lock.success ||
          lock.data.actorUid !== actor.uid ||
          lock.data.schoolId !== input.schoolId ||
          lock.data.requestFingerprint !== fingerprint
        ) {
          throw new RequestCollisionError("Request ID is already in use.");
        }
        return { revision: lock.data.revision, replayed: true };
      }

      const schoolSnapshot = await transaction.get(schoolRef);
      if (!schoolSnapshot.exists) throw new SchoolNotFoundError("School does not exist.");
      const profileSnapshot = await transaction.get(profileRef);
      const current = profileSnapshot.exists ? fieldProfileSchema.parse(profileSnapshot.data()) : null;
      const actualRevision = current?.revision ?? 0;
      if (actualRevision !== input.expectedRevision) {
        throw new RevisionConflictError(actualRevision);
      }

      const now = Timestamp.now();
      const next = mergeFieldProfile(current, {
        schoolId: input.schoolId,
        employeeId: actor.employeeId,
        patch: input.patch,
        now,
      });
      const logId = randomUUID();
      transaction.set(profileRef, next);
      transaction.set(lockRef, {
        operation: "updateSchoolFieldProfile",
        actorUid: actor.uid,
        schoolId: input.schoolId,
        revision: next.revision,
        requestFingerprint: fingerprint,
        createdAt: now,
      });
      transaction.set(this.db.doc(`auditLogs/${logId}`), {
        logId,
        eventType: "SCHOOL_FIELD_PROFILE_UPDATED",
        actorUid: actor.uid,
        actorEmployeeId: actor.employeeId,
        targetType: "schoolFieldProfile",
        targetId: input.schoolId,
        schoolId: input.schoolId,
        cycleId: null,
        changedFields: Object.keys(input.patch),
        requestId: input.requestId,
        appVersion: input.appVersion,
        createdAt: now,
      });
      return { revision: next.revision, replayed: false };
    });
  }
}
