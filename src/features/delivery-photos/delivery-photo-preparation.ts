import { DELIVERY_PHOTO_MAX_BYTES } from "@/domain/delivery-photo";

export const DELIVERY_PHOTO_SOURCE_MAX_BYTES = 30 * 1024 * 1024;
export const DELIVERY_PHOTO_TRANSPORT_MAX_EDGE = 2_560;
// Transport quality is provisional until the Galaxy S20+ field benchmark.
// The server independently creates the final evidence at WebP quality 88.
export const DELIVERY_PHOTO_TRANSPORT_WEBP_QUALITY = 0.9;

export type PreparedDeliveryPhoto = {
  blob: Blob;
  contentType: "image/webp";
  width: number;
  height: number;
};

export type DeliveryPhotoDimensions = { width: number; height: number };

function preparationError(code: string) {
  return Object.assign(new Error("Delivery photo preparation failed."), { code });
}

function canonicalDeclaredType(type: string) {
  return type === "image/jpg" ? "image/jpeg" : type;
}

export function validateDeliveryPhotoSelection(file: File): string | null {
  if (file.size <= 0) return "사진 파일이 비어 있어요. 다시 촬영하거나 선택해주세요.";
  if (file.size > DELIVERY_PHOTO_SOURCE_MAX_BYTES) return "원본 사진은 30MB 이하여야 해요.";
  if (/^image\/hei[cf]/iu.test(file.type) || /\.hei[cf]$/iu.test(file.name ?? "")) {
    return "HEIC/HEIF 사진은 지원하지 않아요. JPEG로 다시 촬영하거나 지원되는 사진을 선택해주세요.";
  }
  if (!["image/jpeg", "image/jpg", "image/png", "image/webp", "", "application/octet-stream"].includes(file.type)) {
    return "JPEG, PNG 또는 WebP 사진을 선택해주세요.";
  }
  return null;
}

function readWithBlob(file: File, signal?: AbortSignal): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(preparationError("delivery-photo/cancelled")); return; }
    const finish = () => { clearTimeout(timeout); signal?.removeEventListener("abort", cancel); };
    const cancel = () => { finish(); reject(preparationError("delivery-photo/cancelled")); };
    const timeout = setTimeout(() => { finish(); reject(preparationError("delivery-photo/source-timeout")); }, 10_000);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      void file.arrayBuffer().then((bytes) => { finish(); resolve(bytes); }, () => {
        finish(); reject(preparationError("delivery-photo/source-unreadable"));
      });
    } catch {
      finish(); reject(preparationError("delivery-photo/source-unreadable"));
    }
  });
}

function readWithFileReader(file: File, signal?: AbortSignal): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(preparationError("delivery-photo/cancelled")); return; }
    let reader: FileReader;
    try { reader = new FileReader(); } catch { reject(preparationError("delivery-photo/source-unreadable")); return; }
    const finish = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      reader.onload = null; reader.onerror = null; reader.onabort = null;
    };
    const stop = (code: string) => {
      finish(); reject(preparationError(code));
      try { reader.abort(); } catch { /* The native provider may already be settled. */ }
    };
    const cancel = () => stop("delivery-photo/cancelled");
    const timeout = setTimeout(() => stop("delivery-photo/source-timeout"), 20_000);
    reader.onload = () => {
      const result = reader.result; finish();
      if (result instanceof ArrayBuffer) resolve(result);
      else reject(preparationError("delivery-photo/source-unreadable"));
    };
    reader.onerror = reader.onabort = () => { finish(); reject(preparationError("delivery-photo/source-unreadable")); };
    signal?.addEventListener("abort", cancel, { once: true });
    try { reader.readAsArrayBuffer(file); }
    catch { finish(); reject(preparationError("delivery-photo/source-unreadable")); }
  });
}

function exactBytes(bytes: ArrayBuffer, expected: number) {
  if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength !== expected) {
    throw preparationError("delivery-photo/source-unreadable");
  }
  return bytes;
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, end));
}

export function detectDeliveryPhotoContentType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 16 && ascii(bytes, 4, 8) === "ftyp") {
    const boxSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    if (boxSize >= 16 && boxSize <= bytes.length && boxSize % 4 === 0) {
      for (let offset = 8; offset < boxSize; offset += offset === 8 ? 8 : 4) {
        const brand = ascii(bytes, offset, offset + 4);
        if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) {
          throw preparationError("delivery-photo/heic-source");
        }
        if (brand === "avif" || brand === "avis") throw preparationError("delivery-photo/unsupported-source");
      }
    }
  }
  throw preparationError("delivery-photo/invalid-source");
}

