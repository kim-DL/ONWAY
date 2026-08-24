import { afterEach, describe, expect, it, vi } from "vitest";

import { probeNetworkReachability } from "./network-status";

afterEach(() => {
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
});
