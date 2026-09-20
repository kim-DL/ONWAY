"use client";

import "client-only";
import { httpsCallable } from "firebase/functions";
import { z } from "zod";
import {
  CUSTOMER_PHOTO_MAX_BYTES, customerPhotoDownloadSchema,
  customerPhotoUploadResultSchema, getCustomerPhotoInputSchema,
} from "@/domain/customer";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import { prepareCustomerPhoto, photoPreparationErrorMessage, validateCustomerPhotoFile } from "./customer-photo-preparation";

export { CUSTOMER_PHOTO_CONTENT_TYPES, CUSTOMER_PHOTO_MAX_BYTES } from "@/domain/customer";
export { CUSTOMER_PHOTO_SOURCE_MAX_BYTES, validateCustomerPhotoFile } from "./customer-photo-preparation";

export function isCustomerPhotoStageError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error) || !("details" in error)) return false;
  const details = error.details;
  return String(error.code).endsWith("failed-precondition")
    && !!details && typeof details === "object" && "reason" in details
    && details.reason === "customer-photo-stage";
}

export function customerPhotoErrorMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const preparationMessage = photoPreparationErrorMessage(error);
  if (preparationMessage) return preparationMessage;
  if (typeof navigator !== "undefined" && !navigator.onLine) return "인터넷 연결 후 사진을 다시 확인해주세요.";
  if (code.endsWith("invalid-argument")) return "JPEG, PNG, WebP 형식의 10MB 이하 사진을 선택해주세요.";
  if (code.endsWith("resource-exhausted")) return "사진 업로드가 많아요. 잠시 후 다시 시도해주세요.";
  if (isCustomerPhotoStageError(error)) return "사진 업로드가 만료되었어요. 사진을 다시 선택해주세요.";
  if (code.endsWith("failed-precondition")) return "사진을 저장할 준비가 되지 않았어요. 다시 로그인한 뒤 시도해주세요.";
  if (code.endsWith("permission-denied") || code.endsWith("unauthenticated")) return "사진 이용 권한을 확인하지 못했어요. 다시 로그인해주세요.";
  if (code.endsWith("not-found")) return "사진이 변경되었어요. 거래처 정보를 새로 확인해주세요.";
  if (code.endsWith("deadline-exceeded") || code.endsWith("unavailable")) return "사진 전송이 끝나지 않았어요. 연결을 확인하고 저장을 다시 눌러주세요.";
  return "사진을 처리하지 못했어요. 잠시 후 다시 시도해주세요.";
}

function sessionIdentity(claims: Record<string, unknown>) {
  return JSON.stringify([claims.employeeId, claims.sessionVersion, claims.permissionsVersion, claims.roleScopes]);
}
async function privatePhotoSession(signal?: AbortSignal) {
  signal?.throwIfAborted();
  const services = getFirebaseClientServices();
  const user = services?.auth.currentUser;
  if (!services || !user) throw Object.assign(new Error("Customer photo authentication required."), { code: "unauthenticated" });
  const identity = sessionIdentity((await user.getIdTokenResult()).claims);
  const verify = async () => {
    signal?.throwIfAborted();
    if (typeof navigator !== "undefined" && !navigator.onLine) throw Object.assign(new Error("Customer photo offline."), { code: "unavailable" });
    if (services.auth.currentUser !== user) throw Object.assign(new Error("Customer photo session changed."), { code: "unauthenticated" });
    const currentIdentity = sessionIdentity((await user.getIdTokenResult()).claims);
    if (services.auth.currentUser !== user || currentIdentity !== identity) {
      throw Object.assign(new Error("Customer photo session changed."), { code: "unauthenticated" });
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) throw Object.assign(new Error("Customer photo offline."), { code: "unavailable" });
    signal?.throwIfAborted();
  };
  await verify();
  return { services, verify };
}

async function fileBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary);
}

async function upload(file: File, uploadId: string) {
  const error = validateCustomerPhotoFile(file);
  if (error) throw Object.assign(new Error(error), { code: "invalid-argument" });
  const { services, verify } = await privatePhotoSession();
  const uploadFile = await prepareCustomerPhoto(file);
  if (uploadFile.size > CUSTOMER_PHOTO_MAX_BYTES) throw Object.assign(new Error("Optimized photo exceeds upload limit."), { code: "invalid-argument" });
  const encoded = await fileBase64(uploadFile);
  await verify();
  const result = await httpsCallable(services.functions, "uploadCustomerPhoto", { timeout: 120_000 })({
    uploadId: z.uuid().parse(uploadId), contentType: uploadFile.type, fileBase64: encoded,
  });
  await verify();
  return customerPhotoUploadResultSchema.parse(result.data);
}

export async function fetchCustomerPhoto(customerId: string, photoId: string, options: { signal?: AbortSignal; variant?: "thumbnail" | "preview" } = {}): Promise<Blob> {
  const { services, verify } = await privatePhotoSession(options.signal);
  const result = customerPhotoDownloadSchema.parse((await httpsCallable(services.functions, "getCustomerPhoto")(
    getCustomerPhotoInputSchema.parse({ customerId, photoId, variant: options.variant ?? "preview" }),
  )).data);
  await verify();
  const binary = atob(result.fileBase64);
  if (binary.length !== result.byteSize) throw new Error("Customer photo length mismatch.");
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length < 12 || String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF" || String.fromCharCode(...bytes.subarray(8, 12)) !== "WEBP") throw new Error("Invalid customer photo format.");
  options.signal?.throwIfAborted();
  // No IndexedDB, localStorage, public download URL or shared promise cache.
  return new Blob([bytes], { type: result.contentType });
}

export const customerPhotoRepository = { upload, load: fetchCustomerPhoto };
