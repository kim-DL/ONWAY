import { readFile } from "node:fs/promises";

// Accept a Cloud Logging JSON export or newline-delimited JSON; print aggregates only.
if (!process.argv[2]) { console.error("Usage: node scripts/report-mcp-metrics.mjs <metrics.json>"); process.exit(2); }
const input = await readFile(process.argv[2], "utf8");
let records;
try { const parsed = JSON.parse(input); records = Array.isArray(parsed) ? parsed : parsed.entries ?? [parsed]; }
catch { records = input.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }
const groups = new Map();
const numeric = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const percentile = (values, fraction) => {
  const sorted = values.filter(numeric).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] : null;
};
const average = (values) => {
  const valid = values.filter(numeric);
  return valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length * 10) / 10 : null;
};
for (const record of records) {
  const entry = record.jsonPayload ?? record;
  if (entry.event !== "mcp_request" || entry.rpcMethod !== "tools/call" || !/^[a-z_]{1,64}$/.test(entry.tool ?? "")) continue;
  const key = `${/^\d+\.\d+\.\d+$/.test(entry.version ?? "") ? entry.version : "unknown"}/${entry.tool}`;
  const group = groups.get(key) ?? [];
  group.push(entry); groups.set(key, group);
}
const result = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([tool, rows]) => {
  const successfulWarm = rows.filter((row) => row.outcome === "success" && !row.coldStart);
  return { tool, requests: rows.length, successes: rows.filter((row) => row.outcome === "success").length,
    failures: rows.filter((row) => row.outcome !== "success").length, retriedRequests: rows.filter((row) => row.retries > 0).length,
    warmSuccessSamples: successfulWarm.length, warmP50Ms: percentile(successfulWarm.map((row) => row.durationMs), 0.5),
    warmP95Ms: percentile(successfulWarm.map((row) => row.durationMs), 0.95),
    averageObservedDocumentReads: average(successfulWarm.map((row) => row.documentReads)),
    averageResponseBytes: average(successfulWarm.map((row) => row.responseBytes)),
    averageAuthorizationMs: average(successfulWarm.map((row) => row.stageMs?.authorization)),
    averageQueryMs: average(successfulWarm.map((row) => row.stageMs?.query)),
    averageRateLimitMs: average(successfulWarm.map((row) => row.stageMs?.rateLimit)),
    partialResponses: rows.filter((row) => row.complete === false).length };
});
console.log(JSON.stringify({ note: "Server handler timings only; excludes ChatGPT reasoning/network and platform startup. Read counts are observed snapshots, not a billing report. Small samples are not an SLO.", tools: result }, null, 2));
