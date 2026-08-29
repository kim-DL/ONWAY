import { createHash, randomUUID } from "node:crypto";

import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { getAdminFirestore, getAdminPhotoBucket } from "../shared/firebase-admin.js";
import type { CsvExportFilter, CsvExportSelection, ExportCsvInput } from "./csv-export-contract.js";

type ExportBucket = ReturnType<typeof getAdminPhotoBucket>;

const MAX_EXPORT_ROWS = 5_000;
const MAX_EXPORT_BYTES = 8 * 1024 * 1024;
const timestampSchema = z.custom<Timestamp>((value) => value instanceof Timestamp);
const employeeSchema = z.object({
  employeeId: z.string(),
  displayName: z.string(),
  permissions: z.object({ exportTeam: z.boolean() }),
  status: z.enum(["active", "disabled"]),
}).passthrough();
const cycleSchema = z.object({ cycleId: z.string(), year: z.number(), month: z.number(), status: z.string() }).passthrough();
const zoneSchema = z.object({ zoneId: z.string(), name: z.string(), active: z.boolean(), displayOrder: z.number() }).passthrough();
const directorySchema = z.object({ employeeId: z.string(), displayName: z.string(), active: z.boolean(), displayOrder: z.number() }).passthrough();
const tagSchema = z.object({ tagId: z.string(), label: z.string(), active: z.boolean(), displayOrder: z.number() }).passthrough();
const productSchema = z.object({ productId: z.string(), name: z.string(), shortName: z.string().nullable().optional() }).passthrough();
const schoolSchema = z.object({
  schoolId: z.string(),
  source: z.object({ schoolCode: z.string() }).passthrough(),
  name: z.string(),
  schoolType: z.enum(["elementary", "middle", "high", "special", "other"]),
  district: z.enum(["dong", "jung", "seo", "yuseong", "daedeok"]),
}).passthrough();
const assignmentSchema = z.object({
  schoolId: z.string(), cycleId: z.string(), zoneId: z.string().nullable(), primaryAssigneeId: z.string(), assigneeIds: z.array(z.string()),
  monthlyStatus: z.enum(["before", "completed", "followUp", "revisit", "onHold"]),
  latestVisitedAt: timestampSchema.nullable(), brochureStatus: z.string(), sampleStatus: z.string(), updatedAt: timestampSchema,
}).passthrough();
const profileSchema = z.object({
  schoolId: z.string(), interestScore: z.number(), interestEvaluated: z.boolean(), communicationTagIds: z.array(z.string()),
  followUp: z.object({ required: z.boolean(), dueDate: z.string().nullable(), summary: z.string().nullable() }).passthrough(),
  nextAction: z.object({ dueDate: z.string().nullable(), summary: z.string().nullable() }).passthrough(),
}).passthrough();
const visitSchema = z.object({
  visitId: z.string(), schoolId: z.string(), cycleId: z.string(),
  assignmentSnapshot: z.object({ zoneId: z.string().nullable(), primaryAssigneeId: z.string().nullable(), assigneeIds: z.array(z.string()) }).passthrough(),
  visitedAt: timestampSchema, visitedBy: z.string(), recordedBy: z.string(),
  brochure: z.object({ status: z.string() }).passthrough(),
  sample: z.object({ status: z.string(), items: z.array(z.object({ productId: z.string(), quantity: z.number() }).passthrough()) }).passthrough(),
  interest: z.object({ score: z.number() }).passthrough(), activityTagIds: z.array(z.string()), summary: z.string(),
  followUp: z.object({ required: z.boolean(), dueDate: z.string().nullable(), summary: z.string().nullable() }).passthrough(),
  deleted: z.boolean(), updatedAt: timestampSchema,
}).passthrough();
const exportJobSchema = z.object({
  jobId: z.string(), requestedBy: z.string(), cycleId: z.string().nullable(), scope: z.enum(["own", "team", "admin"]),
  rowCount: z.number().int().nonnegative().nullable(), status: z.enum(["queued", "processing", "completed", "failed", "expired"]),
  storagePath: z.string().nullable(), expiresAt: timestampSchema.nullable(), fileName: z.string().optional(),
}).passthrough();
const resultSchema = z.object({
  jobId: z.string(), fileName: z.string(), rowCount: z.number().int().nonnegative(), expiresAt: z.string().datetime(), replayed: z.boolean(),
}).strict();
const requestLockSchema = z.object({
  operation: z.literal("exportCsv"), actorUid: z.string(), fingerprint: z.string().length(64), result: resultSchema.omit({ replayed: true }),
}).passthrough();

