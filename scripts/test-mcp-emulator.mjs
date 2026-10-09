import { spawnSync } from "node:child_process";
// Dedicated opt-in runner: never seeds, reads or mutates a real Firebase project.
const env = { ...process.env, GCLOUD_PROJECT: "demo-onnuriway", GOOGLE_CLOUD_PROJECT: "demo-onnuriway",
  MCP_EMULATOR_TEST: "true", MCP_PUBLIC_ORIGIN: "http://127.0.0.1:5002", MCP_ALLOWED_EMPLOYEE_IDS: "MCP-INTEGRATION",
  PIN_LOOKUP_SECRET: "demo-only-mcp-lookup-at-least-thirty-two-characters",
  PIN_PEPPER: "demo-only-mcp-pepper-at-least-thirty-two-characters", DELIVERY_PHOTO_BUCKET: "demo-onnuriway-delivery-photos.appspot.com",
  FIREBASE_CONFIG: JSON.stringify({ projectId: "demo-onnuriway", storageBucket: "demo-onnuriway.appspot.com" }) };
const build = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "--project", "functions/tsconfig.json"], { env, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
const result = spawnSync(process.execPath, ["--import", "./scripts/firebase-emulator-loopback.mjs", "node_modules/firebase-tools/lib/bin/firebase.js", "emulators:exec", "--config", "firebase.mcp.json", "--only", "auth,firestore,storage,functions,hosting",
  "--project", "demo-onnuriway", '"' + process.execPath + '" node_modules/vitest/vitest.mjs run functions/tests/mcp/emulator.test.ts functions/tests/mcp/inventory-write.emulator.test.ts --maxWorkers=1'], { env, stdio: "inherit" });
process.exit(result.status ?? 1);
