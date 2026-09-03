"use client";

import "client-only";

import { httpsCallable } from "firebase/functions";

import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { createSalesSessionNamespace } from "@/features/sales-cycle/sales-workspace-repository";
import { invalidateCachedSalesWorkspace } from "@/features/sales-cycle/sales-workspace-cache";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import {
  recordSalesVisitInputSchema,
  recordSalesVisitResultSchema,
  updateSalesVisitInputSchema,
  type RecordSalesVisitInput,
  type UpdateSalesVisitInput,
} from "./sales-visit-contract";

export class SalesVisitRepository {
  async record(input: RecordSalesVisitInput, session: AuthenticatedSession) {
    const services = getFirebaseClientServices();
    if (!services) throw new Error("Firebase is not configured.");
    const payload = recordSalesVisitInputSchema.parse(input);
    const callable = httpsCallable<RecordSalesVisitInput, unknown>(services.functions, "recordSalesVisit");
    const response = await callable(payload);
    const result = recordSalesVisitResultSchema.parse(response.data);
    await invalidateCachedSalesWorkspace(createSalesSessionNamespace(session), input.cycleId).catch(() => undefined);
    return result;
  }

  async update(input: UpdateSalesVisitInput, session: AuthenticatedSession) {
    const services = getFirebaseClientServices();
    if (!services) throw new Error("Firebase is not configured.");
    const payload = updateSalesVisitInputSchema.parse(input);
    const callable = httpsCallable<UpdateSalesVisitInput, unknown>(services.functions, "updateSalesVisit");
    const response = await callable(payload);
    const result = recordSalesVisitResultSchema.parse(response.data);
    await invalidateCachedSalesWorkspace(createSalesSessionNamespace(session), input.cycleId).catch(() => undefined);
    return result;
  }
}

export const salesVisitRepository = new SalesVisitRepository();
