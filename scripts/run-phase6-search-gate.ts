import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

import { catalogMetaSchema, commonSearchCatalogSchema } from "../src/domain/catalog";
import { estimateCatalogDocumentBytes, MAX_COMMON_CATALOG_DOCUMENT_BYTES } from "../src/features/search/common-catalog-builder";
import { buildPhase1SeedDocuments } from "../src/seed/phase1";
import { CommonSearchCatalogPublisher } from "./search-catalog-publisher";

const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? "demo-onnuriway";
if (!projectId.startsWith("demo-") || !process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("Phase 6 search gate is restricted to a demo Firestore emulator.");
}

function decode(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(decode);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
  }
  return value;
}

const app = getApps().find((candidate) => candidate.name === "phase6-search-gate")
  ?? initializeApp({ projectId }, "phase6-search-gate");
const firestore = getFirestore(app);

for (const collectionName of [
  "schools",
  "schoolFieldProfiles",
  "employees",
  "employeeDirectory",
  "authz",
  "zones",
  "products",
  "communicationTags",
  "activityTags",
  "salesProfiles",
  "salesVisits",
  "salesCycles",
  "searchCatalogs",
  "catalogMeta",
  "appSettings",
]) {
  await firestore.recursiveDelete(firestore.collection(collectionName));
}

const seedDocuments = buildPhase1SeedDocuments();
for (let offset = 0; offset < seedDocuments.length; offset += 400) {
  const batch = firestore.batch();
  for (const document of seedDocuments.slice(offset, offset + 400)) {
    batch.set(firestore.doc(document.path), document.data);
  }
  await batch.commit();
}

const initialMetaSnapshot = await firestore.doc("catalogMeta/current").get();
const initialMeta = catalogMetaSchema.parse(decode(initialMetaSnapshot.data()));
if (initialMeta.commonCatalogVersion !== 1) throw new Error("Expected seed catalog version 1.");

const publisher = new CommonSearchCatalogPublisher(firestore);
const published = await publisher.publish(new Date("2026-08-23T12:00:00.000Z"));
if (published.version !== 2 || published.itemCount !== 5) {
  throw new Error("Unexpected Phase 6 catalog publication result.");
}

const publishedMetaSnapshot = await firestore.doc("catalogMeta/current").get();
const publishedMeta = catalogMetaSchema.parse(decode(publishedMetaSnapshot.data()));
if (
  publishedMeta.commonCatalogVersion !== 2 ||
  publishedMeta.commonCatalogItemCount !== 5 ||
  publishedMeta.commonCatalogIds.length !== published.documentCount
) {
  throw new Error("Published catalog metadata is inconsistent.");
}

const publishedCatalogs = await Promise.all(
  publishedMeta.commonCatalogIds.map((catalogId) => firestore.doc(`searchCatalogs/${catalogId}`).get()),
);
const parsedCatalogs = publishedCatalogs.map((snapshot) =>
  commonSearchCatalogSchema.parse(decode(snapshot.data())),
);
if (
  parsedCatalogs.some((catalog) => estimateCatalogDocumentBytes(catalog) > MAX_COMMON_CATALOG_DOCUMENT_BYTES) ||
  new Set(parsedCatalogs.flatMap((catalog) => catalog.items.map((item) => item.schoolId))).size !== 5
) {
  throw new Error("Published catalog documents failed size or uniqueness checks.");
}
for (const oldCatalogId of initialMeta.commonCatalogIds) {
  if (!(await firestore.doc(`searchCatalogs/${oldCatalogId}`).get()).exists) {
    throw new Error("Previous catalog version was removed during publication.");
  }
}

const catalogCountBeforeFailure = (await firestore.collection("searchCatalogs").get()).size;
await firestore.doc("schools/SCH-NEIS-G100000001").set({ name: "" }, { merge: true });
let failedAsExpected = false;
try {
  await publisher.publish(new Date("2026-08-23T13:00:00.000Z"));
} catch {
  failedAsExpected = true;
}
if (!failedAsExpected) throw new Error("Invalid source data did not block catalog publication.");

const metaAfterFailure = catalogMetaSchema.parse(decode((await firestore.doc("catalogMeta/current").get()).data()));
const catalogCountAfterFailure = (await firestore.collection("searchCatalogs").get()).size;
if (metaAfterFailure.commonCatalogVersion !== 2 || catalogCountAfterFailure !== catalogCountBeforeFailure) {
  throw new Error("Failed publication changed the active catalog or catalog document count.");
}

console.log(JSON.stringify({
  status: "phase6-search-gate-passed",
  version: published.version,
  itemCount: published.itemCount,
  documentCount: published.documentCount,
}));
