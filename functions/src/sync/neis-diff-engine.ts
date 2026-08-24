import type { ImportedSchool } from "../neis/school-mapper.js";
import { isTargetSyncSchool, type StoredSchool } from "./school-sync-types.js";

export const NEIS_CHANGE_TYPES = [
  "NEW",
  "NAME_CHANGED",
  "ADDRESS_CHANGED",
  "PHONE_CHANGED",
  "HOMEPAGE_CHANGED",
  "TYPE_CHANGED",
  "MISSING",
] as const;

export type NeisChangeType = (typeof NEIS_CHANGE_TYPES)[number];

export interface NeisSyncChangePlan {
  changeId: string;
  type: NeisChangeType;
  schoolId: string | null;
  schoolCode: string;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  approved: null;
  applied: false;
}

export interface NeisDiffPlan {
  sourceCount: number;
  existingTargetCount: number;
  newCount: number;
  changedCount: number;
  missingCount: number;
  changes: NeisSyncChangePlan[];
  suspicious: boolean;
  suspiciousReasons: string[];
}

const TYPE_ORDER = new Map(NEIS_CHANGE_TYPES.map((type, index) => [type, index]));

function normalizeComparable(value: string | null) {
  return value?.normalize("NFKC").replace(/\s+/gu, " ").trim() || null;
}

function changeId(schoolCode: string, type: NeisChangeType) {
  return `${schoolCode}-${type.toLowerCase().replaceAll("_", "-")}`;
}

function snapshotRevision(school: StoredSchool) {
  return { schoolBaseRevision: school.schoolBaseRevision };
}

function createChange(
  type: NeisChangeType,
  school: StoredSchool,
  oldValue: Record<string, unknown>,
  newValue: Record<string, unknown> | null,
): NeisSyncChangePlan {
  return {
    changeId: changeId(school.source.schoolCode, type),
    type,
    schoolId: school.schoolId,
    schoolCode: school.source.schoolCode,
    oldData: { ...snapshotRevision(school), ...oldValue },
    newData: newValue,
    approved: null,
    applied: false,
  };
}

export function buildNeisDiffPlan(input: {
  currentSchools: readonly StoredSchool[];
  sourceSchools: readonly ImportedSchool[];
  targetEducationOfficeCode: string;
  suspiciousMissingRatio?: number;
}): NeisDiffPlan {
  const suspiciousMissingRatio = input.suspiciousMissingRatio ?? 0.5;
  if (!(suspiciousMissingRatio > 0 && suspiciousMissingRatio <= 1)) {
    throw new Error("Suspicious missing ratio must be greater than 0 and at most 1.");
  }

  const currentTargets = input.currentSchools.filter((school) =>
    isTargetSyncSchool(school, input.targetEducationOfficeCode));
  const currentByCode = new Map(currentTargets.map((school) => [school.source.schoolCode, school]));
  const sourceByCode = new Map<string, ImportedSchool>();
  const changes: NeisSyncChangePlan[] = [];

  for (const source of input.sourceSchools) {
    if (sourceByCode.has(source.source.schoolCode)) {
      throw new Error(`Duplicate source school code: ${source.source.schoolCode}`);
    }
    sourceByCode.set(source.source.schoolCode, source);
    const current = currentByCode.get(source.source.schoolCode);
    if (!current) {
      changes.push({
        changeId: changeId(source.source.schoolCode, "NEW"),
        type: "NEW",
        schoolId: null,
        schoolCode: source.source.schoolCode,
        oldData: null,
        newData: source as unknown as Record<string, unknown>,
        approved: null,
        applied: false,
      });
      continue;
    }

    if (normalizeComparable(current.name) !== normalizeComparable(source.name)) {
      changes.push(createChange("NAME_CHANGED", current, { name: current.name }, { name: source.name }));
    }
    if (
      normalizeComparable(current.address.road) !== normalizeComparable(source.address.road)
      || normalizeComparable(current.address.postalCode) !== normalizeComparable(source.address.postalCode)
      || current.district !== source.district
    ) {
      changes.push(createChange(
        "ADDRESS_CHANGED",
        current,
        { address: current.address, district: current.district },
        { address: source.address, district: source.district },
      ));
    }
    if (normalizeComparable(current.phone) !== normalizeComparable(source.phone)) {
      changes.push(createChange("PHONE_CHANGED", current, { phone: current.phone }, { phone: source.phone }));
    }
    if (normalizeComparable(current.homepage) !== normalizeComparable(source.homepage)) {
      changes.push(createChange("HOMEPAGE_CHANGED", current, { homepage: current.homepage }, { homepage: source.homepage }));
    }
    if (current.schoolType !== source.schoolType) {
      changes.push(createChange("TYPE_CHANGED", current, { schoolType: current.schoolType }, { schoolType: source.schoolType }));
    }
  }

  const currentlyActiveTargets = currentTargets.filter((school) => school.operationalStatus === "active");
  for (const current of currentlyActiveTargets) {
    if (!sourceByCode.has(current.source.schoolCode)) {
      changes.push(createChange(
        "MISSING",
        current,
        { operationalStatus: current.operationalStatus },
        { operationalStatus: "inactiveCandidate" },
      ));
    }
  }

  changes.sort((left, right) =>
    left.schoolCode.localeCompare(right.schoolCode)
    || (TYPE_ORDER.get(left.type) ?? 999) - (TYPE_ORDER.get(right.type) ?? 999));

  const newCount = changes.filter((change) => change.type === "NEW").length;
  const missingCount = changes.filter((change) => change.type === "MISSING").length;
  const changedCount = changes.length - newCount - missingCount;
  const suspiciousReasons: string[] = [];
  if (
    currentlyActiveTargets.length >= 3
    && missingCount / currentlyActiveTargets.length >= suspiciousMissingRatio
  ) {
    suspiciousReasons.push(
      `기존 활성 대상 학교 ${currentlyActiveTargets.length}곳 중 ${missingCount}곳이 누락되었습니다.`,
    );
  }
  if (input.sourceSchools.length === 0) {
    suspiciousReasons.push("동기화 대상 학교가 한 곳도 없습니다.");
  }

  return {
    sourceCount: input.sourceSchools.length,
    existingTargetCount: currentTargets.length,
    newCount,
    changedCount,
    missingCount,
    changes,
    suspicious: suspiciousReasons.length > 0,
    suspiciousReasons,
  };
}

export function isRiskyNeisChange(type: NeisChangeType) {
  return type === "NAME_CHANGED"
    || type === "ADDRESS_CHANGED"
    || type === "TYPE_CHANGED"
    || type === "MISSING";
}
