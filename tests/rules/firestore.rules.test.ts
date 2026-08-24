import { readFileSync } from "node:fs";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
  type TokenOptions,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PROJECT_ID = "demo-onnuriway";
const NOW = Timestamp.fromDate(new Date("2026-08-23T00:00:00.000Z"));

interface TestIdentity {
  uid: string;
  employeeId: string;
  token: TokenOptions;
}

function identity(
  uid: string,
  employeeId: string,
  roleScopes: string[],
  overrides: TokenOptions = {},
): TestIdentity {
  return {
    uid,
    employeeId,
    token: {
      employeeId,
      sessionVersion: 1,
      permissionsVersion: 1,
      roleScopes,
      ...overrides,
    },
  };
}

const IDENTITIES = {
  delivery: identity("uid-delivery", "EMP-DELIVERY", ["delivery"]),
  sales: identity("uid-sales", "EMP-SALES-A", ["sales"]),
  viewer: identity("uid-viewer", "EMP-VIEWER", ["viewer"]),
  admin: identity("uid-admin", "EMP-ADMIN", ["admin"], {
    adminApproved: true,
    firebase: { sign_in_provider: "google.com" },
  }),
  customTokenAdmin: identity("uid-admin-custom", "EMP-ADMIN-CUSTOM", ["admin"], {
    adminApproved: true,
    firebase: { sign_in_provider: "custom" },
  }),
  unapprovedAdmin: identity("uid-admin-unapproved", "EMP-ADMIN-UNAPPROVED", ["admin"], {
    adminApproved: false,
    firebase: { sign_in_provider: "google.com" },
  }),
} as const;

const FIELD_READ_PATHS = [
  "schools/SCH-001",
  "schools/SCH-001/photos/01",
  "schoolFieldProfiles/SCH-001",
] as const;

const SALES_READ_PATHS = [
  "salesProfiles/SCH-001",
  "salesVisits/VISIT-001",
  "salesCycles/2026-08",
  "salesCycles/2026-08/assignments/SCH-001",
  "salesCycles/2026-08/employeeStats/EMP-SALES-A",
  "salesCycles/2026-08/stats/team",
  "zones/A",
  "products/PROD-001",
  "communicationTags/COMM-001",
  "activityTags/ACT-001",
] as const;

let testEnvironment: RulesTestEnvironment;

function modularFirestore(context: RulesTestContext): Firestore {
  return context.firestore() as unknown as Firestore;
}

function firestoreFor(testIdentity: TestIdentity): Firestore {
  return modularFirestore(
    testEnvironment.authenticatedContext(testIdentity.uid, testIdentity.token),
  );
}

