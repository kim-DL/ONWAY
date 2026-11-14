"use client";

import { z } from "zod";
import { httpsCallable } from "firebase/functions";
import { APP_METADATA } from "@/lib/app-metadata";
import { ensureFirebaseAppCheckReady, getFirebaseClientServices } from "@/lib/firebase/client";

const accessSchema = z.object({
  revision: z.number().int().nonnegative(),
  entries: z.array(z.object({
    employeeId: z.string(), displayName: z.string(), email: z.string(),
    status: z.enum(["pending", "active", "disabled"]),
  })),
});
const changedSchema = z.object({ employeeId: z.string(), revision: z.number().int().nonnegative() });
export type GoogleAdminAccessData = z.infer<typeof accessSchema>;
export type GoogleAdminEntry = GoogleAdminAccessData["entries"][number];

async function call(name: string, input: Record<string, unknown>) {
  const services = getFirebaseClientServices();
  if (!services) throw new Error("Firebase is not configured.");
  await ensureFirebaseAppCheckReady();
  return (await httpsCallable(services.functions, name)(input)).data;
}

export const googleAdminRepository = {
  async list() { return accessSchema.parse(await call("listGoogleAdminAccess", {})); },
  async register(input: { email: string; displayName: string; expectedRevision: number; requestId: string }) {
    return changedSchema.parse(await call("registerGoogleAdminAccess", { ...input, appVersion: APP_METADATA.buildVersion }));
  },
  async disable(input: { employeeId: string; expectedRevision: number; reason: string; requestId: string }) {
    return changedSchema.parse(await call("disableGoogleAdminAccess", { ...input, appVersion: APP_METADATA.buildVersion }));
  },
};
