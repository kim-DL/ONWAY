import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

await import("./seed-emulator.js");

const nextCli = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const verifyProductionUx = process.env.ONNURIWAY_E2E_UX === "true";
if (verifyProductionUx) {
  const build = spawnSync(process.execPath, [nextCli, "build", "--webpack"], {
    cwd: process.cwd(), env: process.env, stdio: "inherit",
  });
  if (build.error) console.error(build.error.message);
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const nextServer = spawn(
  process.execPath,
  [nextCli, ...(verifyProductionUx ? ["start"] : ["dev", "--webpack"]), "--hostname", "127.0.0.1", "--port", "3103"],
  { cwd: process.cwd(), env: process.env, stdio: "inherit" },
);

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:3103/");
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Next.js Phase 9 test server did not become ready in time.");
}

const playwrightCli = join(process.cwd(), "node_modules", "@playwright", "test", "cli.js");
let exitCode = 1;
try {
  await waitForServer();
  const result = spawnSync(
    process.execPath,
    [playwrightCli, "test", ...(process.env.ONNURIWAY_E2E_UX === "true"
      ? process.env.ONNURIWAY_E2E_UX_SUITE === "auth"
        ? ["tests/e2e-auth/phase3-auth.spec.ts", "tests/e2e-auth/phase22-login-recovery.spec.ts"]
        : process.env.ONNURIWAY_E2E_UX_SUITE === "visits"
        ? ["tests/e2e-auth/phase10-sales-visit.spec.ts"]
        : process.env.ONNURIWAY_E2E_UX_SUITE === "cards"
          ? ["tests/e2e-auth/phase9-sales-cycle.spec.ts", "tests/e2e-auth/phase10-sales-visit.spec.ts", "tests/e2e-auth/phase12-csv-export.spec.ts"]
        : process.env.ONNURIWAY_E2E_UX_SUITE === "sales"
          ? ["tests/e2e-auth/phase9-sales-cycle.spec.ts"]
          : ["tests/e2e-auth/phase22-action-reach.spec.ts", "tests/e2e-auth/phase22-form-actions.spec.ts", "tests/e2e-auth/phase9-brand.spec.ts"]
      : ["tests/e2e-auth/phase9-sales-cycle.spec.ts", "tests/e2e-auth/phase9-brand.spec.ts"]), "--config", "playwright.phase3.config.ts",
      ...(process.env.ONNURIWAY_E2E_GREP ? ["--grep", process.env.ONNURIWAY_E2E_GREP] : [])],
    { cwd: process.cwd(), env: process.env, stdio: "inherit" },
  );
  if (result.error) console.error(result.error.message);
  exitCode = result.status ?? 1;
} finally {
  nextServer.kill("SIGTERM");
}

process.exit(exitCode);
