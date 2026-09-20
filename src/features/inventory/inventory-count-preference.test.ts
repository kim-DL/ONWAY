import { describe, expect, it } from "vitest";
import { readInventoryCountPreference, writeInventoryCountPreference } from "./inventory-count-preference";

function storage() { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; }
describe("personal inventory count mode", () => {
  it("starts off and remembers only the same employee, authorization session and KST day", () => {
    const store = storage();
    expect(readInventoryCountPreference(store, "one:1:1", "2026-09-18")).toBe(false);
    writeInventoryCountPreference(store, "one:1:1", "2026-09-18", true);
    expect(readInventoryCountPreference(store, "one:1:1", "2026-09-18")).toBe(true);
    for (const [key, day] of [["two:1:1", "2026-09-18"], ["one:2:1", "2026-09-18"], ["one:1:1", "2026-09-19"]]) expect(readInventoryCountPreference(store, key!, day!)).toBe(false);
    writeInventoryCountPreference(store, "one:1:1", "2026-09-18", false);
    expect(readInventoryCountPreference(store, "one:1:1", "2026-09-18")).toBe(false);
  });
  it("does not share switches across devices or tabs", () => {
    const employeeA = storage(), employeeB = storage();
    writeInventoryCountPreference(employeeA, "one", "2026-09-18", true);
    expect(readInventoryCountPreference(employeeB, "one", "2026-09-18")).toBe(false);
  });
  it("falls back safely for malformed or blocked session storage", () => {
    const broken = { getItem: () => "{invalid", setItem: () => { throw new Error("blocked"); } };
    expect(readInventoryCountPreference(broken, "one", "2026-09-18")).toBe(false);
    expect(() => writeInventoryCountPreference(broken, "one", "2026-09-18", true)).not.toThrow();
    expect(readInventoryCountPreference(undefined, "one", "2026-09-18")).toBe(false);
  });
});
