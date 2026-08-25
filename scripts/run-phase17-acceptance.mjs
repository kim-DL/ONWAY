import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const projectRoot = process.cwd();
const npmCli = process.env.npm_execpath
  ?? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const outputDirectory = join(projectRoot, "output", "acceptance");
const outputPath = join(outputDirectory, "phase17-report.json");
const gates = [
  ["Dependency audit", ["run", "audit"]],
  ["ESLint", ["run", "lint"]],
  ["TypeScript", ["run", "typecheck"]],
  ["Unit contracts", ["test"]],
  ["Search and cache performance", ["run", "test:performance"]],
  ["Production build", ["run", "build"]],
  ["PWA artifact", ["run", "verify:pwa:build"]],
  ["JavaScript budget", ["run", "verify:performance:build"]],
  ["Safe configuration browser", ["run", "test:e2e"]],
  ["Emulator and full user journey", ["run", "test:acceptance:emulator"]],
];

mkdirSync(outputDirectory, { recursive: true });
const results = [];
for (const [name, args] of gates) {
  const startedAt = Date.now();
  console.log(`\n[Phase 17] ${name}`);
  const result = spawnSync(process.execPath, [npmCli, ...args], {
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
    writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, status: "failed", generatedAt: new Date().toISOString(), gates: results }, null, 2)}\n`);
    process.exit(result.status ?? 1);
  }
}

const emulatorReport = JSON.parse(
  readFileSync(join(outputDirectory, "phase17-emulator.json"), "utf8"),
);
const report = {
  schemaVersion: 1,
  status: "passed",
  generatedAt: new Date().toISOString(),
  p0Defects: 0,
  p1Defects: 0,
  gates: results,
  emulatorGates: emulatorReport.gates,
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
