import { spawnSync } from "node:child_process";

const scripts = process.argv.includes("--race-only") ? ["run-operations-update-race-gate.ts"]
  : ["run-phase15-admin-gate.ts", "run-employee-pin-gate.ts", "run-google-admin-access-gate.ts", "run-operations-update-race-gate.ts"];
for (const script of scripts) {
  const result = spawnSync(process.execPath, ["--import", "tsx", `scripts/${script}`], { env: process.env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
