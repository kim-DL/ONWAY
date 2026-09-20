import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { createServer } from "node:net";
import { build } from "esbuild";
import { prepareStaticInventoryApp } from "./run-inventory-e2e-static.mjs";

// Dedicated emulator-only launcher. Never deploys, exports, imports, or reuses
// a running emulator; all generated configuration lives under test artifacts.
const root = process.cwd();
const projectId = "demo-inventory-e2e";
const runtime = join(root, "output", "playwright", "inventory-runtime");
const environment = { ...process.env };
const inheritedPath = Object.entries(environment).find(([key]) => key.toLowerCase() === "path")?.[1] ?? "";
for (const key of Object.keys(environment)) {
  if (key.toLowerCase() === "path" || /^(GOOGLE_APPLICATION_CREDENTIALS|FIREBASE_TOKEN|FIREBASE_CONFIG|GCLOUD_PROJECT|GOOGLE_CLOUD_PROJECT|FIREBASE_PROJECT_ID|NEXT_PUBLIC_FIREBASE_|NEXT_PUBLIC_KAKAO_|PIN_LOOKUP_SECRET|PIN_PEPPER)/.test(key)) delete environment[key];
}
Object.assign(environment, {
  PATH: `${dirname(process.execPath)}${delimiter}${inheritedPath}`, NODE_ENV: "development", CI: "true", NEXT_TELEMETRY_DISABLED: "1",
  INVENTORY_E2E: "true", FIREBASE_PROJECT_ID: projectId, GCLOUD_PROJECT: projectId, GOOGLE_CLOUD_PROJECT: projectId,
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1234567890", NEXT_PUBLIC_FIREBASE_APP_ID: `1:1234567890:web:${projectId}`,
  NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: "", NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true", NEXT_PUBLIC_ENABLE_INVENTORY: "true",
  NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY: "", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
  PIN_LOOKUP_SECRET: "demo-only-phase3-pin-lookup-secret-change-before-production-2026",
  PIN_PEPPER: "demo-only-phase3-pin-pepper-change-before-production-2026-secret",
  TARGET_EDUCATION_OFFICE_CODE: "G10",
});
if (!environment.JAVA_HOME) {
  const jdk = readdirSync(join(root, ".tools")).find((name) => name.startsWith("jdk-21"));
  if (jdk) environment.JAVA_HOME = join(root, ".tools", jdk);
}
if (environment.JAVA_HOME) environment.PATH = `${join(environment.JAVA_HOME, "bin")}${delimiter}${environment.PATH}`;
for (const port of [3103, 4000, 4400, 4500, 5001, 8080, 9099, 9199]) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () => reject(new Error(`Inventory E2E port ${port} is occupied; refusing to touch another session.`)));
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
function run(args, cwd = root) {
  const result = spawnSync(process.execPath, args, { cwd, env: environment, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Inventory E2E helper exited ${result.status ?? 1}.`);
}
mkdirSync(runtime, { recursive: true });
if (process.env.INVENTORY_E2E_STATIC === "true") {
  environment.INVENTORY_E2E_STATIC = "true";
  environment.INVENTORY_E2E_STATIC_APP = prepareStaticInventoryApp(root, runtime, environment);
}
const functionsRoot = join(runtime, "functions");
mkdirSync(functionsRoot, { recursive: true });
run([join(root, "node_modules", "typescript", "bin", "tsc"), "--outDir", join(functionsRoot, "lib")], join(root, "functions"));
const manifest = JSON.parse(readFileSync(join(root, "functions", "package.json"), "utf8"));
writeFileSync(join(functionsRoot, "package.json"), JSON.stringify({ ...manifest, main: "lib/inventory-e2e-index.js" }, null, 2));
// Export real production callables, not mock implementations. Do not load
// scheduled/external NEIS/Kakao jobs or production functions/.env files.
writeFileSync(join(functionsRoot, "lib", "inventory-e2e-index.js"), [
  'export { employeeLogin, employeeLogout } from "./auth/callables.js";',
  'export { getInventoryContext, listInventoryProducts, getInventoryProduct, saveInventoryProduct, recordInventoryMovement, recordInventoryCount, updateInventoryLot, setInventoryProductStatus, deleteInventoryProduct, updateInventorySettings, listInventoryHistory, listInventoryManufacturers, createInventoryManufacturer, updateInventoryManufacturer, uploadInventoryPhoto, getInventoryPhoto } from "./inventory/callables.js";',
].join("\n"));
writeFileSync(join(functionsRoot, ".secret.local"), `PIN_LOOKUP_SECRET=${environment.PIN_LOOKUP_SECRET}\nPIN_PEPPER=${environment.PIN_PEPPER}\n`);
for (const name of ["firestore.rules", "firestore.indexes.json", "storage.rules"]) cpSync(join(root, name), join(runtime, name));
const configuration = { functions: { source: "functions", runtime: "nodejs22" },
  firestore: { rules: "firestore.rules", indexes: "firestore.indexes.json" }, storage: { rules: "storage.rules" },
  emulators: { auth: { host: "127.0.0.1", port: 9099 }, functions: { host: "127.0.0.1", port: 5001 }, firestore: { host: "127.0.0.1", port: 8080 }, storage: { host: "127.0.0.1", port: 9199 }, ui: { enabled: false }, singleProjectMode: true } };
const configurationPath = join(runtime, "firebase.json");
writeFileSync(configurationPath, JSON.stringify(configuration, null, 2));
const runner = join(runtime, "runner.mjs");
await build({ absWorkingDir: root, tsconfig: "tsconfig.json", entryPoints: ["scripts/run-inventory-e2e.ts"], outfile: runner, bundle: true, platform: "node", format: "esm", packages: "external", logLevel: "warning" });
const firebaseCli = join(root, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
if (!existsSync(firebaseCli)) throw new Error("Install repository dependencies before running inventory E2E.");
run([firebaseCli, "emulators:exec", "--only", "auth,firestore,functions,storage", "--project", projectId,
  "--config", configurationPath, `"${process.execPath}" "${runner}"`]);
