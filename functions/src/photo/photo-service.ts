import { createHash, randomUUID } from "node:crypto";

import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { getAdminFirestore, getAdminPhotoBucket } from "../shared/firebase-admin.js";
import {
  MAX_PHOTO_UPLOAD_BYTES,
  type GetSchoolPhotoInput,
  type MutateSchoolPhotoInput,
  type PreparePhotoUploadInput,
} from "./photo-contract.js";
import {
  detectPhotoContentType,
  InvalidPhotoError,
  processSchoolPhoto,
} from "./photo-processor.js";

const timestampSchema = z.custom<Timestamp>((value) => value instanceof Timestamp);
const photoSchema = z.object({
  schoolId: z.string().min(1),
  slotId: z.enum(["01", "02", "03"]),
  currentVersionId: z.string().min(1),
  caption: z.string().max(2_000).nullable(),
  status: z.enum(["active", "deleted"]),
  photoRevision: z.number().int().positive(),
  createdAt: timestampSchema,
  createdBy: z.string().min(1),
  updatedAt: timestampSchema,
  updatedBy: z.string().min(1),
  deletedAt: timestampSchema.nullable(),
  deletedBy: z.string().nullable(),
  deleteReason: z.string().max(2_000).nullable(),
}).strict();

const uploadResultSchema = z.object({
  schoolId: z.string(),
  slotId: z.enum(["01", "02", "03"]),
  versionId: z.string(),
  revision: z.number().int().positive(),
  replayed: z.boolean(),
}).strict();

const uploadSessionSchema = z.object({
  uploadId: z.string().uuid(),
  actorUid: z.string().min(1),
  actorEmployeeId: z.string().min(1),
  schoolId: z.string().min(1),
  slotId: z.enum(["01", "02", "03"]),
  expectedRevision: z.number().int().nonnegative(),
  requestId: z.string().uuid(),
  appVersion: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().positive().max(MAX_PHOTO_UPLOAD_BYTES),
  caption: z.string().max(2_000).nullable(),
  versionId: z.string().min(1),
  status: z.enum(["prepared", "finalized"]),
  createdAt: timestampSchema,
  expiresAt: timestampSchema,
  finalizedAt: timestampSchema.nullable(),
  result: uploadResultSchema.nullable(),
}).strict();

const requestLockSchema = z.object({
  operation: z.enum(["prepare", "delete", "restore"]),
  fingerprint: z.string().length(64),
  actorUid: z.string().min(1),
  result: z.record(z.string(), z.unknown()),
  createdAt: timestampSchema,
}).strict();

const uploadRateLimitSchema = z.object({
  attemptCount: z.number().int().nonnegative(),
  windowStartedAt: timestampSchema,
  expiresAt: timestampSchema,
}).strict();

export type PhotoActor = { uid: string; employeeId: string };
export type PhotoMutationResult = { revision: number; replayed: boolean };

export class PhotoRevisionConflictError extends Error {
  constructor(readonly actualRevision: number) {
    super("Photo revision conflict.");
  }
}
export class PhotoNotFoundError extends Error {}
export class PhotoUploadSessionError extends Error {}
export class PhotoRequestCollisionError extends Error {}
export class PhotoUploadRateLimitError extends Error {}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function photoPath(schoolId: string, slotId: string) {
  return `schools/${schoolId}/photos/${slotId}`;
}

function versionPath(schoolId: string, slotId: string, versionId: string, variant: string) {
  return `schools/${schoolId}/photos/${slotId}/${versionId}/${variant}.webp`;
}

function auditRecord(input: {
  eventType: "PHOTO_ADDED" | "PHOTO_REPLACED" | "PHOTO_DELETED" | "PHOTO_RESTORED";
  actor: PhotoActor;
  schoolId: string;
  slotId: string;
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
    targetType: "schoolPhoto",
    targetId: `${input.schoolId}:${input.slotId}`,
    schoolId: input.schoolId,
    cycleId: null,
    changedFields: ["status", "currentVersionId", "caption", "photoRevision"],
    requestId: input.requestId,
    appVersion: input.appVersion,
    createdAt: input.createdAt,
  };
}

