import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Public feature switches required by the existing production experience.
// Firebase credentials and all other settings still come from the normal env.
const result = spawnSync(process.execPath, [fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url)), "build", "--webpack"], {
  cwd: fileURLToPath(new URL("../", import.meta.url)),
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS: "true", NEXT_PUBLIC_ENABLE_INVENTORY: "true" },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
