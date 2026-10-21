import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readShellResume, shellResumeKey, writeShellResume } from "./shell-resume";

let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());

describe("employee workspace resume location", () => {
  it("restores a tab only for the same UID and authorization versions", () => {
    const key = shellResumeKey("A", 1, 2);
    writeShellResume(key, "sales", "activity");
    expect(readShellResume(key, ["sales"])).toEqual({ mode: "sales", view: "activity" });
    for (const other of [shellResumeKey("B", 1, 2), shellResumeKey("A", 2, 2), shellResumeKey("A", 1, 3)]) {
      expect(readShellResume(other, ["sales"])).toBeNull();
    }
    expect(readShellResume(key, ["delivery"])).toBeNull();
    expect(JSON.parse(storage.get(key)!)).toEqual({ mode: "sales", view: "activity" });
  });
  it("normalizes disabled tabs and tolerates corrupt or unavailable storage", () => {
    storage.set("key", JSON.stringify({ mode: "delivery", view: "activity" }));
    expect(readShellResume("key", ["delivery"])).toEqual({ mode: "delivery", view: "schools" });
    storage.set("key", "broken"); expect(readShellResume("key", ["delivery"])).toBeNull();
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    expect(readShellResume("key", ["delivery"])).toBeNull();
    expect(() => writeShellResume("key", "delivery", "settings")).not.toThrow();
  });
});
