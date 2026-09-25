import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const environment = {
  ...process.env,
  NEXT_PUBLIC_FIREBASE_API_KEY: "",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "",
  NEXT_PUBLIC_FIREBASE_APP_ID: "",
  NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: "",
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "false",
};
const nextCli = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const nextServer = spawn(
  process.execPath,
  [nextCli, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3102"],
  { cwd: process.cwd(), env: environment, stdio: "inherit" },
);

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:3102/");
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Next.js app-shell test server did not become ready in time.");
}

async function waitForClientReady() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:3102/", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: /앱 연결 설정이\s*필요합니다\./ }).waitFor({
      state: "visible",
      timeout: 120_000,
    });
  } finally {
    await browser.close();
  }
}

let exitCode = 1;
try {
  await waitForServer();
  await waitForClientReady();
  const playwrightCli = join(
    process.cwd(),
    "node_modules",
    "@playwright",
    "test",
    "cli.js",
  );
  const result = spawnSync(process.execPath, [playwrightCli, "test"], {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  });
  if (result.error) console.error(result.error.message);
  exitCode = result.status ?? 1;
} finally {
  nextServer.kill("SIGTERM");
}

process.exit(exitCode);
