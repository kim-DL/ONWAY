import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  refs: [] as Array<{ current: unknown }>, cursor: 0, effects: [] as Array<() => void | (() => void)>,
  allowed: true, changed: (() => {}) as () => void, unsubscribe: vi.fn(),
}));
vi.mock("react", () => ({
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    harness.refs[index] ??= { current: initial };
    return harness.refs[index];
  },
  useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
  useCallback: (callback: unknown) => callback,
}));
vi.mock("./use-motion-permission", () => ({
  getMotionAllowed: () => harness.allowed,
  subscribeToMotionAllowed: (changed: () => void) => { harness.changed = changed; return harness.unsubscribe; },
}));

import { animatePhotoMorph, photoMorphGeometry, usePhotoMorph } from "./photo-morph";

const sourceRect = { left: 30, top: 180, width: 320, height: 200 };
const targetRect = { left: 20, top: 120, width: 360, height: 400 };
const flush = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };
let frames: Array<FrameRequestCallback> = [];
function element(rect = targetRect) {
  const animations: Array<{ finished: Promise<void>; cancel: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; complete: () => void }> = [];
  const node = { isConnected: true, getBoundingClientRect: () => rect, querySelector: () => null, closest: vi.fn((): HTMLElement | null => null), dataset: { photoMorphState: "open" }, animate: vi.fn((keyframes: unknown, options: unknown) => {
    void keyframes; void options;
    let complete!: () => void;
    let reject!: (error: Error) => void;
    const finished = new Promise<void>((resolve, no) => { complete = resolve; reject = no; });
    const animation = { finished, complete, cancel: vi.fn(() => reject(new Error("cancelled"))), pause: vi.fn() };
    animations.push(animation);
    return animation;
  }) };
  return { node, animations, html: node as unknown as HTMLElement };
}
function PhotoHarness(canReturn = true) {
  const source = element(sourceRect);
  const stage = element();
  const layer = element();
  stage.node.closest.mockReturnValue(layer.html);
  const onClose = vi.fn();
  const hook = usePhotoMorph({ origin: source.html, identity: "private-photo-version", onClose, canReturn });
  hook.stageRef.current = stage.html as HTMLDivElement;
  const cleanups = harness.effects.map((effect) => effect());
  return { source, stage, layer, onClose, hook,
    refreshPhoto: () => { cleanups.at(-1)?.(); cleanups[cleanups.length - 1] = harness.effects.at(-1)?.(); },
    unmount: () => cleanups.forEach((cleanup) => cleanup?.()),
  };
}
function nextFrame() { const pending = frames; frames = []; pending.forEach((callback) => callback(0)); }

