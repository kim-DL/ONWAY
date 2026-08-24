export const PERFORMANCE_BUDGETS = {
  appBootDuration: 1_000,
  searchDuration: 100,
  cachedSchoolDetailDuration: 200,
} as const;

export type PerformanceMetricName =
  | "appBootDuration"
  | "catalogLoadDuration"
  | "searchDuration"
  | "schoolDetailDuration"
  | "imagePreviewDuration";

export type PerformanceSource =
  | "runtime"
  | "memory"
  | "indexeddb"
  | "firestore"
  | "network"
  | "image-cache";

export type CacheLayer = "memory" | "indexeddb" | "image-cache";
export type FirestoreReadArea = "auth" | "shell" | "search" | "detail" | "sales" | "history";

export type PerformanceMetric = {
  name: PerformanceMetricName;
  durationMs: number;
  source: PerformanceSource;
  recordedAt: number;
};

type HitMissCounter = { hits: number; misses: number };

export type PerformanceSnapshot = {
  metrics: PerformanceMetric[];
  cache: Record<CacheLayer, HitMissCounter>;
  firestoreReads: {
    total: number;
    byArea: Record<FirestoreReadArea, number>;
  };
  vitals: {
    cumulativeLayoutShift: number;
    longTaskCount: number;
    longTaskDurationMs: number;
  };
};

type PerformanceDiagnostics = {
  snapshot: () => PerformanceSnapshot;
  clear: () => void;
};

declare global {
  interface Window {
    __ONNURIWAY_PERFORMANCE__?: PerformanceDiagnostics;
  }
}

const MAX_METRICS = 120;
const metricBuffer: PerformanceMetric[] = [];
const cacheCounters: Record<CacheLayer, HitMissCounter> = {
  memory: { hits: 0, misses: 0 },
  indexeddb: { hits: 0, misses: 0 },
  "image-cache": { hits: 0, misses: 0 },
};
const firestoreReads: Record<FirestoreReadArea, number> = {
  auth: 0,
  shell: 0,
  search: 0,
  detail: 0,
  sales: 0,
  history: 0,
};
const vitals = {
  cumulativeLayoutShift: 0,
  longTaskCount: 0,
  longTaskDurationMs: 0,
};

let appBootStartedAt: number | null = null;
let appBootRecorded = false;
let observersStarted = false;

function safeNow() {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function roundDuration(durationMs: number) {
  return Math.round(Math.max(0, durationMs) * 10) / 10;
}

function copyCounters() {
  return {
    memory: { ...cacheCounters.memory },
    indexeddb: { ...cacheCounters.indexeddb },
    "image-cache": { ...cacheCounters["image-cache"] },
  };
}

export function getPerformanceSnapshot(): PerformanceSnapshot {
  return {
    metrics: metricBuffer.map((metric) => ({ ...metric })),
    cache: copyCounters(),
    firestoreReads: {
      total: Object.values(firestoreReads).reduce((sum, count) => sum + count, 0),
      byArea: { ...firestoreReads },
    },
    vitals: { ...vitals },
  };
}

export function clearPerformanceDiagnostics() {
  metricBuffer.length = 0;
  for (const counter of Object.values(cacheCounters)) {
    counter.hits = 0;
    counter.misses = 0;
  }
  for (const area of Object.keys(firestoreReads) as FirestoreReadArea[]) {
    firestoreReads[area] = 0;
  }
  vitals.cumulativeLayoutShift = 0;
  vitals.longTaskCount = 0;
  vitals.longTaskDurationMs = 0;
  appBootRecorded = false;
  appBootStartedAt = safeNow();
}

export function recordPerformanceMetric(
  name: PerformanceMetricName,
  startedAt: number,
  source: PerformanceSource,
) {
  const durationMs = roundDuration(safeNow() - startedAt);
  if (!Number.isFinite(durationMs)) return;
  metricBuffer.push({ name, durationMs, source, recordedAt: Date.now() });
  if (metricBuffer.length > MAX_METRICS) metricBuffer.splice(0, metricBuffer.length - MAX_METRICS);
}

export function recordCacheAccess(layer: CacheLayer, hit: boolean) {
  cacheCounters[layer][hit ? "hits" : "misses"] += 1;
}

export function recordFirestoreReads(area: FirestoreReadArea, count: number) {
  if (!Number.isFinite(count) || count <= 0) return;
  firestoreReads[area] += Math.floor(count);
}

export function startAppBootMeasurement() {
  appBootStartedAt ??= safeNow();
}

export function markAppBootReady(source: PerformanceSource = "runtime") {
  if (appBootRecorded) return;
  appBootRecorded = true;
  recordPerformanceMetric("appBootDuration", appBootStartedAt ?? 0, source);
}

function observeBrowserVitals() {
  if (observersStarted || typeof PerformanceObserver === "undefined") return;
  observersStarted = true;

  try {
    const layoutShiftObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
        if (!shift.hadRecentInput && typeof shift.value === "number") {
          vitals.cumulativeLayoutShift = Math.round((vitals.cumulativeLayoutShift + shift.value) * 10_000) / 10_000;
        }
      }
    });
    layoutShiftObserver.observe({ type: "layout-shift", buffered: true });
  } catch {
    // Older webviews may not expose LayoutShift entries.
  }

  try {
    const longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        vitals.longTaskCount += 1;
        vitals.longTaskDurationMs = roundDuration(vitals.longTaskDurationMs + entry.duration);
      }
    });
    longTaskObserver.observe({ type: "longtask", buffered: true });
  } catch {
    // Long Task is diagnostic-only and unsupported browsers remain functional.
  }
}

export function initializeClientPerformanceMonitoring() {
  startAppBootMeasurement();
  observeBrowserVitals();
  if (typeof window === "undefined") return;
  window.__ONNURIWAY_PERFORMANCE__ = {
    snapshot: getPerformanceSnapshot,
    clear: clearPerformanceDiagnostics,
  };
}
