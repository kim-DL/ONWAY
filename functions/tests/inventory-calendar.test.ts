import { describe, expect, it } from "vitest";

import {
  defaultInventorySettings,
  inventoryCycle,
  inventoryToday,
  nextInventorySettings,
} from "../src/inventory/inventory-calendar.js";
import type { InventorySettings } from "../src/inventory/inventory-contract.js";

const employeeId = "EMP-CALENDAR";
const dayMs = 86_400_000;
const morning = (date: string) => new Date(`${date}T01:00:00.000Z`);
const edit = (settings: InventorySettings, weekday: number, date: string, urgentDays = settings.urgentDays) =>
  nextInventorySettings(settings, weekday, urgentDays, morning(date), employeeId);
const mondayPending = () => edit(defaultInventorySettings(), 1, "2026-09-11");

describe("inventory urgent-expiry defaults", () => {
  it("starts an unconfigured inventory with the D-100 threshold", () => {
    expect(defaultInventorySettings()).toMatchObject({ weekday: 5, urgentDays: 100, revision: 0 });
  });

  it.each([0, 7, 14, 180])("preserves an existing %i-day administrator setting when changing the count schedule", (urgentDays) => {
    const current = { ...defaultInventorySettings(), urgentDays, revision: 3 };
    const changed = edit(current, 1, "2026-09-11");
    expect(changed).toMatchObject({ urgentDays, revision: 4 });
    expect(current).toMatchObject({ urgentDays, revision: 3 });
  });
});

