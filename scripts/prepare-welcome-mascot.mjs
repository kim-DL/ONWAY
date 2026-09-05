import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

// Technical export only: preserve the supplied canvas, colours, alpha, every
// frame, its duration and the complete repeating cycle. No crop or resampling.
// Usage: node scripts/prepare-welcome-mascot.mjs "path/to/bloub-my-cycle onnuri.gif"
const sourceArgument = process.argv[2];
assert(sourceArgument, "Pass the original bloub-my-cycle onnuri.gif path.");

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(sourceArgument);
const outputDirectory = join(projectRoot, "public", "brand");
const animationPath = join(outputDirectory, "bloub-welcome-v2.webp");
const posterPath = join(outputDirectory, "bloub-welcome-still-v2.png");
const source = await readFile(sourcePath);
const sourceMetadata = await sharp(source, { animated: true }).metadata();

assert.equal(sourceMetadata.format, "gif");
assert.equal(sourceMetadata.width, 320);
assert.equal(sourceMetadata.pageHeight, 320);
assert.equal(sourceMetadata.pages, 200);
assert.equal(sourceMetadata.hasAlpha, true);
assert.equal(sourceMetadata.loop, 0);
assert.equal(sourceMetadata.delay?.length, 200);
assert(sourceMetadata.delay.every((delay) => delay === 50));

const animation = await sharp(source, { animated: true })
  .webp({
    lossless: true,
    effort: 6,
    loop: sourceMetadata.loop,
    delay: sourceMetadata.delay,
    minSize: true,
    mixed: false,
  })
  .toBuffer();
const poster = await sharp(source, { page: 0, pages: 1 })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toBuffer();

const animationMetadata = await sharp(animation, { animated: true }).metadata();
assert.equal(animationMetadata.format, "webp");
for (const key of ["width", "pageHeight", "pages", "hasAlpha", "loop"]) {
  assert.equal(animationMetadata[key], sourceMetadata[key], `Changed ${key}.`);
}
assert.deepEqual(animationMetadata.delay, sourceMetadata.delay, "Changed frame timing.");

// Verify all decoded pixels, not merely the container's lossless flag. RGB in
// fully transparent pixels is invisible and encoders may normalise that value;
// alpha and every non-transparent pixel must remain exactly the same.
function assertSameVisiblePixels(original, exported, context) {
  assert.equal(exported.length, original.length, `${context}: changed pixel count.`);
  for (let offset = 0; offset < original.length; offset += 4) {
    assert.equal(exported[offset + 3], original[offset + 3], `${context}: changed alpha at ${offset / 4}.`);
    if (original[offset + 3] === 0) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      assert.equal(exported[offset + channel], original[offset + channel], `${context}: changed colour at ${offset / 4}.`);
    }
  }
}

const originalPixels = await sharp(source, { animated: true }).ensureAlpha().raw().toBuffer();
const animationPixels = await sharp(animation, { animated: true }).ensureAlpha().raw().toBuffer();
assertSameVisiblePixels(originalPixels, animationPixels, "Full animation");

const alphaBounds = { left: 320, top: 320, right: -1, bottom: -1 };
for (let offset = 3; offset < originalPixels.length; offset += 4) {
  if (originalPixels[offset] === 0) continue;
  const framePixel = Math.floor(offset / 4) % (320 * 320);
  const x = framePixel % 320;
  const y = Math.floor(framePixel / 320);
  alphaBounds.left = Math.min(alphaBounds.left, x);
  alphaBounds.top = Math.min(alphaBounds.top, y);
  alphaBounds.right = Math.max(alphaBounds.right, x);
  alphaBounds.bottom = Math.max(alphaBounds.bottom, y);
}

const posterMetadata = await sharp(poster).metadata();
assert.equal(posterMetadata.format, "png");
assert.equal(posterMetadata.width, 320);
assert.equal(posterMetadata.height, 320);
assert.equal(posterMetadata.hasAlpha, true);
assert.equal(posterMetadata.pages ?? 1, 1);
const posterPixels = await sharp(poster).ensureAlpha().raw().toBuffer();
assertSameVisiblePixels(originalPixels.subarray(0, 320 * 320 * 4), posterPixels, "First-frame poster");

// Only publish files once all format, timing and pixel-preservation checks pass.
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(animationPath, animation),
  writeFile(posterPath, poster),
]);

console.log(JSON.stringify({
  status: "welcome-mascot-export-verified",
  source: basename(sourcePath),
  sourceSha256: createHash("sha256").update(source).digest("hex"),
  sourceBytes: source.length,
  animation: basename(animationPath),
  animationBytes: animation.length,
  poster: basename(posterPath),
  posterBytes: poster.length,
  width: animationMetadata.width,
  height: animationMetadata.pageHeight,
  frames: animationMetadata.pages,
  frameDelayMs: 50,
  durationMs: animationMetadata.delay.reduce((sum, delay) => sum + delay, 0),
  loop: animationMetadata.loop,
  hasAlpha: animationMetadata.hasAlpha,
  compression: "lossless",
  allVisiblePixelsIdentical: true,
  firstFramePosterIdentical: true,
  allFrameAlphaBounds: {
    ...alphaBounds,
    width: alphaBounds.right - alphaBounds.left + 1,
    height: alphaBounds.bottom - alphaBounds.top + 1,
  },
  bytesSavedPercent: Number(((1 - animation.length / source.length) * 100).toFixed(1)),
}, null, 2));
