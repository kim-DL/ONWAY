import { afterEach, expect, it, vi } from "vitest";
import { cameraLens, focusPoint } from "./camera-lens";
import { captureLabelFrame } from "./camera-frame";

afterEach(() => vi.unstubAllGlobals());

it("applies focus, light and zoom on one track without losing an accepted setting after a rejected control", async () => {
  vi.stubGlobal("navigator", { mediaDevices: { getSupportedConstraints: () => ({ pointsOfInterest: true }) } });
  const applyConstraints = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("unsupported")).mockResolvedValue(undefined);
  const track = { getCapabilities: () => ({ torch: [false, true], focusMode: ["continuous"], zoom: { min: 1, max: 1.8, step: 0.2 } }), getSettings: () => ({ zoom: 1 }), applyConstraints };
  const lens = cameraLens(track as unknown as MediaStreamTrack);
  expect(lens.hasTorch).toBe(true);
  expect(lens.nearZoom).toBeCloseTo(1.8);
  expect(lens.pointMode).toBe("continuous");
  const first = lens.apply({ torch: true });
  const second = lens.apply({ zoom: 1.8 });
  await first; await expect(second).rejects.toThrow();
  await lens.apply({ focusMode: "continuous" });
  expect(applyConstraints.mock.lastCall?.[0]).toEqual({ advanced: [{ torch: true, focusMode: "continuous" }] });
});

it("leaves unsupported camera controls hidden and ignores taps on the letterbox", () => {
  vi.stubGlobal("navigator", {});
  const lens = cameraLens({ getCapabilities: () => ({ torch: [false] }) } as unknown as MediaStreamTrack);
  expect(lens.hasTorch).toBe(false);
  expect(lens.pointMode).toBeUndefined();
  expect(lens.nearZoom).toBe(lens.baseZoom);
  const video = { videoWidth: 1920, videoHeight: 1080, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }) } as HTMLVideoElement;
  expect(focusPoint(video, 300, 200)).toEqual({ x: .75, y: .5 });
  expect(focusPoint(video, 100, 10)).toBeNull();
});

it("uses the frozen shutter frame when still photography fails or the stream is closed", async () => {
  const frame = { getContext: () => ({ fillRect: vi.fn(), drawImage: vi.fn() }) };
  vi.stubGlobal("document", { createElement: () => frame });
  const live = { videoWidth: 1280, videoHeight: 960 } as HTMLVideoElement;
  const track = {} as MediaStreamTrack;
  const controller = new AbortController();
  vi.stubGlobal("ImageCapture", class { takePhoto() { return Promise.reject(new Error("unsupported")); } });
  expect(await captureLabelFrame(live, track, controller.signal)).toBe(frame);
  vi.stubGlobal("ImageCapture", class { takePhoto() { return new Promise(() => {}); } });
  const pending = captureLabelFrame(live, track, controller.signal);
  controller.abort();
  expect(await pending).toBe(frame);
});
