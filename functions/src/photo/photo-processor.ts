import sharp from "sharp";

import {
  MAX_PHOTO_INPUT_PIXELS,
  MAX_PHOTO_UPLOAD_BYTES,
  type PhotoVariant,
} from "./photo-contract.js";

export class InvalidPhotoError extends Error {}

export type ProcessedPhotoVariant = {
  buffer: Buffer;
  width: number;
  height: number;
  bytes: number;
};

export type ProcessedPhoto = Record<PhotoVariant, ProcessedPhotoVariant>;

export function detectPhotoContentType(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg" as const;
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png" as const;
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp" as const;
  }
  return null;
}

async function variant(
  input: Buffer,
  width: number,
  height: number,
  quality: number,
  fit: "cover" | "inside",
) {
  const buffer = await sharp(input, { limitInputPixels: MAX_PHOTO_INPUT_PIXELS, animated: false })
    .rotate()
    .resize({ width, height, fit, withoutEnlargement: true })
    .webp({ quality, effort: 5, smartSubsample: true })
    .toBuffer();
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) throw new InvalidPhotoError("처리된 사진 크기를 확인할 수 없습니다.");
  return { buffer, width: metadata.width, height: metadata.height, bytes: buffer.length };
}

export async function processSchoolPhoto(input: Buffer): Promise<ProcessedPhoto> {
  if (input.length === 0 || input.length > MAX_PHOTO_UPLOAD_BYTES) {
    throw new InvalidPhotoError("사진은 10MB 이하여야 합니다.");
  }
  if (!detectPhotoContentType(input)) throw new InvalidPhotoError("지원하지 않는 사진 형식입니다.");

  try {
    const metadata = await sharp(input, { limitInputPixels: MAX_PHOTO_INPUT_PIXELS, animated: false }).metadata();
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PHOTO_INPUT_PIXELS) {
      throw new InvalidPhotoError("사진 해상도가 너무 큽니다.");
    }
    const [thumbnail, preview, original] = await Promise.all([
      variant(input, 400, 300, 76, "cover"),
      variant(input, 1440, 1440, 82, "inside"),
      variant(input, 2560, 2560, 88, "inside"),
    ]);
    return { thumbnail, preview, original };
  } catch (error) {
    if (error instanceof InvalidPhotoError) throw error;
    throw new InvalidPhotoError("사진을 안전한 WebP로 변환하지 못했습니다.");
  }
}
