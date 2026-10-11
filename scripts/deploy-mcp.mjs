import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// Execute only from the configured, authenticated deployment environment.
// New function + separate Hosting site; cannot deploy PWA, rules, indexes or other functions.
const config = JSON.parse(await readFile("firebase.mcp.json", "utf8"));
assert.equal(config.hosting.site, "onnuriway-mcp");
assert.equal(config.hosting.public, "mcp-public");
assert.deepEqual(config.hosting.rewrites, ["/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp", "**"]
  .map((source) => ({ source, function: { functionId: "employeeMcp", region: "asia-northeast3" } })));
assert.equal(process.versions.node.split(".")[0], "22", "Use the pinned Node 22 toolchain.");
function run(args) {
  const result = spawnSync(process.execPath, ["node_modules/firebase-tools/lib/bin/firebase.js", ...args, "--project", "onnuriway", "--non-interactive"], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// This read-only preflight fails without deploy credentials, before any mutation.
run(["functions:list"]);
run(["deploy", "--config", "firebase.mcp.json", "--only", "functions:employeeMcp"]);
run(["deploy", "--config", "firebase.mcp.json", "--only", "hosting:onnuriway-mcp"]);
const probe = spawnSync(process.execPath, ["scripts/verify-mcp-remote.mjs", "https://onnuriway-mcp.web.app"], { stdio: "inherit" });
process.exit(probe.status ?? 1);
