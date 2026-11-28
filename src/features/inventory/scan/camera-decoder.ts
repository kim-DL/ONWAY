import { uniqueRetailCodes, type DetectedCode } from "./camera-code";
import { drawFrame } from "./camera-frame";

const formats = ["ean_13", "ean_8", "upc_a", "upc_e", "itf"];
interface Detector {
  new(options: { formats: string[] }): { detect: (image: HTMLCanvasElement) => Promise<DetectedCode[]> };
  getSupportedFormats?: () => Promise<string[]>;
}

async function nativeCodes(frame: HTMLCanvasElement): Promise<string[]> {
  const Constructor = (window as Window & { BarcodeDetector?: Detector }).BarcodeDetector;
  if (!Constructor) return [];
  const supported = Constructor.getSupportedFormats ? await Constructor.getSupportedFormats() : formats;
  const requested = formats.filter((format) => supported.includes(format));
  if (!requested.length) return [];
  const detector = new Constructor({ formats: requested });
  return uniqueRetailCodes(await detector.detect(frame));
}

/** A slow browser service or a missing offline decoder chunk must never block sending the photograph. */
function bounded<T>(task: Promise<T>, delay: number, fallback: T, signal: AbortSignal): Promise<T> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(fallback); return; }
    const finish = (value: T) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      resolve(value);
    };
    const cancel = () => finish(fallback);
    const timer = setTimeout(cancel, delay);
    signal.addEventListener("abort", cancel, { once: true });
    void task.then(finish, cancel);
  });
}

/** Decode only the still being submitted, so moving to a different box cannot carry over a live code. */
export async function detectFrameGtin(frame: HTMLCanvasElement, signal: AbortSignal): Promise<string | undefined> {
  if (signal.aborted) return;
  const native = await bounded(nativeCodes(frame), 650, [], signal);
  if (native.length) return native.length === 1 ? native[0] : undefined;
  if (signal.aborted) return;
  const decoder = await bounded(import("./camera-zxing"), 1800, null, signal);
  if (!decoder || signal.aborted) return;
  try {
    const reduced = drawFrame(frame, frame.width, frame.height, 1440);
    const rgba = reduced.getContext("2d")?.getImageData(0, 0, reduced.width, reduced.height).data;
    return rgba && decoder.decodeGtinPixels(rgba, reduced.width, reduced.height);
  } catch { return; }
}
