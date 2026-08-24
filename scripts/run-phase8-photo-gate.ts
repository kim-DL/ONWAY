import { randomUUID } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import sharp from "sharp";

import { preparePhotoUploadInputSchema } from "../functions/src/photo/photo-contract.js";
import { detectPhotoContentType } from "../functions/src/photo/photo-processor.js";
import {
  PhotoNotFoundError,
  PhotoRevisionConflictError,
  PhotoService,
} from "../functions/src/photo/photo-service.js";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.STORAGE_EMULATOR_HOST) {
  throw new Error("Phase 8 photo gate is restricted to Firestore and Storage emulators.");
}

const projectId = process.env.GCLOUD_PROJECT ?? "demo-onnuriway";
const app = getApps().find((candidate) => candidate.name === "phase8-photo-gate")
  ?? initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` }, "phase8-photo-gate");
const database = getFirestore(app);
const bucket = getStorage(app).bucket(`${projectId}.appspot.com`);
const service = new PhotoService(database, bucket);
const actor = { uid: "uid-phase8-delivery", employeeId: "EMP-PHASE8-DELIVERY" };
const schoolId = "SCH-PHASE8-001";
await database.doc(`schools/${schoolId}`).set({ schoolId, name: "Phase 8 Gate School" });

const source = await sharp({ create: { width: 1_600, height: 1_000, channels: 3, background: "#327969" } }).jpeg().toBuffer();
const baseInput = preparePhotoUploadInputSchema.parse({
  schoolId,
  slotId: "01",
  expectedRevision: 0,
  requestId: randomUUID(),
  appVersion: "phase8-gate",
  fileName: "field.jpg",
  contentType: "image/jpeg",
  byteSize: source.length,
  caption: "학교 접근",
});

const prepared = await service.prepare(baseInput, actor);
const prepareReplay = await service.prepare(baseInput, actor);
if (!prepareReplay.replayed || prepareReplay.uploadId !== prepared.uploadId) throw new Error("Prepare replay failed.");
const created = await service.finalize(prepared.uploadId, source.toString("base64"), actor);
if (created.revision !== 1 || created.replayed) throw new Error("Initial photo finalize failed.");
const finalizeReplay = await service.finalize(prepared.uploadId, source.toString("base64"), actor);
if (!finalizeReplay.replayed || finalizeReplay.revision !== 1) throw new Error("Finalize replay failed.");
const preview = await service.get({ schoolId, slotId: "01", versionId: created.versionId, variant: "preview" });
if (detectPhotoContentType(Buffer.from(preview.fileBase64, "base64")) !== "image/webp") throw new Error("Preview is not WebP.");

const replacementInput = preparePhotoUploadInputSchema.parse({
  ...baseInput,
  expectedRevision: 1,
  requestId: randomUUID(),
  caption: "새 학교 접근",
});
const replacementSession = await service.prepare(replacementInput, actor);
const replaced = await service.finalize(replacementSession.uploadId, source.toString("base64"), actor);
if (replaced.revision !== 2 || replaced.versionId === created.versionId) throw new Error("Version replacement failed.");

let conflictRevision: number | null = null;
try {
  await service.prepare({ ...replacementInput, requestId: randomUUID() }, actor);
} catch (error) {
  if (error instanceof PhotoRevisionConflictError) conflictRevision = error.actualRevision;
  else throw error;
}
if (conflictRevision !== 2) throw new Error("Stale photo revision was not rejected.");

const deleted = await service.delete({
  schoolId,
  slotId: "01",
  expectedRevision: 2,
  requestId: randomUUID(),
  appVersion: "phase8-gate",
  reason: "Gate soft delete",
}, actor);
let deletedDownloadDenied = false;
try {
  await service.get({ schoolId, slotId: "01", versionId: replaced.versionId, variant: "preview" });
} catch (error) {
  if (error instanceof PhotoNotFoundError) deletedDownloadDenied = true;
  else throw error;
}
if (!deletedDownloadDenied) throw new Error("Deleted photo remained downloadable.");
const restored = await service.restore({
  schoolId,
  slotId: "01",
  expectedRevision: deleted.revision,
  requestId: randomUUID(),
  appVersion: "phase8-gate",
}, actor);
if (restored.revision !== 4) throw new Error("Photo restore failed.");

const [metadata, audit, files] = await Promise.all([
  database.doc(`schools/${schoolId}/photos/01`).get(),
  database.collection("auditLogs").where("schoolId", "==", schoolId).get(),
  bucket.getFiles({ prefix: `schools/${schoolId}/photos/01/` }),
]);
const [temporaryFiles] = await bucket.getFiles({ prefix: `temporaryUploads/${actor.uid}/` });
const photoFiles = files[0];
if (metadata.get("status") !== "active" || metadata.get("photoRevision") !== 4) throw new Error("Final photo metadata is inconsistent.");
if (audit.size !== 4) throw new Error(`Expected 4 photo audit events, received ${audit.size}.`);
if (photoFiles.length !== 6) throw new Error("Immutable photo versions were not preserved.");
if (temporaryFiles.length !== 0) throw new Error("Temporary upload objects were not cleaned.");

console.log(JSON.stringify({
  status: "phase8-photo-gate-passed",
  revision: metadata.get("photoRevision"),
  versions: 2,
  variants: photoFiles.length,
  conflictRevision,
  auditCount: audit.size,
  temporaryObjects: temporaryFiles.length,
}));
