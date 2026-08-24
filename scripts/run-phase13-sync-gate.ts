import { randomUUID } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import type { NeisSchoolRow } from "../functions/src/neis/contract.js";
import { KakaoMatchService } from "../functions/src/sync/kakao-match-service.js";
import { NeisSyncService, NeisSyncSuspiciousResultError } from "../functions/src/sync/neis-sync-service.js";
import { buildPhase1SeedDocuments, createPhase1Seed } from "../src/seed/phase1.js";

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Phase 13 gate is restricted to a Firestore emulator.");
const projectId = process.env.GCLOUD_PROJECT ?? "demo-onnuriway";
const app = getApps().find((candidate) => candidate.name === "phase13-sync-gate")
  ?? initializeApp({ projectId }, "phase13-sync-gate");
const database = getFirestore(app);
const seed = createPhase1Seed();
for (const document of buildPhase1SeedDocuments(seed)) await database.doc(document.path).set(document.data);

const actor = { uid: "uid-admin", employeeId: "EMP-ADMIN" };
const clock = new Date("2026-08-24T06:00:00.000Z");

function neisRow(input: {
  code: string;
  name: string;
  type: "초등학교" | "중학교" | "고등학교";
  address: string;
  postalCode?: string;
  phone?: string;
  homepage?: string;
}): NeisSchoolRow {
  return {
    ATPT_OFCDC_SC_CODE: "G10",
    ATPT_OFCDC_SC_NM: "대전광역시교육청",
    SD_SCHUL_CODE: input.code,
    SCHUL_NM: input.name,
    ENG_SCHUL_NM: "",
    SCHUL_KND_SC_NM: input.type,
    LCTN_SC_NM: "대전광역시",
    JU_ORG_NM: "",
    FOND_SC_NM: "공립",
    ORG_RDNZC: input.postalCode ?? "",
    ORG_RDNMA: input.address,
    ORG_RDNDA: "",
    ORG_TELNO: input.phone ?? "",
    HMPG_ADRES: input.homepage ?? "",
    LOAD_DTM: "20260824",
  };
}

const rows = [
  neisRow({
    code: "G100000001",
    name: "대전온누리미래고등학교",
    type: "고등학교",
    address: "대전광역시 서구 온누리로 1",
    postalCode: "35200",
    phone: "042-000-0001",
    homepage: "https://school.example/onnuri",
  }),
  neisRow({
    code: "G100000002",
    name: "대전한밭중학교",
    type: "중학교",
    address: "대전광역시 중구 한밭새길 22",
  }),
  neisRow({
    code: "G100000004",
    name: "대전새빛고등학교",
    type: "고등학교",
    address: "대전광역시 동구 새빛로 4",
    postalCode: "34600",
    phone: "042-000-0004",
  }),
  neisRow({
    code: "G100000006",
    name: "대전새길초등학교",
    type: "초등학교",
    address: "대전광역시 유성구 새길로 6",
    postalCode: "34100",
  }),
];

const protectedPaths = [
  "schoolFieldProfiles/SCH-NEIS-G100000001",
  "salesProfiles/SCH-NEIS-G100000001",
  "schools/SCH-NEIS-G100000001/photos/01",
] as const;
const [fieldBefore, salesBefore, photoBefore, visitsBefore, assignmentsBefore] = await Promise.all([
  database.doc(protectedPaths[0]).get(),
  database.doc(protectedPaths[1]).get(),
  database.doc(protectedPaths[2]).get(),
  database.collection("salesVisits").get(),
  database.collection("salesCycles/2026-08/assignments").get(),
]);

