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

/** Sample both axes in either reading direction. A fixed number of rows bounds CPU work on phones. */
export function decodeGtinPixels(rgba: Uint8ClampedArray, width: number, height: number): string | undefined {
  const luminance = new Uint8ClampedArray(width * height);
  const turned = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      const level = (rgba[offset]! + 2 * rgba[offset + 1]! + rgba[offset + 2]!) / 4;
      luminance[index] = level;
      turned[x * height + height - 1 - y] = level;
    }
  }
  const hints = new Map<DecodeHintType, number[]>([
    [DecodeHintType.POSSIBLE_FORMATS, [...formats.keys()]], [DecodeHintType.ALLOWED_LENGTHS, [14]],
  ]);
  const readers = [new MultiFormatUPCEANReader(hints), new ITFReader()];
  const detections: DetectedCode[] = [];
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
  function scan(pixels: Uint8ClampedArray, w: number, h: number) {
    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, w, h)));
    let row = new BitArray(w);
    const rows = Math.min(24, h);
    for (let line = 0; line < rows; line += 1) {
      const y = Math.min(h - 1, Math.floor((line + 0.5) * h / rows));
      try { row = bitmap.getBlackRow(y, row); } catch { continue; }
      for (let direction = 0; direction < 2; direction += 1) {
        if (direction) row.reverse();
        const result = readRow(row, y);
        if (!result) continue;
        detections.push(result);
        checkAdjacent(row, y, 0, Math.floor(result.start));
        checkAdjacent(row, y, Math.ceil(result.end), w);
        break;
      }
    }
  }
  scan(luminance, width, height);
  scan(turned, height, width);
  const valid = uniqueRetailCodes(detections);
  return valid.length === 1 ? valid[0] : undefined;
}
