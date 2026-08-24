import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { getAdminFirestore } from "../shared/firebase-admin.js";
import type { ImportedSchool } from "./school-mapper.js";
import type {
  InitialSchoolImportPlan,
  InitialSchoolImportRepository,
} from "./initial-import-service.js";

const MAX_INITIAL_IMPORT_SCHOOLS = 498;
const INITIAL_IMPORT_MARKER_PATH = "secureSettings/neisInitialImport";

export class InitialImportConflictError extends Error {
  constructor(message = "Initial school import requires an empty school collection.") {
    super(message);
    this.name = "InitialImportConflictError";
  }
}

function serializeSchool(school: ImportedSchool) {
  return {
    ...school,
    source: {
      ...school.source,
      syncedAt: Timestamp.fromDate(school.source.syncedAt),
    },
    createdAt: Timestamp.fromDate(school.createdAt),
    updatedAt: Timestamp.fromDate(school.updatedAt),
  };
}

export class SchoolImportRepository implements InitialSchoolImportRepository {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async applyInitialImport(input: {
    runId: string;
    requestedBy: string;
    plan: InitialSchoolImportPlan;
    completedAt: Date;
  }) {
    if (input.plan.schools.length > MAX_INITIAL_IMPORT_SCHOOLS) {
      throw new InitialImportConflictError(
        `Initial import is limited to ${MAX_INITIAL_IMPORT_SCHOOLS} schools for one atomic batch.`,
      );
    }

    const markerRef = this.db.doc(INITIAL_IMPORT_MARKER_PATH);
    const [existingSchools, marker] = await Promise.all([
      this.db.collection("schools").limit(1).get(),
      markerRef.get(),
    ]);
    if (!existingSchools.empty || marker.exists) {
      throw new InitialImportConflictError();
    }

    const timestamp = Timestamp.fromDate(input.completedAt);
    const batch = this.db.batch();
    for (const school of input.plan.schools) {
      batch.create(this.db.doc(`schools/${school.schoolId}`), serializeSchool(school));
    }
    batch.create(this.db.doc(`neisSyncRuns/${input.runId}`), {
      runId: input.runId,
      status: "COMPLETED",
      requestedBy: input.requestedBy,
      sourceCount: input.plan.sourceCount,
      newCount: input.plan.importedCount,
      changedCount: 0,
      missingCount: 0,
      appliedCount: input.plan.importedCount,
      errorCount: 0,
      startedAt: timestamp,
      completedAt: timestamp,
    });
    batch.create(markerRef, {
      runId: input.runId,
      importedCount: input.plan.importedCount,
      completedAt: timestamp,
    });

    await batch.commit();
  }
}
