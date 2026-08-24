import { readFileSync } from "node:fs";

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
  type TokenOptions,
} from "@firebase/rules-unit-testing";
import {
  deleteObject,
  getBytes,
  ref,
  uploadBytes,
  uploadString,
  type FirebaseStorage,
} from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const PROJECT_ID = "demo-onnuriway";
const PHOTO_PATH = "schools/SCH-001/photos/01/v001/preview.webp";
const TEMPORARY_PATH = "temporaryUploads/uid-sales/upload-001/original.jpg";
const EXPORT_PATH = "exports/EMP-SALES-A/JOB-001/export.csv";

const TOKENS: Record<string, TokenOptions> = {
  delivery: {
    employeeId: "EMP-DELIVERY",
    sessionVersion: 1,
    permissionsVersion: 1,
    roleScopes: ["delivery"],
  },
  sales: {
    employeeId: "EMP-SALES-A",
    sessionVersion: 1,
    permissionsVersion: 1,
    roleScopes: ["sales"],
  },
  viewer: {
    employeeId: "EMP-VIEWER",
    sessionVersion: 1,
    permissionsVersion: 1,
    roleScopes: ["viewer"],
  },
  admin: {
    employeeId: "EMP-ADMIN",
    sessionVersion: 1,
    permissionsVersion: 1,
    roleScopes: ["admin"],
    adminApproved: true,
    firebase: { sign_in_provider: "google.com" },
  },
};

let testEnvironment: RulesTestEnvironment;

function modularStorage(context: RulesTestContext): FirebaseStorage {
  return context.storage() as unknown as FirebaseStorage;
}

function storageFor(role: keyof typeof TOKENS): FirebaseStorage {
  return modularStorage(
    testEnvironment.authenticatedContext(`uid-${role}`, TOKENS[role]),
  );
}

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: {
      host: "127.0.0.1",
      port: 9199,
      rules: readFileSync("storage.rules", "utf8"),
    },
  });
});
beforeEach(async () => {
  await testEnvironment.clearStorage();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const storage = modularStorage(context);
    await uploadString(ref(storage, PHOTO_PATH), "photo", "raw", { contentType: "image/webp" });
    await uploadString(ref(storage, TEMPORARY_PATH), "temporary", "raw", {
      contentType: "image/jpeg",
    });
    await uploadString(ref(storage, EXPORT_PATH), "schoolId,name", "raw", {
      contentType: "text/csv",
    });
  });
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe("Storage server-only boundary", () => {
  it("denies unauthenticated downloads from every known and unknown area", async () => {
    const storage = modularStorage(testEnvironment.unauthenticatedContext());

    for (const path of [PHOTO_PATH, TEMPORARY_PATH, EXPORT_PATH, "unknown/file.txt"]) {
      await assertFails(getBytes(ref(storage, path)));
    }
  });

  it("denies direct photo downloads to every role including Admin", async () => {
    for (const role of Object.keys(TOKENS) as Array<keyof typeof TOKENS>) {
      await assertFails(getBytes(ref(storageFor(role), PHOTO_PATH)));
    }
  });

  it("denies temporary uploads regardless of claimed role, owner path, MIME, or size", async () => {
    for (const role of Object.keys(TOKENS) as Array<keyof typeof TOKENS>) {
      const storage = storageFor(role);
      await assertFails(
        uploadString(ref(storage, `temporaryUploads/uid-${role}/attack/photo.webp`), "payload", "raw", {
          contentType: "image/webp",
        }),
      );
    }

    const sales = storageFor("sales");
    await assertFails(
      uploadBytes(ref(sales, "temporaryUploads/uid-sales/attack/oversized.webp"), new Uint8Array(11 * 1024 * 1024), {
        contentType: "image/webp",
      }),
    );
    await assertFails(
      uploadString(ref(sales, "temporaryUploads/uid-sales/attack/script.webp"), "<script>", "raw", {
        contentType: "text/html",
      }),
    );
  });

  it("denies direct export downloads and object deletion to every role", async () => {
    for (const role of Object.keys(TOKENS) as Array<keyof typeof TOKENS>) {
      const storage = storageFor(role);
      await assertFails(getBytes(ref(storage, EXPORT_PATH)));
      await assertFails(deleteObject(ref(storage, PHOTO_PATH)));
    }
  });

  it("denies path traversal-like and non-canonical photo object paths", async () => {
    const admin = storageFor("admin");
    const paths = [
      "schools/SCH-001/photos/04/v001/original.webp",
      "schools/SCH-001/photos/01/v001/../../secret.txt",
      "schools/SCH-001/photos/01/v001/original.exe",
      "exports/EMP-OTHER/JOB-001/export.csv",
    ];

    for (const path of paths) {
      await assertFails(uploadString(ref(admin, path), "blocked"));
    }
  });
});
