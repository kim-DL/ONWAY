import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  setState: vi.fn(),
  probe: vi.fn<() => Promise<boolean>>(),
  recover: vi.fn<() => () => void>(),
}));

// Run the actual provider effect with controlled network completions. Other PWA
// effects (installation and SW registration) are outside this lifecycle test.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect); },
  useState: (value: unknown) => [value, harness.setState],
  useRef: (value: unknown) => ({ current: value }),
  useMemo: (compute: () => unknown) => compute(),
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: () => false,
}));
vi.mock("./network-status", () => ({
  probeNetworkReachability: harness.probe,
  subscribeToNetworkRecovery: harness.recover,
}));

import { PwaProvider } from "./pwa-provider";

function mountConnectivity() {
  PwaProvider({ children: null });
  const cleanup = harness.effects[0]?.();
  if (!cleanup) throw new Error("Expected connectivity effect cleanup");
  return cleanup;
}

function pendingProbe() {
  let finish!: (online: boolean) => void;
  harness.probe.mockReturnValueOnce(new Promise<boolean>((resolve) => { finish = resolve; }));
  return finish;
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.effects = [];
  harness.probe.mockReset();
  harness.recover.mockReset().mockImplementation(() => vi.fn());
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
});

afterEach(() => vi.unstubAllGlobals());

describe("PWA connectivity effect ownership", () => {
  it("ignores stale checks when focus and visibility arrive together", async () => {
    const finishInitial = pendingProbe();
    const cleanup = mountConnectivity();
    const finishFocus = pendingProbe();
    window.dispatchEvent(new Event("focus"));
    const finishVisible = pendingProbe();
    document.dispatchEvent(new Event("visibilitychange"));
    finishVisible(false);
    await Promise.resolve();
    finishFocus(false);
    finishInitial(true);
    await Promise.resolve();
    expect(harness.setState).toHaveBeenCalledExactlyOnceWith(false);
    expect(harness.recover).toHaveBeenCalledTimes(1);
    cleanup();
    expect(harness.recover.mock.results[0]?.value).toHaveBeenCalledOnce();
  });

  it("an offline event invalidates an older successful check", async () => {
    const finish = pendingProbe();
    const cleanup = mountConnectivity();
    window.dispatchEvent(new Event("offline"));
    finish(true);
    await Promise.resolve();
    expect(harness.setState).toHaveBeenCalledExactlyOnceWith(false);
    expect(harness.recover).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("a later fresh check can recover and disposes the previous retry", async () => {
    const finish = pendingProbe();
    const cleanup = mountConnectivity();
    finish(false);
    await Promise.resolve();
    const finishNext = pendingProbe();
    window.dispatchEvent(new Event("online"));
    expect(harness.recover.mock.results[0]?.value).toHaveBeenCalledOnce();
    finishNext(true);
    await Promise.resolve();
    expect(harness.setState).toHaveBeenLastCalledWith(true);
    expect(harness.recover).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("does not publish or attach recovery after unmount", async () => {
    const finish = pendingProbe();
    const cleanup = mountConnectivity();
    cleanup();
    finish(false);
    await Promise.resolve();
    expect(harness.setState).not.toHaveBeenCalled();
    expect(harness.recover).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("focus"));
    expect(harness.probe).toHaveBeenCalledTimes(1);
  });
});
