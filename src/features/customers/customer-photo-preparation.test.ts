import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const optimize = vi.hoisted(() => vi.fn());
vi.mock("../school-detail/photo-upload-optimizer", () => ({ PHOTO_SOURCE_MAX_BYTES: 30 * 1024 * 1024, optimizeSchoolPhoto: optimize }));
import { photoPreparationErrorMessage, prepareCustomerPhoto, readCustomerPhotoSource } from "./customer-photo-preparation";

const jpegBytes = new Uint8Array([255, 216, 255, 224, 0, 16]);
const makeJpeg = (type = "image/jpeg") => new File([jpegBytes], "album.jpg", { type });
function ftyp(major: string, compatible: string[] = []) {
  const bytes = new Uint8Array(16 + compatible.length * 4);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set(new TextEncoder().encode(`ftyp${major}`), 4);
  compatible.forEach((brand, index) => bytes.set(new TextEncoder().encode(brand), 16 + index * 4));
  return bytes;
}
beforeEach(() => { vi.clearAllMocks(); optimize.mockImplementation(async (file: File) => ({ file })); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function installAlbumReader(result: "success" | "error" | "abort" | "pending" = "success") {
  const read = vi.fn(); const abort = vi.fn();
  class AlbumReader {
    result: ArrayBuffer | null = null;
    onload: (() => void) | null = null; onerror: (() => void) | null = null; onabort: (() => void) | null = null;
    readAsArrayBuffer(file: File) {
      read(file); this.result = jpegBytes.buffer.slice(0);
      if (result === "success") queueMicrotask(() => this.onload?.());
      if (result === "error") queueMicrotask(() => this.onerror?.());
      if (result === "abort") queueMicrotask(() => this.onabort?.());
    }
    // A broken provider may never send onabort. Our deadline must still settle.
    abort() { abort(); }
  }
  vi.stubGlobal("FileReader", AlbumReader);
  return { read, abort };
}

describe("one safe customer photo preparation", () => {
  it.each(["image/jpeg", "image/jpg", "", "application/octet-stream"])("takes an independent byte snapshot of an album file with %s MIME", async (type) => {
    const original = makeJpeg(type);
    const source = await readCustomerPhotoSource(original);
    expect(source).not.toBe(original);
    expect(source.type).toBe("image/jpeg");
    expect(new Uint8Array(await source.arrayBuffer())).toEqual(jpegBytes);
    const nativeRead = vi.spyOn(original, "arrayBuffer").mockRejectedValue(new DOMException("native URI is gone", "NotReadableError"));
    expect(await readCustomerPhotoSource(source)).toBe(source);
    await expect(prepareCustomerPhoto(source)).resolves.toBe(source);
    expect(nativeRead).not.toHaveBeenCalled();
  });
  it("shares one exact promise and decoder between preview, save and repeated render", async () => {
    const source = await readCustomerPhotoSource(makeJpeg());
    const preview = prepareCustomerPhoto(source);
    const upload = prepareCustomerPhoto(source);
    expect(upload).toBe(preview);
    await Promise.all([preview, upload]);
    expect(optimize).toHaveBeenCalledOnce();
  });
  it("does not keep a failed preparation in the retry cache", async () => {
    const source = makeJpeg();
    optimize.mockRejectedValueOnce(new Error("private file metadata"));
    await expect(prepareCustomerPhoto(source)).rejects.toMatchObject({ code: "photo/processing-failed" });
    await expect(prepareCustomerPhoto(source)).resolves.toBeInstanceOf(File);
    expect(optimize).toHaveBeenCalledTimes(2);
  });
  it("distinguishes a native album read failure and mismatched byte count before image decoding", async () => {
    const source = makeJpeg();
    vi.spyOn(source, "arrayBuffer").mockRejectedValue(new DOMException("private content://path", "NotReadableError"));
    await expect(readCustomerPhotoSource(source)).rejects.toMatchObject({ code: "photo/source-unreadable" });
    const partial = makeJpeg();
    vi.spyOn(partial, "arrayBuffer").mockResolvedValue(new ArrayBuffer(2));
    await expect(readCustomerPhotoSource(partial)).rejects.toMatchObject({ code: "photo/source-unreadable" });
    expect(optimize).not.toHaveBeenCalled();
    expect(photoPreparationErrorMessage({ code: "photo/source-unreadable" })).toContain("다운로드");
  });
  it("uses FileReader as a fallback when a mobile Blob promise cannot read the source", async () => {
    const source = makeJpeg();
    vi.spyOn(source, "arrayBuffer").mockRejectedValue(new DOMException("read failed", "NotReadableError"));
    const read = vi.fn();
    class AlbumReader {
      result: ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;
      readAsArrayBuffer(file: File) { read(file); this.result = jpegBytes.buffer.slice(0); queueMicrotask(() => this.onload?.()); }
      abort() { this.onabort?.(); }
    }
    vi.stubGlobal("FileReader", AlbumReader);
    const copied = await readCustomerPhotoSource(source);
    expect(read).toHaveBeenCalledWith(source);
    expect(copied.type).toBe("image/jpeg");
    expect(new Uint8Array(await copied.arrayBuffer())).toEqual(jpegBytes);
  });
  it("recovers a fulfilled but incomplete Blob read through FileReader instead of rejecting a readable original", async () => {
    const file = makeJpeg(); vi.spyOn(file, "arrayBuffer").mockResolvedValue(new ArrayBuffer(2));
    const reader = installAlbumReader();
    const source = await readCustomerPhotoSource(file);
    expect(reader.read).toHaveBeenCalledOnce();
    expect(new Uint8Array(await source.arrayBuffer())).toEqual(jpegBytes);
  });
  it("bounds a stalled Blob promise and uses the other read API without waiting forever", async () => {
    vi.useFakeTimers();
    const file = makeJpeg(); vi.spyOn(file, "arrayBuffer").mockReturnValue(new Promise(() => undefined));
    const reader = installAlbumReader(); const pending = readCustomerPhotoSource(file);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toBeInstanceOf(File); expect(reader.read).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("settles a stalled fallback even when the native provider sends no abort event", async () => {
    vi.useFakeTimers();
    const file = makeJpeg(); vi.spyOn(file, "arrayBuffer").mockRejectedValue(new DOMException("private path", "NotReadableError"));
    const reader = installAlbumReader("pending");
    const failed = expect(readCustomerPhotoSource(file)).rejects.toMatchObject({ code: "photo/source-timeout" });
    await vi.advanceTimersByTimeAsync(20_000); await failed;
    expect(reader.abort).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["error", "abort"] as const)("settles native FileReader %s without leaking private error text or starting a decoder", async (result) => {
    const file = makeJpeg(); vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("content://private"));
    installAlbumReader(result);
    await expect(readCustomerPhotoSource(file)).rejects.toMatchObject({ code: "photo/source-unreadable", message: "Customer photo preparation failed." });
    expect(optimize).not.toHaveBeenCalled();
  });
  it("cancels a pending source read on dismissal without starting a fallback or accepting a late result", async () => {
    vi.useFakeTimers();
    const file = makeJpeg(); let release: ((value: ArrayBuffer) => void) | undefined;
    vi.spyOn(file, "arrayBuffer").mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const reader = installAlbumReader(); const controller = new AbortController();
    const failed = expect(readCustomerPhotoSource(file, controller.signal)).rejects.toMatchObject({ code: "photo/cancelled" });
    controller.abort(); await failed; release?.(jpegBytes.buffer.slice(0)); await Promise.resolve();
    expect(reader.read).not.toHaveBeenCalled(); expect(optimize).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("aborts an in-flight FileReader and never reuses its native file after dismissal", async () => {
    vi.useFakeTimers();
    const file = makeJpeg(); vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("read failed"));
    const reader = installAlbumReader("pending"); const controller = new AbortController();
    const failed = expect(readCustomerPhotoSource(file, controller.signal)).rejects.toMatchObject({ code: "photo/cancelled" });
    await vi.advanceTimersByTimeAsync(0); controller.abort(); await failed;
    expect(reader.abort).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not read an already cancelled selection or accept non-image document picker files", async () => {
    const file = makeJpeg(); const read = vi.spyOn(file, "arrayBuffer"); const controller = new AbortController(); controller.abort();
    await expect(readCustomerPhotoSource(file, controller.signal)).rejects.toMatchObject({ code: "photo/cancelled" });
    expect(read).not.toHaveBeenCalled();
    await expect(readCustomerPhotoSource(new File(["pdf"], "document.pdf", { type: "application/pdf" }))).rejects.toMatchObject({ code: "photo/invalid-selection" });
    expect(optimize).not.toHaveBeenCalled();
  });
  it.each(["image/jpeg", "application/octet-stream", ""])("identifies real HEIC bytes hidden behind %s MIME before creating a broken preview", async (type) => {
    const bytes = ftyp("mif1", ["heic"]);
    await expect(readCustomerPhotoSource(new File([bytes], "album.jpg", { type }))).rejects.toMatchObject({ code: "photo/heic-source" });
    expect(optimize).not.toHaveBeenCalled();
  });
  it("normalizes native AVIF input through the decoder instead of sending AVIF to the server", async () => {
    const bytes = ftyp("avif", ["mif1"]);
    const converted = new File(["RIFFxxxxWEBPdata"], "prepared.webp", { type: "image/webp" });
    optimize.mockResolvedValue({ file: converted });
    expect(await prepareCustomerPhoto(new File([bytes], "album.avif", { type: "image/avif" }))).toBe(converted);
    expect(optimize.mock.calls[0]![0].type).toBe("image/avif");
  });
  it.each(["avif", "avis"])("recognizes compatible %s after other brands without misclassifying mif1 as HEIC", async (brand) => {
    const bytes = ftyp("mif1", ["miaf", "MA1B", "xxxx", "yyyy", "zzzz", brand]);
    const source = await readCustomerPhotoSource(new File([bytes], "album.avif", { type: "image/avif" }));
    expect(source.type).toBe("image/avif");
  });
  it("does not mistake a minor version or bytes outside ftyp for an AVIF brand", async () => {
    const bytes = ftyp("mif1", ["heic"]);
    bytes.set(new TextEncoder().encode("avif"), 12);
    const payload = new Uint8Array([...bytes, ...new TextEncoder().encode("avif")]);
    await expect(readCustomerPhotoSource(new File([payload], "album.jpg", { type: "image/jpeg" }))).rejects.toMatchObject({ code: "photo/heic-source" });
  });
  it.each([8, 19, 4_294_967_295])("rejects an invalid ftyp box size %s without reading outside the file", async (size) => {
    const bytes = ftyp("avif", ["mif1"]);
    new DataView(bytes.buffer).setUint32(0, size);
    await expect(readCustomerPhotoSource(new File([bytes], "album.avif", { type: "image/avif" }))).rejects.toMatchObject({ code: "photo/invalid-source" });
  });
  it("never passes mislabeled HTML/SVG payloads to the decoder", async () => {
    await expect(readCustomerPhotoSource(new File(["<svg onload='unsafe'/>"], "album.jpg", { type: "image/jpeg" }))).rejects.toMatchObject({ code: "photo/invalid-source" });
    expect(optimize).not.toHaveBeenCalled();
  });
});
