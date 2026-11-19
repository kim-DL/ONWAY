"use client";

import { httpsCallable } from "firebase/functions";

import { listDeliveryPhotosInputSchema, listDeliveryPhotosResultSchema, type DeliveryPhotoGalleryCursor } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { invalidDeliveryPhotoResponse, verifyDeliveryPhotoSession, verifySameDeliveryPhotoSession } from "../delivery-photo-history-repository";

export async function readGalleryPage(session: AuthenticatedSession, date: string, customerId: string | undefined,
  cursor: DeliveryPhotoGalleryCursor | null, signal: AbortSignal) {
  const input = listDeliveryPhotosInputSchema.parse({ scope: "gallery", deliveryDateKey: date,
    ...(customerId && { customerId }), ...(cursor && { cursor }) });
  const { services, user } = await verifyDeliveryPhotoSession(session, signal);
  const response = await httpsCallable<typeof input, unknown>(services.functions, "listDeliveryPhotos", { timeout: 60_000 })(input);
  await verifySameDeliveryPhotoSession(session, user, signal);
  const result = listDeliveryPhotosResultSchema.safeParse(response.data);
  if (!result.success || result.data.scope !== "gallery" || result.data.deliveryDateKey !== date || result.data.customerId !== (customerId ?? null)
    || result.data.photos.some((photo) => photo.deliveryDateKey !== date || (customerId && photo.customerId !== customerId))) throw invalidDeliveryPhotoResponse();
  return result.data;
}
