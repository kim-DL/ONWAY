import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { classifyChanges, planRange, profiles } from "./ci-scope.mjs";

const modified = (path, before, after) => ({ path, status: "M", before, after });
const theme = modified("src/lib/app-metadata.ts", 'export const APP_METADATA = {\n  themeColor: "#0b5a84",\n};', 'export const APP_METADATA = {\n  // Canvas hint\n  themeColor: "#f8fafc",\n};');

test("docs do not install or build the application, including deletions", () => {
  assert.equal(classifyChanges([{ path: "docs/HANDOFF.md", status: "D" }, { path: "AGENTS.md", status: "M" }]).profile, "docs");
  assert.deepEqual(profiles.docs, []);
});
test("the actual theme fix selects presentation checks without auth/photo emulators", () => {
  const plan = classifyChanges([
    theme,
    modified("src/app/layout.tsx", 'export const viewport = {\n  width: "device-width",\n};', 'export const viewport = {\n  width: "device-width",\n  colorScheme: "light",\n};'),
    modified("src/app/styles/base.css", ':root {\n  --color: red;\n}', ':root {\n  color-scheme: only light;\n  --color: red;\n}'),
    modified("src/lib/app-metadata.test.ts"), modified("docs/HANDOFF.md"),
  ]);
  assert.equal(plan.profile, "presentation");
  assert.deepEqual(plan.required, ["lint", "typecheck", "unit", "production-build", "presentation"]);
});
test("existing allowlisted styles and raster assets use presentation checks", () => {
  for (const path of ["src/app/styles/auth-loading.css", "src/app/styles/app-shell.css", "src/app/styles/brand-motion.css", "public/ui/mode-glass-three-v2.webp", "public/brand/onnuri-food-logo.png"]) {
    assert.equal(classifyChanges([modified(path)]).profile, "presentation", path);
  }
});
test("a theme file cannot conceal executable or app identity changes", () => {
  for (const after of [theme.after + "\nauthenticate();", theme.after.replace('"#f8fafc"', "getColor()"), theme.after.replace("};", '  name: "new",\n};')]) {
    assert.equal(classifyChanges([{ ...theme, after }]).profile, "full");
  }
  assert.equal(classifyChanges([modified("src/app/layout.tsx", "<PwaProvider/>", "<div/>")]).profile, "full");
  assert.equal(classifyChanges([modified("src/app/styles/base.css", ":root { color:red; }", ":root { display:none; }")]).profile, "full");
});
test("logic, tests, auth, cache, dependency and workflow changes retain full coverage", () => {
  for (const path of ["src/features/auth/pin-login.tsx", "src/features/pwa/pwa-provider.tsx", "src/features/customer/use-customer.ts", "src/app/manifest.ts", "src/app/sw.ts", "functions/src/index.ts", "firestore.rules", "firebase.json", "package-lock.json", ".github/workflows/ci.yml", "scripts/ci-scope.mjs", "tests/e2e/loading-experience.spec.ts", "public/ui/active.svg", "unknown.txt"]) {
    assert.equal(classifyChanges([theme, modified(path)]).profile, "full", path);
  }
});
test("missing diffs, moves, additions, deletions, broad changes and manual full requests fail closed", () => {
  for (const changes of [[], null, [{ path: "../docs/file.md", status: "M" }], [{ path: "docs//file.md", status: "M" }], [{ ...theme, status: "R100" }], [{ ...theme, status: "D" }], [{ ...theme, status: "A" }], Array(13).fill(theme)]) {
    assert.equal(classifyChanges(changes).profile, "full");
  }
  assert.equal(classifyChanges([theme], { forceFull: true }).profile, "full");
  assert.equal(planRange("0".repeat(40), "a".repeat(40)).profile, "full");
  assert.equal(planRange("--help", "HEAD").profile, "full");
});
test("git range includes earlier commits, runtime deletions and names with spaces", () => {
  const directory = mkdtempSync(join(tmpdir(), "onnuri-ci-scope-"));
  const moduleUrl = pathToFileURL(resolve("scripts/ci-scope.mjs")).href;
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const commit = () => { git("add", "."); git("-c", "user.name=Scope Test", "-c", "user.email=scope@example.invalid", "commit", "-m", "fixture"); return git("rev-parse", "HEAD"); };
  const plan = (base, head) => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `import {planRange} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(planRange(process.argv[1],process.argv[2])));`, base, head], { cwd: directory, encoding: "utf8" }));
  try {
    git("init"); mkdirSync(join(directory, "docs"));
    writeFileSync(join(directory, "runtime.ts"), "export const enabled = true;\n");
    const base = commit();
    writeFileSync(join(directory, "docs", "a file.md"), "notes\n"); const docs = commit();
    assert.equal(plan(base, docs).profile, "docs");
    writeFileSync(join(directory, "runtime.ts"), "export const enabled = false;\n"); const logic = commit();
    writeFileSync(join(directory, "docs", "a file.md"), "new notes\n"); const tip = commit();
    assert.equal(plan(logic, tip).profile, "docs");
    assert.equal(plan(base, tip).profile, "full");
    assert.equal(plan(tip, base).profile, "full");
    rmSync(join(directory, "runtime.ts")); writeFileSync(join(directory, "docs", "moved.md"), "export const enabled = false;\n");
    assert.equal(plan(tip, commit()).profile, "full");
  } finally {
    // mkdtemp created this isolated fixture under the OS temp directory.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("onnuri-ci-scope-"));
    rmSync(directory, { recursive: true, force: true });
  }
});
