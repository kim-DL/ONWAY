import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const fullChecks = [
  "audit", "lint", "typecheck", "unit", "search-performance", "functions-build",
  "production-build", "browser", "deferred-tools", "phase17", "inventory-photos", "delivery-photos",
];
export const allChecks = [...fullChecks, "presentation"];
export const profiles = {
  docs: [],
  presentation: ["lint", "typecheck", "unit", "production-build", "presentation"],
  full: fullChecks,
};

const makePlan = (profile, reason) => ({ profile, reason, required: profiles[profile] });
const isDoc = (name) => /^(?:docs\/.*|[^/]+)\.md$/.test(name);
const styles = new Set([
  "src/app/styles/auth-loading.css", "src/app/styles/brand-motion.css", "src/app/styles/app-shell.css",
]);
const testFiles = new Set(["src/lib/app-metadata.test.ts"]);
const stripped = (text, pattern) => text.replaceAll("\r\n", "\n").split("\n")
  .filter((line) => !pattern.test(line)).join("\n");

// Shared entry files are not a blanket UI exemption. Compare complete old/new
// source after removing ONLY literal theme declarations (and metadata comments).
function themeOnly(change) {
  if (typeof change.before !== "string" || typeof change.after !== "string") return false;
  const patterns = {
    "src/lib/app-metadata.ts": /^\s*(?:(?:themeColor|backgroundColor): "#[\da-fA-F]{6}",|\/\/.*)\s*$/,
    "src/app/layout.tsx": /^\s*(?:themeColor: (?:APP_METADATA\.themeColor|"#[\da-fA-F]{6}"),|colorScheme: "(?:light|dark|light dark|dark light)",)\s*$/,
    "src/app/styles/base.css": /^\s*color-scheme: (?:only light|light|dark|light dark|dark light);\s*$/,
  };
  const pattern = patterns[change.path];
  return Boolean(pattern) && stripped(change.before, pattern) === stripped(change.after, pattern);
}

export function classifyChanges(changes, { forceFull = false } = {}) {
  if (forceFull) return makePlan("full", "Explicit full verification requested.");
  if (!Array.isArray(changes) || changes.length === 0 || changes.some((c) =>
    !c || typeof c.path !== "string" || !/^[AMD]$/.test(c.status) ||
    c.path.includes("\\") || c.path.split("/").some((part) => !part || part === ".."))) {
    return makePlan("full", "Missing or uncertain change range.");
  }
  if (changes.every((c) => isDoc(c.path))) return makePlan("docs", "Documentation only; no runtime files changed.");
  const runtime = changes.filter((c) => !isDoc(c.path));
  if (runtime.length > 12 || runtime.some((c) => c.status !== "M")) {
    return makePlan("full", "Broad change, addition, deletion or rename needs full verification.");
  }
  const uiOnly = runtime.every((c) => styles.has(c.path) || testFiles.has(c.path) ||
    /^public\/(?:brand|ui|icons)\/[^/]+\.(?:png|webp|jpe?g|ico)$/.test(c.path) || themeOnly(c));
  return uiOnly
    ? makePlan("presentation", "Existing presentation assets/styles or literal theme declarations only.")
    : makePlan("full", "Runtime logic, security, dependencies, infrastructure or unclassified change.");
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

export function planRange(base, head, options = {}) {
  try {
    if (![base, head].every((sha) => typeof sha === "string" && /^[0-9a-f]{40}$/.test(sha) && !/^0+$/.test(sha))) {
      return makePlan("full", "Missing or invalid base/head commit.");
    }
    git("merge-base", "--is-ancestor", base, head);
    const stats = git("diff", "--numstat", "--no-renames", base, head, "--").trim().split("\n");
    const changedLines = stats.reduce((sum, line) => {
      const [added, removed] = line.split("\t");
      return sum + (Number(added) || 0) + (Number(removed) || 0);
    }, 0);
    // No rename detection: both old and new paths are included; moves cannot hide
    // a runtime deletion behind a harmless destination. NUL preserves filenames.
    const parts = git("diff", "--name-status", "--no-renames", "-z", base, head, "--").split("\0");
    parts.pop();
    if (parts.length % 2 !== 0) throw new Error("Incomplete git change list");
    const changes = [];
    for (let index = 0; index < parts.length; index += 2) {
      const status = parts[index], path = parts[index + 1];
      const change = { status, path };
      if (["src/lib/app-metadata.ts", "src/app/layout.tsx", "src/app/styles/base.css"].includes(path) && status === "M") {
        change.before = git("show", `${base}:${path}`);
        change.after = git("show", `${head}:${path}`);
      }
      changes.push(change);
    }
    if (changedLines > 500 && !changes.every((c) => isDoc(c.path))) {
      return makePlan("full", "More than 500 changed lines; full verification is required.");
    }
    return classifyChanges(changes, options);
  } catch {
    return makePlan("full", "Could not prove the complete diff; full verification is required.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const head = git("rev-parse", "HEAD").trim();
  // PR checkout is the tested merge commit: compare the complete PR range,
  // including changes since it opened, rather than only its latest commit.
  const base = process.env.GITHUB_EVENT_NAME === "pull_request" ? event.pull_request?.base?.sha : event.before;
  const plan = planRange(base, head, { forceFull: process.env.GITHUB_EVENT_NAME === "workflow_dispatch" });
  console.log(JSON.stringify({ ...plan, base, head }, null, 2));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `profile=${plan.profile}\nrequired=${JSON.stringify(plan.required)}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## Verification scope: ${plan.profile}\n\n${plan.reason}\n\nRequired: ${plan.required.join(", ") || "plan + final verification only"}\n\nBase: ${base ?? "unknown"}\nHead: ${head}\n`);
  }
}