function decodeBase64(value: string) {
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new InvalidPhotoError("사진 데이터가 올바른 Base64가 아닙니다.");
  }
  const buffer = Buffer.from(value, "base64");
  if (buffer.toString("base64") !== value) {
    throw new InvalidPhotoError("사진 데이터가 올바른 Base64가 아닙니다.");
  }
  return buffer;
}

export class PhotoService {
  constructor(
    private readonly db: Firestore = getAdminFirestore(),
    private readonly bucket = getAdminPhotoBucket(),
  ) {}

  async prepare(input: PreparePhotoUploadInput, actor: PhotoActor, now = new Date()) {
    const inputFingerprint = fingerprint({ ...input, actorUid: actor.uid });
    const uploadId = randomUUID();
    const versionId = `v-${randomUUID()}`;
    const createdAt = Timestamp.fromDate(now);
    const expiresAt = Timestamp.fromMillis(now.getTime() + 10 * 60 * 1_000);
    const schoolRef = this.db.doc(`schools/${input.schoolId}`);
    const photoRef = this.db.doc(photoPath(input.schoolId, input.slotId));
    const sessionRef = this.db.doc(`photoUploadSessions/${uploadId}`);
    const lockRef = this.db.doc(`requestLocks/photo-prepare-${input.requestId}`);
    const hourWindow = new Date(now);
    hourWindow.setUTCMinutes(0, 0, 0);
    const rateRef = this.db.doc(`photoUploadRateLimits/${actor.uid}-${hourWindow.toISOString().slice(0, 13).replace(/[^0-9T]/g, "")}`);

    return this.db.runTransaction(async (transaction) => {
      const [lockSnapshot, schoolSnapshot, photoSnapshot, rateSnapshot] = await Promise.all([
        transaction.get(lockRef),
        transaction.get(schoolRef),
        transaction.get(photoRef),
        transaction.get(rateRef),
      ]);
      if (lockSnapshot.exists) {
        const lock = requestLockSchema.parse(lockSnapshot.data());
        if (lock.fingerprint !== inputFingerprint || lock.actorUid !== actor.uid) {
          throw new PhotoRequestCollisionError();
        }
        return {
          uploadId: z.string().uuid().parse(lock.result.uploadId),
          expiresAt: z.string().datetime().parse(lock.result.expiresAt),
          maxBytes: MAX_PHOTO_UPLOAD_BYTES,
          replayed: true,
        };
      }
      if (!schoolSnapshot.exists) throw new PhotoNotFoundError("School not found.");
      const rate = rateSnapshot.exists ? uploadRateLimitSchema.parse(rateSnapshot.data()) : null;
      if ((rate?.attemptCount ?? 0) >= 30) throw new PhotoUploadRateLimitError();

      const currentPhoto = photoSnapshot.exists ? photoSchema.parse(photoSnapshot.data()) : null;
      const actualRevision = currentPhoto?.photoRevision ?? 0;
      const mayReplaceDeletedSlot = input.expectedRevision === 0 && currentPhoto?.status === "deleted";
      if (input.expectedRevision !== actualRevision && !mayReplaceDeletedSlot) {
        throw new PhotoRevisionConflictError(actualRevision);
      }

      const session = uploadSessionSchema.parse({
        uploadId,
        actorUid: actor.uid,
        actorEmployeeId: actor.employeeId,
        schoolId: input.schoolId,
        slotId: input.slotId,
        expectedRevision: actualRevision,
        requestId: input.requestId,
        appVersion: input.appVersion,
        fileName: input.fileName,
        contentType: input.contentType,
        byteSize: input.byteSize,
        caption: input.caption,
        versionId,
        status: "prepared",
        createdAt,
        expiresAt,
        finalizedAt: null,
        result: null,
      });
      const result = {
        uploadId,
        expiresAt: expiresAt.toDate().toISOString(),
        maxBytes: MAX_PHOTO_UPLOAD_BYTES,
        replayed: false,
      };
      transaction.create(sessionRef, session);
      transaction.set(rateRef, {
        attemptCount: (rate?.attemptCount ?? 0) + 1,
        windowStartedAt: rate?.windowStartedAt ?? Timestamp.fromDate(hourWindow),
        expiresAt: Timestamp.fromMillis(hourWindow.getTime() + 2 * 60 * 60 * 1_000),
      });
      transaction.create(lockRef, {
        operation: "prepare",
        fingerprint: inputFingerprint,
        actorUid: actor.uid,
        result: { uploadId, expiresAt: result.expiresAt },
        createdAt,
      });
      return result;
    });
  }

