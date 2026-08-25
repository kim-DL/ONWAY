import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();
const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const vitestCli = join(projectRoot, "node_modules", "vitest", "vitest.mjs");
const outputPath = join(projectRoot, "output", "acceptance", "phase17-emulator.json");
const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;

if (projectId !== "demo-onnuriway" || !firestoreHost) {
  throw new Error("Phase 17 suite requires the demo-onnuriway Firestore Emulator.");
}

async function clearFirestore() {
  const response = await fetch(
    `http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(`Phase 17 Firestore isolation failed with HTTP ${response.status}.`);
  }
}

const gates = [
  ["NEIS initial import", [join(projectRoot, "scripts", "run-phase5-neis-gate.mjs")]],
  ["Search catalog publication", [tsxCli, join(projectRoot, "scripts", "run-phase6-search-gate.ts")]],
  ["Field profile mutation", [tsxCli, join(projectRoot, "scripts", "run-phase7-field-gate.ts")]],
  ["Versioned photo lifecycle", [tsxCli, join(projectRoot, "scripts", "run-phase8-photo-gate.ts")]],
  ["Monthly sales assignments", [tsxCli, join(projectRoot, "scripts", "run-phase9-sales-gate.ts")]],
  ["Atomic sales visit", [tsxCli, join(projectRoot, "scripts", "run-phase10-sales-visit-gate.ts")]],
  ["Sales history collaboration", [tsxCli, join(projectRoot, "scripts", "run-phase11-sales-history-gate.ts")]],
  ["Filtered expiring CSV", [tsxCli, join(projectRoot, "scripts", "run-phase12-csv-export-gate.ts")]],
  ["NEIS and Kakao synchronization", [tsxCli, join(projectRoot, "scripts", "run-phase13-sync-gate.ts")]],
  ["Google-approved administration", [tsxCli, join(projectRoot, "scripts", "run-phase15-admin-gate.ts")]],
  ["Firestore and Storage red team", [vitestCli, "run", "--config", "vitest.rules.config.ts"]],
  ["Production full user journey", [tsxCli, join(projectRoot, "scripts", "run-phase17-e2e.ts")]],
];

const results = [];
mkdirSync(join(projectRoot, "output", "acceptance"), { recursive: true });

for (const [name, args] of gates) {
  const startedAt = Date.now();
  console.log(`\n[Phase 17] ${name}`);
  await clearFirestore();
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });
  const gate = {
    name,
    durationMs: Date.now() - startedAt,
    status: result.status === 0 ? "passed" : "failed",
  };
  results.push(gate);
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) {
    writeFileSync(outputPath, `${JSON.stringify({ status: "failed", gates: results }, null, 2)}\n`);
    process.exit(result.status ?? 1);
  }
}

const report = { status: "passed", gates: results };
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
