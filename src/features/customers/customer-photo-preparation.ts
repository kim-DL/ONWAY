import { optimizeSchoolPhoto, PHOTO_SOURCE_MAX_BYTES } from "../school-detail/photo-upload-optimizer";

export const CUSTOMER_PHOTO_SOURCE_MAX_BYTES = PHOTO_SOURCE_MAX_BYTES;
const preparations = new WeakMap<File, Promise<File>>();
const materializedSources = new WeakSet<File>();

export function validateCustomerPhotoFile(file: File): string | null {
  if (file.size <= 0 || file.size > CUSTOMER_PHOTO_SOURCE_MAX_BYTES) return "원본 사진은 30MB 이하여야 해요.";
  if (/^image\/hei[cf]/iu.test(file.type) || (!file.type && /\.hei[cf]$/iu.test(file.name ?? ""))) return "HEIC 사진은 JPEG로 변환하거나 직접 촬영해 등록해주세요.";
  if (!["image/jpeg", "image/png", "image/webp", "image/avif", "", "application/octet-stream", "image/jpg"].includes(file.type)) return "JPEG, PNG, WebP, AVIF 사진을 선택해주세요.";
  return null;
}

function photoError(code: string) { return Object.assign(new Error("Customer photo preparation failed."), { code }); }

function readWithFileReader(file: File, signal?: AbortSignal): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(photoError("photo/cancelled")); return; }
    let reader: FileReader;
    try { reader = new FileReader(); } catch { reject(photoError("photo/source-unreadable")); return; }
    const stop = (code: string) => { finish(); reject(photoError(code)); try { reader.abort(); } catch { /* Already settled; a provider's abort cannot hold the form open. */ } };
    const cancel = () => stop("photo/cancelled");
    const timeout = setTimeout(() => stop("photo/source-timeout"), 20_000);
    const finish = () => { clearTimeout(timeout); signal?.removeEventListener("abort", cancel); reader.onload = null; reader.onerror = null; reader.onabort = null; };
    reader.onload = () => { const result = reader.result; finish(); if (result instanceof ArrayBuffer) resolve(result); else reject(photoError("photo/source-unreadable")); };
    reader.onerror = reader.onabort = () => { finish(); reject(photoError("photo/source-unreadable")); };
    signal?.addEventListener("abort", cancel, { once: true });
    try { reader.readAsArrayBuffer(file); }
    catch { finish(); reject(photoError("photo/source-unreadable")); }
  });
}

function readWithBlob(file: File, signal?: AbortSignal): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(photoError("photo/cancelled")); return; }
    const cancel = () => { finish(); reject(photoError("photo/cancelled")); };
    const timeout = setTimeout(() => { finish(); reject(photoError("photo/source-timeout")); }, 10_000);
    const finish = () => { clearTimeout(timeout); signal?.removeEventListener("abort", cancel); };
    signal?.addEventListener("abort", cancel, { once: true });
    // Blob.arrayBuffer has no abort API. Ignore its late result and never keep
    // the native File in state; the abortable FileReader is a bounded fallback.
    try { void file.arrayBuffer().then((bytes) => { finish(); resolve(bytes); }, () => { finish(); reject(photoError("photo/source-unreadable")); }); }
    catch { finish(); reject(photoError("photo/source-unreadable")); }
  });
}

function completeSourceBytes(bytes: ArrayBuffer, expectedSize: number): ArrayBuffer {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== expectedSize || !bytes.byteLength) throw photoError("photo/source-unreadable");
  return bytes;
}

function sourceType(header: Uint8Array): string | null {
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "image/jpeg";
  if (header.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => header[index] === value)) return "image/png";
  const text = (start: number, end: number) => String.fromCharCode(...header.subarray(start, end));
  if (header.length >= 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  if (header.length >= 16 && text(4, 8) === "ftyp") {
    const boxSize = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(0);
    if (boxSize < 16 || boxSize > header.length || boxSize % 4 !== 0) return null;
    let heif = false;
    // AVIF may use mif1 as its major brand and avif as a compatible brand.
    // Inspect only four-byte brands inside ftyp; skip the minor-version field.
    for (let offset = 8; offset < boxSize; offset += offset === 8 ? 8 : 4) {
      const brand = text(offset, offset + 4);
      if (brand === "avif" || brand === "avis") return "image/avif";
      if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) heif = true;
    }
    if (heif) throw photoError("photo/heic-source");
  }
  return null;
}

/** Materialize the album/provider file BEFORE releasing the native input. */
export async function readCustomerPhotoSource(file: File, signal?: AbortSignal): Promise<File> {
  if (signal?.aborted) throw photoError("photo/cancelled");
  const validation = validateCustomerPhotoFile(file);
  if (validation) throw photoError("photo/invalid-selection");
  if (materializedSources.has(file)) return file;
  let bytes: ArrayBuffer;
  try { bytes = completeSourceBytes(await readWithBlob(file, signal), file.size); }
  catch (cause) {
    if (signal?.aborted) throw photoError("photo/cancelled");
    // Retry incomplete reads as well as rejected promises, before releasing
    // the input. Do not accept truncated bytes or relax the file-size check.
    if (typeof FileReader !== "function") throw cause;
    bytes = completeSourceBytes(await readWithFileReader(file, signal), file.size);
  }
  if (signal?.aborted) throw photoError("photo/cancelled");
  const type = sourceType(new Uint8Array(bytes));
  if (!type) throw photoError("photo/invalid-source");
  const source = new File([bytes], file.name || "customer-photo", { type, lastModified: file.lastModified });
  materializedSources.add(source);
  return source;
}

/** A single decode/resize shared by preview and save; rejected work is retryable. */
export function prepareCustomerPhoto(file: File): Promise<File> {
  let pending = preparations.get(file);
  if (!pending) {
    pending = (async () => {
      const source = await readCustomerPhotoSource(file);
      try { return (await optimizeSchoolPhoto(source)).file; }
      catch { throw photoError("photo/processing-failed"); }
    })();
    preparations.set(file, pending);
    void pending.catch(() => preparations.delete(file));
  }
  return pending;
}

export function photoPreparationErrorMessage(error: unknown): string | null {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "photo/source-unreadable") return "앨범에서 원본 사진을 읽지 못했어요. ‘파일에서 선택’으로 다시 열어주세요. 클라우드 사진이면 먼저 기기에 다운로드해주세요.";
  if (code === "photo/source-timeout") return "사진을 가져오는 데 시간이 오래 걸리고 있어요. ‘파일에서 선택’으로 다시 열어주세요.";
  if (code === "photo/heic-source") return "고효율 HEIC 사진이에요. JPEG로 변환한 사진을 선택해주세요.";
  if (code === "photo/invalid-source") return "사진 파일의 내용을 확인하지 못했어요. 원본을 다시 선택해주세요.";
  if (code === "photo/processing-failed") return "사진을 준비하지 못했어요. 다시 준비를 누르거나 원본 사진을 다시 선택해주세요.";
  if (code === "photo/invalid-selection") return "지원되는 형식의 30MB 이하 사진을 선택해주세요.";
  return null;
}
