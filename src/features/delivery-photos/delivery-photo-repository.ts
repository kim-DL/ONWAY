"use client";

import "client-only";

import { httpsCallable } from "firebase/functions";
import { z } from "zod";

import {
  deliveryPhotoDayResultSchema,
  deliveryPhotoRouteSchema,
  getDeliveryPhotoDayInputSchema,
  getDeliveryPhotoRouteInputSchema,
  listDeliveryPhotosInputSchema,
  listDeliveryPhotosResultSchema,
  saveDeliveryPhotoDayInputSchema,
  saveDeliveryPhotoRouteInputSchema,
} from "@/domain/delivery-photo";
import { getFirebaseClientServices } from "@/lib/firebase/client";

type SaveInput = z.input<typeof saveDeliveryPhotoRouteInputSchema>;
export type DeliveryPhotoRouteResult = z.infer<typeof deliveryPhotoRouteSchema> | null;
export type DeliveryPhotoDayResult = z.infer<typeof deliveryPhotoDayResultSchema>;
export type DeliveryPhotoTodayResult = Extract<z.infer<typeof listDeliveryPhotosResultSchema>, { scope: "today" }>;

async function call<Input, Output>(name: string, input: Input, schema: z.ZodType<Output>): Promise<Output> {
  const services = getFirebaseClientServices();
  const uid = services?.auth.currentUser?.uid;
  if (!services || !uid) throw Object.assign(new Error("Delivery photo authentication required."), { code: "unauthenticated" });
  const response = await httpsCallable<Input, unknown>(services.functions, name)(input);
  if (services.auth.currentUser?.uid !== uid) throw Object.assign(new Error("Delivery photo session changed."), { code: "unauthenticated" });
  return schema.parse(response.data);
}

export function deliveryPhotoErrorKind(error: unknown): "auth" | "conflict" | "temporary" {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["permission-denied", "unauthenticated", "failed-precondition"].some((suffix) => code.endsWith(suffix))) return "auth";
  if (code.endsWith("aborted")) return "conflict";
  return "temporary";
}

export const deliveryPhotoRepository = {
  getRoute: () => call("getDeliveryPhotoRoute", getDeliveryPhotoRouteInputSchema.parse({}), deliveryPhotoRouteSchema.nullable()),
  getDay: () => call("getDeliveryPhotoDay", getDeliveryPhotoDayInputSchema.parse({}), deliveryPhotoDayResultSchema),
  listToday: () => call("listDeliveryPhotos", listDeliveryPhotosInputSchema.parse({ scope: "today" }), listDeliveryPhotosResultSchema) as Promise<DeliveryPhotoTodayResult>,
  saveRoute: (input: SaveInput) => call("saveDeliveryPhotoRoute", saveDeliveryPhotoRouteInputSchema.parse(input), deliveryPhotoRouteSchema),
  saveDay: (input: SaveInput) => call("saveDeliveryPhotoDay", saveDeliveryPhotoDayInputSchema.parse(input), deliveryPhotoDayResultSchema),
};
