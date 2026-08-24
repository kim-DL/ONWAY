import { randomUUID } from "node:crypto";

import { Timestamp, type DocumentData, type Firestore } from "firebase-admin/firestore";

import type { NeisSchoolRow } from "../neis/contract.js";
import { buildInitialSchoolImportPlan, InitialImportValidationError } from "../neis/initial-import-service.js";
import type { NeisClient } from "../neis/neis-client.js";
import type { ImportedSchool } from "../neis/school-mapper.js";
import { normalizeSchoolName } from "../neis/school-mapper.js";
import { CatalogRebuildService } from "./catalog-rebuild-service.js";
import {
  buildNeisDiffPlan,
  isRiskyNeisChange,
  type NeisDiffPlan,
  type NeisSyncChangePlan,
  type NeisChangeType,
} from "./neis-diff-engine.js";
import type { ApplyNeisSchoolSyncInput, PreviewNeisSchoolSyncInput } from "./sync-contract.js";
import type { StoredSchool } from "./school-sync-types.js";

export interface SyncActor {
  uid: string;
  employeeId: string;
}

type SyncRunStatus = "FETCHING" | "NORMALIZING" | "DIFF_READY" | "APPLYING" | "COMPLETED" | "FAILED" | "SUSPICIOUS_RESULT";

interface StoredSyncRun {
  runId: string;
  status: SyncRunStatus;
  requestedBy: string;
  sourceCount: number;
  newCount: number;
  changedCount: number;
  missingCount: number;
  appliedCount: number;
  errorCount: number;
  startedAt: Timestamp;
  completedAt: Timestamp | null;
}

type StoredSyncChange = Omit<NeisSyncChangePlan, "changeId">;

const KOREAN_INITIALS = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;

function getKoreanInitials(value: string) {
  return Array.from(normalizeSchoolName(value), (character) => {
    const point = character.codePointAt(0);
    if (point === undefined || point < 0xac00 || point > 0xd7a3) return character;
    return KOREAN_INITIALS[Math.floor((point - 0xac00) / 588)] ?? character;
  }).join("");
}

function asStoredSchool(document: DocumentData, id: string): StoredSchool {
  if (
    document.schoolId !== id
    || typeof document.name !== "string"
    || typeof document.schoolBaseRevision !== "number"
    || !document.source
    || typeof document.source.schoolCode !== "string"
    || !document.address
    || !document.location
  ) {
    throw new Error(`Stored school contract is invalid: ${id}`);
  }
  return document as StoredSchool;
}

function serializeSourceSchool(school: ImportedSchool): DocumentData {
  return {
    ...school,
    source: { ...school.source, syncedAt: Timestamp.fromDate(school.source.syncedAt) },
    createdAt: Timestamp.fromDate(school.createdAt),
    updatedAt: Timestamp.fromDate(school.updatedAt),
  };
}

function toSourceSchools(rows: NeisSchoolRow[], targetEducationOfficeCode: string, syncedAt: Date) {
  if (rows.length === 0) return [];
  try {
    return buildInitialSchoolImportPlan(rows, { targetEducationOfficeCode, syncedAt }).schools;
  } catch (error) {
    if (
      error instanceof InitialImportValidationError
      && error.issues.length === 1
      && error.issues[0]?.schoolCode === null
      && error.issues[0]?.message === "No target schools remained after filtering."
    ) {
      return [];
    }
    throw error;
  }
}

function auditDocument(input: {
  logId?: string;
  eventType: string;
  actor: SyncActor;
  targetType: string;
  targetId: string | null;
  schoolId?: string | null;
  changedFields?: string[];
  requestId: string | null;
  createdAt: Timestamp;
}) {
  return {
    logId: input.logId ?? randomUUID(),
    eventType: input.eventType,
    actorUid: input.actor.uid,
    actorEmployeeId: input.actor.employeeId,
    targetType: input.targetType,
    targetId: input.targetId,
    schoolId: input.schoolId ?? null,
    cycleId: null,
    changedFields: input.changedFields ?? [],
    requestId: input.requestId,
    appVersion: null,
    createdAt: input.createdAt,
  };
}

