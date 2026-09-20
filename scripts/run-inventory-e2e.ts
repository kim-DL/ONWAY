import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";
import { resolve, sep } from "node:path";
import next from "next";
import { getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import nextConfig from "../next.config";
import { assertInventoryE2EEnvironment, INVENTORY_E2E_ORIGIN } from "./inventory-e2e-safety";

assertInventoryE2EEnvironment();
await import("./seed-emulator.js");
const seeded = getApps().find((app) => app.name === "phase1-seed");
if (!seeded) throw new Error("Inventory E2E seed is missing.");
// A dual-role field employee exercises the full four-mode header on mobile.
await getFirestore(seeded).doc("employees/EMP-DELIVERY").update({ roleScopes: ["delivery", "sales"] });
await getAuth(seeded).setCustomUserClaims("uid-delivery", { employeeId: "EMP-DELIVERY", roleScopes: ["delivery", "sales"], sessionVersion: 1, permissionsVersion: 1 });
// Reuse a test PIN but exercise the real read-only role. No auth/UI mocking.
await getFirestore(seeded).doc("employees/EMP-SALES-B").update({ roleScopes: ["viewer"], displayName: "재고 조회 직원" });
await getAuth(seeded).setCustomUserClaims("uid-sales-b", { employeeId: "EMP-SALES-B", roleScopes: ["viewer"], sessionVersion: 1, permissionsVersion: 1 });

async function startApp(): Promise<() => Promise<void>> {
  if (process.env.INVENTORY_E2E_STATIC === "true") {
    const appRoot = resolve(process.env.INVENTORY_E2E_STATIC_APP ?? "");
    const allowed = resolve(process.cwd(), "output/playwright/inventory-runtime");
    if (!appRoot.startsWith(`${allowed}${sep}static-app-`) || !/^static-app-[\w-]+$/.test(appRoot.slice(allowed.length + 1))) throw new Error("Unsafe inventory static app path.");
    const child = spawn(process.execPath, [join(appRoot, "scripts/serve-hosting-local.mjs"), "--port", "3103", "--hostname", "127.0.0.1"], {
      cwd: appRoot, env: { ...process.env, NODE_ENV: "production" }, stdio: "inherit", windowsHide: true,
    });
    let startupError: Error | undefined;
    child.once("error", (error) => { startupError = error; });
    try {
      const deadline = Date.now() + 30_000;
      for (;;) {
        if (startupError) throw startupError;
        if (child.exitCode !== null) throw new Error("Inventory static server exited before startup.");
        try { if ((await fetch(INVENTORY_E2E_ORIGIN, { signal: AbortSignal.timeout(1000) })).ok) break; } catch { /* Wait for the local-only server to bind. */ }
        if (Date.now() > deadline) throw new Error("Inventory static server startup timed out.");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) { child.kill(); throw error; }
    return async () => { if (child.exitCode === null) await new Promise<void>((resolve) => { child.once("exit", () => resolve()); child.kill(); }); };
  }
  const app = next({ dev: true, webpack: true, dir: process.cwd(), hostname: "127.0.0.1", port: 3103,
    conf: { ...nextConfig, distDir: "output/playwright/inventory-next" } });
  await app.prepare();
  const server = createServer(app.getRequestHandler());
  server.on("upgrade", app.getUpgradeHandler());
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(3103, "127.0.0.1", resolve); });
  return async () => { server.closeAllConnections(); server.close(); await app.close(); };
}
const stopApp = await startApp();
let exitCode = 1;
try {
  const response = await fetch(INVENTORY_E2E_ORIGIN, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Inventory E2E app failed to start: HTTP ${response.status}.`);
  const cli = join(process.cwd(), "node_modules", "@playwright", "test", "cli.js");
  exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "test", "tests/e2e-auth/inventory-flow.spec.ts", "--config", "playwright.phase3.config.ts", "--output", "output/playwright/inventory-results", "--reporter", "list", ...(process.env.INVENTORY_E2E_DEBUG_OFFLINE === "true" ? ["--grep", "offline registration draft"] : [])], { cwd: process.cwd(), env: process.env, stdio: "inherit", windowsHide: true });
    child.once("error", reject); child.once("exit", (code) => resolve(code ?? 1));
  });
  // Use this already-guarded, owned emulator lifetime for transaction/rules
  // integration too. The suite creates its own random demo project and never
  // clears the browser fixture's data or touches a configured real project.
  assertInventoryE2EEnvironment();
  const integrationExitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [join(process.cwd(), "node_modules/vitest/vitest.mjs"), "run", "functions/tests/inventory-emulator.test.ts", "--maxWorkers=1"], {
      cwd: process.cwd(), env: { ...process.env, INVENTORY_EMULATOR_TESTS: "true" }, stdio: "inherit", windowsHide: true,
    });
    child.once("error", reject); child.once("exit", (code) => resolve(code ?? 1));
  });
  if (integrationExitCode !== 0) exitCode = integrationExitCode;
} finally {
  await stopApp();
}
process.exit(exitCode);