async function seedAuthz(
  firestore: Firestore,
  uid: string,
  employeeId: string,
  options: { active?: boolean; sessionVersion?: number; permissionsVersion?: number } = {},
) {
  await setDoc(doc(firestore, "authz", uid), {
    employeeId,
    active: options.active ?? true,
    sessionVersion: options.sessionVersion ?? 1,
    permissionsVersion: options.permissionsVersion ?? 1,
    updatedAt: NOW,
  });
}

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const firestore = modularFirestore(context);
    const batch = writeBatch(firestore);
    const documents: Array<[string, Record<string, unknown>]> = [
      ["schools/SCH-001", { schoolId: "SCH-001", name: "테스트 학교" }],
      ["schools/SCH-001/photos/01", { schoolId: "SCH-001", slotId: "01" }],
      ["schools/SCH-001/photos/04", { schoolId: "SCH-001", slotId: "04" }],
      ["schoolFieldProfiles/SCH-001", { schoolId: "SCH-001", fieldNotes: null }],
      ["salesProfiles/SCH-001", { schoolId: "SCH-001", interestScore: 80 }],
      ["salesVisits/VISIT-001", { visitId: "VISIT-001", schoolId: "SCH-001" }],
      ["salesCycles/2026-08", { cycleId: "2026-08" }],
      ["salesCycles/2026-08/assignments/SCH-001", { schoolId: "SCH-001" }],
      ["salesCycles/2026-08/employeeStats/EMP-SALES-A", { employeeId: "EMP-SALES-A" }],
      ["salesCycles/2026-08/stats/team", { totalSchoolCount: 1 }],
      ["zones/A", { zoneId: "A" }],
      ["products/PROD-001", { productId: "PROD-001" }],
      ["communicationTags/COMM-001", { tagId: "COMM-001" }],
      ["activityTags/ACT-001", { tagId: "ACT-001" }],
      ["employeeDirectory/EMP-DELIVERY", { displayName: "납품 담당" }],
      ["employees/EMP-DELIVERY", { employeeId: "EMP-DELIVERY", roleScopes: ["delivery"] }],
      ["employees/EMP-ADMIN", { employeeId: "EMP-ADMIN", roleScopes: ["admin"] }],
      ["authCredentials/EMP-DELIVERY", { pinHash: "server-only" }],
      ["pinIndexes/LOOKUP-001", { employeeId: "EMP-DELIVERY" }],
      ["searchCatalogs/common-main", { kind: "common" }],
      ["searchCatalogs/field-main", { kind: "field" }],
      ["searchCatalogs/sales-main", { kind: "sales" }],
      ["searchCatalogs/assignment-main", { kind: "assignment" }],
      ["catalogMeta/current", { commonCatalogVersion: 1 }],
      ["exportJobs/JOB-OWN", { requestedBy: "EMP-SALES-A" }],
      ["exportJobs/JOB-OTHER", { requestedBy: "EMP-SALES-B" }],
      ["auditLogs/LOG-001", { eventType: "TEST" }],
      ["neisSyncRuns/RUN-001", { status: "COMPLETED" }],
      ["neisSyncRuns/RUN-001/changes/CHANGE-001", { type: "NEW" }],
      ["kakaoMatchReviews/SCH-001", { status: "needsReview", candidates: [] }],
      ["appSettings/public", { maintenanceMode: false }],
      ["secureSettings/internal", { policy: "server-only" }],
      ["requestLocks/REQUEST-001", { state: "server-only" }],
      ["photoUploadSessions/UPLOAD-001", { state: "server-only" }],
      ["photoUploadRateLimits/uid-hour", { state: "server-only" }],
      ["unknownCollection/DOC-001", { data: "blocked" }],
    ];

    for (const [path, data] of documents) {
      batch.set(doc(firestore, path), data);
    }
    await batch.commit();

    for (const testIdentity of Object.values(IDENTITIES)) {
      await seedAuthz(firestore, testIdentity.uid, testIdentity.employeeId);
    }

    await seedAuthz(firestore, "uid-disabled", "EMP-DISABLED", { active: false });
    await seedAuthz(firestore, "uid-stale", "EMP-STALE", { sessionVersion: 2 });
    await seedAuthz(firestore, "uid-permission-stale", "EMP-PERMISSION", {
      permissionsVersion: 2,
    });
    await seedAuthz(firestore, "uid-wrong-employee", "EMP-OTHER");
    await seedAuthz(firestore, "uid-malformed-role", "EMP-MALFORMED");
    await seedAuthz(firestore, "uid-no-claims", "EMP-NO-CLAIMS");
  });
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe("Firestore role read matrix", () => {
  it("denies every representative read when unauthenticated", async () => {
    const firestore = modularFirestore(testEnvironment.unauthenticatedContext());
    const paths = [
      ...FIELD_READ_PATHS,
      ...SALES_READ_PATHS,
      "employeeDirectory/EMP-DELIVERY",
      "appSettings/public",
      "unknownCollection/DOC-001",
    ];

    await Promise.all(paths.map((path) => assertFails(getDoc(doc(firestore, path)))));
  });

  it("allows Delivery to read field data and denies every sales area", async () => {
    const firestore = firestoreFor(IDENTITIES.delivery);

    await Promise.all(FIELD_READ_PATHS.map((path) => assertSucceeds(getDoc(doc(firestore, path)))));
    await assertFails(getDocs(collection(firestore, "schools", "SCH-001", "photos")));
    await Promise.all(SALES_READ_PATHS.map((path) => assertFails(getDoc(doc(firestore, path)))));
  });

  it("allows Sales to read field data, team activity, and sales definitions", async () => {
    const firestore = firestoreFor(IDENTITIES.sales);
    const paths = [...FIELD_READ_PATHS, ...SALES_READ_PATHS];

    await Promise.all(paths.map((path) => assertSucceeds(getDoc(doc(firestore, path)))));
    await assertSucceeds(getDocs(collection(firestore, "salesVisits")));
  });

  it("allows Viewer to read field data only", async () => {
    const firestore = firestoreFor(IDENTITIES.viewer);

    await Promise.all(FIELD_READ_PATHS.map((path) => assertSucceeds(getDoc(doc(firestore, path)))));
    await Promise.all(SALES_READ_PATHS.map((path) => assertFails(getDoc(doc(firestore, path)))));
  });

  it("allows only a Google, server-approved Admin to read management data", async () => {
    const firestore = firestoreFor(IDENTITIES.admin);
    const paths = [
      ...FIELD_READ_PATHS,
      ...SALES_READ_PATHS,
      "employees/EMP-ADMIN",
      "auditLogs/LOG-001",
      "neisSyncRuns/RUN-001",
      "neisSyncRuns/RUN-001/changes/CHANGE-001",
    ];

    await Promise.all(paths.map((path) => assertSucceeds(getDoc(doc(firestore, path)))));

    for (const invalidAdmin of [IDENTITIES.customTokenAdmin, IDENTITIES.unapprovedAdmin]) {
      const invalidAdminFirestore = firestoreFor(invalidAdmin);
      await assertFails(getDoc(doc(invalidAdminFirestore, "employees", "EMP-ADMIN")));
      await assertFails(getDoc(doc(invalidAdminFirestore, "auditLogs", "LOG-001")));
    }
  });

  it("allows the separated employee directory to every valid role", async () => {
    for (const testIdentity of [
      IDENTITIES.delivery,
      IDENTITIES.sales,
      IDENTITIES.viewer,
      IDENTITIES.admin,
    ]) {
      await assertSucceeds(
        getDoc(doc(firestoreFor(testIdentity), "employeeDirectory", "EMP-DELIVERY")),
      );
    }
  });

  it("enforces catalog scope and direct-known-document reads", async () => {
    const delivery = firestoreFor(IDENTITIES.delivery);
    const sales = firestoreFor(IDENTITIES.sales);

    await assertSucceeds(getDoc(doc(delivery, "searchCatalogs", "common-main")));
    await assertSucceeds(getDoc(doc(delivery, "searchCatalogs", "field-main")));
    await assertFails(getDoc(doc(delivery, "searchCatalogs", "sales-main")));
    await assertFails(getDoc(doc(delivery, "searchCatalogs", "assignment-main")));

    for (const catalogId of ["common-main", "field-main", "sales-main", "assignment-main"]) {
      await assertSucceeds(getDoc(doc(sales, "searchCatalogs", catalogId)));
    }
    await assertFails(getDocs(collection(sales, "searchCatalogs")));
  });

  it("limits export jobs to the requesting Sales employee or verified Admin", async () => {
    const sales = firestoreFor(IDENTITIES.sales);
    const delivery = firestoreFor(IDENTITIES.delivery);
    const admin = firestoreFor(IDENTITIES.admin);

    await assertSucceeds(getDoc(doc(sales, "exportJobs", "JOB-OWN")));
    await assertFails(getDoc(doc(sales, "exportJobs", "JOB-OTHER")));
    await assertFails(getDoc(doc(delivery, "exportJobs", "JOB-OWN")));
    await assertSucceeds(getDoc(doc(admin, "exportJobs", "JOB-OWN")));
    await assertSucceeds(getDoc(doc(admin, "exportJobs", "JOB-OTHER")));
  });

  it("rejects non-canonical photo slots even for otherwise authorized roles", async () => {
    for (const testIdentity of [IDENTITIES.delivery, IDENTITIES.sales, IDENTITIES.admin]) {
      await assertFails(getDoc(doc(firestoreFor(testIdentity), "schools/SCH-001/photos/04")));
    }
  });
});

