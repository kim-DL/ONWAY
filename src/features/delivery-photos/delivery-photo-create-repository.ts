"use client";

import "client-only";

import { httpsCallable } from "firebase/functions";
import { z } from "zod";

import { createDeliveryPhotoInputSchema, createDeliveryPhotoResultSchema } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { getFirebaseClientServices } from "@/lib/firebase/client";

export type DeliveryPhotoCreateInput = z.input<typeof createDeliveryPhotoInputSchema>;
export type DeliveryPhotoCreateResult = z.infer<typeof createDeliveryPhotoResultSchema>;
export type DeliveryPhotoCreateErrorCategory = "auth" | "retryable" | "input" | "permanent";

function sessionSignature(session: AuthenticatedSession) {
  return JSON.stringify([session.uid, session.claims.employeeId, session.claims.sessionVersion, session.claims.permissionsVersion]);
}

async function verifyCreateSession(session: AuthenticatedSession) {
  const services = getFirebaseClientServices();
  const user = services?.auth.currentUser;
  if (!services || !user || user.uid !== session.uid) {
    throw Object.assign(new Error("Delivery photo authentication required."), { code: "unauthenticated" });
  }
  const claims = (await user.getIdTokenResult()).claims;
  const current = JSON.stringify([user.uid, claims.employeeId, claims.sessionVersion, claims.permissionsVersion]);
  if (services.auth.currentUser !== user || current !== sessionSignature(session)) {
    throw Object.assign(new Error("Delivery photo session changed."), { code: "unauthenticated" });
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw Object.assign(new Error("Delivery photo connection unavailable."), { code: "unavailable" });
  }
  return { services, user };
}

export { classifyDeliveryPhotoCreateError, deliveryPhotoCreateErrorMessage } from "./delivery-photo-upload-errors";

async function create(input: DeliveryPhotoCreateInput, session: AuthenticatedSession): Promise<DeliveryPhotoCreateResult> {
  const parsed = createDeliveryPhotoInputSchema.parse(input);
  const { services, user } = await verifyCreateSession(session);
  const response = await httpsCallable<DeliveryPhotoCreateInput, unknown>(services.functions, "createDeliveryPhoto", { timeout: 130_000 })(parsed);
  if (services.auth.currentUser !== user) throw Object.assign(new Error("Delivery photo session changed."), { code: "unauthenticated" });
  await verifyCreateSession(session);
  const result = createDeliveryPhotoResultSchema.safeParse(response.data);
  if (!result.success) throw Object.assign(new Error("Delivery photo response was invalid."), { code: "delivery-photo/invalid-response" });
  return result.data;
}

export const deliveryPhotoCreateRepository = { create };
