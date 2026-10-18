import { describe, expect, it } from "vitest";
import { containPhoto, fittedPhoto, photoGeometry, zoomPhoto } from "./inventory-photo-geometry";

describe("inventory photograph viewport geometry", () => {
  it("fits landscape and portrait without cropping or stretching", () => {
    expect(photoGeometry(400, 300, 1600, 800)).toMatchObject({ imageWidth: 400, imageHeight: 200 });
    expect(photoGeometry(400, 300, 800, 1600)).toMatchObject({ imageWidth: 150, imageHeight: 300 });
  });
  it("reserves 3x for enough native pixels at the current device pixel ratio", () => {
    expect(photoGeometry(400, 300, 1600, 1200, 1)?.max).toBe(3);
    expect(photoGeometry(400, 300, 1600, 1200, 2)?.max).toBe(2.5);
    expect(photoGeometry(400, 300, 320, 240, 1)?.max).toBe(2.5);
  });
  it.each([0, -1, Infinity, NaN])("waits for valid image and viewport dimensions (%s)", (value) => {
    expect(photoGeometry(value, 300, 1600, 1200)).toBeNull();
    expect(photoGeometry(400, 300, value, 1200)).toBeNull();
  });
  it("keeps the same photograph point under the cursor at fractional zoom levels", () => {
    const geometry = photoGeometry(400, 300, 1600, 1200)!;
    const point = { x: 32, y: -24 }, previous = { scale: 1.2, x: 15, y: -10 };
    const next = zoomPhoto(previous, 1.873, point, geometry);
    expect(next.scale).toBe(1.873);
    expect((point.x - next.x) / next.scale).toBeCloseTo((point.x - previous.x) / previous.scale, 10);
    expect((point.y - next.y) / next.scale).toBeCloseTo((point.y - previous.y) / previous.scale, 10);
  });
  it("retains centred letterboxing on an axis that still fits while zooming", () => {
    const geometry = photoGeometry(400, 300, 2000, 200)!;
    expect(containPhoto({ scale: 2.5, x: 9000, y: 9000 }, geometry)).toEqual({ scale: 2.5, x: 300, y: 0 });
  });
  it("reaches a centred fit after extreme panning and zooming out", () => {
    const geometry = photoGeometry(400, 300, 1600, 1200)!;
    const edge = containPhoto({ scale: 300, x: -1e6, y: 1e6 }, geometry);
    expect(edge).toEqual({ scale: 3, x: -400, y: 300 });
    expect(zoomPhoto(edge, .01, { x: 120, y: -90 }, geometry)).toEqual(fittedPhoto);
  });
  it("never leaves an empty edge on an overflowing axis across shapes and fractional scales", () => {
    for (const [width, height] of [[1600, 1200], [1200, 1600], [4000, 300], [300, 4000]]) {
      const geometry = photoGeometry(328, 416, width!, height!)!;
      for (let step = 0; step < 100; step++) {
        const view = containPhoto({ scale: 1 + step / 37, x: Math.sin(step) * 10000, y: Math.cos(step) * 10000 }, geometry);
        expect(view.scale).toBeGreaterThanOrEqual(1); expect(view.scale).toBeLessThanOrEqual(geometry.max);
        for (const [size, viewport, offset] of [[geometry.imageWidth, geometry.width, view.x], [geometry.imageHeight, geometry.height, view.y]]) {
          const rendered = size! * view.scale;
          if (rendered <= viewport!) expect(offset).toBe(0);
          else { expect((viewport! - rendered) / 2 + offset!).toBeLessThanOrEqual(1e-9); expect((viewport! + rendered) / 2 + offset!).toBeGreaterThanOrEqual(viewport! - 1e-9); }
        }
      }
    }
  });
});