  async finalize(uploadId: string, fileBase64: string, actor: PhotoActor, now = new Date()) {
    const sessionRef = this.db.doc(`photoUploadSessions/${uploadId}`);
    const firstSnapshot = await sessionRef.get();
    if (!firstSnapshot.exists) throw new PhotoUploadSessionError("Upload session not found.");
    const session = uploadSessionSchema.parse(firstSnapshot.data());
    if (session.actorUid !== actor.uid || session.actorEmployeeId !== actor.employeeId) {
      throw new PhotoUploadSessionError("Upload session owner mismatch.");
    }
    if (session.status === "finalized" && session.result) {
      return { ...session.result, replayed: true };
    }
    if (session.expiresAt.toMillis() <= now.getTime()) {
      throw new PhotoUploadSessionError("Upload session expired.");
    }

    const input = decodeBase64(fileBase64);
    if (input.length !== session.byteSize) throw new InvalidPhotoError("선택한 파일 크기가 준비 요청과 다릅니다.");
    if (detectPhotoContentType(input) !== session.contentType) {
      throw new InvalidPhotoError("파일 내용과 MIME 형식이 일치하지 않습니다.");
    }

    const temporaryPath = `temporaryUploads/${actor.uid}/${uploadId}/source`;
    const temporaryFile = this.bucket.file(temporaryPath);
    await temporaryFile.save(input, {
      resumable: false,
      metadata: { contentType: session.contentType, cacheControl: "private,no-store" },
    });

    try {
      const processed = await processSchoolPhoto(input);
      await Promise.all(([
        ["thumbnail", processed.thumbnail],
        ["preview", processed.preview],
        ["original", processed.original],
      ] as const).map(([name, output]) => this.bucket
        .file(versionPath(session.schoolId, session.slotId, session.versionId, name))
        .save(output.buffer, {
          resumable: false,
          metadata: {
            contentType: "image/webp",
            cacheControl: name === "original" ? "private,no-store" : "private,max-age=604800,immutable",
            metadata: { width: String(output.width), height: String(output.height), phase: "8" },
          },
        })));

      const photoRef = this.db.doc(photoPath(session.schoolId, session.slotId));
      const finalizedAt = Timestamp.fromDate(now);
      try {
        return await this.db.runTransaction(async (transaction) => {
          const [freshSessionSnapshot, photoSnapshot] = await Promise.all([
            transaction.get(sessionRef),
            transaction.get(photoRef),
          ]);
          const freshSession = uploadSessionSchema.parse(freshSessionSnapshot.data());
          if (freshSession.status === "finalized" && freshSession.result) {
            return { ...freshSession.result, replayed: true };
          }
          const existing = photoSnapshot.exists ? photoSchema.parse(photoSnapshot.data()) : null;
          const actualRevision = existing?.photoRevision ?? 0;
          if (actualRevision !== freshSession.expectedRevision) {
            throw new PhotoRevisionConflictError(actualRevision);
          }
          const revision = actualRevision + 1;
          const result = uploadResultSchema.parse({
            schoolId: session.schoolId,
            slotId: session.slotId,
            versionId: session.versionId,
            revision,
            replayed: false,
          });
          const photo = photoSchema.parse({
            schoolId: session.schoolId,
            slotId: session.slotId,
            currentVersionId: session.versionId,
            caption: session.caption,
            status: "active",
            photoRevision: revision,
            createdAt: existing?.createdAt ?? finalizedAt,
            createdBy: existing?.createdBy ?? actor.employeeId,
            updatedAt: finalizedAt,
            updatedBy: actor.employeeId,
            deletedAt: null,
            deletedBy: null,
            deleteReason: null,
          });
          const audit = auditRecord({
            eventType: existing ? "PHOTO_REPLACED" : "PHOTO_ADDED",
            actor,
            schoolId: session.schoolId,
            slotId: session.slotId,
            requestId: session.requestId,
            appVersion: session.appVersion,
            createdAt: finalizedAt,
          });
          transaction.set(photoRef, photo);
          transaction.update(sessionRef, { status: "finalized", finalizedAt, result });
          transaction.create(this.db.doc(`auditLogs/${audit.logId}`), audit);
          return result;
        });
      } catch (error) {
        if (error instanceof PhotoRevisionConflictError) {
          await Promise.all(["thumbnail", "preview", "original"].map((name) => this.bucket
            .file(versionPath(session.schoolId, session.slotId, session.versionId, name))
            .delete({ ignoreNotFound: true })));
        }
        throw error;
      }
    } finally {
      await temporaryFile.delete({ ignoreNotFound: true }).catch(() => undefined);
    }
  }

