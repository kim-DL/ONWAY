import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import sharp from "sharp";

import { createPinLookupKey, hashPin } from "../functions/src/auth/pin-crypto.js";
import { processSchoolPhoto } from "../functions/src/photo/photo-processor.js";
import { firestoreCollections } from "../src/lib/firebase/firestore-paths";
import { buildPhase1SeedDocuments, createPhase1Seed } from "../src/seed/phase1";
import { PHASE3_TEST_IDENTITIES } from "./fixtures/phase3-auth";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-onnuriway";

if (!projectId.startsWith("demo-")) {
  throw new Error("Seed is restricted to Firebase demo projects.");
}

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";

const app =
  getApps().find((candidate) => candidate.name === "phase1-seed") ??
  initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` }, "phase1-seed");
const firestore = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const seed = createPhase1Seed();
const lookupSecret =
  process.env.PIN_LOOKUP_SECRET ??
  "demo-only-phase3-pin-lookup-secret-change-before-production-2026";
const pinPepper =
  process.env.PIN_PEPPER ??
  "demo-only-phase3-pin-pepper-change-before-production-2026-secret";

const authDocuments = await Promise.all(
  PHASE3_TEST_IDENTITIES.map(async ({ employeeId, pin }, index) => {
    const createdAt = new Date("2026-08-18T09:00:00.000Z");
    const lookupKey = createPinLookupKey(pin, lookupSecret);
    const salt = Buffer.from(`onnuriway-seed-${index}`.padEnd(16, "0").slice(0, 16));
    const employee = seed.employees.find((candidate) => candidate.employeeId === employeeId);
    if (!employee) {
      throw new Error(`Missing employee seed for ${employeeId}.`);
    }

    return [
      {
        path: firestoreCollections.authCredentials + `/${employeeId}`,
        data: {
          employeeId,
          lookupKey,
          pinHash: await hashPin(pin, pinPepper, { salt }),
          pinVersion: 1,
          failedAttemptCount: 0,
          lockedUntil: null,
          sessionVersion: employee.sessionVersion,
          updatedAt: createdAt,
        },
      },
      {
        path: firestoreCollections.pinIndexes + `/${lookupKey}`,
        data: { employeeId, createdAt, updatedAt: createdAt },
      },
    ];
  }),
);
const documents = [
  ...buildPhase1SeedDocuments(seed),
  ...authDocuments.flat(),
];

for (const collectionName of Object.values(firestoreCollections)) {
  await firestore.recursiveDelete(firestore.collection(collectionName));
}
await firestore.recursiveDelete(firestore.collection("loginRateLimits"));

let pageToken: string | undefined;
do {
  const page = await auth.listUsers(1_000, pageToken);
  if (page.users.length > 0) {
    await auth.deleteUsers(page.users.map((user) => user.uid));
  }
  pageToken = page.pageToken;
} while (pageToken !== undefined);

for (const user of seed.authUsers) {
  await auth.createUser({
    uid: user.uid,
    displayName: user.displayName,
    disabled: user.disabled,
  });
  await auth.setCustomUserClaims(user.uid, {
    employeeId: user.employeeId,
    roleScopes: user.roleScopes,
    sessionVersion: user.sessionVersion,
    permissionsVersion: user.permissionsVersion,
    ...(user.roleScopes.includes("admin") ? { adminApproved: true } : {}),
  });
}

for (let offset = 0; offset < documents.length; offset += 400) {
  const batch = firestore.batch();
  for (const document of documents.slice(offset, offset + 400)) {
    batch.set(firestore.doc(document.path), document.data);
  }
  await batch.commit();
}

if (process.env.STORAGE_EMULATOR_HOST) {
  const bucket = storage.bucket(`${projectId}.appspot.com`);
  const [existingFiles] = await bucket.getFiles();
  await Promise.all(existingFiles.map((file) => file.delete({ ignoreNotFound: true })));
  const colors = [
    ["#d8ebe5", "#286f60", "MAIN APPROACH"],
    ["#f0dfc5", "#8d5b2b", "CAFETERIA ENTRY"],
    ["#dce4f1", "#3f5f8c", "UNLOADING POINT"],
  ] as const;
  for (const [index, photo] of seed.photos.entries()) {
    const palette = colors[index] ?? colors[0];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000">
      <rect width="1600" height="1000" fill="${palette[0]}"/>
      <rect y="610" width="1600" height="390" fill="#b9c7c0"/>
      <path d="M0 900 L700 560 L1600 780 L1600 1000 L0 1000Z" fill="#5f6d68"/>
      <rect x="170" y="190" width="920" height="470" rx="20" fill="#f8f5ec"/>
      <rect x="250" y="290" width="140" height="150" fill="${palette[1]}" opacity=".72"/>
      <rect x="455" y="290" width="140" height="150" fill="${palette[1]}" opacity=".72"/>
      <rect x="660" y="290" width="140" height="150" fill="${palette[1]}" opacity=".72"/>
      <rect x="865" y="270" width="140" height="390" fill="${palette[1]}"/>
      <circle cx="1320" cy="230" r="92" fill="#f8cb6c" opacity=".8"/>
      <text x="90" y="110" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="${palette[1]}">ONNURIWAY · FIELD ${photo.slotId}</text>
      <text x="90" y="160" font-family="Arial,sans-serif" font-size="23" fill="#40534d">${palette[2]} · DEMO FIXTURE</text>
    </svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const processed = await processSchoolPhoto(png);
    for (const [variant, output] of Object.entries(processed)) {
      await bucket.file(`schools/${photo.schoolId}/photos/${photo.slotId}/${photo.currentVersionId}/${variant}.webp`).save(output.buffer, {
        resumable: false,
        metadata: { contentType: "image/webp", cacheControl: "private,max-age=604800,immutable" },
      });
    }
  }
}

console.log(
  `Seeded ${seed.authUsers.length} Auth users and ${documents.length} Firestore documents into ${projectId}; PIN values were not logged.`,
);
