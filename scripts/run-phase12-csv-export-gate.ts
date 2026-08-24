import { randomUUID } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import { exportCsvInputSchema } from "../functions/src/export/csv-export-contract.js";
import { CsvExportPermissionError, CsvExportRequestCollisionError, CsvExportService } from "../functions/src/export/csv-export-service.js";
import { buildPhase1SeedDocuments, createPhase1Seed } from "../src/seed/phase1.js";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.STORAGE_EMULATOR_HOST) throw new Error("Phase 12 gate is restricted to Firestore and Storage emulators.");
const projectId = process.env.GCLOUD_PROJECT ?? "demo-onnuriway";
const app = getApps().find((candidate) => candidate.name === "phase12-csv-gate") ?? initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` }, "phase12-csv-gate");
const database = getFirestore(app);
const bucket = getStorage(app).bucket(`${projectId}.appspot.com`);
const service = new CsvExportService(database, bucket);
for (const document of buildPhase1SeedDocuments(createPhase1Seed())) await database.doc(document.path).set(document.data);

const ownActor = { uid: "uid-sales-a", employeeId: "EMP-SALES-A", roleScopes: ["sales"], canExportTeam: false };
const teamActor = { ...ownActor, canExportTeam: true };
const baseFilter = {
  cycleId: "2026-08", zoneId: null, assigneeId: null, district: null, schoolType: null, monthlyStatus: null,
  interestScore: null, followUpOnly: false, tagId: null, visitedFrom: null, visitedTo: null,
};
const ownSelection = { kind: "assignments" as const, scope: "own" as const, filter: baseFilter };
const ownPreview = await service.preview(ownSelection, ownActor);
if (ownPreview.rowCount !== 2) throw new Error(`Expected two own assignments, received ${ownPreview.rowCount}.`);

let unauthorizedTeamRejected = false;
try { await service.preview({ ...ownSelection, scope: "team" }, ownActor); }
catch (error) { if (error instanceof CsvExportPermissionError) unauthorizedTeamRejected = true; else throw error; }
if (!unauthorizedTeamRejected) throw new Error("Team export was exposed without exportTeam permission.");
const teamPreview = await service.preview({ ...ownSelection, scope: "team" }, teamActor);
if (teamPreview.rowCount !== 5) throw new Error(`Expected five team assignments, received ${teamPreview.rowCount}.`);

const requestId = randomUUID();
const input = exportCsvInputSchema.parse({ ...ownSelection, filter: { ...baseFilter, district: "seo" }, requestId, appVersion: "phase12-gate" });
const result = await service.generate(input, ownActor, new Date("2026-08-24T03:00:00.000Z"));
const replay = await service.generate(input, ownActor, new Date("2026-08-24T03:01:00.000Z"));
if (result.rowCount !== 1 || result.replayed || !replay.replayed || result.jobId !== replay.jobId) throw new Error("CSV generation idempotency failed.");
let collisionRejected = false;
try { await service.generate({ ...input, filter: { ...input.filter, district: "dong" } }, ownActor); }
catch (error) { if (error instanceof CsvExportRequestCollisionError) collisionRejected = true; else throw error; }
if (!collisionRejected) throw new Error("A reused CSV request ID accepted different filters.");

const download = await service.download(result.jobId, ownActor, new Date("2026-08-24T04:00:00.000Z"));
const csv = Buffer.from(download.fileBase64, "base64");
if (!csv.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) || !csv.toString("utf8").includes("대전온누리고등학교")) throw new Error("UTF-8 BOM or Korean CSV content is missing.");
let otherOwnerRejected = false;
try { await service.download(result.jobId, { uid: "uid-sales-b", employeeId: "EMP-SALES-B", roleScopes: ["sales"], canExportTeam: false }); }
catch (error) { if (error instanceof CsvExportPermissionError) otherOwnerRejected = true; else throw error; }
if (!otherOwnerRejected) throw new Error("Another employee downloaded the export.");

const [jobs, audits, files] = await Promise.all([
  database.collection("exportJobs").get(), database.collection("auditLogs").where("eventType", "==", "CSV_EXPORTED").get(), bucket.getFiles({ prefix: `exports/${ownActor.employeeId}/${result.jobId}/` }),
]);
if (jobs.size !== 1 || audits.size !== 1 || files[0].length !== 1) throw new Error(`Expected one job/audit/file, received ${jobs.size}/${audits.size}/${files[0].length}.`);
if (audits.docs[0]?.get("rowCount") !== 1 || audits.docs[0]?.get("scope") !== "own") throw new Error("CSV audit context is incomplete.");

const expiration = await service.expireCompleted(new Date("2026-08-25T04:00:00.000Z"));
const [expiredJob, expiredFiles] = await Promise.all([
  database.doc(`exportJobs/${result.jobId}`).get(), bucket.getFiles({ prefix: `exports/${ownActor.employeeId}/${result.jobId}/` }),
]);
if (expiration.expiredCount !== 1 || expiredJob.get("status") !== "expired" || expiredJob.get("storagePath") !== null || expiredFiles[0].length !== 0) throw new Error("Expired CSV object cleanup failed.");

console.log(JSON.stringify({ status: "phase12-csv-export-gate-passed", ownRows: ownPreview.rowCount, teamRows: teamPreview.rowCount, filteredRows: result.rowCount, utf8Bom: true, koreanPreserved: true, replayed: replay.replayed, collisionRejected, unauthorizedTeamRejected, otherOwnerRejected, auditCount: audits.size, fileCount: files[0].length, expiredObjectsRemoved: expiration.expiredCount }));