const service = new NeisSyncService({
  db: database,
  client: { fetchAllSchools: async () => rows },
  targetEducationOfficeCode: "G10",
  now: () => clock,
});
const previewRequestId = randomUUID();
const preview = await service.preview({ requestId: previewRequestId }, actor);
if (preview.status !== "DIFF_READY" || preview.newCount !== 1 || preview.changedCount !== 2 || preview.missingCount !== 1) {
  throw new Error(`Unexpected NEIS preview summary: ${JSON.stringify(preview)}`);
}
const previewReplay = await service.preview({ requestId: previewRequestId }, actor);
if (!previewReplay.replayed || previewReplay.changes.length !== preview.changes.length) throw new Error("NEIS preview replay failed.");
const applied = await service.apply({
  runId: preview.runId,
  requestId: randomUUID(),
  confirmRiskyChanges: true,
}, actor);
if (applied.status !== "COMPLETED" || applied.appliedCount !== 4 || !applied.catalog || applied.catalog.version !== 2) {
  throw new Error(`Unexpected NEIS apply result: ${JSON.stringify(applied)}`);
}

const [renamed, moved, missing, added, fieldAfter, salesAfter, photoAfter, visitsAfter, assignmentsAfter, runSnapshot, metaSnapshot] = await Promise.all([
  database.doc("schools/SCH-NEIS-G100000001").get(),
  database.doc("schools/SCH-NEIS-G100000002").get(),
  database.doc("schools/SCH-NEIS-G100000003").get(),
  database.doc("schools/SCH-NEIS-G100000006").get(),
  database.doc(protectedPaths[0]).get(),
  database.doc(protectedPaths[1]).get(),
  database.doc(protectedPaths[2]).get(),
  database.collection("salesVisits").get(),
  database.collection("salesCycles/2026-08/assignments").get(),
  database.doc(`neisSyncRuns/${preview.runId}`).get(),
  database.doc("catalogMeta/current").get(),
]);
if (renamed.get("name") !== "대전온누리미래고등학교" || !renamed.get("aliases").includes("대전온누리고등학교")) {
  throw new Error("School rename did not preserve the stable ID and previous-name alias.");
}
if (renamed.get("location.matchStatus") !== "confirmed" || renamed.get("location.kakaoPlaceId") !== "KAKAO-ONNURI-1") {
  throw new Error("NEIS rename overwrote an administrator-confirmed location.");
}
if (moved.get("address.road") !== "대전광역시 중구 한밭새길 22" || moved.get("possibleRelocation") !== true) {
  throw new Error("Address relocation review was not staged safely.");
}
if (missing.get("operationalStatus") !== "inactiveCandidate" || !added.exists || added.get("location.matchStatus") !== "unmatched") {
  throw new Error("Missing/new school handling is inconsistent.");
}
if (
  JSON.stringify(fieldAfter.data()) !== JSON.stringify(fieldBefore.data())
  || JSON.stringify(salesAfter.data()) !== JSON.stringify(salesBefore.data())
  || JSON.stringify(photoAfter.data()) !== JSON.stringify(photoBefore.data())
  || visitsAfter.size !== visitsBefore.size
  || assignmentsAfter.size !== assignmentsBefore.size
) {
  throw new Error("NEIS apply modified protected field/photo/sales data.");
}
if (runSnapshot.get("status") !== "COMPLETED" || metaSnapshot.get("commonCatalogVersion") !== 2) {
  throw new Error("Sync completion or catalog publication is inconsistent.");
}

