import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { GoogleAuth, googleAuthLibrary } from "google-gax";
import { INVENTORY_MAX_LOTS, INVENTORY_PRODUCT_PATH } from "../functions/src/inventory/inventory-contract.js";
import { inventoryLotFromDocument, inventoryProductFromDocument, summarizeInventoryLots } from "../functions/src/inventory/inventory-service.js";
import { summarizeInventoryLotGroups } from "../functions/src/inventory/inventory-stock-summary.js";

// Explicit one-off operator tool. Dry-run is the default, never a client read
// side effect. Each apply updates ONLY lotSummary, not quantities, revisions,
// timestamps, count confirmations, photos, events, or audit/request receipts.
export async function backfillInventoryLotSummary(db: Firestore, options: { apply: boolean; maxProducts: number; onStage?: (stage: string) => void }) {
  if (!Number.isInteger(options.maxProducts) || options.maxProducts < 1 || options.maxProducts > 1_000) throw new Error("maxProducts must be 1–1000.");
  options.onStage?.("products-list");
  const page = await db.collection(INVENTORY_PRODUCT_PATH).orderBy(FieldPath.documentId()).limit(options.maxProducts + 1).get();
  if (page.docs.length > options.maxProducts) throw new Error("Product limit exceeded; no changes were made. Review scope before increasing the bound.");
  const results: Array<{ productId: string; status: string; stockRevision?: number }> = [];
  for (const candidate of page.docs) {
    results.push(await db.runTransaction(async (transaction) => {
      const ref = db.doc(`${INVENTORY_PRODUCT_PATH}/${candidate.id}`);
      options.onStage?.("product-read");
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return { productId: candidate.id, status: "missing" };
      options.onStage?.("product-validate");
      const product = inventoryProductFromDocument(snapshot.data()!);
      if (product.productId !== candidate.id) throw new Error(`Product ${candidate.id} document identity is inconsistent.`);
      if (product.status === "deleted") return { productId: candidate.id, status: "deleted-skipped" };
      if (product.lotSummary) return { productId: candidate.id, status: "already-summarized", stockRevision: product.stockRevision };
      options.onStage?.("lots-read");
      const lotsSnapshot = await transaction.get(db.collection(`${INVENTORY_PRODUCT_PATH}/${candidate.id}/lots`).where("quantity", ">", 0).limit(INVENTORY_MAX_LOTS + 1));
      if (lotsSnapshot.docs.length > INVENTORY_MAX_LOTS) throw new Error(`Product ${candidate.id} exceeds the active lot bound.`);
      options.onStage?.("lots-validate");
      const lots = lotsSnapshot.docs.map((doc) => {
        const lot = inventoryLotFromDocument(doc.data());
        if (lot.lotId !== doc.id) throw new Error(`Product ${candidate.id} contains an inconsistent lot document identity.`);
        return lot;
      });
      if (lots.some((lot) => lot.productId !== product.productId)) throw new Error(`Product ${candidate.id} contains an invalid lot relationship.`);
      options.onStage?.("quantity-consistency");
      const quantities = summarizeInventoryLots(lots).quantityByLocation;
      if (JSON.stringify(quantities) !== JSON.stringify(product.quantityByLocation)) throw new Error(`Product ${candidate.id} quantity summary is inconsistent; inspect it before backfill.`);
      const lotSummary = summarizeInventoryLotGroups(lots);
      // Reading the product AND lots in the same transaction guarantees a
      // stockRevision/lots change retries and recomputes the summary before
      // commit. Do not use the older outer pagination snapshot for a write.
      options.onStage?.(options.apply ? "summary-commit" : "summary-dry-run");
      if (options.apply) transaction.update(ref, { lotSummary });
      return { productId: candidate.id, status: options.apply ? "updated" : "would-update", stockRevision: product.stockRevision };
    }));
  }
  return { mode: options.apply ? "apply" : "dry-run", scanned: page.docs.length, results };
}