function previewResult(run: StoredSyncRun, changes: Array<StoredSyncChange & { changeId: string }>, replayed: boolean) {
  return {
    runId: run.runId,
    status: run.status,
    sourceCount: run.sourceCount,
    newCount: run.newCount,
    changedCount: run.changedCount,
    missingCount: run.missingCount,
    appliedCount: run.appliedCount,
    errorCount: run.errorCount,
    suspiciousReasons: run.status === "SUSPICIOUS_RESULT"
      ? [`기존 대상 학교 대비 누락 비율이 안전 임계값을 초과했습니다.`]
      : [],
    changes,
    replayed,
  };
}

export class NeisSyncConflictError extends Error {}
export class NeisSyncSuspiciousResultError extends Error {}
export class NeisSyncRiskAcknowledgementError extends Error {}
export class NeisSyncRevisionConflictError extends Error {}

export class NeisSyncService {
  private readonly now: () => Date;
  private readonly catalogService: Pick<CatalogRebuildService, "publish">;

  constructor(private readonly dependencies: {
    db: Firestore;
    client: Pick<NeisClient, "fetchAllSchools">;
    targetEducationOfficeCode: string;
    suspiciousMissingRatio?: number;
    now?: () => Date;
    catalogService?: Pick<CatalogRebuildService, "publish">;
  }) {
    this.now = dependencies.now ?? (() => new Date());
    this.catalogService = dependencies.catalogService ?? new CatalogRebuildService(dependencies.db);
  }

  private async loadPreview(runId: string, replayed: boolean) {
    const [runSnapshot, changesSnapshot] = await Promise.all([
      this.dependencies.db.doc(`neisSyncRuns/${runId}`).get(),
      this.dependencies.db.collection(`neisSyncRuns/${runId}/changes`).get(),
    ]);
    if (!runSnapshot.exists) throw new NeisSyncConflictError("NEIS preview does not exist.");
    const run = runSnapshot.data() as StoredSyncRun;
    const changes = changesSnapshot.docs
      .map((document) => ({ changeId: document.id, ...(document.data() as StoredSyncChange) }))
      .sort((left, right) => left.changeId.localeCompare(right.changeId));
    return previewResult(run, changes, replayed);
  }

  private async startPreview(runId: string, actor: SyncActor, startedAt: Timestamp) {
    return this.dependencies.db.runTransaction(async (transaction) => {
      const runRef = this.dependencies.db.doc(`neisSyncRuns/${runId}`);
      const existing = await transaction.get(runRef);
      if (existing.exists) {
        const run = existing.data() as StoredSyncRun;
        if (run.requestedBy !== actor.employeeId) {
          throw new NeisSyncConflictError("This request identifier belongs to another administrator.");
        }
        return false;
      }
      const run: StoredSyncRun = {
        runId,
        status: "FETCHING",
        requestedBy: actor.employeeId,
        sourceCount: 0,
        newCount: 0,
        changedCount: 0,
        missingCount: 0,
        appliedCount: 0,
        errorCount: 0,
        startedAt,
        completedAt: null,
      };
      const audit = auditDocument({
        eventType: "NEIS_SYNC_STARTED",
        actor,
        targetType: "neisSyncRun",
        targetId: runId,
        requestId: runId,
        createdAt: startedAt,
      });
      transaction.create(runRef, run);
      transaction.create(this.dependencies.db.doc(`auditLogs/${audit.logId}`), audit);
      return true;
    });
  }

  private async failPreview(runId: string, actor: SyncActor, error: unknown) {
    const failedAt = Timestamp.fromDate(this.now());
    const audit = auditDocument({
      eventType: "NEIS_SYNC_FAILED",
      actor,
      targetType: "neisSyncRun",
      targetId: runId,
      changedFields: [error instanceof Error ? error.name : "UnknownError"],
      requestId: runId,
      createdAt: failedAt,
    });
    await this.dependencies.db.runTransaction(async (transaction) => {
      transaction.update(this.dependencies.db.doc(`neisSyncRuns/${runId}`), {
        status: "FAILED",
        errorCount: 1,
        completedAt: failedAt,
      });
      transaction.create(this.dependencies.db.doc(`auditLogs/${audit.logId}`), audit);
    });
  }

