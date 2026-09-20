import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("shared motion permission", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  function browser({ reduced = false, paused = false } = {}) {
    const page = Object.assign(new EventTarget(), { visibilityState: "visible" });
    const media = Object.assign(new EventTarget(), { matches: reduced });
    const store = new Map<string, string>([["onnuriway:header-motion-paused:v1", String(paused)]]);
    const host = Object.assign(new EventTarget(), {
      matchMedia: vi.fn(() => media),
      localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) },
    });
    vi.stubGlobal("window", host);
    vi.stubGlobal("document", page);
    return { page, media, host };
  }

  it("stays still without browser APIs", async () => {
    const motion = await import("./use-motion-permission");
    expect(motion.getMotionAllowed()).toBe(false);
    vi.stubGlobal("window", { localStorage: { getItem: () => null } });
    vi.stubGlobal("document", { visibilityState: "visible" });
    expect(motion.getMotionAllowed()).toBe(false);
  });

  it("combines OS reduction, explicit app pause and page visibility", async () => {
    const { page, media } = browser();
    const motion = await import("./use-motion-permission");
    const preference = await import("@/features/app-shell/header-motion-preference");
    const changed = vi.fn();
    const stop = motion.subscribeToMotionAllowed(changed);
    expect(motion.getMotionAllowed()).toBe(true);
    media.matches = true;
    media.dispatchEvent(new Event("change"));
    expect(motion.getMotionAllowed()).toBe(false);
    media.matches = false;
    preference.setHeaderMotionPaused(true);
    expect(motion.getMotionAllowed()).toBe(false);
    preference.setHeaderMotionPaused(false);
    page.visibilityState = "hidden";
    page.dispatchEvent(new Event("visibilitychange"));
    expect(motion.getMotionAllowed()).toBe(false);
    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
    expect(motion.getMotionAllowed()).toBe(true);
    expect(changed).toHaveBeenCalledTimes(5);
    stop();
  });

  it("honors a stored pause before subscribing", async () => {
    browser({ paused: true });
    const motion = await import("./use-motion-permission");
    expect(motion.getMotionAllowed()).toBe(false);
  });

  it("shares listeners and releases them after the final consumer unmounts", async () => {
    const { page, host, media } = browser();
    const added = vi.spyOn(page, "addEventListener");
    const removed = vi.spyOn(page, "removeEventListener");
    const motion = await import("./use-motion-permission");
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = motion.subscribeToMotionAllowed(first);
    const stopSecond = motion.subscribeToMotionAllowed(second);
    expect(added).toHaveBeenCalledTimes(1);
    expect(host.matchMedia).toHaveBeenCalledTimes(1);
    stopFirst();
    media.dispatchEvent(new Event("change"));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(removed).not.toHaveBeenCalled();
    stopSecond();
    expect(removed).toHaveBeenCalledTimes(1);
    page.dispatchEvent(new Event("visibilitychange"));
    media.dispatchEvent(new Event("change"));
    expect(second).toHaveBeenCalledOnce();
  });
});
