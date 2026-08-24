"use client";

import "client-only";

import { httpsCallable } from "firebase/functions";
import { z } from "zod";

import { documentIdSchema } from "@/domain/common";
import { photoSlotIdSchema, type PhotoSlotId } from "@/domain/school";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import {
  createPhotoVariantCacheKey,
  readPhotoVariantCache,
  writePhotoVariantCache,
  type PhotoVariant,
} from "./school-photo-cache";

export const PHOTO_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoVariantResult = {
  blob: Blob;
  source: "memory" | "indexeddb" | "network";
};
const inflightVariantResults = new Map<string, Promise<PhotoVariantResult>>();

const prepareResultSchema = z.object({
  uploadId: z.string().uuid(),
  expiresAt: z.string().datetime(),
  maxBytes: z.number().int().positive(),
  replayed: z.boolean(),
}).strict();
const uploadResultSchema = z.object({
  schoolId: documentIdSchema,
  slotId: photoSlotIdSchema,
  versionId: documentIdSchema,
  revision: z.number().int().positive(),
  replayed: z.boolean(),
}).strict();
const mutationResultSchema = z.object({ revision: z.number().int().positive(), replayed: z.boolean() }).strict();
const downloadResultSchema = z.object({
  contentType: z.literal("image/webp"),
  byteSize: z.number().int().positive(),
  fileBase64: z.string().min(1),
}).strict();

type UploadInput = {
  schoolId: string;
  slotId: PhotoSlotId;
  expectedRevision: number;
  requestId: string;
  appVersion: string;
  caption: string | null;
  file: File;
};

type MutationInput = {
  schoolId: string;
  slotId: PhotoSlotId;
  expectedRevision: number;
  requestId: string;
  appVersion: string;
  reason?: string;
};

async function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("사진을 읽지 못했습니다."));
    reader.onload = () => {
      if (typeof reader.result !== "string") return reject(new Error("사진을 읽지 못했습니다."));
      const separator = reader.result.indexOf(",");
      if (separator < 0) return reject(new Error("사진 데이터 형식이 올바르지 않습니다."));
      resolve(reader.result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export class SchoolPhotoRepository {
  async upload(input: UploadInput) {
    const services = getFirebaseClientServices();
    if (!services) throw new Error("Firebase is not configured.");
    if (!PHOTO_UPLOAD_TYPES.includes(input.file.type as typeof PHOTO_UPLOAD_TYPES[number])) {
      throw new Error("JPEG, PNG, WebP 사진만 사용할 수 있습니다.");
    }
    if (input.file.size <= 0 || input.file.size > PHOTO_UPLOAD_MAX_BYTES) {
      throw new Error("사진은 10MB 이하여야 합니다.");
    }
    const prepare = httpsCallable(services.functions, "preparePhotoUpload");
    const prepared = prepareResultSchema.parse((await prepare({
      schoolId: documentIdSchema.parse(input.schoolId),
      slotId: photoSlotIdSchema.parse(input.slotId),
      expectedRevision: z.number().int().nonnegative().parse(input.expectedRevision),
      requestId: z.string().uuid().parse(input.requestId),
      appVersion: z.string().trim().min(1).max(100).parse(input.appVersion),
      fileName: input.file.name,
      contentType: input.file.type,
      byteSize: input.file.size,
      caption: input.caption,
    })).data);
    const finalize = httpsCallable(services.functions, "finalizePhotoUpload");
    return uploadResultSchema.parse((await finalize({
      uploadId: prepared.uploadId,
      fileBase64: await fileToBase64(input.file),
    })).data);
  }

  getVariant(input: {
    sessionNamespace: string;
    schoolId: string;
    slotId: PhotoSlotId;
    versionId: string;
    variant: PhotoVariant;
  }) {
    const cacheKey = createPhotoVariantCacheKey(input);
    const pending = inflightVariantResults.get(cacheKey);
    if (pending) return pending;
    const request = this.loadVariant(input, cacheKey);
    inflightVariantResults.set(cacheKey, request);
    void request.then(
      () => inflightVariantResults.delete(cacheKey),
      () => inflightVariantResults.delete(cacheKey),
    );
    return request;
  }

  private async loadVariant(input: {
    sessionNamespace: string;
    schoolId: string;
    slotId: PhotoSlotId;
    versionId: string;
    variant: PhotoVariant;
  }, cacheKey: string) {
    const cached = await readPhotoVariantCache(cacheKey, input.variant);
    if (cached) return cached;
    const services = getFirebaseClientServices();
    if (!services) throw new Error("Firebase is not configured.");
    const callable = httpsCallable(services.functions, "getSchoolPhoto");
    const result = downloadResultSchema.parse((await callable({
      schoolId: documentIdSchema.parse(input.schoolId),
      slotId: photoSlotIdSchema.parse(input.slotId),
      versionId: documentIdSchema.parse(input.versionId),
      variant: input.variant,
    })).data);
    const blob = new Blob([decodeBase64(result.fileBase64)], { type: result.contentType });
    if (blob.size !== result.byteSize) throw new Error("사진 다운로드 크기가 일치하지 않습니다.");
    await writePhotoVariantCache({ ...input, cacheKey }, blob);
    return { blob, source: "network" as const };
  }

  async delete(input: MutationInput) {
    return this.mutate("deleteSchoolPhoto", input);
  }

  async restore(input: MutationInput) {
    return this.mutate("restoreSchoolPhoto", input);
  }

  private async mutate(callableName: "deleteSchoolPhoto" | "restoreSchoolPhoto", input: MutationInput) {
    const services = getFirebaseClientServices();
    if (!services) throw new Error("Firebase is not configured.");
    const callable = httpsCallable(services.functions, callableName);
    return mutationResultSchema.parse((await callable({
      schoolId: documentIdSchema.parse(input.schoolId),
      slotId: photoSlotIdSchema.parse(input.slotId),
      expectedRevision: z.number().int().positive().parse(input.expectedRevision),
      requestId: z.string().uuid().parse(input.requestId),
      appVersion: z.string().trim().min(1).max(100).parse(input.appVersion),
      ...(input.reason ? { reason: input.reason } : {}),
    })).data);
  }
}

export const schoolPhotoRepository = new SchoolPhotoRepository();
