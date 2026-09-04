"use client";

import "client-only";

import { httpsCallable } from "firebase/functions";

import { getFirebaseClientServices } from "@/lib/firebase/client";
import { salesRouteResultSchema, type SalesRouteResult } from "./sales-route-contract";
import { parseSalesRouteFailure, routeResultMatchesRequest, type SalesRouteRequest } from "./sales-route-recovery";

export async function optimizeSalesRoute(input: SalesRouteRequest): Promise<SalesRouteResult> {
  const services = getFirebaseClientServices();
  if (!services) throw new Error("Firebase is not configured.");
  const response = await httpsCallable<typeof input, unknown>(services.functions, "optimizeSalesRoute")(input);
  const result = salesRouteResultSchema.parse(response.data);
  if (!routeResultMatchesRequest(result, input)) throw new Error("The route response does not match the requested schools.");
  return result;
}

export function salesRouteErrorMessage(error: unknown) {
  return parseSalesRouteFailure(error).message;
}
