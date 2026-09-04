import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import manifest from "@/app/manifest";
import { isPublicAssetPath } from "@/features/pwa/cache-policy";

async function inspectMark(filename: string) {
  const { data, info } = await sharp(join(process.cwd(), "public", "icons", filename))
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let coloredPixels = 0;
  let maximumRadius = 0;
  let minX = info.width;
  let maxX = 0;
  let opaque = true;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * 4;
      const red = data[offset]!;
      const green = data[offset + 1]!;
      const blue = data[offset + 2]!;
      opaque &&= data[offset + 3] === 255;
      // The retained company mark is saturated; the full-bleed surface is not.
      if (Math.max(red, green, blue) - Math.min(red, green, blue) < 80) continue;
      coloredPixels += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      maximumRadius = Math.max(maximumRadius, Math.hypot(x + .5 - info.width / 2, y + .5 - info.height / 2));
    }
  }
  return { width: info.width, height: info.height, coloredPixels, maximumRadius, markWidth: maxX - minX + 1, opaque };
}

describe("production company icons", () => {
  it("publishes versioned, correctly sized, opaque icons in the offline allowlist", async () => {
    for (const icon of manifest().icons ?? []) {
      expect(icon.src).toContain("-v4.png");
      expect(isPublicAssetPath(icon.src)).toBe(true);
      const pixels = await inspectMark(icon.src.split("/").at(-1)!);
      expect(`${pixels.width}x${pixels.height}`).toBe(icon.sizes);
      expect(pixels.opaque).toBe(true);
    }
  });

  it("enlarges the mark without allowing Android masks to cut the logo", async () => {
    const previous = await inspectMark("onnuriway-company-icon-maskable-512-v3.png");
    const current = await inspectMark("onnuriway-company-icon-maskable-512-v4.png");
    expect(current.markWidth).toBeGreaterThan(previous.markWidth * 1.17);
    expect(current.coloredPixels).toBeGreaterThan(previous.coloredPixels * 1.38);
    expect(current.maximumRadius).toBeLessThanOrEqual(current.width * .4);
  });

  it("uses the available canvas for the standard and Apple touch icons", async () => {
    for (const filename of ["onnuriway-company-icon-512-v4.png", "onnuriway-company-apple-touch-icon-v4.png"]) {
      const icon = await inspectMark(filename);
      expect(icon.markWidth / icon.width).toBeGreaterThan(.93);
    }
  });
});
