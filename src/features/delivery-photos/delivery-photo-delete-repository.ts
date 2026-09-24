"use client";

import "client-only";

import { httpsCallable } from "firebase/functions";

import { deleteDeliveryPhotoInputSchema, deleteDeliveryPhotoResultSchema } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

import {
  invalidDeliveryPhotoResponse,
  verifyDeliveryPhotoSession,
  verifySameDeliveryPhotoSession,
} from "./delivery-photo-history-repository";

export type DeliveryPhotoDeleteErrorKind = "permission" | "unavailable" | "auth" | "temporary";

export function deliveryPhotoDeleteErrorKind(error: unknown): DeliveryPhotoDeleteErrorKind {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code.endsWith("permission-denied")) return "permission";
  if (code.endsWith("not-found")) return "unavailable";
  if (code.endsWith("unauthenticated") || code.endsWith("failed-precondition")) return "auth";
  return "temporary";
}

async function remove(photoId: string, requestId: string, session: AuthenticatedSession) {
  const input = deleteDeliveryPhotoInputSchema.parse({ photoId, requestId });
  const { services, user } = await verifyDeliveryPhotoSession(session);
  const response = await httpsCallable<typeof input, unknown>(services.functions, "deleteDeliveryPhoto", { timeout: 60_000 })(input);
  await verifySameDeliveryPhotoSession(session, user);
  const parsed = deleteDeliveryPhotoResultSchema.safeParse(response.data);
  if (!parsed.success || parsed.data.photoId !== photoId) throw invalidDeliveryPhotoResponse();
  return parsed.data;
}

export const deliveryPhotoDeleteRepository = { remove };
