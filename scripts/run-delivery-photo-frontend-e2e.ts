import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "demo-onnuriway"
  || process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true"
  || process.env.NEXT_PUBLIC_ENABLE_DELIVERY_PHOTOS !== "true"
  || !/^(127\.0\.0\.1|localhost):/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "")) {
  throw new Error("Delivery photo frontend E2E requires demo emulators and a local flag-on build.");
}

await import("./seed-emulator.js");
const environment = { ...process.env };
const nextCli = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const build = spawnSync(process.execPath, [nextCli, "build", "--webpack"], {
  cwd: process.cwd(), env: environment, stdio: "inherit",
});
if (build.error) console.error(build.error.message);
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn(process.execPath,
  [join(process.cwd(), "scripts", "serve-hosting-local.mjs"), "--hostname", "127.0.0.1", "--port", "3103"],
  { cwd: process.cwd(), env: environment, stdio: "inherit" });
let exitCode = 1;
try {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try { if ((await fetch("http://127.0.0.1:3103/")).ok) break; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const cli = join(process.cwd(), "node_modules", "@playwright", "test", "cli.js");
  const result = spawnSync(process.execPath,
    [cli, "test", "tests/e2e-auth/delivery-photo-field.spec.ts", "--config", "playwright.phase3.config.ts"],
    { cwd: process.cwd(), env: environment, stdio: "inherit" });
  if (result.error) console.error(result.error.message);
  exitCode = result.status ?? 1;
} finally { server.kill("SIGTERM"); }
process.exit(exitCode);
