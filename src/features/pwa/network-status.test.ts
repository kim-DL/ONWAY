import { afterEach, describe, expect, it, vi } from "vitest";

import { probeNetworkReachability, subscribeToNetworkRecovery } from "./network-status";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Phase 14 network reachability probe", () => {
  it("does not issue a request when the browser reports offline", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeNetworkReachability()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the non-cached HEAD endpoint instead of trusting navigator.onLine", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(probeNetworkReachability()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/connectivity\?t=\d+$/),
      expect.objectContaining({ method: "HEAD", cache: "no-store" }),
    );
  });

  it("reports unreachable when the probe request is blocked", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    await expect(probeNetworkReachability()).resolves.toBe(false);
  });

  it("shares concurrent checks but never reuses a completed connectivity result", async () => {
    let finish!: (response: { ok: boolean }) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }))
      .mockResolvedValue({ ok: false });
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", fetchMock);

    const checks = Array.from({ length: 6 }, () => probeNetworkReachability());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish({ ok: true });
    expect(await Promise.all(checks)).toEqual(Array(6).fill(true));
    await expect(probeNetworkReachability()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps callers' distinct timeout policies and releases failed requests", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("unreachable"));
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([
      probeNetworkReachability({ timeoutMs: 100 }),
      probeNetworkReachability({ timeoutMs: 200 }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await probeNetworkReachability({ timeoutMs: 100 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not report a late successful response as online after going offline", async () => {
    let finish!: (response: { ok: boolean }) => void;
    const browser = { onLine: true };
    vi.stubGlobal("navigator", browser);
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { finish = resolve; })));
    const check = probeNetworkReachability();
    browser.onLine = false;
    await expect(probeNetworkReachability()).resolves.toBe(false);
    finish({ ok: true });
    await expect(check).resolves.toBe(false);
  });
});

describe("network recovery timer ownership", () => {
  it("keeps one retry after early online events and disposes it on recovery", async () => {
    vi.useFakeTimers();
    const events = new EventTarget();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("window", events);
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", fetchMock);
    const recovered = vi.fn();
    const cleanup = subscribeToNetworkRecovery(recovered, 5_000);
    await vi.advanceTimersByTimeAsync(1_000);
    events.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(1);
    fetchMock.mockResolvedValue({ ok: true });
    events.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(recovered).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    events.dispatchEvent(new Event("online"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    cleanup();
  });

  it("ignores completion after unsubscribe and leaves no retry timer", async () => {
    vi.useFakeTimers();
    let finish!: (response: { ok: boolean }) => void;
    const events = new EventTarget();
    vi.stubGlobal("window", events);
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { finish = resolve; })));
    const recovered = vi.fn();
    const cleanup = subscribeToNetworkRecovery(recovered);
    events.dispatchEvent(new Event("online"));
    cleanup();
    finish({ ok: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(recovered).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
