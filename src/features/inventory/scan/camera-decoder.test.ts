import { afterEach, describe, expect, it, vi } from "vitest";
import { retailCode, uniqueRetailCodes } from "./camera-code";
import { detectFrameGtin } from "./camera-decoder";
import { decodeGtinPixels } from "./camera-zxing";
import { fitFrame, sampleAim } from "./camera-frame";

// Draw actual 1D symbols from their standard bit patterns, independent of the reader.
const left = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const invert = (bits: string) => bits.replace(/[01]/g, (bit) => bit === "1" ? "0" : "1");
const reverse = (bits: string) => [...bits].reverse().join("");
function digit(value: string, pattern: string) {
  const bits = left[Number(value)]!;
  if (pattern === "R") return invert(bits);
  return pattern === "G" ? reverse(invert(bits)) : bits;
}
function group(value: string, pattern: string) { return [...value].map((n, i) => digit(n, pattern[i]!)).join(""); }
function ean13(value: string) {
  const parity = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
  return "101" + group(value.slice(1, 7), parity[Number(value.charAt(0))]!) + "01010" + group(value.slice(7), "RRRRRR") + "101";
}
function itf(value: string) {
  const widths = ["11331", "31113", "13113", "33111", "11313", "31311", "13311", "11133", "31131", "13131"];
  let bits = "1010";
  for (let i = 0; i < value.length; i += 2) {
    const bars = widths[Number(value[i])]!;
    const spaces = widths[Number(value[i + 1])]!;
    for (let j = 0; j < 5; j++) bits += "1".repeat(Number(bars[j])) + "0".repeat(Number(spaces[j]));
  }
  return bits + "11101";
}
function raster(bands: string[], vertical = false): [Uint8ClampedArray, number, number] {
  const width = (Math.max(...bands.map((s) => s.length)) + 24) * 3;
  const height = bands.length * 48;
  const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 0; y < height; y += 1) {
    const bits = bands[Math.floor(y / 48)]!;
    for (let x = 0; x < width; x += 1) {
      if (bits[Math.floor(x / 3) - 12] !== "1") continue;
      const offset = (vertical ? x * height + height - 1 - y : y * width + x) * 4;
      rgba.fill(0, offset, offset + 3);
    }
  }
  return [rgba, vertical ? height : width, vertical ? width : height];
}

describe("camera barcode decoding", () => {
  it.each([
    ["EAN-13", ean13("4006381333931"), "4006381333931"],
    ["EAN-8", "101" + group("9638", "LLLL") + "01010" + group("5074", "RRRR") + "101", "96385074"],
    ["UPC-A", ean13("0036000291452"), "036000291452"],
    ["UPC-E", "101" + group("425261", "GLGGLL") + "010101", "042100005264"],
    ["ITF-14", itf("10012345000017"), "10012345000017"],
  ])("reads %s pixels in both camera orientations", (_name, symbol, expected) => {
    expect(decodeGtinPixels(...raster([symbol!]))).toBe(expected);
    expect(decodeGtinPixels(...raster([reverse(symbol!)], true))).toBe(expected);
  });
  it("does not attach ambiguous, invalid or nonretail codes", () => {
    expect(decodeGtinPixels(...raster([ean13("4006381333931"), ean13("5901234123457")]))).toBeUndefined();
    expect(decodeGtinPixels(...raster([ean13("4006381333931") + "0".repeat(24) + ean13("5901234123457")]))).toBeUndefined();
    expect(decodeGtinPixels(...raster([ean13("4006381333932")]))).toBeUndefined();
    expect(uniqueRetailCodes([{ rawValue: "036000291452", format: "itf" }, { rawValue: "036000291452", format: "qr_code" }])).toEqual([]);
    expect(retailCode({ rawValue: "04252615", format: "upc_e" })).toBeUndefined();
    expect(uniqueRetailCodes([{ rawValue: "036000291452", format: "upc_a" }, { rawValue: "0036000291452", format: "ean_13" }])).toHaveLength(1);
  });
});