const phoneBeforeSelective = await database.doc("schools/SCH-NEIS-G100000004").get();
const selectiveRows = rows.map((source) => {
  if (source.SD_SCHUL_CODE === "G100000002") return { ...source, ORG_TELNO: "042-555-1002" };
  if (source.SD_SCHUL_CODE === "G100000004") return { ...source, ORG_TELNO: "042-555-1004" };
  return source;
});
const selectiveService = new NeisSyncService({
  db: database,
  client: { fetchAllSchools: async () => selectiveRows },
  targetEducationOfficeCode: "G10",
  now: () => new Date("2026-08-24T06:30:00.000Z"),
});
const selectivePreview = await selectiveService.preview({ requestId: randomUUID() }, actor);
const selectedPhoneChange = selectivePreview.changes.find(
  (change) => change.type === "PHONE_CHANGED" && change.schoolCode === "G100000002",
);
const excludedPhoneChange = selectivePreview.changes.find(
  (change) => change.type === "PHONE_CHANGED" && change.schoolCode === "G100000004",
);
if (!selectedPhoneChange || !excludedPhoneChange) throw new Error("Selective NEIS fixture did not produce both phone changes.");
const selectiveApplied = await selectiveService.apply({
  runId: selectivePreview.runId,
  requestId: randomUUID(),
  approvedChangeIds: [selectedPhoneChange.changeId],
  confirmRiskyChanges: false,
}, actor);
const [selectedSchoolAfter, excludedSchoolAfter, selectedChangeAfter, excludedChangeAfter] = await Promise.all([
  database.doc("schools/SCH-NEIS-G100000002").get(),
  database.doc("schools/SCH-NEIS-G100000004").get(),
  database.doc(`neisSyncRuns/${selectivePreview.runId}/changes/${selectedPhoneChange.changeId}`).get(),
  database.doc(`neisSyncRuns/${selectivePreview.runId}/changes/${excludedPhoneChange.changeId}`).get(),
]);
if (
  selectiveApplied.appliedCount !== 1
  || selectedSchoolAfter.get("phone") !== "042-555-1002"
  || excludedSchoolAfter.get("phone") !== phoneBeforeSelective.get("phone")
  || selectedChangeAfter.get("approved") !== true
  || selectedChangeAfter.get("applied") !== true
  || excludedChangeAfter.get("approved") !== false
  || excludedChangeAfter.get("applied") !== false
) {
  throw new Error("Selective NEIS apply changed an excluded item or failed to persist its decision.");
}

const suspiciousService = new NeisSyncService({
  db: database,
  client: { fetchAllSchools: async () => [rows[0]!] },
  targetEducationOfficeCode: "G10",
  now: () => new Date("2026-08-24T07:00:00.000Z"),
});
const suspicious = await suspiciousService.preview({ requestId: randomUUID() }, actor);
if (suspicious.status !== "SUSPICIOUS_RESULT") throw new Error("Mass missing response was not marked suspicious.");
let suspiciousApplyBlocked = false;
try {
  await suspiciousService.apply({ runId: suspicious.runId, requestId: randomUUID(), confirmRiskyChanges: true }, actor);
} catch (error) {
  if (error instanceof NeisSyncSuspiciousResultError) suspiciousApplyBlocked = true;
  else throw error;
}
if (!suspiciousApplyBlocked) throw new Error("Suspicious NEIS result was applied.");

function kakaoCandidate(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: "10001",
    placeId: "10001",
    name: "대전한밭중학교",
    categoryName: "교육 > 학교 > 중학교",
    addressName: "대전광역시 중구 한밭동 22",
    roadAddress: "대전광역시 중구 한밭새길 22",
    latitude: 36.33,
    longitude: 127.42,
    placeUrl: "https://place.map.kakao.com/10001",
    ...overrides,
  };
}
const exactKakao = new KakaoMatchService({
  db: database,
  client: {
    searchAddress: async () => ({ addressName: "대전광역시 중구 한밭동 22", roadAddress: "대전광역시 중구 한밭새길 22", latitude: 36.3301, longitude: 127.4201 }),
    searchKeyword: async () => [kakaoCandidate()],
  },
  now: () => new Date("2026-08-24T08:00:00.000Z"),
});
const exact = await exactKakao.match({ schoolId: "SCH-NEIS-G100000002", requestId: randomUUID() }, actor);
if (exact.status !== "autoMatched") throw new Error("Exact Kakao candidate was not auto-matched.");

