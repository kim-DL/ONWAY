import { deleteApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { neisSchoolRowSchema } from "../src/neis/contract";
import { buildInitialSchoolImportPlan, InitialSchoolImportService } from "../src/neis/initial-import-service";
import { InitialImportConflictError, SchoolImportRepository } from "../src/neis/school-import-repository";

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const syncedAt = new Date("2026-08-23T12:00:00.000Z");

function rows() {
  return [
    ["G100300001", "대전새길초등학교", "초등학교", "대전광역시 동구 새길로 1"],
    ["G100300002", "대전새길중학교", "중학교", "대전광역시 중구 새길로 2"],
    ["G100300003", "대전새길고등학교", "고등학교", "대전광역시 서구 새길로 3"],
  ].map(([schoolCode, name, kind, road]) => neisSchoolRowSchema.parse({
    ATPT_OFCDC_SC_CODE: "G10",
    SD_SCHUL_CODE: schoolCode,
    SCHUL_NM: name,
    SCHUL_KND_SC_NM: kind,
    ORG_RDNMA: road,
    ORG_RDNDA: "",
  }));
}

async function clearCollection(db: Firestore, collectionName: string) {
  const snapshot = await db.collection(collectionName).get();
  if (snapshot.empty) return;
  const batch = db.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
}

describe.skipIf(!emulatorAvailable)("NEIS initial import Firestore boundary", () => {
  let app: App;
  let db: Firestore;

  beforeAll(() => {
    process.env.GCLOUD_PROJECT = "demo-onnuriway";
    app = getApps()[0] ?? initializeApp({ projectId: "demo-onnuriway" });
    db = getFirestore(app);
  });

  beforeEach(async () => {
    await Promise.all([
      clearCollection(db, "schools"),
      clearCollection(db, "neisSyncRuns"),
      clearCollection(db, "secureSettings"),
    ]);
  });

  afterAll(async () => {
    if (app) await deleteApp(app);
  });

  it("atomically creates validated schools, the sync run, and the one-time marker", async () => {
    const plan = buildInitialSchoolImportPlan(rows(), {
      targetEducationOfficeCode: "G10",
      syncedAt,
    });
    const repository = new SchoolImportRepository(db);

    await repository.applyInitialImport({
      runId: "RUN-EMULATOR-001",
      requestedBy: "SYSTEM-TEST",
      plan,
      completedAt: syncedAt,
    });

    const [schools, run, marker] = await Promise.all([
      db.collection("schools").get(),
      db.doc("neisSyncRuns/RUN-EMULATOR-001").get(),
      db.doc("secureSettings/neisInitialImport").get(),
    ]);
    expect(schools.size).toBe(3);
    expect(new Set(schools.docs.map((document) => document.data().source.schoolCode)).size).toBe(3);
    expect(run.data()).toMatchObject({ status: "COMPLETED", sourceCount: 3, appliedCount: 3 });
    expect(marker.data()).toMatchObject({ runId: "RUN-EMULATOR-001", importedCount: 3 });
  });

  it("refuses a second or non-empty import without changing existing data", async () => {
    await db.doc("schools/SENTINEL").set({ protected: true });
    const repository = new SchoolImportRepository(db);
    const plan = buildInitialSchoolImportPlan(rows(), {
      targetEducationOfficeCode: "G10",
      syncedAt,
    });

    await expect(repository.applyInitialImport({
      runId: "RUN-EMULATOR-CONFLICT",
      requestedBy: "SYSTEM-TEST",
      plan,
      completedAt: syncedAt,
    })).rejects.toBeInstanceOf(InitialImportConflictError);

    expect((await db.doc("schools/SENTINEL").get()).data()).toEqual({ protected: true });
    expect((await db.collection("schools").get()).size).toBe(1);
    expect((await db.collection("neisSyncRuns").get()).empty).toBe(true);
    expect((await db.doc("secureSettings/neisInitialImport").get()).exists).toBe(false);
  });

  it("preserves an existing database when source validation fails", async () => {
    await db.doc("schools/SENTINEL").set({ protected: true });
    const service = new InitialSchoolImportService({
      client: {
        fetchAllSchools: async () => rows().map((item) => ({ ...item, SCHUL_NM: "" })),
      },
      repository: new SchoolImportRepository(db),
      targetEducationOfficeCode: "G10",
      now: () => syncedAt,
      runIdFactory: () => "RUN-EMULATOR-INVALID",
    });

    await expect(service.execute("SYSTEM-TEST")).rejects.toThrow();
    expect((await db.doc("schools/SENTINEL").get()).data()).toEqual({ protected: true });
    expect((await db.collection("neisSyncRuns").get()).empty).toBe(true);
  });
});
