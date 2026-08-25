import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

await import("./seed-emulator.js");

const environment = {
  ...process.env,
  PHASE16_PERFORMANCE_GATE: "true",
};
const nextCli = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const build = spawnSync(process.execPath, [nextCli, "build", "--webpack"], {
  cwd: process.cwd(),
  env: environment,
  stdio: "inherit",
});
if (build.error) console.error(build.error.message);
if (build.status !== 0) process.exit(build.status ?? 1);

const nextServer = spawn(
  process.execPath,
  [nextCli, "start", "--hostname", "127.0.0.1", "--port", "3103"],
  { cwd: process.cwd(), env: environment, stdio: "inherit" },
);

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:3103/");
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Next.js Phase 17 production test server did not become ready in time.");
}

const playwrightCli = join(process.cwd(), "node_modules", "@playwright", "test", "cli.js");
let exitCode = 1;
try {
  await waitForServer();
  const result = spawnSync(
    process.execPath,
    [playwrightCli, "test", "--config", "playwright.phase3.config.ts"],
    { cwd: process.cwd(), env: environment, stdio: "inherit" },
  );
  if (result.error) console.error(result.error.message);
  exitCode = result.status ?? 1;
} finally {
  nextServer.kill("SIGTERM");
}

process.exit(exitCode);
