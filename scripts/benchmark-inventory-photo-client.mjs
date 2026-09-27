import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus } from "node:os";

// Run only in a coordinated exclusive CPU window; no app, emulator or network.
if (process.argv[2] !== "--run") throw new Error("Usage: node scripts/benchmark-inventory-photo-client.mjs --run");
const browser = await chromium.launch({ headless: true, args: ["--enable-precise-memory-info"] });
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const fixtures = [];
  for (const byteLength of [256 * 1024, 1024 * 1024, 1536 * 1024]) {
    const bytes = Buffer.alloc(byteLength);
    let seed = 20260927;
    for (let i = 0; i < bytes.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      bytes[i] = seed >>> 24;
    }
    fixtures.push({ byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), base64: bytes.toString("base64") });
  }
  const result = await page.evaluate(async (inputs) => {
    const delay = () => new Promise((resolve) => setTimeout(resolve, 40));
    const heap = () => performance.memory?.usedJSHeapSize ?? null;
    const longTasks = [];
    const supportsLongTasks = PerformanceObserver.supportedEntryTypes.includes("longtask");
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, duration: entry.duration });
    });
    if (supportsLongTasks) observer.observe({ type: "longtask", buffered: true });
    const currentDecode = (input) => Uint8Array.from(atob(input), (character) => character.charCodeAt(0));
    const indexedDecode = (input) => {
      const binary = atob(input); const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    };
    const currentEncode = async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(binary);
    };
    const readerEncode = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(",") + 1));
      reader.readAsDataURL(file);
    });
    const nativeDecode = typeof Uint8Array.fromBase64 === "function";
    const nativeEncode = typeof Uint8Array.prototype.toBase64 === "function";
    const methods = [
      { name: "decode-current-callback", direction: "decode", execute: (input) => currentDecode(input.base64) },
      { name: "decode-indexed-loop", direction: "decode", execute: (input) => indexedDecode(input.base64) },
      { name: "decode-native-feature-detected", direction: "decode", nativeAvailable: nativeDecode,
        execute: (input) => nativeDecode ? Uint8Array.fromBase64(input.base64) : indexedDecode(input.base64) },
      { name: "encode-current-spread8192", direction: "encode", execute: (_input, file) => currentEncode(file) },
      { name: "encode-native-feature-detected", direction: "encode", nativeAvailable: nativeEncode,
        execute: async (_input, file) => nativeEncode ? new Uint8Array(await file.arrayBuffer()).toBase64() : currentEncode(file) },
      { name: "encode-filereader", direction: "encode", execute: (_input, file) => readerEncode(file) },
    ];
    const measurements = [];
    for (const input of inputs) {
      const expected = indexedDecode(input.base64);
      const file = new File([expected], "synthetic.webp", { type: "image/webp" });
      const entries = methods.map((method) => ({ method: method.name, direction: method.direction,
        nativeAvailable: method.nativeAvailable ?? null, samples: [] }));
      for (const method of methods) for (let i = 0; i < 3; i++) { await delay(); await method.execute(input, file); }
      // Rotate method order each round to reduce fixed-order GC/thermal bias.
      for (let round = 0; round < 20; round++) {
        for (let slot = 0; slot < methods.length; slot++) {
          const index = (round + slot) % methods.length; const method = methods[index];
          await delay();
          const heapBefore = heap(); const start = performance.now();
          let output = await method.execute(input, file);
          const end = performance.now(); const heapAfter = heap();
          // Yield before identity validation; do not charge validation to codec tasks.
          await delay();
          const tasks = longTasks.filter((entry) => entry.duration > 50 && entry.startTime < end && entry.startTime + entry.duration > start);
          let byteIdentical = true;
          if (method.direction === "encode") byteIdentical = output === input.base64;
          else {
            byteIdentical = output.length === expected.length;
            for (let i = 0; byteIdentical && i < expected.length; i++) if (output[i] !== expected[i]) byteIdentical = false;
          }
          if (!byteIdentical) throw new Error(`Byte identity failed: ${method.name}/${input.byteLength}`);
          output = null;
          entries[index].samples.push({ elapsedMs: end - start, startTime: start, endTime: end, byteIdentical,
            heapBefore, heapAfter, heapDelta: heapBefore === null || heapAfter === null ? null : heapAfter - heapBefore,
            overlappingLongTasks: tasks });
        }
      }
      const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
      measurements.push({ byteLength: input.byteLength, sha256: input.sha256, methods: entries.map((entry) => ({ ...entry,
        p50: percentile(entry.samples.map((sample) => sample.elapsedMs), .5),
        p75: percentile(entry.samples.map((sample) => sample.elapsedMs), .75),
        p95: percentile(entry.samples.map((sample) => sample.elapsedMs), .95),
        samplesWithLongTask: entry.samples.filter((sample) => sample.overlappingLongTasks.length).length,
      })) });
    }
    observer.disconnect();
    return { nativeDecode, nativeEncode, supportsLongTasks, measurements };
  }, fixtures);
  const report = { recordedAt: new Date().toISOString(), browser: browser.version(), node: process.version,
    cpu: cpus()[0]?.model, viewport: { width: 412, height: 915 }, cpuThrottle: 4, warmups: 3, repeats: 20,
    scope: "Base64 codec only, deterministic raw bytes named synthetic.webp; no actual WebP/image decoding, capture, upload, or network. Encode includes File read. Decode excludes Blob/image creation. Interactions/INP are not measured.",
    memoryLimit: "Heap values are coarse samples before/after each operation, not peak allocations or total memory. GC may make deltas negative; native/FileReader buffers may be outside JS heap.",
    copyNotes: "Current decode materializes an atob string then byte array through a callback. Indexed decode retains the string plus typed array; native decode avoids the JS binary string. Current encode reads File into ArrayBuffer, builds binary strings, then Base64; native encode retains buffer and Base64; FileReader creates a data URL and extracts its payload. Copies are qualitative, engine-dependent, not measured allocation totals.",
    references: ["https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/fromBase64", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/toBase64"],
    ...result };
  await mkdir("output/inventory-performance/photo-client", { recursive: true });
  await writeFile("output/inventory-performance/photo-client/report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ measurements: result.measurements.map((entry) => ({ byteLength: entry.byteLength,
    methods: entry.methods.map(({ method, p50, p75, p95, samplesWithLongTask }) => ({ method, p50, p75, p95, samplesWithLongTask })) })) }, null, 2));
} finally { await browser.close(); }
