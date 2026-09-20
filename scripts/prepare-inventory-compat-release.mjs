import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { cp, copyFile, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

export const INVENTORY_COMPAT_TARGETS = ["getInventoryContext", "listInventoryProducts", "getInventoryProduct", "saveInventoryProduct",
  "recordInventoryMovement", "recordInventoryCount", "updateInventoryLot", "setInventoryProductStatus", "deleteInventoryProduct",
  "updateInventorySettings", "listInventoryHistory", "uploadInventoryPhoto", "getInventoryPhoto"];

export function inventoryCompatibilitySource(source) {
  const replacements = [
    ["...(current?.lotSummary ? { lotSummary: current.lotSummary } : !current ? { lotSummary: summarizeInventoryLotGroups([]) } : {}),",
      "...(current?.lotSummary ? { lotSummary: current.lotSummary } : {}),"],
    ["      lotSummary: summarizeInventoryLotGroups(lots),",
      "      ...(product.lotSummary ? { lotSummary: summarizeInventoryLotGroups(lots) } : {}),"],
    ["persisted({ ...next, inspectionByLot })",
      "persisted({ ...next, ...(product.inspectionByLot !== undefined ? { inspectionByLot } : {}) })"],
    ["const inspectionCycleId = input.inspectionCycleId || (today === cycle.startDate ? cycle.cycleId : null);",
      "const inspectionCycleId = input.inspectionCycleId ?? null;"],
  ];
  let transformed = source;
  for (const [before, after] of replacements) {
    assert.equal(transformed.split(before).length - 1, 1, "Compatibility source anchor changed; do not guess or deploy an unverified transform.");
    transformed = transformed.replace(before, after);
  }
  return transformed;
}

export async function verifyInventoryCompatibilityPackage(output) {
  const { InventoryService } = await import(pathToFileURL(path.join(output, "functions/lib/inventory/inventory-service.js")).href);
  const { inventoryProductSchema, inventoryLotSchema, inventoryLocationMap } = await import(pathToFileURL(path.join(output, "functions/lib/inventory/inventory-contract.js")).href);
  const { inventorySummaryResponse, summarizeInventoryLotGroups } = await import(pathToFileURL(path.join(output, "functions/lib/inventory/inventory-stock-summary.js")).href);
  const now = new Date("2026-09-11T01:00:00Z"); const requestId = randomUUID();
  const actor = { uid: "compat-check", employeeId: "EMP-COMPAT", roleScopes: ["delivery"], isAdmin: false, sessionVersion: 1, permissionsVersion: 1 };
  const product = inventoryProductSchema.parse({ name: "검증 상품", manufacturer: "", specification: "", origin: "", unitLabel: "봉", unitsPerBox: 1,
    defaultLocationId: "freezer1", note: "", urgent: false, productId: "compat-product", companyId: "onnuri", status: "active", revision: 1, stockRevision: 0,
    hasHistory: false, quantityByLocation: inventoryLocationMap(0), nearestExpiryByLocation: inventoryLocationMap(null), lastCountByLocation: inventoryLocationMap(null),
    photo: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), createdBy: actor.employeeId, updatedBy: actor.employeeId });
  const lot = inventoryLotSchema.parse({ label: "", expiryState: "dated", expiryDate: "2027-01-01", lotId: "first-freezer1", productId: product.productId,
    originLotId: "first", locationId: "freezer1", quantity: 5, revision: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() });
  const input = { requestId, productId: product.productId, locationId: "freezer1", reason: "", includeDetail: true };
  const db = { doc: (value) => value }; const service = new InventoryService(db, () => now);
  const writes = [];
  const transaction = { set: (ref, value) => writes.push({ ref, value }), create: (ref, value) => writes.push({ ref, value }) };
  const line = { lotId: lot.lotId, locationId: lot.locationId, before: 0, after: 5, delta: 5 };
  // Exercise the compiled committing logic without a network/Firestore client.
  const legacy = service.writeStock(transaction, input, actor, now, product, [lot], [lot], "receive", [line]);
  const legacyStored = writes.find((entry) => entry.ref.endsWith("/compat-product")).value;
  assert(!("lotSummary" in legacyStored)); assert(!("inspectionByLot" in legacyStored));
  inventoryProductSchema.omit({ lotSummary: true }).strict().parse(legacy.product);
  assert.equal(legacy.product.lastCountByLocation.freezer1, null);

  writes.length = 0;
  const secondLot = { ...lot, lotId: "second-freezer1", originLotId: "second", quantity: 2 };
  const expanded = { ...product, lotSummary: summarizeInventoryLotGroups([secondLot]), inspectionByLot: {
    [secondLot.lotId]: { cycleId: "week-2026-09-11", quantity: 2, checkedAt: now.toISOString(), checkedBy: actor.employeeId, changed: false },
  } };
  const preserved = service.writeStock(transaction, input, actor, now, expanded, [lot, secondLot], [lot], "receive", [line], "week-2026-09-11");
  const expandedStored = writes.find((entry) => entry.ref.endsWith("/compat-product")).value;
  assert.deepEqual(expandedStored.lotSummary.all, { lotCount: 2, expiryCount: 1 });
  assert.equal(Object.keys(expandedStored.inspectionByLot).length, 2);
  assert.deepEqual(expandedStored.inspectionByLot[secondLot.lotId], expanded.inspectionByLot[secondLot.lotId]);
  assert.equal(preserved.product.lastCountByLocation.freezer1.stockChangedSinceCount, false);
  inventoryProductSchema.omit({ lotSummary: true }).strict().parse(inventorySummaryResponse(preserved.product, false));
  assert(!("inspectionByLot" in preserved.product));
  return { compiledWriteGate: true, existingFieldsPreserved: true, legacyWireAccepted: true };
}

