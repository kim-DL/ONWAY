import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareCustomerPhoto, readCustomerPhotoSource } from "../customers/customer-photo-preparation";

function heicFile(type = "image/heic", name = "camera.heic") {
  const bytes = new Uint8Array(20);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set(new TextEncoder().encode("ftypmif1"), 4);
  bytes.set(new TextEncoder().encode("heic"), 16);
  return new File([bytes], name, { type });
}

function installEncoder(type: "image/webp" | "image/png") {
  const bytes = type === "image/webp"
    ? new TextEncoder().encode("RIFFxxxxWEBPdata")
    : new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const draw = vi.fn();
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ fillRect: vi.fn(), drawImage: draw }),
    toBlob: vi.fn((done: BlobCallback) => done(new Blob([bytes], { type }))),
  };
  vi.stubGlobal("document", { createElement: () => canvas });
  return { canvas, draw, bytes };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("inventory's shared photo preparation on iPhone and Android", () => {
  it("decodes HEIC bytes with corrected MIME and always converts even a small capture", async () => {
    const close = vi.fn();
    const bitmap = { width: 4_032, height: 3_024, close };
    const decode = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal("createImageBitmap", decode);
    const { canvas, draw, bytes } = installEncoder("image/webp");
    const source = await readCustomerPhotoSource(heicFile("image/jpeg", "camera.jpg"));
    const pending = prepareCustomerPhoto(source);
    expect(prepareCustomerPhoto(source)).toBe(pending);
    const prepared = await pending;
    expect(decode).toHaveBeenCalledExactlyOnceWith(source, { imageOrientation: "from-image" });
    expect(source.type).toBe("image/heic");
    expect(prepared).not.toBe(source);
    expect(prepared.type).toBe("image/webp");
    expect(prepared.name).toBe("camera-optimized.webp");
    expect(new Uint8Array(await prepared.arrayBuffer())).toEqual(bytes);
    expect([canvas.width, canvas.height]).toEqual([2_560, 1_920]);
    expect(draw).toHaveBeenCalledWith(bitmap, 0, 0, 2_560, 1_920);
    expect(close).toHaveBeenCalledOnce();
  });

  it("uses the browser image decoder and retains the real PNG format when Safari cannot encode WebP", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("unsupported bitmap")));
    const create = vi.fn().mockReturnValue("blob:heic-source");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    const imageDecode = vi.fn().mockResolvedValue(undefined);
    class NativeImage {
      naturalWidth = 3_024; naturalHeight = 4_032;
      decode = imageDecode;
    }
    vi.stubGlobal("Image", NativeImage);
    const { canvas, bytes } = installEncoder("image/png");
    const prepared = await prepareCustomerPhoto(heicFile());
    expect(imageDecode).toHaveBeenCalledOnce();
    expect(prepared.type).toBe("image/png");
    expect(prepared.name).toBe("camera-optimized.png");
    expect(new Uint8Array(await prepared.arrayBuffer())).toEqual(bytes);
    expect([canvas.width, canvas.height]).toEqual([1_920, 2_560]);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.82);
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:heic-source");
  });

  it("rejects an undecodable capture without publishing an HEIC file or leaking its blob URL", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("unsupported bitmap")));
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: () => "blob:unsupported-heic", revokeObjectURL: revoke });
    class UnsupportedImage { decode() { return Promise.reject(new Error("unsupported image")); } }
    vi.stubGlobal("Image", UnsupportedImage);
    const { canvas } = installEncoder("image/png");
    await expect(prepareCustomerPhoto(heicFile())).rejects.toMatchObject({ code: "photo/processing-failed" });
    expect(canvas.toBlob).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:unsupported-heic");
  });

  it("keeps Android's small JPEG capture without an extra encode", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 1_200, height: 900, close }));
    const { canvas } = installEncoder("image/webp");
    const bytes = new Uint8Array([255, 216, 255, 224]);
    const prepared = await prepareCustomerPhoto(new File([bytes], "android.jpg", { type: "image/jpeg" }));
    expect(prepared.type).toBe("image/jpeg");
    expect(prepared.name).toBe("android.jpg");
    expect(new Uint8Array(await prepared.arrayBuffer())).toEqual(bytes);
    expect(canvas.toBlob).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
