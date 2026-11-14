import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SchoolPhoto } from "@/domain/school";

const harness = vi.hoisted(() => ({
  cursor: 0, cells: [] as Array<{ value?: unknown; deps?: readonly unknown[]; cleanup?: (() => void) | undefined }>,
  effects: [] as Array<() => void>, load: vi.fn(), revoke: vi.fn(), create: vi.fn(),
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    harness.cells[index] ??= { value: initial };
    return [harness.cells[index].value, (next: unknown) => {
      harness.cells[index]!.value = typeof next === "function" ? next(harness.cells[index]!.value) : next;
    }];
  },
  useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.cells[index];
    if (previous?.deps?.every((value, offset) => Object.is(value, deps[offset]))) return;
    harness.effects.push(() => { previous?.cleanup?.(); harness.cells[index] = { deps, cleanup: effect() || undefined }; });
  },
}));
vi.mock("./school-photo-repository", () => ({ schoolPhotoRepository: { getVariant: harness.load } }));
vi.mock("@/features/auth/private-client-state", () => ({ registerPrivateBlobUrl: (url: string) => url, forgetPrivateBlobUrl: harness.revoke }));
vi.mock("@/lib/performance/performance-monitor", () => ({ recordPerformanceMetric: vi.fn() }));
import { useSchoolPhoto } from "./use-school-photo";

const photo = { schoolId: "SCHOOL", slotId: "01", currentVersionId: "VERSION" } as SchoolPhoto;
function PhotoHarness(enabled=true, session="SESSION:1", item: SchoolPhoto | null=photo) {
  harness.cursor = 0;
  return useSchoolPhoto(item, session, "original", enabled);
}
function commit() { for (const effect of harness.effects.splice(0)) effect(); }
function unmount() { for (const cell of harness.cells) cell?.cleanup?.(); }
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
beforeEach(() => {
  harness.cursor=0; harness.cells=[]; harness.effects=[];
  harness.load.mockReset(); harness.revoke.mockReset(); harness.create.mockReset().mockReturnValue("blob:first");
  vi.stubGlobal("URL", { createObjectURL: harness.create });
});
afterEach(() => vi.unstubAllGlobals());

describe("school photo consumer lifetime", () => {
  it("waits for new bytes when zoom resumes after revoking its original", async () => {
    harness.load.mockResolvedValue({ blob: new Blob(["image"]), source: "memory" });
    PhotoHarness(); commit(); await flush();
    expect(PhotoHarness()).toMatchObject({ status: "ready", url: "blob:first" });
    expect(PhotoHarness(false)).toMatchObject({ status: "idle", url: null }); commit();
    expect(harness.revoke).toHaveBeenCalledWith("blob:first");
    expect(PhotoHarness()).toMatchObject({ status: "loading", url: null });
    harness.create.mockReturnValue("blob:resumed"); commit(); await flush();
    expect(PhotoHarness()).toMatchObject({ status: "ready", url: "blob:resumed" });
  });

  it("does not reload or revoke when the same photo version receives a fresh object", async () => {
    harness.load.mockResolvedValue({ blob: new Blob(["image"]), source: "memory" });
    PhotoHarness(); commit(); await flush();
    expect(PhotoHarness(true, "SESSION:1", { ...photo, caption: "새 설명" })).toMatchObject({ status: "ready", url: "blob:first" });
    commit(); await flush();
    expect(harness.load).toHaveBeenCalledTimes(1);
    expect(harness.revoke).not.toHaveBeenCalled();
  });

  it("hides a previous URL immediately when the session or photo version changes", async () => {
    harness.load.mockResolvedValue({ blob: new Blob(["image"]), source: "memory" });
    PhotoHarness(); commit(); await flush();
    expect(PhotoHarness(true, "SESSION:2")).toMatchObject({ status: "loading", url: null }); commit(); await flush();
    expect(PhotoHarness(true, "SESSION:2", { ...photo, currentVersionId: "NEW" })).toMatchObject({ status: "loading", url: null });
  });

  it("does not create URLs from bytes arriving after cleanup", async () => {
    let resolve!: (value: unknown) => void;
    harness.load.mockImplementation(() => new Promise(done => { resolve=done; }));
    PhotoHarness(); commit(); unmount(); resolve({ blob: new Blob(["late"]), source: "network" }); await flush();
    expect(harness.create).not.toHaveBeenCalled();
  });

  it("does not request missing or disabled photos and keeps provider errors private", async () => {
    PhotoHarness(false); commit(); PhotoHarness(true, "SESSION:1", null); commit();
    expect(harness.load).not.toHaveBeenCalled();
    harness.load.mockRejectedValue(new Error("private provider details"));
    PhotoHarness(); commit(); await flush();
    expect(PhotoHarness()).toMatchObject({ status: "error", url: null });
    expect(JSON.stringify(PhotoHarness())).not.toContain("private provider");
  });
});
