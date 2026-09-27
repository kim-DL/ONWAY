import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { cpus } from "node:os";
import sharp from "sharp";
import * as processors from "../functions/src/photo/photo-processor.js";

// CPU-only deterministic processing benchmark: no Firebase, uploads or user photos.
const phase = process.argv[2];
if (phase !== "before" && phase !== "after") throw new Error("Usage: tsx scripts/benchmark-inventory-photo-server.ts before|after");
const runs = 20;
const output = "output/inventory-performance/photo-server";
const digest = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");
const percentile = (values: number[], fraction: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
const processPhoto = phase === "before" ? processors.processSchoolPhoto
  : processors.processInventoryPhoto;
if (!processPhoto) throw new Error("Inventory processor is not implemented");
const results = [];
for (const [width, height, orientation] of [[1440, 1080, 1], [2560, 1920, 6]] as const) {
  const raw = Buffer.alloc(width * height * 3);
  let seed = 20260927;
  for (let pixel = 0; pixel < width * height; pixel++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const x = pixel % width; const y = Math.floor(pixel / width);
    for (let channel = 0; channel < 3; channel++) raw[pixel * 3 + channel] = (Math.floor(x / 16) * 13 + Math.floor(y / 24) * 17 + channel * 67 + (seed >>> 27)) % 256;
  }
  const source = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 88 }).withMetadata({ orientation }).toBuffer();
  for (let i = 0; i < 3; i++) await processPhoto(source);
  const samples = [];
  let variants;
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    const processed = await processPhoto(source);
    samples.push(performance.now() - start);
    variants = Object.fromEntries(Object.entries(processed).map(([name, image]) => [name, { width: image.width, height: image.height, bytes: image.bytes, sha256: digest(image.buffer) }]));
  }
  results.push({ width, height, orientation, sourceBytes: source.length, sourceSha256: digest(source), samplesMs: samples,
    p50: percentile(samples, .5), p75: percentile(samples, .75), p95: percentile(samples, .95), variants });
}
const report = { phase, runs, warmups: 3, recordedAt: new Date().toISOString(), node: process.version, platform: process.platform,
  cpu: cpus()[0]?.model, sharp: sharp.versions, concurrency: sharp.concurrency(), processorSourceSha256: digest(await readFile("functions/src/photo/photo-processor.ts")),
  scope: "Local warmed CPU-only processing. Excludes transport, Storage, Firestore, cold starts, and client preparation. Synthetic patterned JPEG fixtures, not field-photo claims.", results };
await mkdir(output, { recursive: true });
await writeFile(`${output}/${phase}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ phase, results: results.map(({ width, height, p50, p75, p95 }) => ({ width, height, p50, p75, p95 })) }, null, 2));
