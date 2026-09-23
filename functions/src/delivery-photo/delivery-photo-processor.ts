import sharp from "sharp";

import { detectPhotoContentType, InvalidPhotoError, type ProcessedPhotoVariant } from "../photo/photo-processor.js";
import { MAX_PHOTO_INPUT_PIXELS } from "../photo/photo-contract.js";
import { DELIVERY_PHOTO_MAX_BYTES, type createDeliveryPhotoInputSchema } from "./delivery-photo-contract.js";
import type { z } from "zod";

export type ProcessedDeliveryPhoto = {
  evidence: ProcessedPhotoVariant;
  thumbnail: ProcessedPhotoVariant;
};

// Phase 2A benchmark baseline. Keep these delivery-photo-specific until the
// later device-quality benchmark establishes final production values.
export const DELIVERY_PHOTO_EVIDENCE_MAX_EDGE = 2_560;
export const DELIVERY_PHOTO_EVIDENCE_WEBP_QUALITY = 88;
export const DELIVERY_PHOTO_THUMBNAIL_MAX_EDGE = 640;
export const DELIVERY_PHOTO_THUMBNAIL_WEBP_QUALITY = 80;

export function decodeDeliveryPhoto(input: z.infer<typeof createDeliveryPhotoInputSchema>) {
  if (input.fileBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.fileBase64)) {
    throw new InvalidPhotoError("사진 데이터 형식을 확인해주세요.");
  }
  const buffer = Buffer.from(input.fileBase64, "base64");
  if (buffer.length === 0 || buffer.length > DELIVERY_PHOTO_MAX_BYTES || buffer.toString("base64") !== input.fileBase64) {
    throw new InvalidPhotoError("사진은 10MB 이하의 올바른 파일이어야 합니다.");
  }
  if (detectPhotoContentType(buffer) !== input.contentType) {
    throw new InvalidPhotoError("사진 내용과 파일 형식이 일치하지 않습니다.");
  }
  return buffer;
}

async function variant(input: Buffer, maxEdge: number, quality: number): Promise<ProcessedPhotoVariant> {
  const buffer = await sharp(input, { limitInputPixels: MAX_PHOTO_INPUT_PIXELS, animated: false })
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .webp({ quality, effort: 5, smartSubsample: true })
    .toBuffer();
  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height || buffer.length > DELIVERY_PHOTO_MAX_BYTES || detectPhotoContentType(buffer) !== "image/webp") {
    throw new InvalidPhotoError("처리된 사진 형식과 크기를 확인할 수 없습니다.");
  }
  return { buffer, width: metadata.width, height: metadata.height, bytes: buffer.length };
}

export async function processDeliveryPhoto(input: Buffer): Promise<ProcessedDeliveryPhoto> {
  if (input.length === 0 || input.length > DELIVERY_PHOTO_MAX_BYTES || !detectPhotoContentType(input)) {
    throw new InvalidPhotoError("지원하지 않거나 너무 큰 사진입니다.");
  }
  try {
    const metadata = await sharp(input, { limitInputPixels: MAX_PHOTO_INPUT_PIXELS, animated: false }).metadata();
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PHOTO_INPUT_PIXELS) {
      throw new InvalidPhotoError("사진 해상도가 너무 큽니다.");
    }
    const [evidence, thumbnail] = await Promise.all([
      variant(input, DELIVERY_PHOTO_EVIDENCE_MAX_EDGE, DELIVERY_PHOTO_EVIDENCE_WEBP_QUALITY),
      variant(input, DELIVERY_PHOTO_THUMBNAIL_MAX_EDGE, DELIVERY_PHOTO_THUMBNAIL_WEBP_QUALITY),
    ]);
    return { evidence, thumbnail };
  } catch (error) {
    if (error instanceof InvalidPhotoError) throw error;
    throw new InvalidPhotoError("사진을 안전한 WebP로 변환하지 못했습니다.");
  }
}
