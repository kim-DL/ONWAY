"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import type { DeliveryPhotoUploadCoordinator } from "./delivery-photo-upload-memory";
import type { DeliveryPhotoUploadProjection } from "./delivery-photo-upload-state";

const EMPTY_UPLOADS: readonly DeliveryPhotoUploadProjection[] = Object.freeze([]);

export function useDeliveryPhotoUploads(session: AuthenticatedSession, onConfirmed: (photo: DeliveryPhotoMetadata) => void, canMerge = true, reconcile?: () => void) {
  const namespace = JSON.stringify([session.uid, session.claims.employeeId, session.claims.sessionVersion, session.claims.permissionsVersion]);
  const [storageError, setStorageError] = useState(false);
  const [loaded, setLoaded] = useState<{ namespace: string; coordinator: DeliveryPhotoUploadCoordinator } | null>(null);
  const coordinator = loaded?.namespace === namespace ? loaded.coordinator : null;
  useEffect(() => {
    let current = true;
    void import("./delivery-photo-upload-memory").then(async (module) => {
      if (!current) return;
      const coordinator = module.getDeliveryPhotoUploadCoordinator(session);
      const ready = await coordinator.ready;
      if (current) { setStorageError(!ready); if (ready) setLoaded({ namespace, coordinator }); }
    }).catch(() => { if (current) setStorageError(true); });
    return () => { current = false; };
  }, [namespace, session]);

  const subscribe = useCallback((listener: () => void) => coordinator?.subscribe(listener) ?? (() => undefined), [coordinator]);
  const getSnapshot = useCallback(() => coordinator?.getSnapshot() ?? EMPTY_UPLOADS, [coordinator]);
  const jobs = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => () => { coordinator?.releaseCompletedPreviews(); }, [coordinator]);

  useEffect(() => {
    if (!reconcile) return;
    window.addEventListener("onnuriway:delivery-photo-reconcile", reconcile);
    return () => window.removeEventListener("onnuriway:delivery-photo-reconcile", reconcile);
  }, [reconcile]);

  useEffect(() => {
    if (!canMerge) return;
    for (const job of jobs) {
      if (job.status !== "completed") continue;
      const metadata = coordinator?.peekConfirmed(job.jobId);
      if (!metadata) continue;
      onConfirmed(metadata);
      coordinator?.markConfirmedMerged(job.jobId);
    }
  }, [coordinator, jobs, onConfirmed, canMerge]);

  const byCustomer = useMemo(() => {
    const map = new Map<string, DeliveryPhotoUploadProjection>();
    for (const job of jobs) if (!map.has(job.customerId)) map.set(job.customerId, job);
    return map;
  }, [jobs]);
  const pendingByCustomer = useMemo(() => {
    const map = new Map<string, number>();
    for (const job of jobs) if (job.status !== "completed" && job.errorCategory !== "auth"
      && !(job.status === "failed" && job.errorCategory === "preparation" && job.durable === false)) {
      map.set(job.customerId, (map.get(job.customerId) ?? 0) + 1);
    }
    return map;
  }, [jobs]);
  const retryByCustomer = useMemo(() => {
    const map = new Map<string, DeliveryPhotoUploadProjection>();
    for (const job of jobs) if (job.status === "failed" && job.errorCategory === "retryable" && !map.has(job.customerId)) map.set(job.customerId, job);
    return map;
  }, [jobs]);
  return { coordinator, jobs, byCustomer, pendingByCustomer, retryByCustomer, ready: coordinator !== null, storageError };
}
