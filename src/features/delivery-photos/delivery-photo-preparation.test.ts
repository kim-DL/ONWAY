import { afterEach, describe, expect, it, vi } from "vitest";

import { DELIVERY_PHOTO_MAX_BYTES } from "@/domain/delivery-photo";
import {
  DELIVERY_PHOTO_SOURCE_MAX_BYTES,
  DELIVERY_PHOTO_TRANSPORT_MAX_EDGE,
  DELIVERY_PHOTO_TRANSPORT_JPEG_QUALITY,
  DELIVERY_PHOTO_TRANSPORT_WEBP_QUALITY,
  deliveryPhotoPreparationMessage,
  deliveryPhotoTargetDimensions,
  detectDeliveryPhotoContentType,
  materializeDeliveryPhotoSource,
  prepareDeliveryPhoto,
  validateDeliveryPhotoSelection,
} from "./delivery-photo-preparation";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 12, ...new TextEncoder().encode("ExifGPSdata")]);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);

function ftyp(brand: string, compatible?: string) {
  const bytes = new Uint8Array(compatible ? 24 : 20); new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set(new TextEncoder().encode("ftyp"), 4); bytes.set(new TextEncoder().encode(brand), 8);
  if (compatible) bytes.set(new TextEncoder().encode(compatible), 16);
  return bytes;
}

afterEach(() => vi.unstubAllGlobals());

describe("delivery photo source validation and materialization", () => {
  it("recognizes JPEG, PNG and WebP by magic bytes rather than accept or extension", () => {
    expect(detectDeliveryPhotoContentType(jpeg)).toBe("image/jpeg");
    expect(detectDeliveryPhotoContentType(png)).toBe("image/png");
    expect(detectDeliveryPhotoContentType(webp)).toBe("image/webp");
  });

  it("copies provider bytes independently and normalizes an ambiguous MIME", async () => {
    const native = new File([jpeg], "camera.bin", { type: "application/octet-stream" });
    const source = await materializeDeliveryPhotoSource(native);
    expect(source).not.toBe(native); expect(source.type).toBe("image/jpeg");
    expect(new Uint8Array(await source.arrayBuffer())).toEqual(jpeg);
  });

  it("accepts HEIC/HEIF by bytes even when the iOS provider supplies an ambiguous MIME or extension", async () => {
    const heic = ftyp("mif1", "heic");
    for (const [name, type] of [["camera.heic", "image/heic"], ["album.jpg", "application/octet-stream"], ["album.jpg", "image/jpeg"]]) {
      const source = await materializeDeliveryPhotoSource(new File([heic], name!, { type: type! }));
      expect(source.type).toBe("image/heic");
      expect(new Uint8Array(await source.arrayBuffer())).toEqual(heic);
    }
    expect((await materializeDeliveryPhotoSource(new File([ftyp("mif1")], "photo.heif", { type: "image/heif" }))).type).toBe("image/heif");
    expect((await materializeDeliveryPhotoSource(new File([jpeg], "photo.heic", { type: "image/jpeg" }))).type).toBe("image/jpeg");
  });

  it("rejects empty, invalid, MIME-mismatched and unsupported selections", async () => {
    expect(validateDeliveryPhotoSelection(new File([], "empty.jpg", { type: "image/jpeg" }))).toContain("비어");
    await expect(materializeDeliveryPhotoSource(new File(["html"], "bad.jpg", { type: "image/jpeg" }))).rejects.toMatchObject({ code: "delivery-photo/invalid-source" });
    await expect(materializeDeliveryPhotoSource(new File([jpeg], "wrong.png", { type: "image/png" }))).rejects.toMatchObject({ code: "delivery-photo/mime-mismatch" });
    await expect(materializeDeliveryPhotoSource(new File([ftyp("mif1", "avif")], "photo.avif", { type: "application/octet-stream" }))).rejects.toMatchObject({ code: "delivery-photo/unsupported-source" });
    expect(deliveryPhotoPreparationMessage({ code: "delivery-photo/decode-failed" })).toContain("JPEG");
  });

  it("enforces the source boundary before decoding", () => {
    const tooLarge = { size: DELIVERY_PHOTO_SOURCE_MAX_BYTES + 1, name: "large.jpg", type: "image/jpeg" } as File;
    expect(validateDeliveryPhotoSelection(tooLarge)).toContain("30MB");
  });
});