describe("native camera decoder", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("requests supported retail formats, preserves an EAN and refuses two different GTINs", async () => {
    const requested = vi.fn();
    const detect = vi.fn().mockResolvedValueOnce([{ format: "ean_13", rawValue: "4006381333931" }])
      .mockResolvedValueOnce([{ format: "ean_13", rawValue: "4006381333931" }, { format: "ean_13", rawValue: "5901234123457" }]);
    class Detector {
      static getSupportedFormats() { return Promise.resolve(["ean_13", "qr_code"]); }
      constructor(options: unknown) { requested(options); }
      detect = detect;
    }
    vi.stubGlobal("window", { BarcodeDetector: Detector });
    const frame = {} as HTMLCanvasElement;
    const { signal } = new AbortController();
    expect(await detectFrameGtin(frame, signal)).toBe("4006381333931");
    expect(requested).toHaveBeenCalledWith({ formats: ["ean_13"] });
    expect(detect).toHaveBeenCalledWith(frame);
    expect(await detectFrameGtin(frame, signal)).toBeUndefined();
  });
  it("checks the full-size print and refuses conflicting codes seen at the second scale", async () => {
    vi.stubGlobal("window", {});
    const code = "4006381333931";
    function canvas(symbol: string, width: number) {
      const height = 100;
      const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
      for (let y = 20; y < 60; y++) for (let x = 0; x < symbol.length; x++) {
        if (symbol[x] === "1") rgba.fill(0, (y * width + x + 90) * 4, (y * width + x + 90) * 4 + 3);
      }
      return { width, height, getContext: () => ({ fillRect() {}, drawImage() {}, getImageData: () => ({ data: rgba }) }) };
    }
    const full = canvas(ean13(code), 2400) as unknown as HTMLCanvasElement;
    let reduced = canvas("", 1440);
    vi.stubGlobal("document", { createElement: () => reduced });
    expect(await detectFrameGtin(full, new AbortController().signal)).toBe(code);
    reduced = canvas(ean13("5901234123457"), 1440);
    expect(await detectFrameGtin(full, new AbortController().signal)).toBeUndefined();
  });
  it("reads oblique bars from the still and reconciles differently oriented or native results", async () => {
    const width = 840, height = 320;
    const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
    const first = "4006381333931", second = "5901234123457";
    function print(code: string, centerX: number, angle: number) {
      const bits = ean13(code);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const dx = x + 0.5 - centerX, dy = y + 0.5 - height / 2;
        const along = dx * Math.cos(angle) + dy * Math.sin(angle);
        const across = dy * Math.cos(angle) - dx * Math.sin(angle);
        if (Math.abs(across) > 42 || bits[Math.floor(along / 3 + bits.length / 2)] !== "1") continue;
        const start = 4 * (y * width + x);
        rgba.fill(0, start, start + 3);
      }
    }
    const frame = { width, height, getContext: () => ({ getImageData: () => ({ data: rgba }) }) } as unknown as HTMLCanvasElement;
    const { signal } = new AbortController();
    vi.stubGlobal("window", {});
    for (const angle of [-Math.PI / 4, Math.PI / 4]) {
      rgba.fill(255);
      print(second, 620, angle);
      expect(await detectFrameGtin(frame, signal)).toBe(second);
      print(first, 210, 0);
      expect(await detectFrameGtin(frame, signal)).toBeUndefined();
    }
    rgba.fill(255);
    print(second, 620, Math.PI / 4);
    vi.stubGlobal("window", { BarcodeDetector: class { async detect() { return [{ rawValue: first, format: "ean_13" }]; } } });
    expect(await detectFrameGtin(frame, signal)).toBeUndefined();
  });
  it("releases a pending lookup on cancellation and ignores its late native result", async () => {
    const { promise, resolve } = Promise.withResolvers<{ format: string; rawValue: string }[]>();
    const detect = vi.fn(() => promise);
    vi.stubGlobal("window", { BarcodeDetector: class { detect = detect; } });
    const controller = new AbortController();
    const result = detectFrameGtin({} as HTMLCanvasElement, controller.signal);
    controller.abort();
    expect(await result).toBeUndefined();
    resolve([{ format: "ean_13", rawValue: "4006381333931" }]);
    expect(detect).toHaveBeenCalledTimes(1);
  });
});

describe("camera frame and local aim signal", () => {
  it("preserves aspect ratio and keeps the original size below the cap", () => {
    expect(fitFrame(4000, 3000, 2400)).toEqual({ width: 2400, height: 1800 });
    expect(fitFrame(480, 640, 2400)).toEqual({ width: 480, height: 640 });
  });
  it("moves the guide toward texture and recenters when there is no detail", () => {
    const pixels = new Uint8ClampedArray(16 * 8 * 4).fill(90);
    for (let y = 0; y < 8; y++) for (let x = 10; x < 16; x += 2) pixels.fill(205, (y * 16 + x) * 4, (y * 16 + x) * 4 + 3);
    const sample = sampleAim(pixels, 16);
    expect(sample.focusX).toBeGreaterThan(0);
    expect(Math.abs(sample.focusY)).toBeLessThan(0.1);
    const flat = sampleAim(new Uint8ClampedArray(pixels.length).fill(80), 16, sample);
    expect(flat.focusX).toBeLessThan(sample.focusX);
  });
  it("requires repeated textured samples for a steady cue and flags glare or low light", () => {
    const [pixels, width] = raster([ean13("4006381333931")]);
    const first = sampleAim(pixels, width);
    const second = sampleAim(pixels, width, first);
    expect(second.state).toBe("searching");
    expect(sampleAim(pixels, width, second).state).toBe("steady");
    expect(sampleAim(new Uint8ClampedArray(pixels.length).fill(100), width, second).state).toBe("moving");
    expect(sampleAim(new Uint8ClampedArray(pixels.length), width).state).toBe("dark");
    expect(sampleAim(new Uint8ClampedArray(pixels.length).fill(255), width).state).toBe("glare");
  });
});