describe("Firestore session and sensitive-data boundary", () => {
  it("requires a matching active authz record and complete typed claims", async () => {
    const invalidIdentities = [
      identity("uid-missing", "EMP-MISSING", ["delivery"]),
      identity("uid-disabled", "EMP-DISABLED", ["delivery"]),
      identity("uid-stale", "EMP-STALE", ["delivery"]),
      identity("uid-permission-stale", "EMP-PERMISSION", ["delivery"]),
      identity("uid-wrong-employee", "EMP-WRONG", ["delivery"]),
      identity("uid-malformed-role", "EMP-MALFORMED", ["delivery", "root"]),
      { uid: "uid-no-claims", employeeId: "EMP-NO-CLAIMS", token: {} },
    ];

    for (const invalidIdentity of invalidIdentities) {
      await assertFails(getDoc(doc(firestoreFor(invalidIdentity), "schools", "SCH-001")));
    }
  });

  it("lets a signed-in user get only their own authz state without granting list access", async () => {
    const delivery = firestoreFor(IDENTITIES.delivery);

    await assertSucceeds(getDoc(doc(delivery, "authz", IDENTITIES.delivery.uid)));
    await assertFails(getDoc(doc(delivery, "authz", IDENTITIES.sales.uid)));
    await assertFails(getDocs(collection(delivery, "authz")));

    const disabled = firestoreFor(identity("uid-disabled", "EMP-DISABLED", ["delivery"]));
    await assertSucceeds(getDoc(doc(disabled, "authz", "uid-disabled")));
  });

  it("denies auth credentials and PIN indexes to every client including Admin", async () => {
    for (const testIdentity of [
      IDENTITIES.delivery,
      IDENTITIES.sales,
      IDENTITIES.viewer,
      IDENTITIES.admin,
    ]) {
      const firestore = firestoreFor(testIdentity);
      await assertFails(getDoc(doc(firestore, "authCredentials", "EMP-DELIVERY")));
      await assertFails(getDoc(doc(firestore, "pinIndexes", "LOOKUP-001")));
      await assertFails(setDoc(doc(firestore, "pinIndexes", "ATTACK"), { employeeId: "EMP-ADMIN" }));
    }
  });

  it("keeps unknown and server-only collections default denied", async () => {
    for (const testIdentity of [IDENTITIES.delivery, IDENTITIES.sales, IDENTITIES.admin]) {
      const firestore = firestoreFor(testIdentity);
      await assertFails(getDoc(doc(firestore, "unknownCollection", "DOC-001")));
      await assertFails(getDoc(doc(firestore, "secureSettings", "internal")));
      await assertFails(getDoc(doc(firestore, "requestLocks", "REQUEST-001")));
      await assertFails(getDoc(doc(firestore, "photoUploadSessions", "UPLOAD-001")));
      await assertFails(getDoc(doc(firestore, "photoUploadRateLimits", "uid-hour")));
      await assertFails(getDoc(doc(firestore, "kakaoMatchReviews", "SCH-001")));
    }
  });
});