describe("delivery photo fresh WebP preparation", () => {
  it("preserves aspect ratio for portrait and landscape, never crops and never upscales", () => {
    expect(deliveryPhotoTargetDimensions({ width: 4_032, height: 3_024 })).toEqual({ width: 2_560, height: 1_920 });
    expect(deliveryPhotoTargetDimensions({ width: 3_024, height: 4_032 })).toEqual({ width: 1_920, height: 2_560 });
    expect(deliveryPhotoTargetDimensions({ width: 640, height: 480 })).toEqual({ width: 640, height: 480 });
    expect(DELIVERY_PHOTO_TRANSPORT_MAX_EDGE).toBe(2_560);
    expect(DELIVERY_PHOTO_TRANSPORT_WEBP_QUALITY).not.toBe(88);
    expect(DELIVERY_PHOTO_TRANSPORT_JPEG_QUALITY).toBeGreaterThan(0);
  });

  it("normalizes orientation, draws the complete image, fresh-encodes WebP and releases bitmap/canvas resources", async () => {
    const close = vi.fn(); const drawImage = vi.fn(); const fillRect = vi.fn();
    const bitmap = { width: 3_024, height: 4_032, close };
    const createBitmap = vi.fn(async () => bitmap);
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ({ drawImage, fillRect,
      imageSmoothingEnabled: false, imageSmoothingQuality: "low", fillStyle: "" })),
      toBlob: vi.fn((callback: (blob: Blob) => void, type: string) => callback(new Blob([webp], { type }))) };
    vi.stubGlobal("createImageBitmap", createBitmap);
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
    const prepared = await prepareDeliveryPhoto(new File([jpeg], "portrait.jpg", { type: "image/jpeg" }));
    expect(createBitmap).toHaveBeenCalledWith(expect.any(File), { imageOrientation: "from-image" });
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1_920, 2_560);
    expect(prepared).toMatchObject({ contentType: "image/webp", width: 1_920, height: 2_560 });
    expect(new TextDecoder().decode(await prepared.blob.arrayBuffer())).not.toMatch(/Exif|GPS/u);
    expect(close).toHaveBeenCalledOnce(); expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
  });

  it("uses a fresh JPEG when WebKit returns PNG for a WebP canvas request", async () => {
    const close = vi.fn(); const drawImage = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3_024, height: 4_032, close })));
    const toBlob = vi.fn((callback: (blob: Blob) => void, type: string) => callback(new Blob([type === "image/webp" ? png : jpeg], {
      type: type === "image/webp" ? "image/png" : "image/jpeg",
    })));
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage, fillRect: vi.fn(), imageSmoothingEnabled: false, imageSmoothingQuality: "low", fillStyle: "" }), toBlob };
    vi.stubGlobal("document", { createElement: () => canvas });
    const source = await materializeDeliveryPhotoSource(new File([ftyp("heic")], "camera.heic", { type: "image/heic" }));
    const prepared = await prepareDeliveryPhoto(source);
    expect(prepared).toMatchObject({ contentType: "image/jpeg", width: 1_920, height: 2_560 });
    expect(toBlob).toHaveBeenCalledTimes(2);
    expect(toBlob.mock.calls[0]?.[1]).toBe("image/webp");
    expect(toBlob.mock.calls[1]?.[1]).toBe("image/jpeg");
    expect(drawImage).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
  });

  it("accepts exactly 10MiB output and rejects one byte more", async () => {
    const close = vi.fn(); vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 10, height: 10, close })));
    let outputSize = DELIVERY_PHOTO_MAX_BYTES;
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn(), fillRect: vi.fn(), imageSmoothingEnabled: false, imageSmoothingQuality: "low", fillStyle: "" }),
      toBlob: (callback: (blob: Blob) => void) => {
        const padding = new Uint8Array(outputSize - webp.length); callback(new Blob([webp, padding], { type: "image/webp" }));
      } };
    vi.stubGlobal("document", { createElement: () => canvas });
    await expect(prepareDeliveryPhoto(new File([jpeg], "boundary.jpg", { type: "image/jpeg" }))).resolves.toMatchObject({ contentType: "image/webp" });
    outputSize += 1;
    await expect(prepareDeliveryPhoto(new File([jpeg], "large.jpg", { type: "image/jpeg" }))).rejects.toMatchObject({ code: "delivery-photo/output-too-large" });
    expect(close).toHaveBeenCalledTimes(2);
  });
});
