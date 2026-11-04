import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { cpus } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { chromium, webkit } from "@playwright/test";
import sharp from "sharp";

const baselinePath = process.argv[2];
if (!baselinePath) throw Error("Pass the saved baseline delivery-photo-upload-memory.ts path");
const baseline = await readFile(baselinePath, "utf8");
const baselineOutbox = process.argv[3] ? await readFile(process.argv[3], "utf8") : undefined;
const baselinePreparation = process.argv[4] ? await readFile(process.argv[4], "utf8") : undefined;
const output = path.resolve("output/playwright/photo-persistence", new Date().toISOString().replaceAll(":", "-"));
await mkdir(output, { recursive: true });
const pixels = Buffer.alloc(3024 * 4032 * 3);
let value = 12345;
for (let i = 0; i < pixels.length; i++) { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; pixels[i] = value >>> 24; }
const jpeg = await sharp(pixels, { raw: { width: 3024, height: 4032, channels: 3 } }).jpeg({ quality: 88 }).toBuffer();
const expectedHash = createHash("sha256").update(jpeg).digest("hex");
const results: Array<{ engine: string; side: string; iteration: number; safeMs: number; bytes: number; readsBeforeDurable: number; readMsBeforeDurable: number }> = [];
const versions: Record<string, string> = {};
const failures: Array<{ engine: string; side: string; iteration: number; error: string; measurement: unknown }> = [];
const entry = `
import {DeliveryPhotoUploadCoordinator} from './src/features/delivery-photos/delivery-photo-upload-memory';
import {deliveryPhotoOutbox} from './src/features/delivery-photos/delivery-photo-outbox';
const coordinator=new DeliveryPhotoUploadCoordinator({uid:'benchmark',displayName:'synthetic',claims:{employeeId:'benchmark',roleScopes:['delivery'],sessionVersion:1,permissionsVersion:1}});
window.measurement={safeMs:null,completed:false,hash:null,bytes:0,readsBeforeDurable:0,readMsBeforeDurable:0};
const read=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){const start=performance.now();const bytes=await read.call(this);if(window.measurement.safeMs===null){window.measurement.readsBeforeDurable++;window.measurement.readMsBeforeDurable+=performance.now()-start;}return bytes;};
let started=0;
coordinator.subscribe(()=>{const job=coordinator.getSnapshot()[0];if(!job)return;
if(job.durable && window.measurement.safeMs===null){window.measurement.safeMs=performance.now()-started;}
if(job.status==='completed')window.measurement.completed=true;
if(job.status==='failed')window.measurement.error=job.message;
});
window.verifySource=async()=>{const scope=await deliveryPhotoOutbox.activate(JSON.stringify(['benchmark','benchmark',1,1]));const records=await deliveryPhotoOutbox.list(scope);const source=records[0]?.source;if(!source)throw Error('source missing before preparation');const bytes=await source.arrayBuffer();window.measurement.bytes=bytes.byteLength;window.measurement.hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');window.releasePreparation();};
window.preparationGate=new Promise(resolve=>window.releasePreparation=resolve);
document.querySelector('input').onchange=async event=>{started=performance.now();const job=coordinator.begin('customer','camera');if(!job)throw Error('capture rejected');await coordinator.acceptNativeSource(job.jobId,event.target.files[0]);};
coordinator.ready.then(ready=>{if(!ready)throw Error('outbox not ready');window.ready=true;});`;
const bundles: Record<string, string> = {};
for (const side of ["before", "after"]) {
  const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false,
    platform: "browser", format: "iife", minify: true, define: { "process.env.NODE_ENV": '"production"' }, plugins: [{
      name: "benchmark-boundaries", setup(builder) {
        if (side === "before") builder.onLoad({ filter: /delivery-photo-upload-memory\.ts$/ }, ({ path: file }) => ({ contents: baseline, loader: "ts", resolveDir: path.dirname(file) }));
        if (side === "before" && baselineOutbox) builder.onLoad({ filter: /delivery-photo-outbox\.ts$/ }, ({ path: file }) => ({ contents: baselineOutbox, loader: "ts", resolveDir: path.dirname(file) }));
        builder.onResolve({ filter: /auth\/private-client-state$|delivery-photo-create-repository$/ }, (args) => ({ path: args.path, namespace: "benchmark" }));
        builder.onLoad({ filter: /.*/, namespace: "benchmark" }, ({ path: file }) => ({ contents: file.endsWith("private-client-state")
          ? "export const registerPrivateBlobUrl=x=>x;export const forgetPrivateBlobUrl=x=>URL.revokeObjectURL(x);"
          : `export const deliveryPhotoCreateRepository={async create(input){return{photoId:input.requestId,customerId:input.customerId,source:input.source,deliveryDateKey:'2026-11-04',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),thumbnail:{width:1,height:1}}}};` }));
        builder.onLoad({ filter: /delivery-photo-preparation\.ts$/ }, async ({ path: file }) => ({ loader: "ts", contents: (side === "before" && baselinePreparation ? baselinePreparation : await readFile(file, "utf8")).replace(
          "const decoded = await decodeDeliveryPhoto(source);", "await window.preparationGate; const decoded = await decodeDeliveryPhoto(source);"), resolveDir: path.dirname(file) }));
      },
    }] });
  bundles[side] = bundle.outputFiles[0]!.text;
  await writeFile(path.join(output, `${side}.js`), bundles[side]!);
}
for (const [engineName, engine] of [["chromium", chromium], ["webkit", webkit]] as const) {
  const context = await engine.launchPersistentContext(path.join(output, `${engineName}-profile`), { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  context.setDefaultTimeout(15_000);
  try {
    versions[engineName] = context.browser()?.version() ?? engineName;
    for (let iteration = -2; iteration < 5; iteration++) {
      for (const side of iteration % 2 === 0 ? ["before", "after"] : ["after", "before"]) {
        const page = await context.newPage();
        try {
        const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
        await page.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: `<input type="file"><script>${bundles[side]!.replaceAll("</script>", "<\\/script>")}</script>` }));
        await page.goto(`https://${engineName}-${side}-${iteration + 2}.photo-benchmark.test/`);
        await page.waitForFunction(() => (window as unknown as { ready: boolean }).ready);
        await page.locator("input").setInputFiles({ name: "benchmark.jpg", mimeType: "image/jpeg", buffer: jpeg });
        await page.waitForFunction(() => (window as unknown as { measurement: { safeMs: number | null } }).measurement.safeMs !== null);
        await page.evaluate(() => (window as unknown as { verifySource: () => Promise<void> }).verifySource());
        await page.waitForFunction(() => { const measurement = (window as unknown as { measurement: { completed: boolean; error?: string } }).measurement; return measurement.completed || measurement.error; });
        const measurement = await page.evaluate(() => (window as unknown as { measurement: { safeMs: number; hash: string; bytes: number;
          readsBeforeDurable: number; readMsBeforeDurable: number; error?: string } }).measurement);
        assert.deepEqual(errors, []); assert.equal(measurement.error, undefined);
        assert.equal(measurement.hash, expectedHash); assert.equal(measurement.bytes, jpeg.length);
        if (iteration >= 0) results.push({ engine: engineName, side, iteration, safeMs: measurement.safeMs, bytes: measurement.bytes,
          readsBeforeDurable: measurement.readsBeforeDurable, readMsBeforeDurable: measurement.readMsBeforeDurable });
        const evidence = { engine: engineName, side, iteration, measurement };
        await appendFile(path.join(output, "trials.jsonl"), JSON.stringify(evidence) + "\n");
        console.log(JSON.stringify(evidence));
        } catch (error) {
          const failure = { engine: engineName, side, iteration, error: String(error), measurement: await page.evaluate(() => (window as unknown as { measurement: unknown }).measurement).catch(() => null) };
          failures.push(failure);
          await appendFile(path.join(output, "trials.jsonl"), JSON.stringify(failure) + "\n");
          console.log(JSON.stringify(failure));
        } finally { await page.close(); }
      }
    }
  } finally { await context.close(); }
}
const summary = ["chromium", "webkit"].flatMap((engine) => ["before", "after"].map((side) => {
  const times = results.filter((result) => result.engine === engine && result.side === side).map((result) => result.safeMs).sort((a, b) => a - b);
  return { engine, side, count: times.length, medianMs: times[Math.floor(times.length / 2)], minMs: times[0], maxMs: times.at(-1) };
}));
await writeFile(path.join(output, "results.json"), JSON.stringify({ conditions: { node: process.version, cpu: cpus()[0]?.model, logicalCores: cpus().length,
  versions, sourceBytes: jpeg.length, sourceSha256: expectedHash, warmupsPerSide: 2, repeatsPerSide: 5, timing: "file change to committed durable state; image processing gate released after source checksum verification",
  production: true, viewport: "390x844", cpuThrottle: 1, storage: "new origin each capture", cache: "warm browser process; fresh IndexedDB; all modules bundled",
  baseline: { coordinator: baselinePath, outbox: process.argv[3], preparation: process.argv[4] },
  exclusions: "camera provider, download/import, server, screen lock, actual mobile hardware" }, failures, results, summary }, null, 2));
console.log(JSON.stringify({ output, summary }, null, 2));
assert.equal(failures.length, 0, "Some benchmark trials failed correctness checks; inspect results.json");
