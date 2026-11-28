import BarcodeFormat from "@zxing/library/es2015/core/BarcodeFormat";
import BinaryBitmap from "@zxing/library/es2015/core/BinaryBitmap";
import DecodeHintType from "@zxing/library/es2015/core/DecodeHintType";
import RGBLuminanceSource from "@zxing/library/es2015/core/RGBLuminanceSource";
import BitArray from "@zxing/library/es2015/core/common/BitArray";
import HybridBinarizer from "@zxing/library/es2015/core/common/HybridBinarizer";
import ITFReader from "@zxing/library/es2015/core/oned/ITFReader";
import MultiFormatUPCEANReader from "@zxing/library/es2015/core/oned/MultiFormatUPCEANReader";
import UPCEANReader from "@zxing/library/es2015/core/oned/UPCEANReader";
import UPCEReader from "@zxing/library/es2015/core/oned/UPCEReader";
import { uniqueRetailCodes, type DetectedCode } from "./camera-code";

const formats = new Map<BarcodeFormat, string>([
  [BarcodeFormat.EAN_13, "ean_13"], [BarcodeFormat.EAN_8, "ean_8"], [BarcodeFormat.UPC_A, "upc_a"],
  [BarcodeFormat.ITF, "itf"],
]);

const upceEnd = Int32Array.from([1, 1, 1, 1, 1, 1]);
interface RowCode extends DetectedCode { start: number; end: number }
// In ZXing JS 0.21, UPCEReader.decodeMiddle returns a number to a caller expecting
// { rowOffset, resultString }. Reuse its public digit/guard decoder and validate the expanded UPC.
function compressedUpc(row: BitArray): RowCode | undefined {
  const start = UPCEANReader.findStartGuardPattern(row);
  let offset = start[1]!;
  let parity = 0;
  let data = "";
  const counters = new Int32Array(4);
  for (let i = 0; i < 6; i += 1) {
    const digit = UPCEANReader.decodeDigit(row, counters, offset, UPCEANReader.L_AND_G_PATTERNS);
    data += digit % 10;
    parity = (parity << 1) | Number(digit >= 10);
    for (const width of counters) offset += width;
  }
  const end = UPCEANReader.findGuardPatternWithoutCounters(row, offset, true, upceEnd);
  const quiet = end[1]! + end[1]! - end[0]!;
  if (end[0] !== offset || quiet > row.getSize() || !row.isRange(end[1]!, quiet, false)) return;
  const systemZero = UPCEReader.NUMSYS_AND_CHECK_DIGIT_PATTERNS[0]!;
  const zeroCheck = systemZero.indexOf(parity);
  if (zeroCheck >= 0) return { rawValue: "0" + data + zeroCheck, format: "upc_e", start: start[0]!, end: end[1]! };
  const oneCheck = systemZero.indexOf(parity ^ 63);
  if (oneCheck >= 0) return { rawValue: "1" + data + oneCheck, format: "upc_e", start: start[0]!, end: end[1]! };
}

/** Sample four orientations in either reading direction, with bounded work on each still photo. */
export function decodeGtinPixels(rgba: Uint8ClampedArray, width: number, height: number, detections: DetectedCode[] = []): string | undefined {
  const hints = new Map<DecodeHintType, number[]>([
    [DecodeHintType.POSSIBLE_FORMATS, [...formats.keys()]], [DecodeHintType.ALLOWED_LENGTHS, [14]],
  ]);
  const readers = [new MultiFormatUPCEANReader(hints), new ITFReader()];
  function readRow(row: BitArray, y: number): RowCode | undefined {
    for (const reader of readers) {
      try {
        const result = reader.decodeRow(y, row, hints);
        const format = formats.get(result.getBarcodeFormat());
        const [start, end] = result.getResultPoints();
        if (format && start && end) return { rawValue: result.getText(), format, start: start.getX(), end: end.getX() };
      } catch { /* Try the other retail format. */ }
    }
    try { return compressedUpc(row); } catch { return; }
  }
  // An outer box and an individual pack can show different codes on the same scan line.
  function checkAdjacent(row: BitArray, y: number, from: number, to: number) {
    if (to - from < 51) return;
    const strip = new BitArray(to - from);
    let changes = 0;
    let previous = false;
    for (let x = from; x < to; x += 1) {
      const bar = row.get(x);
      if (bar) strip.set(x - from);
      if (bar !== previous) changes += 1;
      previous = bar;
    }
    if (changes < 24) return;
    let adjacent = readRow(strip, y);
    if (!adjacent) { strip.reverse(); adjacent = readRow(strip, y); }
    if (adjacent) detections.push(adjacent);
  }
  function readBothDirections(row: BitArray, y: number) {
    for (let direction = 0; direction < 2; direction += 1) {
      if (direction) row.reverse();
      const result = readRow(row, y);
      if (!result) continue;
      detections.push(result);
      checkAdjacent(row, y, 0, Math.floor(result.start));
      checkAdjacent(row, y, Math.ceil(result.end), row.getSize());
      return;
    }
  }
  function scan(vertical: boolean) {
    const w = vertical ? height : width, h = vertical ? width : height;
    const rows = Math.min(72, h);
    const pixels = new Uint8ClampedArray(w * rows);
    // Only the scan lines are needed, even at full still-photo resolution.
    for (let line = 0; line < rows; line++) {
      const y = Math.floor((line + 0.5) * h / rows);
      for (let x = 0; x < w; x++) {
        const offset = 4 * (vertical ? (height - 1 - x) * width + y : y * width + x);
        pixels[line * w + x] = (rgba[offset]! + 2 * rgba[offset + 1]! + rgba[offset + 2]!) / 4;
      }
    }
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, w, rows)));
    let row = new BitArray(w);
    for (let y = 0; y < rows; y++) {
      try { row = bitmap.getBlackRow(y, row); } catch { continue; }
      readBothDirections(row, y);
    }
  }
  // Traverse the actual pixels on each diagonal. A short printed code can fit
  // between horizontal scan lines or end before an angled line crosses all its bars.
  function scanDiagonals(upward: boolean) {
    const pixels = new Uint8ClampedArray(Math.min(width, height));
    const intercepts = width + height - 1;
    const count = Math.min(72, intercepts);
    const stride = 4 * (1 + (upward ? -width : width));
    for (let line = 0; line < count; line++) {
      const intercept = Math.floor((line + 0.5) * intercepts / count) - width + 1;
      const x = Math.max(0, -intercept);
      const y = x + intercept;
      const length = Math.min(width - x, height - y);
      if (length < 51) continue;
      let offset = 4 * ((upward ? height - 1 - y : y) * width + x);
      for (let i = 0; i < length; i++, offset += stride) {
        pixels[i] = (rgba[offset]! + 2 * rgba[offset + 1]! + rgba[offset + 2]!) / 4;
      }
      const bitmap = new HybridBinarizer(new RGBLuminanceSource(pixels.subarray(0, length), length, 1));
      let row: BitArray;
      try { row = bitmap.getBlackRow(0, new BitArray(length)); } catch { continue; }
      readBothDirections(row, line);
    }
  }
  scan(false);
  scan(true);
  if (uniqueRetailCodes(detections).length <= 1) {
    scanDiagonals(false);
    scanDiagonals(true);
  }
  const valid = uniqueRetailCodes(detections);
  return valid.length === 1 ? valid[0] : undefined;
}
