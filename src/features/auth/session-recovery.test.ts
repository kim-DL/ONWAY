import { afterEach, describe, expect, it, vi } from "vitest";
import { isSessionRejection, subscribeToSessionRetry } from "./session-recovery";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("session recovery", () => {
  it.each(["auth/network-request-failed", "unavailable", "deadline-exceeded", "resource-exhausted", "internal"])("never logs out for %s", (code) => {
    expect(isSessionRejection({ code })).toBe(false);
  });
  it.each(["auth/user-disabled", "auth/user-token-expired", "auth/invalid-user-token", "permission-denied", "unauthenticated"])("recognizes explicit rejection %s", (code) => {
    expect(isSessionRejection({ code })).toBe(true);
  });
  it("retries once, wakes on foreground recovery, and removes all listeners", async () => {
    vi.useFakeTimers();
    const viewport = new EventTarget();
    const page = Object.assign(new EventTarget(), { visibilityState: "hidden" });
    vi.stubGlobal("window", viewport); vi.stubGlobal("document", page);
    const retry = vi.fn();
    const cleanup = subscribeToSessionRetry(retry);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(retry).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
    viewport.dispatchEvent(new Event("focus")); viewport.dispatchEvent(new Event("online"));
    expect(retry).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    cleanup();
  });
  it("retries service failures even if the browser never emits an online event", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
    const retry = vi.fn();
    const cleanup = subscribeToSessionRetry(retry);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(retry).toHaveBeenCalledTimes(1);
    cleanup();
    const cancelled = subscribeToSessionRetry(retry); cancelled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(retry).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
});
