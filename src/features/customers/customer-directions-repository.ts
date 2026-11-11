"use client";
import "client-only";
import { httpsCallable } from "firebase/functions";
import { z } from "zod";
import { customerLocationCandidateSchema, type CustomerPoint } from "@/domain/customer";
import { getFirebaseClientServices } from "@/lib/firebase/client";
export { renderDirectionsLoading } from "./customer-directions-loading";

export async function resolveDirectionsPoint(query: string): Promise<CustomerPoint | null> {
  const services = getFirebaseClientServices(); const user = services?.auth.currentUser;
  if (!services || !user || !navigator.onLine) throw new Error("Directions unavailable");
  const before = (await user.getIdTokenResult()).claims;
  const response = await httpsCallable<{ query: string; addressOnly: boolean }, unknown>(services.functions, "searchCustomerLocations", { timeout: 15_000 })({ query, addressOnly: true });
  const current = services.auth.currentUser;
  const after = current === user ? (await user.getIdTokenResult()).claims : null;
  if (!after || before.sessionVersion !== after.sessionVersion || before.permissionsVersion !== after.permissionsVersion) throw new Error("Directions session changed");
  const candidates = z.array(customerLocationCandidateSchema).max(1).parse(response.data);
  return candidates[0]?.id === "address" ? candidates[0].point : null;
}