  async get(input: GetSchoolPhotoInput) {
    const snapshot = await this.db.doc(photoPath(input.schoolId, input.slotId)).get();
    if (!snapshot.exists) throw new PhotoNotFoundError();
    const photo = photoSchema.parse(snapshot.data());
    if (photo.status !== "active" || photo.currentVersionId !== input.versionId) {
      throw new PhotoNotFoundError();
    }
    const [buffer] = await this.bucket
      .file(versionPath(input.schoolId, input.slotId, input.versionId, input.variant))
      .download();
    return { contentType: "image/webp" as const, byteSize: buffer.length, fileBase64: buffer.toString("base64") };
  }

  async delete(input: MutateSchoolPhotoInput, actor: PhotoActor, now = new Date()) {
    return this.mutateStatus("delete", input, actor, now);
  }

  async restore(input: MutateSchoolPhotoInput, actor: PhotoActor, now = new Date()) {
    return this.mutateStatus("restore", input, actor, now);
  }

  private async mutateStatus(
    operation: "delete" | "restore",
    input: MutateSchoolPhotoInput,
    actor: PhotoActor,
    now: Date,
  ): Promise<PhotoMutationResult> {
    const inputFingerprint = fingerprint({ ...input, operation, actorUid: actor.uid });
    const photoRef = this.db.doc(photoPath(input.schoolId, input.slotId));
    const lockRef = this.db.doc(`requestLocks/photo-${operation}-${input.requestId}`);
    const createdAt = Timestamp.fromDate(now);
    return this.db.runTransaction(async (transaction) => {
      const [lockSnapshot, photoSnapshot] = await Promise.all([
        transaction.get(lockRef),
        transaction.get(photoRef),
      ]);
      if (lockSnapshot.exists) {
        const lock = requestLockSchema.parse(lockSnapshot.data());
        if (lock.fingerprint !== inputFingerprint || lock.actorUid !== actor.uid) {
          throw new PhotoRequestCollisionError();
        }
        return {
          revision: z.number().int().positive().parse(lock.result.revision),
          replayed: true,
        };
      }
      if (!photoSnapshot.exists) throw new PhotoNotFoundError();
      const photo = photoSchema.parse(photoSnapshot.data());
      if (photo.photoRevision !== input.expectedRevision) {
        throw new PhotoRevisionConflictError(photo.photoRevision);
      }
      const revision = photo.photoRevision + 1;
      const deleting = operation === "delete";
      const updated = photoSchema.parse({
        ...photo,
        status: deleting ? "deleted" : "active",
        photoRevision: revision,
        updatedAt: createdAt,
        updatedBy: actor.employeeId,
        deletedAt: deleting ? createdAt : null,
        deletedBy: deleting ? actor.employeeId : null,
        deleteReason: deleting ? (input.reason ?? "현장 사진 정리") : null,
      });
      const audit = auditRecord({
        eventType: deleting ? "PHOTO_DELETED" : "PHOTO_RESTORED",
        actor,
        schoolId: input.schoolId,
        slotId: input.slotId,
        requestId: input.requestId,
        appVersion: input.appVersion,
        createdAt,
      });
      transaction.set(photoRef, updated);
      transaction.create(lockRef, {
        operation,
        fingerprint: inputFingerprint,
        actorUid: actor.uid,
        result: { revision },
        createdAt,
      });
      transaction.create(this.db.doc(`auditLogs/${audit.logId}`), audit);
      return { revision, replayed: false };
    });
  }
}