  private async persistDiff(runId: string, plan: NeisDiffPlan) {
    for (let offset = 0; offset < plan.changes.length; offset += 400) {
      const batch = this.dependencies.db.batch();
      for (const change of plan.changes.slice(offset, offset + 400)) {
        const { changeId, ...stored } = change;
        const data = change.type === "NEW" && change.newData
          ? { ...stored, newData: serializeSourceSchool(change.newData as unknown as ImportedSchool) }
          : stored;
        batch.set(this.dependencies.db.doc(`neisSyncRuns/${runId}/changes/${changeId}`), data);
      }
      await batch.commit();
    }
    await this.dependencies.db.doc(`neisSyncRuns/${runId}`).update({
      status: plan.suspicious ? "SUSPICIOUS_RESULT" : "DIFF_READY",
      sourceCount: plan.sourceCount,
      newCount: plan.newCount,
      changedCount: plan.changedCount,
      missingCount: plan.missingCount,
    });
  }

  async preview(input: PreviewNeisSchoolSyncInput, actor: SyncActor) {
    const startedAt = Timestamp.fromDate(this.now());
    const created = await this.startPreview(input.requestId, actor, startedAt);
    if (!created) return this.loadPreview(input.requestId, true);

    try {
      const rows = await this.dependencies.client.fetchAllSchools();
      await this.dependencies.db.doc(`neisSyncRuns/${input.requestId}`).update({ status: "NORMALIZING" });
      const syncedAt = this.now();
      const sourceSchools = toSourceSchools(
        rows,
        this.dependencies.targetEducationOfficeCode,
        syncedAt,
      );
      const currentSnapshot = await this.dependencies.db.collection("schools").get();
      const currentSchools = currentSnapshot.docs.map((document) =>
        asStoredSchool(document.data(), document.id));
      const plan = buildNeisDiffPlan({
        currentSchools,
        sourceSchools,
        targetEducationOfficeCode: this.dependencies.targetEducationOfficeCode,
        ...(this.dependencies.suspiciousMissingRatio === undefined
          ? {}
          : { suspiciousMissingRatio: this.dependencies.suspiciousMissingRatio }),
      });
      await this.persistDiff(input.requestId, plan);
      return this.loadPreview(input.requestId, false);
    } catch (error) {
      await this.failPreview(input.requestId, actor, error);
      throw error;
    }
  }

  private applyExistingChanges(
    school: StoredSchool,
    changes: Array<StoredSyncChange & { changeId: string }>,
    appliedAt: Timestamp,
  ): StoredSchool {
    const next: StoredSchool = {
      ...school,
      source: { ...school.source, syncedAt: appliedAt },
      address: { ...school.address },
      location: { ...school.location },
      aliases: [...school.aliases],
      schoolBaseRevision: school.schoolBaseRevision + 1,
      updatedAt: appliedAt,
    };
    for (const change of changes) {
      const expectedRevision = change.oldData?.schoolBaseRevision;
      if (expectedRevision !== school.schoolBaseRevision) {
        throw new NeisSyncRevisionConflictError(
          `School ${school.schoolId} changed after the preview was created.`,
        );
      }
      switch (change.type) {
        case "NAME_CHANGED": {
          const name = change.newData?.name;
          if (typeof name !== "string") throw new Error("Staged school name is invalid.");
          if (!next.aliases.includes(school.name)) next.aliases = [...next.aliases, school.name].slice(-50);
          next.name = name;
          next.shortName = null;
          next.normalizedName = normalizeSchoolName(name);
          next.initials = getKoreanInitials(name);
          break;
        }
        case "ADDRESS_CHANGED": {
          const address = change.newData?.address;
          const district = change.newData?.district;
          if (!address || typeof address !== "object" || typeof district !== "string") {
            throw new Error("Staged school address is invalid.");
          }
          next.address = address as StoredSchool["address"];
          next.district = district as StoredSchool["district"];
          next.possibleRelocation = true;
          break;
        }
        case "PHONE_CHANGED":
          next.phone = typeof change.newData?.phone === "string" ? change.newData.phone : null;
          break;
        case "HOMEPAGE_CHANGED":
          next.homepage = typeof change.newData?.homepage === "string" ? change.newData.homepage : null;
          break;
        case "TYPE_CHANGED":
          if (typeof change.newData?.schoolType !== "string") throw new Error("Staged school type is invalid.");
          next.schoolType = change.newData.schoolType as StoredSchool["schoolType"];
          break;
        case "MISSING":
          next.operationalStatus = "inactiveCandidate";
          break;
        case "NEW":
          throw new Error("A NEW change cannot update an existing school.");
      }
    }
    return next;
  }

