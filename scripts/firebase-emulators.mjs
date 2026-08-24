import { existsSync, readdirSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = process.cwd();
const toolsRoot = join(projectRoot, ".tools");
const environment = { ...process.env };
const inheritedExecutablePath = Object.entries(environment)
  .find(([key]) => key.toLowerCase() === "path")?.[1] ?? "";
for (const key of Object.keys(environment)) {
  if (key.toLowerCase() === "path") delete environment[key];
}
environment.PATH = `${dirname(process.execPath)}${delimiter}${inheritedExecutablePath}`;

environment.PIN_LOOKUP_SECRET ??=
  "demo-only-phase3-pin-lookup-secret-change-before-production-2026";
environment.PIN_PEPPER ??=
  "demo-only-phase3-pin-pepper-change-before-production-2026-secret";
environment.NEXT_PUBLIC_FIREBASE_API_KEY ??= "demo-api-key";
environment.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??= "demo-onnuriway.firebaseapp.com";
environment.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= "demo-onnuriway";
environment.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??= "demo-onnuriway.appspot.com";
environment.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??= "1234567890";
environment.NEXT_PUBLIC_FIREBASE_APP_ID ??= "1:1234567890:web:demo-onnuriway";
environment.NEXT_PUBLIC_USE_FIREBASE_EMULATORS ??= "true";
environment.TARGET_EDUCATION_OFFICE_CODE ??= "G10";

if (!environment.JAVA_HOME && existsSync(toolsRoot)) {
  const localJdk = readdirSync(toolsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("jdk-21"))
    .map((entry) => join(toolsRoot, entry.name))
    .find((directory) => existsSync(join(directory, "bin", process.platform === "win32" ? "java.exe" : "java")));

  if (localJdk) {
    environment.JAVA_HOME = localJdk;
    environment.PATH = `${join(localJdk, "bin")}${delimiter}${environment.PATH ?? ""}`;
  }
}

const [mode, ...commandParts] = process.argv.slice(2);
const firebaseCli = join(projectRoot, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");

if (!existsSync(firebaseCli)) {
  console.error("firebase-tools is not installed. Run npm install first.");
  process.exit(1);
}

const commonArgs = ["--project", "demo-onnuriway"];
let firebaseArgs;

if (mode === "start") {
  firebaseArgs = ["emulators:start", ...commonArgs];
} else if (mode === "rules") {
  environment.CI = "true";
  const vitestCli = join(projectRoot, "node_modules", "vitest", "vitest.mjs");
  const testCommand = `"${process.execPath}" "${vitestCli}" run --config vitest.rules.config.ts`;
  firebaseArgs = [
    "emulators:exec",
    "--only",
    "firestore,storage",
    ...commonArgs,
    testCommand,
  ];
} else if (mode === "seed") {
  environment.CI = "true";
  const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const seedCommand = `"${process.execPath}" "${tsxCli}" "${join(projectRoot, "scripts", "seed-emulator.ts")}"`;
  firebaseArgs = [
    "emulators:exec",
    "--only",
    "auth,firestore",
    ...commonArgs,
    seedCommand,
  ];
} else if (mode === "phase3" || mode === "phase4" || mode === "phase6e2e" || mode === "phase7e2e" || mode === "phase8e2e" || mode === "phase9e2e" || mode === "phase9focus" || mode === "phase10e2e" || mode === "phase10focus" || mode === "phase11e2e" || mode === "phase11focus" || mode === "phase12e2e" || mode === "phase12focus" || mode === "phase13e2e" || mode === "phase13focus" || mode === "phase16e2e") {
  environment.CI = "true";
  const tscCli = join(projectRoot, "node_modules", "typescript", "bin", "tsc");
  const buildResult = spawnSync(process.execPath, [tscCli], {
    cwd: join(projectRoot, "functions"),
    env: environment,
    stdio: "inherit",
  });
  if (buildResult.error) {
    console.error(buildResult.error.message);
  }
  if (buildResult.status !== 0) {
    process.exit(buildResult.status ?? 1);
  }

  const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const e2eRunner = mode === "phase16e2e"
    ? "run-phase16-e2e.ts"
    : mode === "phase9focus"
      ? "run-phase9-e2e.ts"
    : mode === "phase10focus"
      ? "run-phase10-e2e.ts"
      : mode === "phase11focus"
        ? "run-phase11-e2e.ts"
      : mode === "phase12focus"
        ? "run-phase12-e2e.ts"
        : mode === "phase13focus"
          ? "run-phase13-e2e.ts"
          : "run-phase3-e2e.ts";
  const phase3Command = `"${process.execPath}" "${tsxCli}" "${join(projectRoot, "scripts", e2eRunner)}"`;
  firebaseArgs = [
    "emulators:exec",
    "--only",
    "auth,firestore,functions,storage",
    ...commonArgs,
    phase3Command,
  ];
} else if (mode === "phase5") {
  environment.CI = "true";
  const tscCli = join(projectRoot, "node_modules", "typescript", "bin", "tsc");
  const buildResult = spawnSync(process.execPath, [tscCli], {
    cwd: join(projectRoot, "functions"),
    env: environment,
    stdio: "inherit",
  });
  if (buildResult.error) {
    console.error(buildResult.error.message);
  }
  if (buildResult.status !== 0) {
    process.exit(buildResult.status ?? 1);
  }

  const phase5Command = `"${process.execPath}" "${join(projectRoot, "scripts", "run-phase5-neis-gate.mjs")}"`;
  firebaseArgs = [
    "emulators:exec",
    "--only",
    "firestore",
    ...commonArgs,
    phase5Command,
  ];
} else if (mode === "phase6") {
  environment.CI = "true";
  const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const phase6Command = `"${process.execPath}" "${tsxCli}" "${join(projectRoot, "scripts", "run-phase6-search-gate.ts")}"`;
  firebaseArgs = [
    "emulators:exec",
    "--only",
    "firestore",
    ...commonArgs,
    phase6Command,
  ];
} else if (mode === "phase7") {
  environment.CI = "true";
  const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const phase7Command = `"${process.execPath}" "${tsxCli}" "${join(projectRoot, "scripts", "run-phase7-field-gate.ts")}"`;
  firebaseArgs = [
    "emulators:exec",
    "--only",
    "firestore",
    ...commonArgs,
    phase7Command,
  ];
} else if (mode === "phase8") {
  environment.CI = "true";
  environment.STORAGE_EMULATOR_HOST ??= "http://127.0.0.1:9199";
  const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const phase8Command = `"${process.execPath}" "${tsxCli}" "${join(projectRoot, "scripts", "run-phase8-photo-gate.ts")}"`;
  firebaseArgs = [
    "emulators:exec",
    "--only",
    "firestore,storage",
    ...commonArgs,
    phase8Command,
  ];
} else if (mode === "phase9") {
  environment.CI = "true";
  const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const phase9Command = `"${process.execPath}" "${tsxCli}" "${join(projectRoot, "scripts", "run-phase9-sales-gate.ts")}"`;
  firebaseArgs = [
    "emulators:exec",
    "--only",
    "firestore",
    ...commonArgs,
    phase9Command,
  ];
} else if (mode === "phase10") {
  environment.CI = "true";
  const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const phase10Command = `"${process.execPath}" "${tsxCli}" "${join(projectRoot, "scripts", "run-phase10-sales-visit-gate.ts")}"`;
  firebaseArgs = [
    "emulators:exec",
    "--only",
    "firestore",
    ...commonArgs,
    phase10Command,
  ];
} else if (mode === "phase11") {
  environment.CI = "true";
  const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const phase11Command = `"${process.execPath}" "${tsxCli}" "${join(projectRoot, "scripts", "run-phase11-sales-history-gate.ts")}"`;
  firebaseArgs = [
    "emulators:exec",
    "--only",
    "firestore",
    ...commonArgs,
    phase11Command,
  ];
} else if (mode === "phase12") {
  environment.CI = "true";
  environment.STORAGE_EMULATOR_HOST ??= "http://127.0.0.1:9199";
  const tscCli = join(projectRoot, "node_modules", "typescript", "bin", "tsc");
  const buildResult = spawnSync(process.execPath, [tscCli], {
    cwd: join(projectRoot, "functions"),
    env: environment,
    stdio: "inherit",
  });
  if (buildResult.error) console.error(buildResult.error.message);
  if (buildResult.status !== 0) process.exit(buildResult.status ?? 1);
  const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const phase12Command = `"${process.execPath}" "${tsxCli}" "${join(projectRoot, "scripts", "run-phase12-csv-export-gate.ts")}"`;
  firebaseArgs = [
    "emulators:exec",
    "--only",
    "firestore,storage",
    ...commonArgs,
    phase12Command,
  ];
} else if (mode === "phase13") {
  environment.CI = "true";
  const tscCli = join(projectRoot, "node_modules", "typescript", "bin", "tsc");
  const buildResult = spawnSync(process.execPath, [tscCli], {
    cwd: join(projectRoot, "functions"),
    env: environment,
    stdio: "inherit",
  });
  if (buildResult.error) console.error(buildResult.error.message);
  if (buildResult.status !== 0) process.exit(buildResult.status ?? 1);
  const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const phase13Command = `"${process.execPath}" "${tsxCli}" "${join(projectRoot, "scripts", "run-phase13-sync-gate.ts")}"`;
  firebaseArgs = [
    "emulators:exec",
    "--only",
    "firestore",
    ...commonArgs,
    phase13Command,
  ];
} else if (mode === "phase15") {
  environment.CI = "true";
  const tscCli = join(projectRoot, "node_modules", "typescript", "bin", "tsc");
  const buildResult = spawnSync(process.execPath, [tscCli], {
    cwd: join(projectRoot, "functions"),
    env: environment,
    stdio: "inherit",
  });
  if (buildResult.error) console.error(buildResult.error.message);
  if (buildResult.status !== 0) process.exit(buildResult.status ?? 1);
  const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const phase15Command = `"${process.execPath}" "${tsxCli}" "${join(projectRoot, "scripts", "run-phase15-admin-gate.ts")}"`;
  firebaseArgs = [
    "emulators:exec",
    "--only",
    "auth,firestore",
    ...commonArgs,
    phase15Command,
  ];
} else if (mode === "exec" && commandParts.length > 0) {
  firebaseArgs = [
    "emulators:exec",
    "--only",
    "firestore,storage",
    ...commonArgs,
    commandParts.join(" "),
  ];
} else {
  console.error("Usage: node scripts/firebase-emulators.mjs <start|rules|seed|phase3|phase4|phase5|phase6|phase6e2e|phase7|phase7e2e|phase8|phase8e2e|phase9|phase9e2e|phase9focus|phase10|phase10e2e|phase10focus|phase11|phase11e2e|phase11focus|phase12|phase12e2e|phase12focus|phase13|phase13e2e|phase13focus|phase15|phase16e2e|exec> [command]");
  process.exit(1);
}

const result = spawnSync(process.execPath, [firebaseCli, ...firebaseArgs], {
  cwd: projectRoot,
  env: environment,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
