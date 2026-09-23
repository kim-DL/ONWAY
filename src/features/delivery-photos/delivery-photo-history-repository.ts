"use client";

import "client-only";

import { httpsCallable } from "firebase/functions";
import { z } from "zod";

import {
  deliveryPhotoDownloadSchema,
  getDeliveryPhotoInputSchema,
  listDeliveryPhotosInputSchema,
  listDeliveryPhotosResultSchema,
} from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { getFirebaseClientServices } from "@/lib/firebase/client";

export type DeliveryPhotoHistoryResult = Extract<z.infer<typeof listDeliveryPhotosResultSchema>, { scope: "customer" }>;
export type DeliveryPhotoDownloadVariant = "thumbnail" | "evidence";

function invalidResponse() {
  return Object.assign(new Error("Delivery photo response was invalid."), { code: "delivery-photo/invalid-response" });
}

function sessionSignature(session: AuthenticatedSession) {
  return JSON.stringify([session.uid, session.claims.employeeId, session.claims.sessionVersion, session.claims.permissionsVersion]);
}

async function verifiedSession(session: AuthenticatedSession, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const services = getFirebaseClientServices();
  const user = services?.auth.currentUser;
  if (!services || !user || user.uid !== session.uid) throw Object.assign(new Error("Delivery photo authentication required."), { code: "unauthenticated" });
  const claims = (await user.getIdTokenResult()).claims;
  const current = JSON.stringify([user.uid, claims.employeeId, claims.sessionVersion, claims.permissionsVersion]);
  if (services.auth.currentUser !== user || current !== sessionSignature(session)) {
    throw Object.assign(new Error("Delivery photo session changed."), { code: "unauthenticated" });
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw Object.assign(new Error("Delivery photo connection unavailable."), { code: "unavailable" });
  }
  signal?.throwIfAborted();
  return { services, user };
}

async function verifySameSession(session: AuthenticatedSession, user: NonNullable<ReturnType<typeof getFirebaseClientServices>>["auth"]["currentUser"], signal?: AbortSignal) {
  signal?.throwIfAborted();
  const current = await verifiedSession(session, signal);
  if (current.user !== user) throw Object.assign(new Error("Delivery photo session changed."), { code: "unauthenticated" });
}

export function deliveryPhotoDownloadBlob(input: unknown, expectedPhotoId: string, expectedVariant: DeliveryPhotoDownloadVariant) {
  const parsed = deliveryPhotoDownloadSchema.safeParse(input);
  if (!parsed.success || parsed.data.photoId !== expectedPhotoId || parsed.data.variant !== expectedVariant) throw invalidResponse();
  let binary: string;
  try {
    binary = atob(parsed.data.fileBase64);
  } catch {
    throw invalidResponse();
  }
  if (binary.length !== parsed.data.byteSize) throw invalidResponse();
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length < 12
    || String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF"
    || String.fromCharCode(...bytes.subarray(8, 12)) !== "WEBP") throw invalidResponse();
  const blob = new Blob([bytes], { type: parsed.data.contentType });
  if (blob.size !== parsed.data.byteSize) throw invalidResponse();
  return blob;
}

async function list(customerId: string, session: AuthenticatedSession, signal?: AbortSignal): Promise<DeliveryPhotoHistoryResult> {
  const input = listDeliveryPhotosInputSchema.parse({ scope: "customer", customerId, limit: 30 });
  const { services, user } = await verifiedSession(session, signal);
  const response = await httpsCallable<typeof input, unknown>(services.functions, "listDeliveryPhotos", { timeout: 60_000 })(input);
  await verifySameSession(session, user, signal);
  const parsed = listDeliveryPhotosResultSchema.safeParse(response.data);
  if (!parsed.success || parsed.data.scope !== "customer" || parsed.data.customerId !== customerId) throw invalidResponse();
  return parsed.data;
}

async function load(photoId: string, variant: DeliveryPhotoDownloadVariant, session: AuthenticatedSession, signal?: AbortSignal) {
  const input = getDeliveryPhotoInputSchema.parse({ photoId, variant });
  const { services, user } = await verifiedSession(session, signal);
  const response = await httpsCallable<typeof input, unknown>(services.functions, "getDeliveryPhoto", { timeout: 60_000 })(input);
  await verifySameSession(session, user, signal);
  signal?.throwIfAborted();
  return deliveryPhotoDownloadBlob(response.data, photoId, variant);
}

export function deliveryPhotoHistoryErrorMessage(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "인터넷 연결 후 사진을 다시 확인해주세요.";
  if (code.endsWith("permission-denied") || code.endsWith("unauthenticated") || code.endsWith("failed-precondition")) return "사진 이용 권한을 확인하지 못했어요. 다시 로그인해주세요.";
  if (code.endsWith("not-found")) return "사진이 만료되었거나 변경되었어요. 목록을 새로 확인해주세요.";
  return "납품사진을 불러오지 못했어요. 잠시 후 다시 시도해주세요.";
}

export const deliveryPhotoHistoryRepository = { list, load };