describe("inventory calendar pending-cycle regressions", () => {
  it("holds the Friday count cycle through a deferred Monday boundary", () => {
    const settings = mondayPending();
    expect(settings).toMatchObject({ weekday: 5, pendingWeekday: 1, effectiveDate: "2026-09-21", pendingCycleStartDate: "2026-09-11" });
    for (const today of ["2026-09-11", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"]) {
      expect(inventoryCycle(settings, today)).toEqual({ cycleId: "week-2026-09-11", startDate: "2026-09-11", nextDate: "2026-09-21", weekday: 5 });
    }
  });

  it("does not reset completed badges when a pending change is cancelled after the original boundary", () => {
    const cancelled = edit(mondayPending(), 5, "2026-09-19");
    expect(cancelled).toMatchObject({ weekday: 5, pendingWeekday: 5, effectiveDate: "2026-09-25", pendingCycleStartDate: "2026-09-11" });
    for (const today of ["2026-09-19", "2026-09-24"]) {
      expect(inventoryCycle(cancelled, today)).toEqual({ cycleId: "week-2026-09-11", startDate: "2026-09-11", nextDate: "2026-09-25", weekday: 5 });
    }
    expect(inventoryCycle(cancelled, "2026-09-25")).toEqual({ cycleId: "week-2026-09-25", startDate: "2026-09-25", nextDate: "2026-10-02", weekday: 5 });
  });

  it("can cancel before the original boundary without extending or resetting the cycle", () => {
    const cancelled = edit(mondayPending(), 5, "2026-09-15");
    expect(cancelled).toMatchObject({ pendingWeekday: null, effectiveDate: null, pendingCycleStartDate: null });
    expect(inventoryCycle(cancelled, "2026-09-15")).toEqual({ cycleId: "week-2026-09-11", startDate: "2026-09-11", nextDate: "2026-09-18", weekday: 5 });
    expect(inventoryCycle(cancelled, "2026-09-18").cycleId).toBe("week-2026-09-18");
  });

  it.each([
    [0, "2026-09-20"],
    [2, "2026-09-22"],
    [6, "2026-09-26"],
  ])("preserves the active anchor when re-selecting weekday %i after the original boundary", (weekday, effectiveDate) => {
    const changed = edit(mondayPending(), weekday, "2026-09-19");
    expect(changed).toMatchObject({ pendingWeekday: weekday, effectiveDate, pendingCycleStartDate: "2026-09-11" });
    expect(inventoryCycle(changed, "2026-09-19").cycleId).toBe("week-2026-09-11");
    expect(inventoryCycle(changed, effectiveDate)).toMatchObject({ cycleId: `week-${effectiveDate}`, weekday });
  });

  it("does not restart the current period when saving only the urgent-expiry threshold", () => {
    const changed = edit(mondayPending(), 1, "2026-09-19", 14);
    expect(changed).toMatchObject({ urgentDays: 14, revision: 2, updatedBy: employeeId, pendingWeekday: 1, effectiveDate: "2026-09-21", pendingCycleStartDate: "2026-09-11" });
    expect(inventoryCycle(changed, "2026-09-19").cycleId).toBe("week-2026-09-11");
  });

  it("retains the original anchor through repeated changes and cancellations", () => {
    const cancelled = edit(mondayPending(), 5, "2026-09-19");
    const thursday = edit(cancelled, 4, "2026-09-23");
    const cancelledAgain = edit(thursday, 5, "2026-09-23");
    for (const settings of [thursday, cancelledAgain]) {
      expect(settings.pendingCycleStartDate).toBe("2026-09-11");
      expect(inventoryCycle(settings, "2026-09-23").cycleId).toBe("week-2026-09-11");
    }
    expect(thursday.effectiveDate).toBe("2026-09-24");
    expect(cancelledAgain.effectiveDate).toBe("2026-09-25");
  });

  it("normalizes an activated schedule without resurrecting the previous anchor", () => {
    const normalized = edit(mondayPending(), 1, "2026-09-21", 14);
    expect(normalized).toMatchObject({ weekday: 1, pendingWeekday: null, effectiveDate: null, pendingCycleStartDate: null });
    expect(inventoryCycle(normalized, "2026-09-21")).toEqual({ cycleId: "week-2026-09-21", startDate: "2026-09-21", nextDate: "2026-09-28", weekday: 1 });
    const changedAgain = edit(normalized, 2, "2026-09-21");
    expect(changedAgain).toMatchObject({ weekday: 1, pendingWeekday: 2, effectiveDate: "2026-09-29", pendingCycleStartDate: "2026-09-21" });
  });

  it("preserves legacy pending schedules that have no explicit cycle anchor", () => {
    const legacy = mondayPending();
    delete legacy.pendingCycleStartDate;
    expect(inventoryCycle(legacy, "2026-09-19").cycleId).toBe("week-2026-09-11");
    const cancelled = edit(legacy, 5, "2026-09-19");
    expect(cancelled.pendingCycleStartDate).toBe("2026-09-11");
    expect(inventoryCycle(cancelled, "2026-09-19").cycleId).toBe("week-2026-09-11");
  });

  it("activates at Korean midnight, not at UTC midnight", () => {
    const settings = mondayPending();
    const before = inventoryToday(new Date("2026-09-20T14:59:59.999Z"));
    const at = inventoryToday(new Date("2026-09-20T15:00:00.000Z"));
    expect(before).toBe("2026-09-20");
    expect(at).toBe("2026-09-21");
    expect(inventoryCycle(settings, before).cycleId).toBe("week-2026-09-11");
    expect(inventoryCycle(settings, at).cycleId).toBe("week-2026-09-21");
  });

  it("preserves the same-day active cycle across every pending-weekday re-selection", () => {
    let checked = 0;
    for (let baseWeekday = 0; baseWeekday < 7; baseWeekday += 1) {
      const start = new Date(Date.UTC(2026, 8, 6 + baseWeekday));
      const startDate = start.toISOString().slice(0, 10);
      const base = { ...defaultInventorySettings(), weekday: baseWeekday };
      for (let targetWeekday = 0; targetWeekday < 7; targetWeekday += 1) {
        if (targetWeekday === baseWeekday) continue;
        const pending = edit(base, targetWeekday, startDate);
        for (let offset = 1; offset <= 13; offset += 1) {
          const today = new Date(start.valueOf() + offset * dayMs).toISOString().slice(0, 10);
          if (!pending.effectiveDate || today >= pending.effectiveDate) continue;
          for (let newWeekday = 0; newWeekday < 7; newWeekday += 1) {
            const changed = edit(pending, newWeekday, today);
            expect(inventoryCycle(changed, today).cycleId, `${baseWeekday}->${targetWeekday}->${newWeekday} on ${today}`).toBe(`week-${startDate}`);
            if (changed.effectiveDate) expect(changed.effectiveDate > today).toBe(true);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBe(2793);
  });
});
