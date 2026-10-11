export interface ScanOptions {
  afterId?: string | null;
  limit?: number;
  maxPages?: number;
  maxDurationMs?: number;
  now?: () => number;
}
export interface ScanPage<T> { items: T[]; nextCursor: string | null }
export type ScanStop = "complete" | "result_limit" | "page_budget" | "time_budget";
/** Uses stable source cursors, including when a page contains only non-matches/deleted rows. */
export async function boundedScan<T>(read: (afterId: string | null) => Promise<ScanPage<T>>,
  id: (item: T) => string, matches: (item: T) => boolean, options: ScanOptions = {}) {
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const maxPages = Math.min(5, Math.max(1, options.maxPages ?? 5));
  const now = options.now ?? Date.now;
  const deadline = now() + Math.min(5_000, Math.max(1, options.maxDurationMs ?? 5_000));
  let cursor = options.afterId ?? null;
  const items: T[] = [];
  let pagesScanned = 0;
  let recordsScanned = 0;
  let stoppedBecause: ScanStop = "complete";
  do {
    const page = await read(cursor);
    pagesScanned++;
    for (let index = 0; index < page.items.length; index++) {
      const item = page.items[index]!;
      recordsScanned++;
      if (matches(item)) items.push(item);
      if (items.length === limit && index < page.items.length - 1) {
        // Resume after the last examined row, not the end of the fetched page.
        cursor = id(item); stoppedBecause = "result_limit";
        return result();
      }
    }
    if (page.nextCursor !== null && page.nextCursor === cursor) throw new Error("Non-advancing catalog cursor");
    cursor = page.nextCursor;
    if (cursor === null) break;
    if (items.length >= limit) { stoppedBecause = "result_limit"; break; }
    if (pagesScanned >= maxPages) { stoppedBecause = "page_budget"; break; }
    if (now() >= deadline) { stoppedBecause = "time_budget"; break; }
  } while (cursor !== null);
  return result();
  function result() {
    return { items, nextCursor: cursor, page: { returnedCount: items.length, hasMore: cursor !== null,
      complete: cursor === null, startedFromBeginning: options.afterId == null, pagesScanned, recordsScanned, stoppedBecause } };
  }
}
