import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryContext } from "@/domain/inventory";
import { inventoryKoreaDate, millisecondsUntilInventoryMidnight, watchInventoryCalendar } from "./inventory-calendar";

const documentEvents = new Map<string, () => void>();
const windowEvents = new Map<string, () => void>();
const context: InventoryContext = { today: "2026-09-14", canWrite: true, canAdmin: false, cycle: { cycleId: "week-2026-09-14", startDate: "2026-09-14", nextDate: "2026-09-21", weekday: 1 }, settings: { weekday: 1, urgentDays: 7, revision: 0, pendingWeekday: null, effectiveDate: null, pendingCycleStartDate: null, updatedAt: null, updatedBy: null } };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T14:59:59.000Z"));
  documentEvents.clear(); windowEvents.clear();
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: (name: string, callback: () => void) => documentEvents.set(name, callback), removeEventListener: (name: string) => documentEvents.delete(name) });
  vi.stubGlobal("window", { addEventListener: (name: string, callback: () => void) => windowEvents.set(name, callback), removeEventListener: (name: string) => windowEvents.delete(name) });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function start(load = vi.fn<() => Promise<InventoryContext>>().mockResolvedValue(context)) {
  const callbacks = { load, onContext: vi.fn(), onError: vi.fn(), onRefreshing: vi.fn() };
  return { ...callbacks, watcher: watchInventoryCalendar({ observedDate: "2026-09-13", ...callbacks }) };
}
describe("Korea inventory date boundary", () => {
  it("uses Korea time, not the device timezone, and schedules just after midnight", () => {
    expect(inventoryKoreaDate(Date.parse("2026-09-13T14:59:59Z"))).toBe("2026-09-13");
    expect(inventoryKoreaDate(Date.parse("2026-09-13T15:00:00Z"))).toBe("2026-09-14");
    expect(millisecondsUntilInventoryMidnight()).toBe(1_250);
  });
  it("reads only context once on a visible date transition and does not poll during the day", async () => {
    const test = start();
    await vi.advanceTimersByTimeAsync(1_249); expect(test.load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(test.load).toHaveBeenCalledOnce();
    expect(test.onContext).toHaveBeenCalledWith(context);
    expect(test.onRefreshing.mock.calls).toEqual([[true], [false]]);
    for (let index = 0; index < 4; index += 1) { documentEvents.get("visibilitychange")!(); windowEvents.get("focus")!(); }
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1_000);
    expect(test.load).toHaveBeenCalledOnce(); test.watcher.dispose();
  });
  it("waits while hidden and deduplicates visibility/focus until the refresh settles", async () => {
    Object.assign(document, { visibilityState: "hidden" });
    let resolve!: (value: InventoryContext) => void;
    const test = start(vi.fn(() => new Promise<InventoryContext>((done) => { resolve = done; })));
    await vi.advanceTimersByTimeAsync(2_000); expect(test.load).not.toHaveBeenCalled();
    Object.assign(document, { visibilityState: "visible" });
    documentEvents.get("visibilitychange")!(); windowEvents.get("focus")!(); test.watcher.refresh();
    expect(test.load).toHaveBeenCalledOnce();
    resolve(context); await Promise.resolve(); await Promise.resolve();
    expect(test.onContext).toHaveBeenCalledOnce(); test.watcher.dispose();
  });
  it("does not spin on failure or a server date differing from the device clock", async () => {
    const test = start(vi.fn<() => Promise<InventoryContext>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ...context, today: "2026-09-13" }));
    await vi.advanceTimersByTimeAsync(2_000); expect(test.onError).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(60_000); expect(test.load).toHaveBeenCalledOnce();
    test.watcher.refresh(); await Promise.resolve(); await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60_000); windowEvents.get("focus")!();
    expect(test.load).toHaveBeenCalledTimes(2); test.watcher.dispose();
  });
  it("never accepts a response after going offline, then removes timers and listeners on disposal", async () => {
    let resolve!: (value: InventoryContext) => void;
    const test = start(vi.fn(() => new Promise<InventoryContext>((done) => { resolve = done; })));
    await vi.advanceTimersByTimeAsync(2_000);
    Object.assign(navigator, { onLine: false }); windowEvents.get("offline")!();
    resolve(context); await Promise.resolve(); await Promise.resolve();
    expect(test.onContext).not.toHaveBeenCalled();
    test.watcher.dispose(); expect(vi.getTimerCount()).toBe(0);
    expect(documentEvents.size).toBe(0); expect(windowEvents.size).toBe(0);
  });
  it("ignores late private data when the owning session unmounts", async () => {
    let resolve!: (value: InventoryContext) => void;
    const test = start(vi.fn(() => new Promise<InventoryContext>((done) => { resolve = done; })));
    await vi.advanceTimersByTimeAsync(2_000); test.watcher.dispose();
    resolve(context); await Promise.resolve(); await Promise.resolve();
    expect(test.onContext).not.toHaveBeenCalled(); expect(test.onError).not.toHaveBeenCalled();
  });
});
