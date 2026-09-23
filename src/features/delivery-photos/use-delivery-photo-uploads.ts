"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import type { DeliveryPhotoUploadCoordinator } from "./delivery-photo-upload-memory";
import type { DeliveryPhotoUploadProjection } from "./delivery-photo-upload-state";

const EMPTY_UPLOADS: readonly DeliveryPhotoUploadProjection[] = Object.freeze([]);

export function useDeliveryPhotoUploads(session: AuthenticatedSession, onConfirmed: (photo: DeliveryPhotoMetadata) => void) {
  const namespace = `${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}`;
  const [loaded, setLoaded] = useState<{ namespace: string; coordinator: DeliveryPhotoUploadCoordinator } | null>(null);
  const coordinator = loaded?.namespace === namespace ? loaded.coordinator : null;
  useEffect(() => {
    let current = true;
    void import("./delivery-photo-upload-memory").then((module) => {
      if (current) setLoaded({ namespace, coordinator: module.getDeliveryPhotoUploadCoordinator(session) });
    });
    return () => { current = false; };
  }, [namespace, session]);

  const subscribe = useCallback((listener: () => void) => coordinator?.subscribe(listener) ?? (() => undefined), [coordinator]);
  const getSnapshot = useCallback(() => coordinator?.getSnapshot() ?? EMPTY_UPLOADS, [coordinator]);
  const jobs = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    for (const job of jobs) {
      if (job.status !== "completed") continue;
      const metadata = coordinator?.peekConfirmed(job.jobId);
      if (!metadata) continue;
      onConfirmed(metadata);
      coordinator?.markConfirmedMerged(job.jobId);
    }
  }, [coordinator, jobs, onConfirmed]);

  const byCustomer = useMemo(() => new Map(jobs.map((job) => [job.customerId, job])), [jobs]);
  return { coordinator, jobs, byCustomer, ready: coordinator !== null };
}