describe("Firestore direct-write and red-team boundary", () => {
  it("denies create, update, and delete on core data to every role including Admin", async () => {
    for (const testIdentity of [
      IDENTITIES.delivery,
      IDENTITIES.sales,
      IDENTITIES.viewer,
      IDENTITIES.admin,
    ]) {
      const firestore = firestoreFor(testIdentity);
      await assertFails(setDoc(doc(firestore, "schools", `ATTACK-${testIdentity.uid}`), { name: "공격" }));
      await assertFails(
        updateDoc(doc(firestore, "schoolFieldProfiles", "SCH-001"), { fieldNotes: "변조" }),
      );
      await assertFails(deleteDoc(doc(firestore, "salesVisits", "VISIT-001")));
    }
  });

  it("blocks client role escalation regardless of forged fields or ownership", async () => {
    const delivery = firestoreFor(IDENTITIES.delivery);

    await assertFails(
      setDoc(doc(delivery, "employees", "EMP-ATTACKER"), {
        employeeId: "EMP-ATTACKER",
        firebaseUid: IDENTITIES.delivery.uid,
        roleScopes: ["admin"],
        permissions: { exportTeam: true },
      }),
    );
    await assertFails(
      updateDoc(doc(delivery, "employees", "EMP-DELIVERY"), {
        roleScopes: ["admin"],
      }),
    );
  });

  it("blocks update-bypass, schema-pollution, type-juggling, and resource-exhaustion payloads", async () => {
    const sales = firestoreFor(IDENTITIES.sales);

    await assertFails(
      updateDoc(doc(sales, "schoolFieldProfiles", "SCH-001"), {
        fieldNotes: "x".repeat(1_000_000),
      }),
    );
    await assertFails(
      updateDoc(doc(sales, "salesProfiles", "SCH-001"), {
        extraData: "malicious",
        interestScore: "admin",
      }),
    );
    await assertFails(
      setDoc(doc(sales, "salesVisits", "VISIT-MALICIOUS"), {
        visitedBy: "EMP-OTHER",
        createdAt: "not-a-timestamp",
      }),
    );
  });

  it("denies Audit Log creation, mutation, and deletion from normal and Admin clients", async () => {
    for (const testIdentity of [IDENTITIES.sales, IDENTITIES.admin]) {
      const firestore = firestoreFor(testIdentity);
      await assertFails(setDoc(doc(firestore, "auditLogs", "LOG-ATTACK"), { eventType: "FORGED" }));
      await assertFails(updateDoc(doc(firestore, "auditLogs", "LOG-001"), { eventType: "CHANGED" }));
      await assertFails(deleteDoc(doc(firestore, "auditLogs", "LOG-001")));
    }
  });

  it("does not infer authority from client-created document data", async () => {
    const unauthenticated = modularFirestore(testEnvironment.unauthenticatedContext());
    await assertFails(
      setDoc(doc(unauthenticated, "employees", "SELF-ADMIN"), {
        roleScopes: ["admin"],
        adminApproved: true,
      }),
    );
    await assertFails(getDoc(doc(unauthenticated, "schools", "SCH-001")));
  });
});
