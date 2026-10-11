import { describe, expect, it, vi } from "vitest";
import { boundedScan } from "../../src/shared/bounded-scan.js";

const id = (item: { id: string }) => item.id;
function catalog(count: number, size = 100) {
  const rows = Array.from({ length: count }, (_, index) => ({ id: String(index).padStart(5, "0"), match: index % 37 === 0 }));
  const read = vi.fn(async (cursor: string | null) => {
    const start = cursor === null ? 0 : Number(cursor) + 1;
    const items = rows.slice(start, start + size);
    return { items, nextCursor: start + size < count ? items.at(-1)!.id : null };
  });
  return { rows, read };
}
describe("bounded service pagination", () => {
  it("finds a result beyond the first page in one tool-level search", async () => {
    const { read } = catalog(490);
    const result = await boundedScan(read, id, (row) => row.id === "00480");
    expect(result.items.map(id)).toEqual(["00480"]);
    expect(result.page).toMatchObject({ complete: true, hasMore: false, returnedCount: 1, pagesScanned: 5 });
    expect(read).toHaveBeenCalledTimes(5); // Legacy MCP required five model/tool round trips for this same scan.
  });
  it("resumes inside a fetched page without dropping or duplicating matching rows", async () => {
    const { read, rows } = catalog(1007);
    const resultIds: string[] = [];
    let cursor: string | null = null;
    let requests = 0;
    do {
      const result = await boundedScan(read, id, (row) => row.match, { afterId: cursor, limit: 3 });
      resultIds.push(...result.items.map(id)); cursor = result.nextCursor; requests++;
      expect(result.page.returnedCount).toBeLessThanOrEqual(3);
      expect(result.page.startedFromBeginning).toBe(requests === 1);
      expect(result.page.hasMore).toBe(!result.page.complete);
      expect(requests).toBeLessThan(20);
    } while (cursor !== null);
    expect(resultIds).toEqual(rows.filter((row) => row.match).map(id));
    expect(new Set(resultIds).size).toBe(resultIds.length);
  });
  it("returns an explicit partial empty result at the scan budget and continues to the match", async () => {
    const { read } = catalog(650);
    const first = await boundedScan(read, id, (row) => row.id === "00640");
    expect(first.items).toEqual([]);
    expect(first.page).toMatchObject({ complete: false, pagesScanned: 5, stoppedBecause: "page_budget" });
    expect(first.nextCursor).toBe("00499");
    const second = await boundedScan(read, id, (row) => row.id === "00640", { afterId: first.nextCursor });
    expect(second.items.map(id)).toEqual(["00640"]);
    expect(second.page).toMatchObject({ complete: true, startedFromBeginning: false });
  });
  it("advances through empty filtered pages and stops on the time budget", async () => {
    let now = 0;
    const read = vi.fn(async (cursor: string | null) => {
      now += 3_000;
      return { items: [], nextCursor: cursor === null ? "page1" : "page2" };
    });
    const result = await boundedScan<{ id: string }>(read, id, () => true, { now: () => now });
    expect(result.page).toMatchObject({ returnedCount: 0, pagesScanned: 2, complete: false, stoppedBecause: "time_budget" });
    expect(result.nextCursor).toBe("page2");
  });
  it("does not invent another page when the final row exactly meets the result limit", async () => {
    const { read } = catalog(3);
    expect((await boundedScan(read, id, () => true, { limit: 3 })).page).toMatchObject({ complete: true, stoppedBecause: "complete" });
  });
  it("rejects a non-advancing source cursor instead of looping", async () => {
    await expect(boundedScan(async () => ({ items: [], nextCursor: "stuck" }), id, () => true, { afterId: "stuck" })).rejects.toThrow("Non-advancing");
  });
});
