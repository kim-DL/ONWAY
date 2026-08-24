import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { CommonSearchCatalogPublisher } from "./search-catalog-publisher";

const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? "demo-onnuriway";
const isDemoEmulator = projectId.startsWith("demo-") && Boolean(process.env.FIRESTORE_EMULATOR_HOST);
if (!isDemoEmulator && process.env.ALLOW_LIVE_SEARCH_CATALOG_PUBLISH !== "true") {
  throw new Error(
    "Live search catalog publishing requires explicit ALLOW_LIVE_SEARCH_CATALOG_PUBLISH=true approval.",
  );
}

const app = getApps().find((candidate) => candidate.name === "search-catalog-publisher")
  ?? initializeApp({ projectId }, "search-catalog-publisher");
const result = await new CommonSearchCatalogPublisher(getFirestore(app)).publish();

console.log(JSON.stringify({
  status: "published",
  version: result.version,
  itemCount: result.itemCount,
  documentCount: result.documentCount,
}));