/** Copy provider-owned bytes before the native input is reset or unmounted. */
export async function materializeDeliveryPhotoSource(file: File, signal?: AbortSignal): Promise<File> {
  if (signal?.aborted) throw preparationError("delivery-photo/cancelled");
  const validation = validateDeliveryPhotoSelection(file);
  if (validation) {
    const code = file.size <= 0 ? "delivery-photo/empty-source"
      : file.size > DELIVERY_PHOTO_SOURCE_MAX_BYTES ? "delivery-photo/source-too-large"
        : /^image\/hei[cf]/iu.test(file.type) || /\.hei[cf]$/iu.test(file.name ?? "") ? "delivery-photo/heic-source"
          : "delivery-photo/unsupported-source";
    throw preparationError(code);
  }
  let bytes: ArrayBuffer;
  try { bytes = exactBytes(await readWithBlob(file, signal), file.size); }
  catch (cause) {
    if (signal?.aborted) throw preparationError("delivery-photo/cancelled");
    if (typeof FileReader !== "function") throw cause;
    bytes = exactBytes(await readWithFileReader(file, signal), file.size);
  }
  if (signal?.aborted) throw preparationError("delivery-photo/cancelled");
  const contentType = detectDeliveryPhotoContentType(new Uint8Array(bytes));
  const declared = canonicalDeclaredType(file.type);
  if (declared.startsWith("image/") && declared !== contentType) throw preparationError("delivery-photo/mime-mismatch");
  return new File([bytes], file.name || "delivery-photo", { type: contentType, lastModified: file.lastModified });
}

export function deliveryPhotoTargetDimensions(dimensions: DeliveryPhotoDimensions): DeliveryPhotoDimensions {
  if (!Number.isFinite(dimensions.width) || !Number.isFinite(dimensions.height)
    || dimensions.width <= 0 || dimensions.height <= 0) throw preparationError("delivery-photo/invalid-dimensions");
  const scale = Math.min(1, DELIVERY_PHOTO_TRANSPORT_MAX_EDGE / Math.max(dimensions.width, dimensions.height));
  return { width: Math.max(1, Math.round(dimensions.width * scale)), height: Math.max(1, Math.round(dimensions.height * scale)) };
}

type DecodedDeliveryPhoto = DeliveryPhotoDimensions & { source: CanvasImageSource; close: () => void };

async function decodeDeliveryPhoto(file: File): Promise<DecodedDeliveryPhoto> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
    } catch { /* Fall back to the browser image decoder. */ }
  }
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.decoding = "async"; image.src = objectUrl; await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight, source: image, close: () => URL.revokeObjectURL(objectUrl) };
  } catch {
    URL.revokeObjectURL(objectUrl);
    throw preparationError("delivery-photo/decode-failed");
  }
}

function canvasWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob || blob.type !== "image/webp") reject(preparationError("delivery-photo/webp-unsupported"));
    else resolve(blob);
  }, "image/webp", DELIVERY_PHOTO_TRANSPORT_WEBP_QUALITY));
}

export async function prepareDeliveryPhoto(source: File, signal?: AbortSignal): Promise<PreparedDeliveryPhoto> {
  signal?.throwIfAborted();
  const decoded = await decodeDeliveryPhoto(source);
  const target = deliveryPhotoTargetDimensions(decoded);
  const canvas = document.createElement("canvas");
  try {
    signal?.throwIfAborted();
    canvas.width = target.width; canvas.height = target.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw preparationError("delivery-photo/canvas-unavailable");
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    context.fillStyle = "#fff"; context.fillRect(0, 0, target.width, target.height);
    context.drawImage(decoded.source, 0, 0, target.width, target.height);
    const blob = await canvasWebp(canvas);
    signal?.throwIfAborted();
    if (blob.size <= 0 || blob.size > DELIVERY_PHOTO_MAX_BYTES) throw preparationError("delivery-photo/output-too-large");
    const outputBytes = new Uint8Array(await blob.arrayBuffer());
    if (detectDeliveryPhotoContentType(outputBytes) !== "image/webp") throw preparationError("delivery-photo/invalid-output");
    return { blob, contentType: "image/webp", width: target.width, height: target.height };
  } finally {
    decoded.close();
    canvas.width = 0; canvas.height = 0;
  }
}

export function deliveryPhotoPreparationMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "delivery-photo/heic-source") return "HEIC/HEIF 사진은 지원하지 않아요. JPEG로 다시 촬영하거나 지원되는 사진을 선택해주세요.";
  if (code === "delivery-photo/empty-source") return "사진 파일이 비어 있어요. 다시 촬영하거나 선택해주세요.";
  if (code === "delivery-photo/source-too-large") return "원본 사진은 30MB 이하여야 해요. 다른 사진을 선택해주세요.";
  if (code === "delivery-photo/unsupported-source" || code === "delivery-photo/invalid-selection") return "JPEG, PNG 또는 WebP 사진으로 다시 촬영하거나 선택해주세요.";
  if (code === "delivery-photo/mime-mismatch" || code === "delivery-photo/invalid-source") return "사진 파일 형식이 실제 내용과 맞지 않아요. 원본을 다시 선택해주세요.";
  if (code === "delivery-photo/source-timeout") return "사진을 가져오는 데 시간이 오래 걸려요. 기기에 저장한 뒤 다시 선택해주세요.";
  if (code === "delivery-photo/source-unreadable") return "사진 원본을 읽지 못했어요. 기기에 저장한 뒤 다시 선택해주세요.";
  if (code === "delivery-photo/output-too-large") return "처리한 사진이 10MB를 넘어요. 다른 사진으로 다시 시도해주세요.";
  if (code === "delivery-photo/cancelled" || code === "AbortError") return "사진 준비가 취소되었습니다.";
  return "사진을 안전한 WebP로 준비하지 못했어요. 다시 촬영하거나 선택해주세요.";
}