  private eventForChange(type: NeisChangeType) {
    switch (type) {
      case "NEW": return "SCHOOL_CREATED_FROM_NEIS";
      case "NAME_CHANGED": return "SCHOOL_NAME_CHANGED";
      case "ADDRESS_CHANGED": return "SCHOOL_ADDRESS_CHANGED";
      case "MISSING": return "SCHOOL_MARKED_INACTIVE";
      default: return "SCHOOL_BASE_INFO_CHANGED";
    }
  }

  private changedFields(type: NeisChangeType) {
    switch (type) {
      case "NEW": return ["school"];
      case "NAME_CHANGED": return ["name", "normalizedName", "initials", "aliases"];
      case "ADDRESS_CHANGED": return ["address", "district", "possibleRelocation"];
      case "PHONE_CHANGED": return ["phone"];
      case "HOMEPAGE_CHANGED": return ["homepage"];
      case "TYPE_CHANGED": return ["schoolType"];
      case "MISSING": return ["operationalStatus"];
    }
  }

  private async applySchoolGroup(
    runId: string,
    requestId: string,
    actor: SyncActor,
    changes: Array<StoredSyncChange & { changeId: string }>,
  ) {
    const appliedAt = Timestamp.fromDate(this.now());
    await this.dependencies.db.runTransaction(async (transaction) => {
      const first = changes[0];
      if (!first) return;
      const schoolId = first.schoolId ?? `SCH-NEIS-${first.schoolCode}`;
      const schoolRef = this.dependencies.db.doc(`schools/${schoolId}`);
      const schoolSnapshot = await transaction.get(schoolRef);
      if (first.type === "NEW") {
        if (schoolSnapshot.exists) throw new NeisSyncRevisionConflictError(`School ${schoolId} already exists.`);
        if (!first.newData) throw new Error("Staged new school is missing.");
        transaction.create(schoolRef, {
          ...first.newData,
          schoolId,
          createdAt: appliedAt,
          updatedAt: appliedAt,
          source: { ...(first.newData.source as object), syncedAt: appliedAt },
        });
      } else {
        if (!schoolSnapshot.exists) throw new NeisSyncRevisionConflictError(`School ${schoolId} no longer exists.`);
        const current = asStoredSchool(schoolSnapshot.data()!, schoolSnapshot.id);
        transaction.set(schoolRef, this.applyExistingChanges(current, changes, appliedAt));
      }

      for (const change of changes) {
        const changeRef = this.dependencies.db.doc(`neisSyncRuns/${runId}/changes/${change.changeId}`);
        transaction.update(changeRef, { approved: true, applied: true });
        const audit = auditDocument({
          eventType: this.eventForChange(change.type),
          actor,
          targetType: "school",
          targetId: schoolId,
          schoolId,
          changedFields: this.changedFields(change.type),
          requestId,
          createdAt: appliedAt,
        });
        transaction.create(this.dependencies.db.doc(`auditLogs/${audit.logId}`), audit);
      }
    });
  }