beforeEach(() => {
  vi.useFakeTimers();
  harness.refs = []; harness.cursor = 0; harness.effects = []; harness.allowed = true; harness.unsubscribe.mockReset(); frames = [];
  vi.stubGlobal("window", { innerHeight: 800, innerWidth: 400 });
  vi.stubGlobal("getComputedStyle", () => ({ borderRadius: "12px" }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("private photo morph geometry", () => {
  it("maps the source rectangle to the destination without reading image bytes", () => {
    const geometry = photoMorphGeometry(sourceRect, targetRect)!;
    expect(geometry.scale).toBeCloseTo(320 / 360);
    expect(geometry.transform).toContain(`scale(${geometry.scale})`);
    expect(photoMorphGeometry({ ...sourceRect, width: 0 }, targetRect)).toBeNull();
    expect(photoMorphGeometry(sourceRect, { ...targetRect, height: Number.NaN })).toBeNull();
  });
  it.each([{ width: 1_600, height: 1_000 }, { width: 800, height: 1_200 }])("keeps a %j image undistorted and crops precisely to the source", (image) => {
    const geometry = photoMorphGeometry(sourceRect, targetRect, image)!;
    const [, x, y] = geometry.transform.match(/^translate\(([-.\d]+)px, ([-.\d]+)px\)/)!;
    expect(geometry.transform).toContain(`scale(${geometry.scale})`);
    expect(targetRect.left + Number(x) + geometry.insetX * geometry.scale).toBeCloseTo(sourceRect.left);
    expect(targetRect.top + Number(y) + geometry.insetY * geometry.scale).toBeCloseTo(sourceRect.top);
    expect((targetRect.width - 2 * geometry.insetX) * geometry.scale).toBeCloseTo(sourceRect.width);
    expect((targetRect.height - 2 * geometry.insetY) * geometry.scale).toBeCloseTo(sourceRect.height);
  });
  it("does not allocate an extreme layer for a mismatched panoramic crop", () => {
    expect(photoMorphGeometry(sourceRect, targetRect, { width: 1, height: 1_000 })).toBeNull();
  });
  it("falls back for removed, offscreen and unsupported origins", () => {
    const stage = element();
    const source = element(sourceRect);
    source.node.isConnected = false;
    expect(animatePhotoMorph(stage.html, source.html, false)).toBeNull();
    expect(animatePhotoMorph(stage.html, element({ ...sourceRect, top: 900 }).html, false)).toBeNull();
    Object.assign(stage.node, { animate: undefined });
    expect(animatePhotoMorph(stage.html, element(sourceRect).html, false)).toBeNull();
  });
  it("bounds a browser animation that never reports completion", async () => {
    const stage = element();
    const transition = animatePhotoMorph(stage.html, element(sourceRect).html, false)!;
    await vi.advanceTimersByTimeAsync(400);
    await transition.finished;
    transition.cancel();
    expect(stage.animations[0]!.cancel).toHaveBeenCalledOnce();
  });
});

describe("photo modal transition lifecycle", () => {
  it("opens in 300ms and closes once to the original location", async () => {
    const view = PhotoHarness(); nextFrame();
    expect(view.stage.node.animate.mock.calls[0]?.[1]).toMatchObject({ duration: 300 });
    expect(view.stage.node.animate.mock.calls[0]?.[0]).toEqual(expect.arrayContaining([expect.objectContaining({ clipPath: expect.stringContaining("inset(") })]));
    expect(view.stage.node.dataset.photoMorphState).toBe("opening");
    view.stage.animations[0]!.complete(); await flush();
    expect(view.stage.node.dataset.photoMorphState).toBe("open");
    view.hook.requestClose(); view.hook.requestClose();
    expect(view.hook.beforeClose()).toBe(false);
    expect(view.stage.node.animate.mock.calls[1]?.[1]).toMatchObject({ duration: 260 });
    expect(view.layer.node.animate.mock.calls[0]).toEqual([
      [{ opacity: 1 }, { opacity: 0 }], expect.objectContaining({ duration: 260, fill: "both" }),
    ]);
    expect(view.onClose).not.toHaveBeenCalled();
    view.stage.animations[1]!.complete(); view.layer.animations[0]!.complete(); await flush();
    expect(view.onClose).toHaveBeenCalledOnce();
    expect(view.stage.node.dataset.photoMorphState).toBe("closing");
    expect(view.stage.animations[1]!.cancel).not.toHaveBeenCalled();
    expect(view.layer.animations[0]!.cancel).not.toHaveBeenCalled();
    view.unmount();
    expect(view.stage.animations[1]!.cancel).toHaveBeenCalledOnce();
    expect(view.layer.animations[0]!.cancel).toHaveBeenCalledOnce();
  });
  it("freezes a rapid close in place and fades without flashing the full-size photo", async () => {
    const view = PhotoHarness(); nextFrame(); view.hook.requestClose();
    expect(view.onClose).not.toHaveBeenCalled();
    expect(view.stage.animations[0]!.pause).toHaveBeenCalledOnce();
    expect(view.stage.animations[0]!.cancel).not.toHaveBeenCalled();
    expect(view.stage.node.animate).toHaveBeenCalledOnce();
    view.stage.animations[0]!.complete(); await flush();
    expect(view.stage.node.dataset.photoMorphState).toBe("closing");
    expect(view.onClose).not.toHaveBeenCalled();
    view.layer.animations[0]!.complete(); await flush();
    expect(view.onClose).toHaveBeenCalledOnce(); view.unmount();
  });
  it("falls back to an immediate modal when reduced motion or app pause is active", () => {
    harness.allowed = false;
    const view = PhotoHarness(); nextFrame(); view.hook.requestClose();
    expect(view.stage.node.animate).not.toHaveBeenCalled();
    expect(view.layer.node.animate).not.toHaveBeenCalled();
    expect(view.onClose).toHaveBeenCalledOnce(); view.unmount();
  });
  it("settles the entry if visibility or the motion preference changes", async () => {
    const view = PhotoHarness(); nextFrame(); harness.allowed = false; harness.changed();
    expect(view.stage.node.dataset.photoMorphState).toBe("open");
    expect(view.stage.animations[0]!.cancel).toHaveBeenCalledOnce();
    await flush(); expect(view.onClose).not.toHaveBeenCalled(); view.unmount();
  });
  it("finishes a closing modal once when the page becomes hidden", async () => {
    const view = PhotoHarness(); nextFrame(); view.stage.animations[0]!.complete(); await flush();
    view.hook.requestClose(); harness.allowed = false; harness.changed(); harness.changed();
    await flush(); expect(view.onClose).toHaveBeenCalledOnce();
    expect(view.stage.node.dataset.photoMorphState).toBe("closing");
    expect(view.stage.animations[1]!.cancel).not.toHaveBeenCalled();
    view.unmount();
  });
  it.each(["opening", "closing"] as const)("cancels %s on unmount without a late close or leaked listener", async (phase) => {
    const view = PhotoHarness(); nextFrame();
    if (phase === "closing") { view.stage.animations[0]!.complete(); await flush(); view.hook.requestClose(); }
    view.unmount(); await flush();
    expect(view.onClose).not.toHaveBeenCalled();
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    expect(view.stage.animations.at(-1)!.cancel).toHaveBeenCalledOnce();
  });
  it("fades a zoomed or different photo without returning it to the wrong thumbnail", async () => {
    const view = PhotoHarness(false); nextFrame(); view.stage.animations[0]!.complete(); await flush();
    view.hook.requestClose(); expect(view.stage.node.animate).toHaveBeenCalledOnce();
    expect(view.onClose).not.toHaveBeenCalled();
    view.layer.animations[0]!.complete(); await flush();
    expect(view.onClose).toHaveBeenCalledOnce(); view.unmount();
  });
  it("retains a fade when the original thumbnail has been removed", async () => {
    const view = PhotoHarness(); nextFrame(); view.stage.animations[0]!.complete(); await flush();
    view.source.node.isConnected = false;
    view.hook.requestClose(); expect(view.stage.node.animate).toHaveBeenCalledOnce();
    view.layer.animations[0]!.complete(); await flush();
    expect(view.onClose).toHaveBeenCalledOnce(); view.unmount();
  });
  it("bounds a stuck closing fade without exposing an open frame", async () => {
    const view = PhotoHarness(); nextFrame(); view.stage.animations[0]!.complete(); await flush();
    view.hook.requestClose();
    await vi.advanceTimersByTimeAsync(360); await flush();
    expect(view.onClose).toHaveBeenCalledOnce();
    expect(view.stage.node.dataset.photoMorphState).toBe("closing");
    view.unmount();
  });
  it("does not reopen if the photo URL or identity refreshes while closing", async () => {
    const view = PhotoHarness(); nextFrame(); view.stage.animations[0]!.complete(); await flush();
    view.hook.requestClose(); view.refreshPhoto(); nextFrame();
    expect(view.stage.node.dataset.photoMorphState).toBe("closing");
    expect(view.stage.animations[1]!.cancel).not.toHaveBeenCalled();
    expect(view.layer.animations[0]!.cancel).not.toHaveBeenCalled();
    view.stage.animations[1]!.complete(); view.layer.animations[0]!.complete(); await flush();
    expect(view.onClose).toHaveBeenCalledOnce(); view.unmount();
  });
});
