import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["scripts/firebase-emulators.mjs", "phase9focus"], {
  stdio: "inherit",
  env: { ...process.env, ONNURIWAY_E2E_UX: "true" },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
