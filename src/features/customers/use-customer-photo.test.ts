import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0, effects: [] as Array<() => void | (() => void)>, load: vi.fn(), revoke: vi.fn(), create: vi.fn() }));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (next: unknown) => { harness.states[index] = typeof next === "function" ? next(harness.states[index]) : next; }];
  },
  useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
}));
vi.mock("./customer-photo-repository", () => ({ customerPhotoRepository: { load: harness.load } }));
vi.mock("@/features/auth/private-client-state", () => ({ registerPrivateBlobUrl: (url: string) => url, forgetPrivateBlobUrl: harness.revoke }));

import { useCustomerPhoto } from "./use-customer-photo";

function PhotoHarness(enabled = true, session: string | null = "EMP:1:1", photo = "PHOTO") {
  harness.cursor = 0; harness.effects = [];
  return useCustomerPhoto("CUSTOMER", photo, session, "thumbnail", enabled);
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
beforeEach(() => {
  harness.states = []; harness.cursor = 0; harness.effects = [];
  harness.load.mockReset(); harness.revoke.mockReset(); harness.create.mockReset().mockReturnValue("blob:photo-first");
  vi.stubGlobal("URL", { createObjectURL: harness.create });
});
afterEach(() => vi.unstubAllGlobals());

describe("private customer photo consumer lifecycle", () => {
  it("revokes on offline cleanup and never reuses that URL when the same consumer resumes", async () => {
    harness.load.mockResolvedValue(new Blob(["photo"]));
    expect(PhotoHarness().status).toBe("loading");
    const cleanup = harness.effects[0]!() as () => void;
    await flush();
    expect(PhotoHarness()).toMatchObject({ status: "ready", url: "blob:photo-first" });
    expect(PhotoHarness(false)).toMatchObject({ status: "idle", url: null });
    cleanup();
    expect(harness.revoke).toHaveBeenCalledWith("blob:photo-first");
    expect(harness.load.mock.calls[0]![2].signal.aborted).toBe(true);
    expect(PhotoHarness()).toMatchObject({ status: "loading", url: null });
    harness.create.mockReturnValue("blob:photo-reconnected");
    harness.effects[0]!(); await flush();
    expect(PhotoHarness()).toMatchObject({ status: "ready", url: "blob:photo-reconnected" });
  });

  it("does not create a URL for bytes arriving after unmount", async () => {
    let resolve!: (blob: Blob) => void;
    harness.load.mockImplementation(() => new Promise<Blob>((done) => { resolve = done; }));
    PhotoHarness(); const cleanup = harness.effects[0]!() as () => void;
    await flush(); cleanup(); resolve(new Blob(["late"])); await flush();
    expect(harness.create).not.toHaveBeenCalled();
    expect(PhotoHarness()).toMatchObject({ status: "loading", url: null });
  });

  it("hides previous private bytes immediately on session, photo or authentication changes", async () => {
    harness.load.mockResolvedValue(new Blob(["photo"]));
    PhotoHarness(); harness.effects[0]!(); await flush();
    expect(PhotoHarness().status).toBe("ready");
    expect(PhotoHarness(true, "OTHER:2:2")).toMatchObject({ status: "loading", url: null });
    expect(PhotoHarness(true, "EMP:1:1", "CHANGED")).toMatchObject({ status: "loading", url: null });
    expect(PhotoHarness(true, null)).toMatchObject({ status: "idle", url: null });
  });

  it("supports retry without displaying provider errors or a stale URL", async () => {
    harness.load.mockRejectedValue(new Error("private provider detail"));
    PhotoHarness(); harness.effects[0]!(); await flush();
    const failed = PhotoHarness();
    expect(failed).toMatchObject({ status: "error", url: null });
    expect(JSON.stringify(failed)).not.toContain("private provider");
    failed.retry();
    expect(PhotoHarness()).toMatchObject({ status: "loading", url: null });
    harness.load.mockResolvedValue(new Blob(["retry"]));
    harness.effects[0]!(); await flush();
    expect(PhotoHarness().status).toBe("ready");
  });

  it("does not start a request for disabled or signed-out consumers", () => {
    PhotoHarness(false); harness.effects[0]!();
    PhotoHarness(true, null); harness.effects[0]!();
    expect(harness.load).not.toHaveBeenCalled();
  });
});
