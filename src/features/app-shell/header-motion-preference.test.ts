import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("header motion preference", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  function browser(storage = new Map<string, string>()) {
    const target = new EventTarget();
    const localStorage = {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { storage.set(key, value); }),
    };
    vi.stubGlobal("window", Object.assign(target, { localStorage }));
    return { storage, target, localStorage };
  }

  it("renders paused on the server, starts enabled on a new browser", async () => {
    const preference = await import("./header-motion-preference");
    expect(preference.getHeaderMotionPaused()).toBe(true);
    browser();
    expect(preference.getHeaderMotionPaused()).toBe(false);
  });

  it("persists a stop and notifies every mounted consumer", async () => {
    const { storage } = browser();
    const preference = await import("./header-motion-preference");
    const changed = vi.fn();
    const unsubscribe = preference.subscribeToHeaderMotion(changed);
    preference.setHeaderMotionPaused(true);
    expect(storage.get(preference.HEADER_MOTION_STORAGE_KEY)).toBe("true");
    expect(preference.getHeaderMotionPaused()).toBe(true);
    expect(changed).toHaveBeenCalledOnce();
    unsubscribe();
    preference.setHeaderMotionPaused(false);
    expect(changed).toHaveBeenCalledOnce();
  });

  it("honors an existing persisted stop after a fresh module load", async () => {
    browser(new Map([["onnuriway:header-motion-paused:v1", "true"]]));
    const preference = await import("./header-motion-preference");
    expect(preference.getHeaderMotionPaused()).toBe(true);
  });

  it("still stops when storage writes fail but stale values can be read", async () => {
    const { localStorage } = browser(new Map([["onnuriway:header-motion-paused:v1", "false"]]));
    localStorage.setItem.mockImplementation(() => { throw new Error("quota"); });
    const preference = await import("./header-motion-preference");
    preference.setHeaderMotionPaused(true);
    expect(preference.getHeaderMotionPaused()).toBe(true);
  });

  it("responds to cross-tab storage changes and ignores unrelated keys", async () => {
    const { target, storage } = browser();
    const preference = await import("./header-motion-preference");
    const changed = vi.fn();
    const unsubscribe = preference.subscribeToHeaderMotion(changed);
    target.dispatchEvent(Object.assign(new Event("storage"), { key: "unrelated", newValue: "true" }));
    expect(changed).not.toHaveBeenCalled();
    storage.set(preference.HEADER_MOTION_STORAGE_KEY, "true");
    target.dispatchEvent(Object.assign(new Event("storage"), { key: preference.HEADER_MOTION_STORAGE_KEY, newValue: "true" }));
    expect(preference.getHeaderMotionPaused()).toBe(true);
    expect(changed).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