  async apply(input: ApplyNeisSchoolSyncInput, actor: SyncActor) {
    const preview = await this.loadPreview(input.runId, false);
    if (preview.status === "SUSPICIOUS_RESULT") {
      throw new NeisSyncSuspiciousResultError("Suspicious NEIS results cannot be applied.");
    }
    if (preview.status === "COMPLETED") {
      return { runId: input.runId, status: "COMPLETED" as const, appliedCount: preview.appliedCount, replayed: true };
    }
    if (preview.status !== "DIFF_READY" && preview.status !== "FAILED") {
      throw new NeisSyncConflictError(`NEIS run cannot be applied from ${preview.status}.`);
    }
    const allPending = preview.changes.filter((change) => !change.applied);
    const approvedIds = input.approvedChangeIds ? new Set(input.approvedChangeIds) : null;
    if (approvedIds && input.approvedChangeIds?.some((changeId) =>
      !allPending.some((change) => change.changeId === changeId))) {
      throw new NeisSyncConflictError("Selected NEIS changes are no longer pending.");
    }
    const pending = approvedIds
      ? allPending.filter((change) => approvedIds.has(change.changeId))
      : allPending;
    if (!input.confirmRiskyChanges && pending.some((change) => isRiskyNeisChange(change.type))) {
      throw new NeisSyncRiskAcknowledgementError("Risky NEIS changes require explicit acknowledgement.");
    }

    await this.dependencies.db.runTransaction(async (transaction) => {
      const runRef = this.dependencies.db.doc(`neisSyncRuns/${input.runId}`);
      const snapshot = await transaction.get(runRef);
      const current = snapshot.data() as StoredSyncRun | undefined;
      if (!current || (current.status !== "DIFF_READY" && current.status !== "FAILED")) {
        throw new NeisSyncConflictError("Another apply is already in progress.");
      }
      transaction.update(runRef, { status: "APPLYING", completedAt: null });
    });

    try {
      const groups = new Map<string, Array<StoredSyncChange & { changeId: string }>>();
      for (const change of pending) {
        const key = change.schoolId ?? `SCH-NEIS-${change.schoolCode}`;
        groups.set(key, [...(groups.get(key) ?? []), change]);
      }
      for (const changes of groups.values()) {
        await this.applySchoolGroup(input.runId, input.requestId, actor, changes);
      }
      const excluded = allPending.filter((change) => !pending.includes(change));
      for (let offset = 0; offset < excluded.length; offset += 400) {
        const batch = this.dependencies.db.batch();
        for (const change of excluded.slice(offset, offset + 400)) {
          batch.update(
            this.dependencies.db.doc(`neisSyncRuns/${input.runId}/changes/${change.changeId}`),
            { approved: false, applied: false },
          );
        }
        await batch.commit();
      }
      const catalogRelevant = pending.some((change) =>
        change.type === "NEW"
        || change.type === "NAME_CHANGED"
        || change.type === "ADDRESS_CHANGED"
        || change.type === "TYPE_CHANGED"
        || change.type === "MISSING");
      const catalog = catalogRelevant ? await this.catalogService.publish(this.now()) : null;
      const completedAt = Timestamp.fromDate(this.now());
      const audit = auditDocument({
        logId: `neis-completed-${input.requestId}`,
        eventType: "NEIS_SYNC_COMPLETED",
        actor,
        targetType: "neisSyncRun",
        targetId: input.runId,
        changedFields: [
          ...(pending.length > 0 ? ["schools"] : []),
          ...(catalog ? ["commonSearchCatalog"] : []),
        ],
        requestId: input.requestId,
        createdAt: completedAt,
      });
      await this.dependencies.db.runTransaction(async (transaction) => {
        transaction.update(this.dependencies.db.doc(`neisSyncRuns/${input.runId}`), {
          status: "COMPLETED",
          appliedCount: pending.length,
          errorCount: 0,
          completedAt,
        });
        transaction.create(this.dependencies.db.doc(`auditLogs/${audit.logId}`), audit);
      });
      return {
        runId: input.runId,
        status: "COMPLETED" as const,
        appliedCount: pending.length,
        catalog,
        replayed: false,
      };
    } catch (error) {
      const failedAt = Timestamp.fromDate(this.now());
      await this.dependencies.db.doc(`neisSyncRuns/${input.runId}`).update({
        status: "FAILED",
        errorCount: 1,
        completedAt: failedAt,
      });
      throw error;
    }
  }
}
