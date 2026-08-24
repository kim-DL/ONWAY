import { randomUUID } from "node:crypto";

import type { NeisSchoolRow } from "./contract.js";
import type { NeisClient } from "./neis-client.js";
import {
  mapNeisSchool,
  mapNeisSchoolType,
  type ImportedSchool,
} from "./school-mapper.js";

export interface InitialSchoolImportPlan {
  sourceCount: number;
  importedCount: number;
  filteredOutCount: number;
  schools: ImportedSchool[];
}

export interface InitialSchoolImportRepository {
  applyInitialImport: (input: {
    runId: string;
    requestedBy: string;
    plan: InitialSchoolImportPlan;
    completedAt: Date;
  }) => Promise<void>;
}

export interface InitialImportIssue {
  schoolCode: string | null;
  message: string;
}

export class InitialImportValidationError extends Error {
  constructor(readonly issues: InitialImportIssue[]) {
    super(`NEIS initial import validation failed with ${issues.length} issue(s).`);
    this.name = "InitialImportValidationError";
  }
}

export function buildInitialSchoolImportPlan(
  rows: NeisSchoolRow[],
  options: { targetEducationOfficeCode: string; syncedAt: Date },
): InitialSchoolImportPlan {
  if (rows.length === 0) {
    throw new InitialImportValidationError([{ schoolCode: null, message: "NEIS returned no schools." }]);
  }

  const issues: InitialImportIssue[] = [];
  const seenCodes = new Set<string>();
  const schools: ImportedSchool[] = [];
  let filteredOutCount = 0;

  for (const row of rows) {
    if (row.ATPT_OFCDC_SC_CODE !== options.targetEducationOfficeCode) {
      filteredOutCount += 1;
      continue;
    }

    const schoolCode = row.SD_SCHUL_CODE.trim().toUpperCase();
    if (seenCodes.has(schoolCode)) {
      issues.push({ schoolCode, message: "Duplicate school code." });
      continue;
    }
    seenCodes.add(schoolCode);

    if (!mapNeisSchoolType(row.SCHUL_KND_SC_NM)) {
      filteredOutCount += 1;
      continue;
    }

    try {
      schools.push(mapNeisSchool(row, options));
    } catch (error) {
      issues.push({
        schoolCode: schoolCode || null,
        message: error instanceof Error ? error.message : "Unknown mapping error.",
      });
    }
  }

  if (schools.length === 0) {
    issues.push({ schoolCode: null, message: "No target schools remained after filtering." });
  }
  if (issues.length > 0) throw new InitialImportValidationError(issues);

  schools.sort((left, right) => left.schoolId.localeCompare(right.schoolId));
  return {
    sourceCount: rows.length,
    importedCount: schools.length,
    filteredOutCount,
    schools,
  };
}

export class InitialSchoolImportService {
  private readonly now: () => Date;
  private readonly runIdFactory: () => string;

  constructor(private readonly dependencies: {
    client: Pick<NeisClient, "fetchAllSchools">;
    repository: InitialSchoolImportRepository;
    targetEducationOfficeCode: string;
    now?: () => Date;
    runIdFactory?: () => string;
  }) {
    this.now = dependencies.now ?? (() => new Date());
    this.runIdFactory = dependencies.runIdFactory ?? randomUUID;
  }

  async execute(requestedBy: string) {
    const rows = await this.dependencies.client.fetchAllSchools();
    const completedAt = this.now();
    const plan = buildInitialSchoolImportPlan(rows, {
      targetEducationOfficeCode: this.dependencies.targetEducationOfficeCode,
      syncedAt: completedAt,
    });
    const runId = this.runIdFactory();

    await this.dependencies.repository.applyInitialImport({
      runId,
      requestedBy,
      plan,
      completedAt,
    });
    return { runId, ...plan };
  }
}
