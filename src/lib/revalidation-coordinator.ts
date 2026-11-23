export const REVALIDATION_TTL_MS = 60_000;

export type RevalidationFreshness = "idle" | "fresh" | "refreshing" | "stale-error";

export type RevalidationRun<T> =
  | { kind: "skipped"; promise: null }
  | { kind: "started" | "joined"; promise: Promise<T> };

export class RevalidationCoordinator {
  private inFlight: Promise<unknown> | null = null;
  private lastSuccessAt: number | null = null;
  private generation = 0;

  constructor(
    readonly namespace: string,
    private readonly ttlMs = REVALIDATION_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  hasSuccessfulRead() {
    return this.lastSuccessAt !== null;
  }

  guardCurrentGeneration() {
    const generation = this.generation;
    return () => this.generation === generation;
  }

  remainingTtl(hasData: boolean) {
    if (!hasData || this.lastSuccessAt === null) return 0;
    return Math.max(0, this.ttlMs - (this.now() - this.lastSuccessAt));
  }

  run<T>(task: () => Promise<T>, options: { force?: boolean; hasData: boolean }): RevalidationRun<T> {
    if (this.inFlight) return { kind: "joined", promise: this.inFlight as Promise<T> };
    if (!options.force && this.remainingTtl(options.hasData) > 0) return { kind: "skipped", promise: null };

    const generation = this.generation;
    const promise = task().then((value) => {
      if (this.generation === generation) this.lastSuccessAt = this.now();
      return value;
    }).finally(() => {
      if (this.inFlight === promise) this.inFlight = null;
    });
    this.inFlight = promise;
    return { kind: "started", promise };
  }

  invalidate() {
    this.generation += 1;
    this.lastSuccessAt = null;
    this.inFlight = null;
  }
}

export function revalidationFreshnessText(status: RevalidationFreshness) {
  if (status === "refreshing") return "최신 정보 확인 중";
  if (status === "stale-error") return "갱신 실패 · 기존 정보 표시";
  return "";
}
