import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  MAX_PHOTO_UPLOAD_BYTES,
  preparePhotoUploadInputSchema,
} from "../src/photo/photo-contract.js";
import {
  detectPhotoContentType,
  InvalidPhotoError,
  processSchoolPhoto,
} from "../src/photo/photo-processor.js";

describe("Phase 8 photo processing contract", () => {
  it("normalizes an oriented source into three metadata-free WebP variants", async () => {
    const source = await sharp({
      create: { width: 1_200, height: 800, channels: 3, background: "#2f7969" },
    }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const result = await processSchoolPhoto(source);

    expect(detectPhotoContentType(source)).toBe("image/jpeg");
    expect(result.thumbnail.width).toBe(400);
    expect(result.thumbnail.height).toBe(300);
    expect(result.preview.width).toBe(800);
    expect(result.preview.height).toBe(1_200);
    expect(result.original.width).toBe(800);
    expect(result.original.height).toBe(1_200);
    for (const output of Object.values(result)) {
      const metadata = await sharp(output.buffer).metadata();
      expect(metadata.format).toBe("webp");
      expect(metadata.exif).toBeUndefined();
    }
  });

  it("rejects unsupported magic bytes and an oversized declaration", async () => {
    await expect(processSchoolPhoto(Buffer.from("not-an-image"))).rejects.toBeInstanceOf(InvalidPhotoError);
    const base = {
      schoolId: "SCH-001",
      slotId: "01",
      expectedRevision: 0,
      requestId: "f50c1043-d238-41fc-9c09-3fcd041fd4a1",
      appVersion: "phase8",
      fileName: "field.jpg",
      contentType: "image/jpeg",
      byteSize: MAX_PHOTO_UPLOAD_BYTES + 1,
      caption: null,
    };
    expect(preparePhotoUploadInputSchema.safeParse(base).success).toBe(false);
    expect(preparePhotoUploadInputSchema.safeParse({ ...base, byteSize: 100, slotId: "04" }).success).toBe(false);
    expect(preparePhotoUploadInputSchema.safeParse({ ...base, byteSize: 100, injectedRole: "admin" }).success).toBe(false);
  });
});