const multipleKakao = new KakaoMatchService({
  db: database,
  client: {
    searchAddress: async () => ({ addressName: "대전광역시 서구 온누리동 1", roadAddress: "대전광역시 서구 온누리로 1", latitude: 36.35, longitude: 127.38 }),
    searchKeyword: async () => [
      kakaoCandidate({ candidateId: "20001", placeId: "20001", name: "대전온누리미래고등학교", roadAddress: "대전광역시 서구 온누리로 1", addressName: "대전광역시 서구 온누리동 1", latitude: 36.35, longitude: 127.38 }),
      kakaoCandidate({ candidateId: "20002", placeId: "20002", name: "대전온누리미래고등학교", roadAddress: "대전광역시 서구 온누리로 1", addressName: "대전광역시 서구 온누리동 1", latitude: 36.3502, longitude: 127.3802 }),
    ],
  },
  now: () => new Date("2026-08-24T08:10:00.000Z"),
});
const multiple = await multipleKakao.match({ schoolId: "SCH-NEIS-G100000001", requestId: randomUUID() }, actor);
if (multiple.status !== "needsReview" || multiple.candidates.length !== 2) throw new Error("Multiple Kakao candidates were auto-confirmed.");
const beforeConfirmation = await database.doc("schools/SCH-NEIS-G100000001").get();
const confirmed = await multipleKakao.confirm({
  schoolId: "SCH-NEIS-G100000001",
  requestId: randomUUID(),
  expectedSchoolBaseRevision: multiple.schoolBaseRevision,
  candidateId: "20001",
  manualLocation: null,
}, actor);
if (confirmed.status !== "confirmed") throw new Error("Administrator Kakao confirmation failed.");
const afterConfirmation = await database.doc("schools/SCH-NEIS-G100000001").get();
if (afterConfirmation.get("location.matchStatus") !== "confirmed" || afterConfirmation.get("location.confirmedBy") !== actor.employeeId) {
  throw new Error("Confirmed Kakao location metadata is incomplete.");
}
if (beforeConfirmation.get("location.kakaoPlaceId") !== "KAKAO-ONNURI-1") throw new Error("Review changed the confirmed location before approval.");

const failedKakao = new KakaoMatchService({
  db: database,
  client: {
    searchAddress: async () => { throw new Error("fixture outage"); },
    searchKeyword: async () => [],
  },
  now: () => new Date("2026-08-24T08:20:00.000Z"),
});
const failed = await failedKakao.match({ schoolId: "SCH-NEIS-G100000006", requestId: randomUUID() }, actor);
const failedSchool = await database.doc("schools/SCH-NEIS-G100000006").get();
if (failed.status !== "failed" || !failedSchool.exists || failedSchool.get("location.matchStatus") !== "failed") {
  throw new Error("Kakao API failure affected the school base record.");
}
const manual = await failedKakao.confirm({
  schoolId: "SCH-NEIS-G100000006",
  requestId: randomUUID(),
  expectedSchoolBaseRevision: failed.schoolBaseRevision,
  candidateId: null,
  manualLocation: {
    latitude: 36.36,
    longitude: 127.35,
    name: "대전새길초등학교",
    roadAddress: "대전광역시 유성구 새길로 6",
  },
}, actor);
const manuallyConfirmedSchool = await database.doc("schools/SCH-NEIS-G100000006").get();
if (manual.status !== "confirmed" || manuallyConfirmedSchool.get("location.matchMethod") !== "manual") {
  throw new Error("Manual administrator location confirmation failed.");
}

const auditSnapshot = await database.collection("auditLogs").get();
console.log(JSON.stringify({
  status: "phase13-sync-gate-passed",
  previewChanges: preview.changes.length,
  previewReplayed: previewReplay.replayed,
  appliedCount: applied.appliedCount,
  selectiveAppliedCount: selectiveApplied.appliedCount,
  selectiveExcludedPreserved: true,
  catalogVersion: applied.catalog.version,
  protectedFieldPhotoSales: true,
  suspiciousApplyBlocked,
  exactKakao: exact.status,
  multipleKakao: multiple.status,
  confirmedKakao: confirmed.status,
  failedKakao: failed.status,
  manualKakao: manual.status,
  auditCount: auditSnapshot.size,
}));