type School = z.infer<typeof schoolSchema>;
type Assignment = z.infer<typeof assignmentSchema>;
type Profile = z.infer<typeof profileSchema>;
type Visit = z.infer<typeof visitSchema>;
type CsvRow = readonly unknown[];

export type CsvExportActor = {
  uid: string;
  employeeId: string;
  roleScopes: readonly string[];
  canExportTeam: boolean;
};

export class CsvExportPermissionError extends Error {}
export class CsvExportRequestCollisionError extends Error {}
export class CsvExportTooLargeError extends Error {}
export class CsvExportNotFoundError extends Error {}
export class CsvExportExpiredError extends Error {}

const DISTRICT_LABELS: Record<School["district"], string> = { dong: "동구", jung: "중구", seo: "서구", yuseong: "유성구", daedeok: "대덕구" };
const SCHOOL_TYPE_LABELS: Record<School["schoolType"], string> = { elementary: "초등학교", middle: "중학교", high: "고등학교", special: "특수학교", other: "기타" };
const MONTHLY_STATUS_LABELS: Record<Assignment["monthlyStatus"], string> = { before: "방문 전", completed: "방문 완료", followUp: "후속 필요", revisit: "재방문", onHold: "보류" };
const DELIVERY_LABELS: Record<string, string> = { unknown: "미확인", delivered: "전달", notDelivered: "미전달" };

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function ttlHours() {
  const parsed = Number.parseInt(process.env.CSV_EXPORT_TTL_HOURS ?? "24", 10);
  return Number.isFinite(parsed) ? Math.min(168, Math.max(1, parsed)) : 24;
}

function seoulDate(value: Timestamp | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(value.toDate());
}

function seoulDateTime(value: Timestamp) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(value.toDate());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
}

function safeCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function quoteCell(value: unknown) {
  const safe = safeCell(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function encodeCsv(rows: readonly CsvRow[]) {
  return Buffer.from(`\uFEFF${rows.map((row) => row.map(quoteCell).join(",")).join("\r\n")}\r\n`, "utf8");
}

function filterRecord(selection: CsvExportSelection) {
  const entries: Array<[string, string]> = [["kind", selection.kind]];
  for (const [key, value] of Object.entries(selection.filter)) {
    if (value !== null && value !== false) entries.push([key, String(value)]);
  }
  return Object.fromEntries(entries);
}

function selectionSummary(selection: CsvExportSelection, names: { zones: Map<string, string>; employees: Map<string, string>; tags: Map<string, string> }) {
  const filter = selection.filter;
  const labels = [
    selection.kind === "assignments" ? "월별 배정" : "방문 이력",
    filter.cycleId ? filter.cycleId.replace("-", "년 ") + "월" : "전체 기간",
    selection.scope === "own" ? "내 담당" : selection.scope === "team" ? "팀 전체" : "관리 범위",
  ];
  if (filter.zoneId) labels.push(names.zones.get(filter.zoneId) ?? filter.zoneId);
  if (filter.assigneeId) labels.push(names.employees.get(filter.assigneeId) ?? filter.assigneeId);
  if (filter.district) labels.push(DISTRICT_LABELS[filter.district]);
  if (filter.schoolType) labels.push(SCHOOL_TYPE_LABELS[filter.schoolType]);
  if (filter.monthlyStatus) labels.push(MONTHLY_STATUS_LABELS[filter.monthlyStatus]);
  if (filter.interestScore !== null) labels.push(`관심도 ${filter.interestScore}`);
  if (filter.followUpOnly) labels.push("후속 필요");
  if (filter.tagId) labels.push(names.tags.get(filter.tagId) ?? filter.tagId);
  if (filter.visitedFrom || filter.visitedTo) labels.push(`${filter.visitedFrom ?? "처음"}~${filter.visitedTo ?? "오늘"}`);
  return labels;
}

async function getAllChunked(db: Firestore, paths: readonly string[]) {
  const snapshots = [];
  for (let offset = 0; offset < paths.length; offset += 100) {
    const refs = paths.slice(offset, offset + 100).map((path) => db.doc(path));
    if (refs.length > 0) snapshots.push(...await db.getAll(...refs));
  }
  return snapshots;
}

function assertScope(selection: CsvExportSelection, actor: CsvExportActor) {
  const isAdmin = actor.roleScopes.includes("admin");
  if (selection.scope === "admin" && !isAdmin) throw new CsvExportPermissionError("관리 범위 내보내기 권한이 없습니다.");
  if (selection.scope === "team" && !(actor.canExportTeam || isAdmin)) throw new CsvExportPermissionError("팀 CSV 내보내기 권한이 없습니다.");
  if (selection.filter.assigneeId && selection.scope === "own" && selection.filter.assigneeId !== actor.employeeId) {
    throw new CsvExportPermissionError("내 담당 범위에서 다른 담당자를 선택할 수 없습니다.");
  }
}

export class CsvExportService {
  constructor(private readonly db: Firestore = getAdminFirestore(), private readonly bucket: ExportBucket = getAdminPhotoBucket()) {}

  async options(actor: CsvExportActor) {
    const [settings, cycles, zones, employees, communicationTags, activityTags] = await Promise.all([
      this.db.doc("appSettings/public").get(),
      this.db.collection("salesCycles").limit(60).get(),
      this.db.collection("zones").limit(100).get(),
      this.db.collection("employeeDirectory").limit(500).get(),
      this.db.collection("communicationTags").limit(500).get(),
      this.db.collection("activityTags").limit(500).get(),
    ]);
    if (!settings.exists || typeof settings.get("currentSalesCycleId") !== "string") throw new CsvExportNotFoundError("현재 영업 월을 찾을 수 없습니다.");
    return {
      currentCycleId: settings.get("currentSalesCycleId") as string,
      teamExportAllowed: actor.canExportTeam || actor.roleScopes.includes("admin"),
      cycles: cycles.docs.map((item) => cycleSchema.parse(item.data())).sort((a, b) => b.cycleId.localeCompare(a.cycleId)).map(({ cycleId, year, month, status }) => ({ cycleId, label: `${year}년 ${month}월`, status })),
      zones: zones.docs.map((item) => zoneSchema.parse(item.data())).filter((item) => item.active).sort((a, b) => a.displayOrder - b.displayOrder).map(({ zoneId, name }) => ({ zoneId, name })),
      employees: employees.docs.map((item) => directorySchema.parse(item.data())).filter((item) => item.active).sort((a, b) => a.displayOrder - b.displayOrder).map(({ employeeId, displayName }) => ({ employeeId, displayName })),
      communicationTags: communicationTags.docs.map((item) => tagSchema.parse(item.data())).filter((item) => item.active).sort((a, b) => a.displayOrder - b.displayOrder).map(({ tagId, label }) => ({ tagId, label })),
      activityTags: activityTags.docs.map((item) => tagSchema.parse(item.data())).filter((item) => item.active).sort((a, b) => a.displayOrder - b.displayOrder).map(({ tagId, label }) => ({ tagId, label })),
    };
  }

  async preview(selection: CsvExportSelection, actor: CsvExportActor) {
    assertScope(selection, actor);
    const dataset = await this.buildDataset(selection, actor);
    return { rowCount: dataset.rows.length - 1, filterSummary: dataset.summary, teamExportAllowed: actor.canExportTeam || actor.roleScopes.includes("admin") };
  }

  async generate(input: ExportCsvInput, actor: CsvExportActor, now = new Date()) {
    assertScope(input, actor);
    const inputFingerprint = hash({ ...input, actorUid: actor.uid });
    const lockRef = this.db.doc(`requestLocks/csv-export-${input.requestId}`);
    const existingLock = await lockRef.get();
    if (existingLock.exists) {
      const lock = requestLockSchema.parse(existingLock.data());
      if (lock.actorUid !== actor.uid || lock.fingerprint !== inputFingerprint) throw new CsvExportRequestCollisionError();
      return { ...lock.result, replayed: true };
    }

    const dataset = await this.buildDataset(input, actor);
    const rowCount = dataset.rows.length - 1;
    const file = encodeCsv(dataset.rows);
    if (file.length > MAX_EXPORT_BYTES) throw new CsvExportTooLargeError("CSV 파일 크기가 제한을 초과했습니다.");

    const jobId = `csv-${input.requestId}`;
    const period = input.filter.cycleId ?? "all";
    const asciiFileName = `${input.kind}-${period}.csv`;
    const fileName = `급식길_${input.kind === "assignments" ? "월별배정" : "방문이력"}_${period}.csv`;
    const storagePath = `exports/${actor.employeeId}/${jobId}/${asciiFileName}`;
    const createdAt = Timestamp.fromDate(now);
    const expiresAt = Timestamp.fromMillis(now.getTime() + ttlHours() * 60 * 60 * 1_000);
    await this.bucket.file(storagePath).save(file, {
      resumable: false,
      metadata: {
        contentType: "text/csv; charset=utf-8",
        cacheControl: "private,no-store,max-age=0",
        contentDisposition: `attachment; filename="${asciiFileName}"`,
        metadata: { ownerEmployeeId: actor.employeeId, jobId, expiresAt: expiresAt.toDate().toISOString(), phase: "12" },
      },
    });

    const baseResult = resultSchema.omit({ replayed: true }).parse({ jobId, fileName, rowCount, expiresAt: expiresAt.toDate().toISOString() });
    const jobRef = this.db.doc(`exportJobs/${jobId}`);
    const auditRef = this.db.doc(`auditLogs/${randomUUID()}`);
    const transactionResult = await this.db.runTransaction(async (transaction) => {
      const freshLock = await transaction.get(lockRef);
      if (freshLock.exists) {
        const lock = requestLockSchema.parse(freshLock.data());
        if (lock.actorUid !== actor.uid || lock.fingerprint !== inputFingerprint) throw new CsvExportRequestCollisionError();
        return { ...lock.result, replayed: true };
      }
      transaction.create(jobRef, {
        jobId, requestedBy: actor.employeeId, cycleId: input.filter.cycleId, scope: input.scope, filter: filterRecord(input), rowCount,
        status: "completed", storagePath, expiresAt, createdAt, completedAt: createdAt, fileName,
      });
      transaction.create(lockRef, { operation: "exportCsv", actorUid: actor.uid, fingerprint: inputFingerprint, result: baseResult, createdAt });
      transaction.create(auditRef, {
        logId: auditRef.id, eventType: "CSV_EXPORTED", actorUid: actor.uid, actorEmployeeId: actor.employeeId,
        targetType: "exportJob", targetId: jobId, schoolId: null, cycleId: input.filter.cycleId,
        changedFields: ["status", "rowCount", "storagePath", "expiresAt"], requestId: input.requestId, appVersion: input.appVersion,
        exportedBy: actor.employeeId, exportedAt: createdAt, scope: input.scope, rowCount, filter: filterRecord(input), createdAt,
      });
      return { ...baseResult, replayed: false };
    });
    return transactionResult;
  }

  async download(jobId: string, actor: CsvExportActor, now = new Date()) {
    const snapshot = await this.db.doc(`exportJobs/${jobId}`).get();
    if (!snapshot.exists) throw new CsvExportNotFoundError();
    const job = exportJobSchema.parse(snapshot.data());
    const isAdmin = actor.roleScopes.includes("admin");
    if (job.requestedBy !== actor.employeeId && !isAdmin) throw new CsvExportPermissionError("다른 직원의 CSV는 열 수 없습니다.");
    if (job.status !== "completed" || !job.storagePath || !job.expiresAt) throw new CsvExportNotFoundError();
    if (job.expiresAt.toMillis() <= now.getTime()) throw new CsvExportExpiredError();
    const [buffer] = await this.bucket.file(job.storagePath).download();
    if (buffer.length > MAX_EXPORT_BYTES) throw new CsvExportTooLargeError();
    return { jobId, fileName: job.fileName ?? job.storagePath.split("/").at(-1) ?? "onnuriway.csv", contentType: "text/csv; charset=utf-8", fileBase64: buffer.toString("base64") };
  }

  async expireCompleted(now = new Date(), batchSize = 100) {
    const expiredAt = Timestamp.fromDate(now);
    const snapshots = await this.db.collection("exportJobs").where("expiresAt", "<=", expiredAt).limit(Math.min(400, Math.max(1, batchSize))).get();
    const expired = snapshots.docs.map((snapshot) => ({ ref: snapshot.ref, job: exportJobSchema.parse(snapshot.data()) }))
      .filter(({ job }) => job.status === "completed" && job.storagePath !== null);
    await Promise.all(expired.map(({ job }) => this.bucket.file(job.storagePath as string).delete({ ignoreNotFound: true })));
    const batch = this.db.batch();
    for (const { ref } of expired) batch.update(ref, { status: "expired", storagePath: null });
    if (expired.length > 0) await batch.commit();
    return { expiredCount: expired.length };
  }

  private async buildDataset(selection: CsvExportSelection, actor: CsvExportActor) {
    const definitionsPromise = Promise.all([
      this.db.collection("zones").limit(100).get(), this.db.collection("employeeDirectory").limit(500).get(),
      this.db.collection("communicationTags").limit(500).get(), this.db.collection("activityTags").limit(500).get(), this.db.collection("products").limit(500).get(),
    ]);
    const source = selection.kind === "assignments"
      ? await this.db.collection(`salesCycles/${selection.filter.cycleId}/assignments`).limit(MAX_EXPORT_ROWS + 1).get()
      : selection.filter.cycleId
        ? await this.db.collection("salesVisits").where("cycleId", "==", selection.filter.cycleId).orderBy("visitedAt", "desc").limit(MAX_EXPORT_ROWS + 1).get()
        : await this.db.collection("salesVisits").orderBy("visitedAt", "desc").limit(MAX_EXPORT_ROWS + 1).get();
    if (source.size > MAX_EXPORT_ROWS) throw new CsvExportTooLargeError("내보낼 행이 5,000건을 초과했습니다. 기간이나 필터를 좁혀주세요.");

    const sourceItems = selection.kind === "assignments"
      ? source.docs.map((item) => assignmentSchema.parse(item.data()))
      : source.docs.map((item) => visitSchema.parse(item.data())).filter((item) => !item.deleted);
    const schoolIds = [...new Set(sourceItems.map((item) => item.schoolId))];
    const [schoolSnapshots, profileSnapshots, definitions] = await Promise.all([
      getAllChunked(this.db, schoolIds.map((id) => `schools/${id}`)),
      selection.kind === "assignments" ? getAllChunked(this.db, schoolIds.map((id) => `salesProfiles/${id}`)) : Promise.resolve([]),
      definitionsPromise,
    ]);
    const schools = new Map(schoolSnapshots.filter((item) => item.exists).map((item) => { const value = schoolSchema.parse(item.data()); return [value.schoolId, value] as const; }));
    const profiles = new Map(profileSnapshots.filter((item) => item.exists).map((item) => { const value = profileSchema.parse(item.data()); return [value.schoolId, value] as const; }));
    const [zoneSnapshots, employeeSnapshots, communicationTagSnapshots, activityTagSnapshots, productSnapshots] = definitions;
    const zones = new Map(zoneSnapshots.docs.map((item) => { const value = zoneSchema.parse(item.data()); return [value.zoneId, value.name] as const; }));
    const employees = new Map(employeeSnapshots.docs.map((item) => { const value = directorySchema.parse(item.data()); return [value.employeeId, value.displayName] as const; }));
    const communicationTags = new Map(communicationTagSnapshots.docs.map((item) => { const value = tagSchema.parse(item.data()); return [value.tagId, value.label] as const; }));
    const activityTags = new Map(activityTagSnapshots.docs.map((item) => { const value = tagSchema.parse(item.data()); return [value.tagId, value.label] as const; }));
    const products = new Map(productSnapshots.docs.map((item) => { const value = productSchema.parse(item.data()); return [value.productId, value.shortName ?? value.name] as const; }));
    const tags = selection.kind === "assignments" ? communicationTags : activityTags;
    const names = { zones, employees, tags };

    if (selection.kind === "assignments") {
      const assignments = sourceItems as Assignment[];
      const filtered = assignments.filter((assignment) => this.matchesAssignment(assignment, schools.get(assignment.schoolId), profiles.get(assignment.schoolId), selection.filter, selection.scope, actor));
      const header = ["월", "학교명", "학교코드", "행정구", "학교급", "구역", "주 담당자", "공동 담당자", "방문 상태", "최근 방문일", "홍보지", "샘플", "관심도", "후속 여부", "후속일", "다음 행동", "커뮤니케이션 태그", "수정시각"];
      const rows = filtered.sort((a, b) => (schools.get(a.schoolId)?.name ?? a.schoolId).localeCompare(schools.get(b.schoolId)?.name ?? b.schoolId, "ko")).map((assignment) => {
        const school = schools.get(assignment.schoolId); const profile = profiles.get(assignment.schoolId);
        return [assignment.cycleId, school?.name ?? assignment.schoolId, school?.source.schoolCode ?? "", school ? DISTRICT_LABELS[school.district] : "", school ? SCHOOL_TYPE_LABELS[school.schoolType] : "", assignment.zoneId ? zones.get(assignment.zoneId) ?? assignment.zoneId : "", employees.get(assignment.primaryAssigneeId) ?? assignment.primaryAssigneeId, assignment.assigneeIds.filter((id) => id !== assignment.primaryAssigneeId).map((id) => employees.get(id) ?? id).join(" · "), MONTHLY_STATUS_LABELS[assignment.monthlyStatus], seoulDate(assignment.latestVisitedAt), DELIVERY_LABELS[assignment.brochureStatus] ?? assignment.brochureStatus, DELIVERY_LABELS[assignment.sampleStatus] ?? assignment.sampleStatus, profile?.interestEvaluated ? profile.interestScore : "미평가", profile?.followUp.required ? "필요" : "없음", profile?.followUp.dueDate ?? "", profile?.nextAction.summary ?? "", profile?.communicationTagIds.map((id) => communicationTags.get(id) ?? id).join(" · ") ?? "", seoulDateTime(assignment.updatedAt)];
      });
      return { rows: [header, ...rows], summary: selectionSummary(selection, names) };
    }

    const visits = sourceItems as Visit[];
    const filtered = visits.filter((visit) => this.matchesVisit(visit, schools.get(visit.schoolId), selection.filter, selection.scope, actor));
    const header = ["방문일", "월", "학교명", "학교코드", "행정구", "학교급", "구역", "당시 주 담당자", "실제 방문자", "기록자", "홍보지", "샘플", "샘플 내역", "관심도", "후속 여부", "후속일", "활동 태그", "방문 결과", "수정시각"];
    const rows = filtered.map((visit) => {
      const school = schools.get(visit.schoolId);
      return [seoulDate(visit.visitedAt), visit.cycleId, school?.name ?? visit.schoolId, school?.source.schoolCode ?? "", school ? DISTRICT_LABELS[school.district] : "", school ? SCHOOL_TYPE_LABELS[school.schoolType] : "", visit.assignmentSnapshot.zoneId ? zones.get(visit.assignmentSnapshot.zoneId) ?? visit.assignmentSnapshot.zoneId : "", visit.assignmentSnapshot.primaryAssigneeId ? employees.get(visit.assignmentSnapshot.primaryAssigneeId) ?? visit.assignmentSnapshot.primaryAssigneeId : "", employees.get(visit.visitedBy) ?? visit.visitedBy, employees.get(visit.recordedBy) ?? visit.recordedBy, DELIVERY_LABELS[visit.brochure.status] ?? visit.brochure.status, DELIVERY_LABELS[visit.sample.status] ?? visit.sample.status, visit.sample.items.map((item) => `${products.get(item.productId) ?? item.productId} ${item.quantity}개`).join(" · "), visit.interest.score, visit.followUp.required ? "필요" : "없음", visit.followUp.dueDate ?? "", visit.activityTagIds.map((id) => activityTags.get(id) ?? id).join(" · "), visit.summary, seoulDateTime(visit.updatedAt)];
    });
    return { rows: [header, ...rows], summary: selectionSummary(selection, names) };
  }

  private matchesAssignment(assignment: Assignment, school: School | undefined, profile: Profile | undefined, filter: CsvExportFilter, scope: CsvExportSelection["scope"], actor: CsvExportActor) {
    if (scope === "own" && !assignment.assigneeIds.includes(actor.employeeId)) return false;
    if (filter.zoneId && assignment.zoneId !== filter.zoneId) return false;
    if (filter.assigneeId && !assignment.assigneeIds.includes(filter.assigneeId)) return false;
    if (filter.district && school?.district !== filter.district) return false;
    if (filter.schoolType && school?.schoolType !== filter.schoolType) return false;
    if (filter.monthlyStatus && assignment.monthlyStatus !== filter.monthlyStatus) return false;
    if (filter.interestScore !== null && profile?.interestScore !== filter.interestScore) return false;
    if (filter.followUpOnly && !profile?.followUp.required) return false;
    if (filter.tagId && !profile?.communicationTagIds.includes(filter.tagId)) return false;
    return true;
  }

  private matchesVisit(visit: Visit, school: School | undefined, filter: CsvExportFilter, scope: CsvExportSelection["scope"], actor: CsvExportActor) {
    if (scope === "own" && !visit.assignmentSnapshot.assigneeIds.includes(actor.employeeId)) return false;
    if (filter.zoneId && visit.assignmentSnapshot.zoneId !== filter.zoneId) return false;
    if (filter.assigneeId && !visit.assignmentSnapshot.assigneeIds.includes(filter.assigneeId)) return false;
    if (filter.district && school?.district !== filter.district) return false;
    if (filter.schoolType && school?.schoolType !== filter.schoolType) return false;
    if (filter.interestScore !== null && visit.interest.score !== filter.interestScore) return false;
    if (filter.followUpOnly && !visit.followUp.required) return false;
    if (filter.tagId && !visit.activityTagIds.includes(filter.tagId)) return false;
    const date = seoulDate(visit.visitedAt);
    if (filter.visitedFrom && date < filter.visitedFrom) return false;
    if (filter.visitedTo && date > filter.visitedTo) return false;
    return true;
  }
}

export async function loadCsvExportActor(db: Firestore, uid: string, employeeId: string, roleScopes: readonly string[]) {
  const snapshot = await db.doc(`employees/${employeeId}`).get();
  if (!snapshot.exists) throw new CsvExportPermissionError();
  const employee = employeeSchema.parse(snapshot.data());
  if (employee.status !== "active" || employee.employeeId !== employeeId) throw new CsvExportPermissionError();
  return { uid, employeeId, roleScopes, canExportTeam: employee.permissions.exportTeam } satisfies CsvExportActor;
}
