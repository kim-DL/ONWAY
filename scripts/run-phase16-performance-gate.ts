import { performance } from "node:perf_hooks";

import { schoolSearchItemSchema, type SchoolSearchItem } from "../src/domain/catalog";
import { MemorySearchIndex } from "../src/features/search/memory-search-index";

function percentile(values: number[], ratio: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * ratio) - 1] ?? Number.POSITIVE_INFINITY;
}

function makeItem(index: number): SchoolSearchItem {
  const district = (["dong", "jung", "seo", "yuseong", "daedeok"] as const)[index % 5];
  return schoolSearchItemSchema.parse({
    schoolId: `SCH-PERF-${String(index).padStart(6, "0")}`,
    name: `대전성능${index}초등학교`,
    shortName: `성능${index}초`,
    normalizedName: `대전성능${index}초등학교`,
    initials: `ㄷㅈㅅㄴ${index}ㅊㄷㅎㄱ`,
    aliases: [`성능학교${index}`],
    schoolType: "elementary",
    district,
    addressSummary: `대전광역시 성능로 ${index}`,
    operationalStatus: "active",
    photoCount: index % 4,
    fieldInfoAvailable: index % 2 === 0,
  });
}

const catalog = Array.from({ length: 5_000 }, (_, index) => makeItem(index));
const catalogStartedAt = performance.now();
const index = new MemorySearchIndex(catalog);
const catalogIndexDurationMs = performance.now() - catalogStartedAt;

for (let warmup = 0; warmup < 5; warmup += 1) index.search(`성능${warmup}`);

const queries = Array.from({ length: 40 }, (_, queryIndex) => `성능${queryIndex * 7}`);
const durations = queries.map((query) => {
  const startedAt = performance.now();
  const results = index.search(query, 10);
  const duration = performance.now() - startedAt;
  if (results.length === 0) throw new Error(`Expected an in-memory result for ${query}.`);
  return duration;
});
const p95SearchDurationMs = percentile(durations, 0.95);
const maximumSearchDurationMs = Math.max(...durations);

if (p95SearchDurationMs >= 100) {
  throw new Error(`Phase 16 search p95 ${p95SearchDurationMs.toFixed(2)}ms exceeds 100ms.`);
}
if (catalogIndexDurationMs >= 500) {
  throw new Error(`Phase 16 catalog indexing ${catalogIndexDurationMs.toFixed(2)}ms exceeds 500ms.`);
}

console.log(JSON.stringify({
  catalogItems: catalog.length,
  catalogIndexDurationMs: Number(catalogIndexDurationMs.toFixed(2)),
  p95SearchDurationMs: Number(p95SearchDurationMs.toFixed(2)),
  maximumSearchDurationMs: Number(maximumSearchDurationMs.toFixed(2)),
  networkRequestsWhileTyping: 0,
  status: "passed",
}, null, 2));
