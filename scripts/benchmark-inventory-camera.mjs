// From the repository root, pass an unpacked zxing-wasm@3.1.8 directory.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { chromium } from "playwright";

// This immutable revision introduced full-size, two-axis reading. Bundle those
// two decoder files against the same pinned project dependencies as the new reader.
const baselineCommit = "75246b88be76d82412b6df14fa2a6afb5f538a8a";
const baselinePlugin = {
  name: "baseline-camera-decoder",
  setup(builder) {
    builder.onLoad({ filter: /camera-(decoder|zxing)\.ts$/ }, ({ path: filename }) => {
      const relative = path.relative(process.cwd(), filename).split(path.sep).join("/");
      return {
        contents: execFileSync("git", ["show", baselineCommit + ":" + relative], { encoding: "utf8" }),
        resolveDir: path.dirname(filename), loader: "ts",
      };
    });
  },
};

async function measure() {
  const packagePath = path.resolve(process.argv[2] || "");
  const metadata = JSON.parse(fs.readFileSync(path.join(packagePath, "package.json"), "utf8"));
  if (metadata.name !== "zxing-wasm" || metadata.version !== "3.1.8") {
    throw new Error("Pass the unpacked zxing-wasm@3.1.8 directory.");
  }
  const wasm = fs.readFileSync(path.join(packagePath, "dist/reader/zxing_reader.wasm"));
  const wrapper = fs.readFileSync(path.join(packagePath, "dist/iife/reader/index.js"));
  const bundle = { entryPoints: ["src/features/inventory/scan/camera-decoder.ts"], bundle: true, format: "iife", write: false };
  const [app, baseline] = await Promise.all([
    build({ ...bundle, globalName: "AppDecoder" }),
    build({ ...bundle, globalName: "BaselineDecoder", plugins: [baselinePlugin] }),
  ]);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route(/^https?:/, route => route.abort());
    await page.addScriptTag({ content: app.outputFiles[0].text });
    await page.addScriptTag({ content: baseline.outputFiles[0].text });
    await page.addScriptTag({ content: wrapper.toString("utf8") });
    await page.evaluate(async (base64) => {
      Object.defineProperty(window, "BarcodeDetector", { value: undefined, configurable: true });
      const wasmBinary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      await ZXingWASM.prepareZXingModule({ overrides: { wasmBinary }, fireImmediately: true });
    }, wasm.toString("base64"));
    const results = await page.evaluate(async () => {
      const digits = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
      const parity = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
      const invert = bits => Array.from(bits, b => b === "0" ? "1" : "0").join("");
      const codes = ["4006381333931", "5901234123457"];
      function paintCode(context, value, x, y, moduleWidth, degrees) {
        const left = Array.from(value.slice(1, 7), (n, i) => {
          const pattern = digits[Number(n)];
          return parity[Number(value[0])][i] === "L" ? pattern : Array.from(invert(pattern)).reverse().join("");
        }).join("");
        const right = Array.from(value.slice(7), n => invert(digits[Number(n)])).join("");
        const symbol = "101" + left + "01010" + right + "101";
        context.save();
        context.translate(x, y);
        context.rotate(degrees * Math.PI / 180);
        context.fillStyle = "black";
        // Draw contiguous runs together so adjacent black modules have no rasterization seams.
        for (const run of symbol.matchAll(/1+/g)) {
          const start = Math.round(run.index * moduleWidth);
          const end = Math.round((run.index + run[0].length) * moduleWidth);
          context.fillRect(start - Math.round(47.5 * moduleWidth), -26 * moduleWidth, end - start, 52 * moduleWidth);
        }
        context.restore();
      }
      function sheet() {
        const frame = document.createElement("canvas");
        frame.width = 2400;
        frame.height = 1400;
        const context = frame.getContext("2d", { willReadFrequently: true });
        context.fillStyle = "white";
        context.fillRect(0, 0, frame.width, frame.height);
        return { frame, context };
      }
      async function jpegFrame(source, blur) {
        const image = sheet();
        image.context.filter = "blur(" + blur + "px)";
        image.context.drawImage(source, 0, 0);
        const jpeg = await new Promise(resolve => image.frame.toBlob(resolve, "image/jpeg", 0.9));
        const bitmap = await createImageBitmap(jpeg);
        image.context.filter = "none";
        image.context.drawImage(bitmap, 0, 0);
        bitmap.close();
        return image;
      }
      // Compare rotating the captured image by a fixed 45 degrees, without using the known print angle.
      function diagonalFrame(source) {
        const edge = Math.ceil((source.width + source.height) / Math.SQRT2);
        const frame = document.createElement("canvas");
        frame.width = edge;
        frame.height = edge;
        const ctx = frame.getContext("2d");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, edge, edge);
        ctx.translate(edge / 2, edge / 2);
        ctx.rotate(Math.PI / 4);
        ctx.drawImage(source, -source.width / 2, -source.height / 2);
        return frame;
      }
      async function read(image) {
        const { signal } = new AbortController();
        const before = performance.now();
        const baseline = await BaselineDecoder.detectFrameGtin(image.frame, signal) ?? null;
        const afterBaseline = performance.now();
        const app = await AppDecoder.detectFrameGtin(image.frame, signal) ?? null;
        const afterApp = performance.now();
        const rotated = await BaselineDecoder.detectFrameGtin(diagonalFrame(image.frame), signal) ?? null;
        const afterRotation = performance.now();
        const pixels = image.context.getImageData(0, 0, image.frame.width, image.frame.height);
        const read = await ZXingWASM.readBarcodes(pixels, { formats: ["EAN13", "EAN8", "UPCA", "UPCE", "ITF"], maxNumberOfSymbols: 8 });
        const wasm = Array.from(new Set(read.filter(result => result.isValid).map(result => result.text))).sort();
        const ms = { baseline: afterBaseline - before, app: afterApp - afterBaseline,
          extraRotation: afterRotation - afterApp, wasm: performance.now() - afterRotation };
        return { baseline, app, wasm, rotated, ms };
      }
      const warmup = sheet();
      paintCode(warmup.context, codes[0], 1036, 681, 3, 0);
      await read(await jpegFrame(warmup.frame, 0));
      const samples = [];
      for (const moduleWidth of [1, 1.5, 2, 3]) {
        for (const degrees of [0, 30, 45, 60, 90]) {
          const source = sheet();
          paintCode(source.context, codes[0], 1036, 681, moduleWidth, degrees);
          for (const blur of [0, 1.3]) {
            const decoded = await read(await jpegFrame(source.frame, blur));
            samples.push({ moduleWidth, degrees, blur, ...decoded });
          }
        }
      }
      const controls = sheet();
      const blank = await read(await jpegFrame(controls.frame, 0));
      paintCode(controls.context, codes[0], 740, 671, 3, 0);
      paintCode(controls.context, codes[1], 1640, 671, 3, 0);
      const twoCodes = await read(await jpegFrame(controls.frame, 0));

      // Variance of the four-neighbour discrete Laplacian on a fixed 400 x 200 patch.
      function sharpness(gray, width, height) {
        let sum = 0, squared = 0;
        const count = (width - 2) * (height - 2);
        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            const v = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i];
            sum += v;
            squared += v * v;
          }
        }
        return Math.round(squared / count - (sum / count) ** 2);
      }
      function focusPatch(context, noise = 0) {
        const { data, width, height } = context.getImageData(540, 571, 400, 200);
        let seed = 19;
        const gray = new Uint8ClampedArray(width * height);
        for (let i = 0; i < gray.length; i++) {
          seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
          gray[i] = data[4 * i] + noise * (seed / 4294967296 * 2 - 1);
        }
        return sharpness(gray, width, height);
      }
      const blurred = await jpegFrame(controls.frame, 2);
      const gray = sheet();
      gray.context.fillStyle = "#888";
      gray.context.fillRect(0, 0, gray.frame.width, gray.frame.height);
      const focus = {
        clearCode: focusPatch(controls.context), blurredCode: focusPatch(blurred.context),
        blurredCodeWithNoise: focusPatch(blurred.context, 36),
        uniformPatch: focusPatch(gray.context), uniformPatchWithNoise: focusPatch(gray.context, 36),
      };
      const mixed = sheet();
      paintCode(mixed.context, codes[0], 740, 671, 3, 0);
      paintCode(mixed.context, codes[1], 1640, 671, 3, 45);
      const mixedCodes = await read(await jpegFrame(mixed.frame, 0));
      return { codes, samples, blank, twoCodes, mixedCodes, focus };
    });
    const correctApp = row => row.app === results.codes[0];
    const correctWasm = row => row.wasm.length === 1 && row.wasm[0] === results.codes[0];
    const correctBaseline = row => row.baseline === results.codes[0];
    const count = rows => ({
      total: rows.length, production: rows.filter(correctApp).length, twoAxis: rows.filter(correctBaseline).length,
      wasm: rows.filter(correctWasm).length,
      twoAxisWithRotation: rows.filter(row => correctBaseline(row) || row.rotated === results.codes[0]).length,
    });
    const desktopMs = Object.fromEntries(["baseline", "app", "extraRotation", "wasm"].map(key => {
      const times = results.samples.map(sample => sample.ms[key]).sort((a, b) => a - b);
      const percentile = p => Math.round(times[Math.ceil(p * times.length) - 1]);
      return [key, { p50: percentile(0.5), p95: percentile(0.95) }];
    }));
    return {
      desktopMs, chromium: browser.version(), wrapperGzip: gzipSync(wrapper).length, wasmGzip: gzipSync(wasm).length,
      correct: count(results.samples),
      byModuleWidth: [1, 1.5, 2, 3].map(width => ({ width, ...count(results.samples.filter(s => s.moduleWidth === width)) })),
      byBlur: [0, 1.3].map(blur => ({ blur, ...count(results.samples.filter(s => s.blur === blur)) })),
      wrongApp: results.samples.filter(s => s.app !== null && !correctApp(s)).length,
      wrongWasm: results.samples.filter(s => s.wasm.some(code => code !== results.codes[0])).length,
      ...results,
    };
  } finally {
    await browser.close();
  }
}
measure().then(report => console.log(JSON.stringify(report, null, 2))).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
