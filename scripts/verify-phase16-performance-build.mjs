import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextRoot = join(projectRoot, ".next");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readPageReferenceManifest() {
  const source = readFileSync(join(nextRoot, "server/app/page_client-reference-manifest.js"), "utf8");
  const assignment = source.indexOf("={");
  if (assignment < 0) throw new Error("Unable to parse the page client reference manifest.");
  return JSON.parse(source.slice(assignment + 1).replace(/;\s*$/u, ""));
}

function sizeAsset(asset) {
  const bytes = readFileSync(join(nextRoot, asset));
  return { asset, rawBytes: bytes.length, gzipBytes: gzipSync(bytes).length };
}

function readInitialHtmlAssets() {
  const source = readFileSync(join(nextRoot, "server/app/index.html"), "utf8");
  const tags = source.match(/<(?:script|link)\b[^>]*>/gu) ?? [];
  const assets = [];

  for (const tag of tags) {
    if (/\bnomodule\b/iu.test(tag)) continue;
    const reference = tag.match(/(?:src|href)="\/_next\/(static\/[^"]+\.js)"/iu)?.[1];
    if (reference) assets.push(reference);
  }

  return assets;
}

function assertBudget(condition, message) {
  if (!condition) throw new Error(`Phase 16 performance gate failed: ${message}`);
}

const buildManifest = readJson(join(nextRoot, "build-manifest.json"));
const pageManifest = readPageReferenceManifest();
const loadableManifest = readJson(join(nextRoot, "react-loadable-manifest.json"));

const initialAssets = new Set(buildManifest.rootMainFiles);
for (const asset of readInitialHtmlAssets()) initialAssets.add(asset);
for (const clientModule of Object.values(pageManifest.clientModules)) {
  for (const chunk of clientModule.chunks) {
    if (typeof chunk === "string" && chunk.startsWith("static/")) initialAssets.add(chunk);
  }
}
const initial = [...initialAssets].map(sizeAsset);
const initialRawBytes = initial.reduce((sum, asset) => sum + asset.rawBytes, 0);
const initialGzipBytes = initial.reduce((sum, asset) => sum + asset.gzipBytes, 0);

const dynamicEntries = Object.entries(loadableManifest)
  .filter(([key]) => /features[\\/]/u.test(key))
  .map(([boundary, value]) => ({ boundary, files: value.files }));
const dynamicAssets = [...new Set(dynamicEntries.flatMap((entry) => entry.files))].map(sizeAsset);
const stylesheets = readdirSync(join(nextRoot, "static/css"))
  .filter((file) => file.endsWith(".css"))
  .map((file) => sizeAsset(`static/css/${file}`));
const stylesheetRawBytes = stylesheets.reduce((sum, asset) => sum + asset.rawBytes, 0);
const stylesheetGzipBytes = stylesheets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
const salesWorkspaceEntry = dynamicEntries.find((entry) =>
  /app-shell[\\/]app-shell\.tsx -> .*sales-workspace$/u.test(entry.boundary));
if (!salesWorkspaceEntry) throw new Error("Missing sales workspace entry for bundle measurement.");
const salesWorkspaceGzipBytes = salesWorkspaceEntry.files
  .map(sizeAsset).reduce((sum, asset) => sum + asset.gzipBytes, 0);
const largestJavascriptGzipBytes = Math.max(
  ...initial.map((asset) => asset.gzipBytes),
  ...dynamicAssets.filter((asset) => asset.asset.endsWith(".js")).map((asset) => asset.gzipBytes),
);

const requiredBoundaries = [
  "auth-application",
  "app-shell",
  "school-search",
  "school-detail",
  "school-photo-gallery",
  "sales-workspace",
  "sales-history-timeline",
  "sales-route-planner",
  "sales-claim-picker",
];
for (const boundary of requiredBoundaries) {
  assertBudget(
    dynamicEntries.some((entry) => entry.boundary.includes(boundary)),
    `missing dynamic boundary: ${boundary}`,
  );
}
const serviceWorker = readFileSync(join(projectRoot, "public/sw.js"), "utf8");
for (const tool of ["sales-route-planner", "sales-claim-picker"]) {
  const entry = dynamicEntries.find(({ boundary }) => boundary.endsWith(tool));
  assertBudget(entry?.files.every((asset) => serviceWorker.includes(asset)),
    `deferred ${tool} assets must remain in the PWA precache`);
}

assertBudget(initialRawBytes <= 520 * 1024, `initial JavaScript raw ${initialRawBytes}B exceeds 520KiB`);
assertBudget(initialGzipBytes <= 160 * 1024, `initial JavaScript gzip ${initialGzipBytes}B exceeds 160KiB`);
assertBudget(largestJavascriptGzipBytes <= 90 * 1024, `largest JavaScript chunk gzip ${largestJavascriptGzipBytes}B exceeds 90KiB`);
// Keep retired design layers out of the shipped payload (phase 31 baseline:
// 297,293B raw / 55,570B gzip before cleanup). Includes every CSS chunk.
assertBudget(stylesheetRawBytes <= 275 * 1024, `CSS raw ${stylesheetRawBytes}B exceeds 275KiB`);
assertBudget(stylesheetGzipBytes <= 52 * 1024, `CSS gzip ${stylesheetGzipBytes}B exceeds 52KiB`);
assertBudget(salesWorkspaceGzipBytes <= 14 * 1024, `sales workspace gzip ${salesWorkspaceGzipBytes}B exceeds 14KiB`);

const report = {
  generatedAt: new Date().toISOString(),
  budgets: {
    initialRawBytes: 520 * 1024,
    initialGzipBytes: 160 * 1024,
    largestJavascriptGzipBytes: 90 * 1024,
    stylesheetRawBytes: 275 * 1024,
    stylesheetGzipBytes: 52 * 1024,
    salesWorkspaceGzipBytes: 14 * 1024,
  },
  measurements: {
    initialAssetCount: initial.length,
    initialRawBytes,
    initialGzipBytes,
    largestJavascriptGzipBytes,
    dynamicBoundaryCount: dynamicEntries.length,
    dynamicAssetCount: dynamicAssets.length,
    stylesheetRawBytes,
    stylesheetGzipBytes,
    salesWorkspaceGzipBytes,
  },
  initial,
  dynamicEntries,
  stylesheets,
  status: "passed",
};

writeFileSync(
  join(nextRoot, "diagnostics/phase16-performance.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify(report.measurements, null, 2));
console.log("Phase 16 production bundle performance gate passed.");
