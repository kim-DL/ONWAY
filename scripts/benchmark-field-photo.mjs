import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import sharp from "sharp";

const root = process.cwd();
const output = resolve("output/playwright/field-latency");
await mkdir(output, { recursive: true });
const empty = resolve(".cache/field-p0/client-only-empty.js"); await writeFile(empty, "export {};\n");
const delayMs = 800, runs = 30;
const bundles = new Map();
const bundledSha256 = {};
for (const phase of ["before", "after"]) {
  const source = resolve(phase === "before" ? ".cache/field-p0/baseline/src/features/delivery-photos" : "src/features/delivery-photos");
  const entry = `
import React, {useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import {DeliveryPhotoUploadCoordinator, encodeDeliveryPhotoBlob} from ${JSON.stringify(source + "/delivery-photo-upload-memory.ts")};
import {DeliveryPhotoInputController} from ${JSON.stringify(source + "/delivery-photo-input-controller.tsx")};
import {prepareDeliveryPhoto} from ${JSON.stringify(source + "/delivery-photo-preparation.ts")};
import {deliveryPhotoOutbox} from ${JSON.stringify(resolve("src/features/delivery-photos/delivery-photo-outbox.ts"))};
const after=${phase === "after"};
const session={uid:'synthetic',displayName:'synthetic',claims:{employeeId:'synthetic',sessionVersion:1,permissionsVersion:1,roleScopes:['delivery']}};
const deps={prepare:prepareDeliveryPhoto,preparationMessage:()=> 'preparation failed',uuid:()=>crypto.randomUUID(),now:()=>Date.now(),maxConcurrentRelays:2,
  store:deliveryPhotoOutbox,encode:encodeDeliveryPhotoBlob,create:async(input)=>{const r=await fetch('/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});return r.json();}};
const c=new DeliveryPhotoUploadCoordinator(session,deps); window.fieldCoordinator=c;
window.field={start:0,opened:0,confirmed:0,preview:0};
document.addEventListener('change',()=>{window.field.start=performance.now();},true);
function App(){const ref=useRef(null);const[ready,setReady]=useState(false);const jobs=useSyncExternalStore(c.subscribe,c.getSnapshot,c.getSnapshot);
useEffect(()=>{Promise.resolve(c.ready).then(()=>setReady(true));},[]);
useEffect(()=>{if(jobs.some(j=>j.status==='completed')&&!window.field.confirmed)window.field.confirmed=performance.now();},[jobs]);
const active=jobs.some(j=>['preparing','queued','uploading'].includes(j.status));const preview=c.getPreview?.(jobs[0]?.jobId);
return <><button disabled={!ready||(after?!c.canBegin('customer'):active)} onClick={()=>{if(ref.current.openCamera('customer'))window.field.opened=performance.now();}}>촬영</button>
<DeliveryPhotoInputController ref={ref} coordinator={c}/><p id='state'>{jobs[0]?.status||'ready'}</p>
{preview?<img alt='local preview' src={preview.thumbnail} onLoad={()=>{if(!window.field.preview)window.field.preview=performance.now();}}/>:null}</>}
createRoot(document.getElementById('root')).render(<App/>);`;
  const result = await build({ stdin: { contents: entry, loader: "tsx", resolveDir: root }, outfile: resolve(output, `${phase}.js`),
    bundle: true, platform: "browser", format: "iife", minify: true, write: false,
    alias: { "client-only": empty }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent" });
  for (const file of result.outputFiles) bundles.set(`/${phase}${file.path.endsWith(".css") ? ".css" : ".js"}`, file.contents);
  bundledSha256[phase] = createHash("sha256").update(result.outputFiles.find((file) => file.path.endsWith(".js")).contents).digest("hex");
}
const pixels = Buffer.alloc(640 * 480 * 3); let seed = 20261018;
for (let i = 0; i < pixels.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; pixels[i] = (i % 241 + (seed >>> 27)) % 256; }
const photo = await sharp(pixels, { raw: { width: 640, height: 480, channels: 3 } }).jpeg({ quality: 88 }).toBuffer();
const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.url === "/confirm" && request.method === "POST") {
    let body = ""; for await (const part of request) body += part;
    const input = JSON.parse(body); await new Promise((done) => setTimeout(done, delayMs));
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ photoId: input.requestId, customerId: input.customerId, deliveryDateKey: new Date().toISOString().slice(0, 10),
      source: input.source, createdAt: new Date().toISOString(), createdByEmployeeId: "synthetic", createdByName: "synthetic",
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), thumbnail: { width: 640, height: 480 } })); return;
  }
  if (bundles.has(request.url)) { response.setHeader("Content-Type", request.url.endsWith(".css") ? "text/css" : "application/javascript"); response.end(bundles.get(request.url)); return; }
  if (request.url === "/before" || request.url === "/after") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${request.url}.css"><div id="root"></div><script src="${request.url}.js"></script>`); return;
  }
  response.statusCode = 404; response.end();
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const address = server.address(); assert.ok(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const samples = { before: [], after: [] };
try {
  for (let trial = -1; trial < runs; trial++) {
    for (const phase of trial % 2 ? ["after", "before"] : ["before", "after"]) {
      const context = await browser.newContext({ viewport: { width: 412, height: 915 }, serviceWorkers: "block" });
      try {
        const page = await context.newPage(); const errors = []; page.on("pageerror", (error) => errors.push(error.message));
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await page.goto(origin + "/" + phase); const button = page.getByRole("button", { name: "촬영", exact: true });
        await button.waitFor(); await page.waitForFunction(() => !document.querySelector("button")?.disabled);
        // App startup is outside this experiment. Limit the capture itself.
        await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 120, downloadThroughput: 200000, uploadThroughput: 100000 });
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        const first = page.waitForEvent("filechooser"); await button.click();
        await (await first).setFiles({ name: "synthetic.jpg", mimeType: "image/jpeg", buffer: photo });
        if (phase === "after") await page.waitForFunction(() => window.fieldCoordinator.getSnapshot()[0]?.durable === true);
        const next = page.waitForEvent("filechooser"); await button.click(); await next;
        const opened = await page.evaluate(() => window.field.opened - window.field.start);
        await page.locator('input[capture="environment"]').dispatchEvent("cancel");
        await page.waitForFunction(() => window.field.confirmed > 0);
        const timing = await page.evaluate(() => ({ nextCameraMs: window.field.opened - window.field.start,
          confirmedMs: window.field.confirmed - window.field.start, previewMs: window.field.preview ? window.field.preview - window.field.start : null }));
        assert.ok(opened > 0); assert.deepEqual(errors, []);
        if (trial >= 0) samples[phase].push(timing);
      } finally { await context.close(); }
    }
    if (trial % 5 === 4) console.log(`Photo controlled comparison: ${trial + 1}/${runs} paired trials`);
  }
  const percentile = (values, fraction) => values.sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
  const summary = Object.fromEntries(Object.entries(samples).map(([phase, values]) => [phase, {
    n: values.length, nextCameraP50Ms: percentile(values.map((v) => v.nextCameraMs), .5), nextCameraP95Ms: percentile(values.map((v) => v.nextCameraMs), .95),
    confirmedP50Ms: percentile(values.map((v) => v.confirmedMs), .5), confirmedP95Ms: percentile(values.map((v) => v.confirmedMs), .95),
    previewP50Ms: percentile(values.map((v) => v.previewMs).filter((v) => v !== null), .5) ?? null,
  }]));
  const report = { recordedAt: new Date().toISOString(), scope: "Real Chromium/native file input/client coordinator and image preparation; controlled loopback confirmation endpoint, not Firebase/production/camera hardware. Limits apply after startup. Times include browser actionability/DOM observation. Alternating phases, new context per trial, one unreported warmup.",
    baseline: "main 04272ec", bundledSha256, browser: browser.version(), cpuThrottle: 4, rttMs: 120, downloadBytesPerSecond: 200000, uploadBytesPerSecond: 100000,
    confirmationDelayMs: delayMs, fixtureWidth: 640, fixtureHeight: 480, fixtureBytes: photo.length, fixtureSha256: createHash("sha256").update(photo).digest("hex"), runs, summary, samples };
  await writeFile(resolve(output, "photo.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(summary, null, 2));
} finally { await browser.close(); await new Promise((done) => server.close(done)); }
