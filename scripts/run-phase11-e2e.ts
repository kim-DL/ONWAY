import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

await import("./seed-emulator.js");

const nextCli = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const nextServer = spawn(
  process.execPath,
  [nextCli, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3103"],
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
  throw new Error("Next.js Phase 11 test server did not become ready in time.");
}

const playwrightCli = join(process.cwd(), "node_modules", "@playwright", "test", "cli.js");
let exitCode = 1;
try {
  await waitForServer();
  const result = spawnSync(
    process.execPath,
    [playwrightCli, "test", "tests/e2e-auth/phase11-sales-history.spec.ts", "--config", "playwright.phase3.config.ts"],
    { cwd: process.cwd(), env: process.env, stdio: "inherit" },
  );
  if (result.error) console.error(result.error.message);
  exitCode = result.status ?? 1;
} finally {
  nextServer.kill("SIGTERM");
}

process.exit(exitCode);