export async function prepareInventoryCompatibilityPackage(outputArgument) {
  const root = await realpath(path.resolve(import.meta.dirname, ".."));
  assert(typeof outputArgument === "string" && outputArgument.length > 0, "An explicit new output directory is required.");
  const output = path.resolve(root, outputArgument); const allowed = path.join(root, ".cache", "deploy");
  const relative = path.relative(allowed, output);
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && path.dirname(output) === allowed,
    "Output must be a new direct child of this workspace's .cache/deploy directory.");
  await mkdir(allowed, { recursive: true, mode: 0o700 });
  assert.equal(await realpath(allowed), allowed, "Deployment parent must not redirect through a link.");
  await mkdir(output, { recursive: false, mode: 0o700 }); // Fail if it exists; never remove/overwrite another package.
  const sourceDir = path.join(root, "functions"); const destination = path.join(output, "functions");
  await mkdir(destination, { mode: 0o700 });
  await cp(path.join(sourceDir, "src"), path.join(destination, "src"), { recursive: true, errorOnExist: true, force: false });
  for (const file of ["package.json", "tsconfig.json"]) await copyFile(path.join(sourceDir, file), path.join(destination, file));
  // Production runtime dotenv only. Never copy local emulator secrets, account
  // keys, node_modules, test artifacts or .env.example, and never print values.
  const copiedEnv = [];
  for (const file of [".env", ".env.onnuriway"]) {
    try { if ((await stat(path.join(sourceDir, file))).isFile()) { await copyFile(path.join(sourceDir, file), path.join(destination, file)); copiedEnv.push(file); } }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
  const sourcePath = path.join(sourceDir, "src/inventory/inventory-service.ts");
  const source = await readFile(sourcePath, "utf8"); const transformed = inventoryCompatibilitySource(source);
  await writeFile(path.join(destination, "src/inventory/inventory-service.ts"), transformed);
  const config = { functions: { source: "functions", runtime: "nodejs22", predeploy: ['npm --prefix "$RESOURCE_DIR" run build'] } };
  await writeFile(path.join(output, "firebase.compat.json"), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  const compiler = path.join(root, "node_modules/typescript/bin/tsc");
  const build = spawnSync(process.execPath, [compiler, "--project", path.join(destination, "tsconfig.json")], { cwd: root, encoding: "utf8", windowsHide: true });
  if (build.status !== 0) { process.stderr.write(build.stdout || ""); process.stderr.write(build.stderr || ""); throw new Error("Compatibility build failed. No deployment was performed."); }
  const verification = await verifyInventoryCompatibilityPackage(output);
  assert.equal(await readFile(sourcePath, "utf8"), source, "Original function source changed during staging; discard this package and prepare a fresh one.");
  const manifest = { phase: "inventory-compatibility-only", project: "onnuriway", database: "(default)",
    sourceSha256: createHash("sha256").update(source).digest("hex"), transforms: 4, verification,
    targets: INVENTORY_COMPAT_TARGETS, runtimeEnvFiles: copiedEnv, generatedAt: new Date().toISOString() };
  await writeFile(path.join(output, "compat-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return { output, config: path.join(output, "firebase.compat.json"), ...manifest };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !args[0].startsWith("--output=")) throw new Error("Usage: node scripts/prepare-inventory-compat-release.mjs --output=.cache/deploy/<new-private-package>");
  prepareInventoryCompatibilityPackage(args[0].slice("--output=".length)).then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch(() => { console.error("Compatibility package preparation failed; inspect the guarded source anchors or build diagnostics. Nothing was deployed and no directory was removed."); process.exitCode = 1; });
}
