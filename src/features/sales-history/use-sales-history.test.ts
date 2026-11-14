import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SalesHistoryPage } from "./sales-history-repository";

const harness = vi.hoisted(() => ({
  cursor: 0, cells: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: (() => void) | undefined }>,
  effects: [] as Array<() => void>, load: vi.fn(),
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    harness.cells[index] ??= { value: initial };
    return [harness.cells[index].value, (next: unknown) => {
      harness.cells[index]!.value = typeof next === "function" ? next(harness.cells[index]!.value) : next;
    }];
  },
  useRef: (initial: unknown) => { const index=harness.cursor++; harness.cells[index] ??= { value: { current: initial } }; return harness.cells[index].value; },
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.cells[index];
    if (previous?.deps?.every((value, offset) => Object.is(value, deps[offset]))) return;
    harness.effects.push(() => { previous?.cleanup?.(); harness.cells[index] = { deps, cleanup: effect() || undefined }; });
  },
}));
vi.mock("./sales-history-repository", () => ({ salesHistoryRepository: { loadPage: harness.load } }));
import { useSalesHistory } from "./use-sales-history";

function HistoryHarness(refreshKey: string | null=null, schoolId="SCHOOL") { harness.cursor=0; return useSalesHistory(schoolId, refreshKey); }
function commit() { for (const effect of harness.effects.splice(0)) effect(); }
function unmount() { for (const cell of harness.cells) cell?.cleanup?.(); }
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function page(visitId: string, hasMore=true): SalesHistoryPage {
  return { visits: [{ visitId, visitedAt: new Date("2026-11-14T00:00:00Z") } as SalesHistoryPage["visits"][number]],
    cursor: hasMore ? { visitedAt: "2026-11-14T00:00:00Z", visitId } : null, hasMore };
}
function deferred() {
  let resolve!: (value: SalesHistoryPage) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<SalesHistoryPage>((done, fail) => { resolve=done; reject=fail; });
  return { promise, resolve, reject };
}
async function ready() { harness.load.mockResolvedValueOnce(page("first")); HistoryHarness(); commit(); await flush(); }
beforeEach(() => { harness.cursor=0; harness.cells=[]; harness.effects=[]; harness.load.mockReset(); });

describe("sales history read generation", () => {
  for (const outcome of ["resolve", "reject"] as const) {
    it(`ignores an older pagination ${outcome} without changing the current request`, async () => {
      await ready();
      const old = deferred(); harness.load.mockReturnValueOnce(old.promise);
      const oldRequest = HistoryHarness().loadMore();
      harness.load.mockResolvedValueOnce(page("refreshed"));
      HistoryHarness("saved"); commit(); await flush();
      const fresh = deferred(); harness.load.mockReturnValueOnce(fresh.promise);
      const freshRequest = HistoryHarness("saved").loadMore();
      if (outcome === "resolve") old.resolve(page("old", false)); else old.reject(new Error("old failure"));
      await expect(oldRequest).resolves.toBeUndefined();
      expect(HistoryHarness("saved")).toMatchObject({ cursor: { visitId: "refreshed" }, loadingMore: true, hasMore: true });
      fresh.resolve(page("fresh", false)); await freshRequest;
      expect(HistoryHarness("saved").visits.map(visit => visit.visitId)).toEqual(["refreshed", "fresh"]);
      expect(HistoryHarness("saved")).toMatchObject({ cursor: null, loadingMore: false, hasMore: false });
    });
  }

  it("deduplicates repeated loadMore calls before React rerenders", async () => {
    await ready(); const next=deferred(); harness.load.mockReturnValueOnce(next.promise);
    const state=HistoryHarness(); const first=state.loadMore(); const second=state.loadMore();
    expect(harness.load).toHaveBeenCalledTimes(2);
    next.resolve(page("next", false)); await Promise.all([first, second]);
    expect(HistoryHarness().visits).toHaveLength(2);
  });

  it("keeps current failures retryable and releases the pagination lock", async () => {
    await ready(); harness.load.mockRejectedValueOnce(new Error("private provider error"));
    await expect(HistoryHarness().loadMore()).rejects.toThrow("방문 이력을 더 불러오지 못했습니다.");
    expect(HistoryHarness()).toMatchObject({ loadingMore: false, hasMore: true });
    harness.load.mockResolvedValueOnce(page("retry", false)); await HistoryHarness().loadMore();
    expect(HistoryHarness().visits.map(visit => visit.visitId)).toEqual(["retry", "first"]);
  });

  it("ignores late first pages and pagination after school change or unmount", async () => {
    const oldFirst=deferred(); harness.load.mockReturnValueOnce(oldFirst.promise); HistoryHarness(); commit();
    harness.load.mockResolvedValueOnce(page("other")); HistoryHarness(null, "OTHER"); commit(); await flush();
    oldFirst.resolve(page("old")); await flush();
    expect(HistoryHarness(null, "OTHER").visits.map(visit => visit.visitId)).toEqual(["other"]);
    const pending=deferred(); harness.load.mockReturnValueOnce(pending.promise);
    const request=HistoryHarness(null, "OTHER").loadMore(); unmount(); pending.reject(new Error("late"));
    await expect(request).resolves.toBeUndefined();
  });
});