export function inventorySummaryBackfillOptions(args: string[]) {
  const allowed = /^(--apply|--dry-run|--use-firebase-cli|--project=onnuriway|--database=\(default\)|--max-products=\d+|--confirm-project=onnuriway)$/;
  if (args.some((arg) => !allowed.test(arg)) || args.some((arg, index) => args.findIndex((item) => item.split("=")[0] === arg.split("=")[0]) !== index)) {
    throw new Error("Unknown or duplicate option. Specify --use-firebase-cli --project=onnuriway --database=(default), optionally --max-products=1000, --apply --confirm-project=onnuriway.");
  }
  if (!args.includes("--project=onnuriway") || !args.includes("--database=(default)")) throw new Error("Explicit existing project onnuriway and database (default) are required.");
  if (!args.includes("--use-firebase-cli")) throw new Error("Use --use-firebase-cli; ambient service-account/ADC credentials are deliberately not accepted.");
  const apply = args.includes("--apply");
  if (apply && (!args.includes("--confirm-project=onnuriway") || args.includes("--dry-run"))) throw new Error("Apply requires --confirm-project=onnuriway and no --dry-run.");
  const maxProducts = Number(args.find((arg) => arg.startsWith("--max-products="))?.split("=")[1] ?? 1_000);
  if (!Number.isInteger(maxProducts) || maxProducts < 1 || maxProducts > 1_000) throw new Error("max-products must be 1–1000.");
  return { apply, maxProducts };
}
export function inventoryCliGoogleAuth(getAccessToken: () => Promise<{ access_token: string; expires_in: number }>) {
  // Use the auth version exported by Firestore's installed transport. Another
  // tool also installs v9 at the workspace root; it returns plain header objects
  // while the current gax transport expects the v10 Headers.forEach interface.
  const authClient = new googleAuthLibrary.OAuth2Client();
  authClient.refreshHandler = async () => {
    const token = await getAccessToken();
    return { access_token: token.access_token, expiry_date: Date.now() + token.expires_in * 1000 };
  };
  // Supplying authClient explicitly prevents GoogleAuth from discovering an
  // unrelated service-account key in ambient ADC environment variables.
  return new GoogleAuth({ projectId: "onnuriway", authClient });
}
let operatorStage = "options";
let operatorHttpStatus: number | undefined;
export function inventoryBackfillDiagnostic(error: unknown, stage: string, httpStatus?: number) {
  const candidate = error !== null && typeof error === "object" ? error as { name?: unknown; code?: unknown } : {};
  const grpcCode = typeof candidate.code === "number" && Number.isInteger(candidate.code) && candidate.code >= 0 && candidate.code <= 16 ? candidate.code : undefined;
  const safeCodes = ["ENOENT", "EACCES", "ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "invalid-credential", "unauthenticated", "permission-denied", "failed-precondition", "aborted"];
  const code = grpcCode ?? (typeof candidate.code === "string" && safeCodes.includes(candidate.code) ? candidate.code : "NOT_EXPOSED");
  return { status: "INVENTORY_BACKFILL_STOPPED", stage: /^[a-z-]{1,40}$/.test(stage) ? stage : "unknown",
    category: candidate.name === "ZodError" ? "schema-validation" : grpcCode !== undefined ? "firestore-grpc" : "operator-or-dependency",
    code, ...(typeof httpStatus === "number" && httpStatus >= 100 && httpStatus <= 599 ? { httpStatus } : {}) };
}
async function main() {
  const options = inventorySummaryBackfillOptions(process.argv.slice(2));
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error("This operator entry point targets the confirmed production database; do not mix emulator settings. Unit/integration tests call the bounded helper directly.");
  const { Firestore } = await import("firebase-admin/firestore");
  const load = async (file: string) => {
    const loaded = await import(pathToFileURL(resolve(import.meta.dirname, "../node_modules/firebase-tools/lib", file)).href);
    return loaded.default ?? loaded;
  };
  operatorStage = "cli-modules";
  (await load("logger.js")).logger.silent = true;
  const auth = await load("auth.js");
  operatorStage = "cli-account";
  const account = auth.getProjectDefaultAccount(resolve(import.meta.dirname, "..")) ?? auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) throw new Error("A signed-in Firebase CLI account with refresh credentials is required.");
  // Explicit custom credentials bypass GOOGLE_APPLICATION_CREDENTIALS/ADC.
  // Reuse only the already selected CLI account, never print credentials or
  // SDK/API response bodies. The SDK calls this again when a token expires.
  const credential = { async getAccessToken() {
    const callingStage = operatorStage;
    operatorStage = "cli-token";
    const token = await auth.getAccessToken(account.tokens.refresh_token, ["https://www.googleapis.com/auth/cloud-platform"]);
    operatorStage = "cli-token-validate";
    if (typeof token?.access_token !== "string" || !token.access_token) throw new Error("CLI access token unavailable.");
    const remaining = typeof token.expires_at === "number" ? Math.floor((token.expires_at - Date.now()) / 1000) : token.expires_in;
    if (typeof remaining !== "number" || !Number.isFinite(remaining) || remaining <= 0) throw new Error("CLI token expiry unavailable.");
    operatorStage = callingStage;
    return { access_token: token.access_token, expires_in: remaining };
  } };
  const token = await credential.getAccessToken();
  operatorStage = "database-metadata-request";
  const metadataResponse = await fetch("https://firestore.googleapis.com/v1/projects/onnuriway/databases/(default)",
    { headers: { Authorization: `Bearer ${token.access_token}` } });
  operatorHttpStatus = metadataResponse.status;
  if (!metadataResponse.ok) throw new Error("Existing database verification failed.");
  operatorStage = "database-metadata-validate";
  const metadata = await metadataResponse.json() as Record<string, unknown>;
  if (metadata.name !== "projects/onnuriway/databases/(default)" || metadata.databaseEdition !== "STANDARD"
    || metadata.type !== "FIRESTORE_NATIVE" || metadata.locationId !== "asia-northeast3") throw new Error("Existing database identity/edition/location does not match the approved target.");
  // Admin getFirestore(app) only accepts certificate/ADC credentials in this
  // installed SDK. The underlying Firestore constructor accepts GoogleAuth
  // directly, retaining a real transaction API with the explicit CLI identity.
  const db = new Firestore({ projectId: "onnuriway", databaseId: "(default)", auth: inventoryCliGoogleAuth(() => credential.getAccessToken()) });
  operatorStage = "firestore-initialize";
  operatorHttpStatus = undefined;
  try { console.log(JSON.stringify(await backfillInventoryLotSummary(db, { ...options, onStage: (stage) => { operatorStage = stage; } }), null, 2)); }
  finally { await db.terminate(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    // Arbitrary SDK error messages can contain transport/account details.
    console.error(JSON.stringify(inventoryBackfillDiagnostic(error, operatorStage, operatorHttpStatus)));
    console.error("If apply was selected, earlier per-product commits may have completed; rerun dry-run to inspect remaining products.");
    process.exitCode = 1;
  });
}
