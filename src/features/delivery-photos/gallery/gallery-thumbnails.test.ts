import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { deliveryPhotoDateKey } from "../delivery-photo-memory";
import { GalleryThumbnails } from "./gallery-thumbnails";

const load = vi.hoisted(() => vi.fn<(id: string, variant: "thumbnail", session: AuthenticatedSession, signal: AbortSignal,
  stillNeeded: () => boolean) => Promise<Blob>>());
vi.mock("../delivery-photo-history-repository", () => ({
  deliveryPhotoHistoryRepository: { load }, deliveryPhotoHistoryErrorMessage: () => "다시 시도",
}));
vi.mock("../delivery-photo-repository", () => ({ deliveryPhotoErrorKind: () => "network" }));
vi.mock("@/features/auth/private-client-state", () => ({
  registerPrivateBlobUrl: (url: string) => url, forgetPrivateBlobUrl: (url: string) => URL.revokeObjectURL(url),
}));
const session: AuthenticatedSession = { uid: "test", displayName: "직원",
  claims: { employeeId: "test", roleScopes: ["delivery"], sessionVersion: 1, permissionsVersion: 1 } };
const blob = new Blob(["preview"]);

beforeEach(() => { load.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("gallery thumbnails", () => {
  it("shares visible photos, serves centers first, and drops a skipped request before it starts", async () => {
    const pending = new Map<string, (value: Blob) => void>();
    load.mockImplementation((id) => new Promise((resolve) => pending.set(id, resolve)));
    const pool = new GalleryThumbnails(session, deliveryPhotoDateKey(), vi.fn());
    const received = vi.fn(), shared = vi.fn();
    const cancel = pool.watch("skipped", 1, vi.fn());
    pool.watch("neighbor", 1, vi.fn());
    pool.watch("center-a", 0, received);
    pool.watch("center-a", 0, shared);
    pool.watch("center-b", 0, vi.fn());
    pool.watch("center-c", 0, vi.fn());
    cancel();
    await Promise.resolve();
    expect(load.mock.calls.map(([id]) => id)).toEqual(["center-a", "center-b", "center-c"]);
    pending.get("center-a")!(blob);
    await vi.waitFor(() => expect(received).toHaveBeenCalledOnce());
    expect(shared.mock.calls).toEqual(received.mock.calls);
    expect(load.mock.calls.map(([id]) => id)).toEqual(["center-a", "center-b", "center-c", "neighbor"]);
    const cached = vi.fn();
    pool.watch("center-a", 0, cached);
    expect(cached.mock.calls).toEqual(received.mock.calls);
    pool.clear();
    expect(load.mock.calls.at(-1)![3].aborted).toBe(true);
  });

  it("keeps six unused previews and revokes every remaining URL when the gallery closes", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const pool = new GalleryThumbnails(session, deliveryPhotoDateKey(), vi.fn());
    load.mockResolvedValue(blob);
    const stop = Array.from({ length: 8 }, (_, index) => pool.watch(String(index), 0, vi.fn()));
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(8));
    stop.forEach((end) => end());
    await Promise.resolve();
    expect(revoke).toHaveBeenCalledTimes(2);
    pool.clear();
    expect(new Set(revoke.mock.calls.flat()).size).toBe(8);
  });

  it("reuses a sent request when a fast swipe returns to the same photo before decoding", async () => {
    let finish!: (blob: Blob) => void;
    load.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const pool = new GalleryThumbnails(session, deliveryPhotoDateKey(), vi.fn());
    const leave = pool.watch("returning", 0, vi.fn());
    await Promise.resolve();
    const needed = load.mock.calls[0]![4];
    leave();
    await Promise.resolve();
    expect(needed()).toBe(false);
    const received = vi.fn();
    pool.watch("returning", 0, received);
    expect(needed()).toBe(true);
    finish(blob);
    await vi.waitFor(() => expect(received).toHaveBeenCalledOnce());
    expect(load).toHaveBeenCalledTimes(1);
    pool.clear();
  });

  it("discards a late private image when midnight passes before the response arrives", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T23:59:59+09:00"));
    const createUrl = vi.spyOn(URL, "createObjectURL");
    let finish!: (value: Blob) => void;
    load.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const pool = new GalleryThumbnails(session, deliveryPhotoDateKey(), vi.fn());
    const received = vi.fn();
    pool.watch("old-window", 0, received);
    await Promise.resolve();
    vi.setSystemTime(new Date("2026-11-20T00:00:00+09:00"));
    finish(blob);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(received).not.toHaveBeenCalled();
    expect(createUrl).not.toHaveBeenCalled();
    pool.clear();
  });
});
