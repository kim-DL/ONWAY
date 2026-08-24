import { join } from "node:path";
import { spawnSync } from "node:child_process";

const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
if (projectId !== "demo-onnuriway" || !firestoreHost) {
  throw new Error("Phase 5 gate requires the demo-onnuriway Firestore Emulator.");
}

const projectRoot = process.cwd();
const emulatorBase = `http://${firestoreHost}`;
const documentsBase = `${emulatorBase}/v1/projects/${projectId}/databases/(default)/documents`;

async function clearFirestore() {
  const response = await fetch(
    `${emulatorBase}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!response.ok) throw new Error(`Firestore clear failed with HTTP ${response.status}.`);
}

async function listDocuments(collectionId) {
  const response = await fetch(`${documentsBase}/${collectionId}?pageSize=100`, {
    headers: { authorization: "Bearer owner" },
  });
  if (!response.ok) throw new Error(`${collectionId} read failed with HTTP ${response.status}.`);
  const payload = await response.json();
  return payload.documents ?? [];
}

async function getDocument(path) {
  const response = await fetch(`${documentsBase}/${path}`, {
    headers: { authorization: "Bearer owner" },
  });
  if (!response.ok) throw new Error(`${path} read failed with HTTP ${response.status}.`);
  return response.json();
}

function runNode(args, expectedStatus) {
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== expectedStatus) {
    throw new Error(`Command exited with ${result.status}; expected ${expectedStatus}.`);
  }
}

await clearFirestore();

const importCli = join(projectRoot, "functions", "lib", "neis", "import-cli.js");
const fixture = join(projectRoot, "scripts", "fixtures", "neis-school-info.json");
runNode([importCli, "--fixture", fixture], 0);

const firstSchools = await listDocuments("schools");
if (firstSchools.length !== 3) {
  throw new Error(`Fixture import created ${firstSchools.length} schools instead of 3.`);
}
const sourceCodes = firstSchools.map(
  (document) => document.fields?.source?.mapValue?.fields?.schoolCode?.stringValue,
);
if (new Set(sourceCodes).size !== 3 || sourceCodes.some((code) => !code)) {
  throw new Error("Fixture import did not preserve three unique school codes.");
}
if (firstSchools.some(
  (document) => document.fields?.source?.mapValue?.fields?.educationOfficeCode?.stringValue !== "G10",
)) {
  throw new Error("Fixture import included a school outside the target education office.");
}

const firstRuns = await listDocuments("neisSyncRuns");
if (firstRuns.length !== 1) throw new Error("Fixture import must create exactly one sync run.");
await getDocument("secureSettings/neisInitialImport");

runNode([importCli, "--fixture", fixture], 1);
const [secondSchools, secondRuns] = await Promise.all([
  listDocuments("schools"),
  listDocuments("neisSyncRuns"),
]);
if (secondSchools.length !== 3 || secondRuns.length !== 1) {
  throw new Error("Rejected second import changed the existing database.");
}

await clearFirestore();
const vitestCli = join(projectRoot, "node_modules", "vitest", "vitest.mjs");
runNode([vitestCli, "run", "functions/tests/neis-import.emulator.test.ts"], 0);

console.log("Phase 5 NEIS fixture CLI and Firestore atomicity gate passed.");
