import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLoadingStage, subscribeToLoadingStage } from "./loading-timing";

describe("loading feedback timing", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10_000); });
  afterEach(() => vi.useRealTimers());

  it("waits one second for motion and three seconds for detail while work can finish immediately", () => {
    const origin = Date.now();
    const changed = vi.fn();
    const stop = subscribeToLoadingStage(origin, changed);
    vi.advanceTimersByTime(999);
    expect(getLoadingStage(origin)).toBe(0);
    expect(changed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(getLoadingStage(origin)).toBe(1);
    expect(changed).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1_999);
    expect(getLoadingStage(origin)).toBe(1);
    vi.advanceTimersByTime(1);
    expect(getLoadingStage(origin)).toBe(2);
    expect(changed).toHaveBeenCalledTimes(2);
    stop();
  });

  it("does not restart an operation's clock when the next fallback mounts", () => {
    const origin = Date.now();
    const first = vi.fn();
    const stopFirst = subscribeToLoadingStage(origin, first);
    vi.advanceTimersByTime(750);
    stopFirst();
    const second = vi.fn();
    const stopSecond = subscribeToLoadingStage(origin, second);
    vi.advanceTimersByTime(250);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(getLoadingStage(origin)).toBe(1);
    stopSecond();
  });

  it("cleans up both deadlines when fast work completes", () => {
    const changed = vi.fn();
    const stop = subscribeToLoadingStage(Date.now(), changed);
    vi.advanceTimersByTime(150);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(changed).not.toHaveBeenCalled();
  });

  it("reads elapsed background time without starting another full wait", () => {
    const origin = Date.now();
    vi.setSystemTime(origin + 6_000);
    expect(getLoadingStage(origin)).toBe(2);
    const stop = subscribeToLoadingStage(origin, vi.fn());
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });
});
