"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import type { DeliveryPhotoUploadCoordinator } from "./delivery-photo-upload-memory";
import { isActiveDeliveryPhotoUpload, type DeliveryPhotoUploadProjection } from "./delivery-photo-upload-state";

const EMPTY_UPLOADS: readonly DeliveryPhotoUploadProjection[] = Object.freeze([]);

export function useDeliveryPhotoUploads(session: AuthenticatedSession, onConfirmed: (photo: DeliveryPhotoMetadata) => void, canMerge = true, reconcile?: () => void) {
  const namespace = JSON.stringify([session.uid, session.claims.employeeId, session.claims.sessionVersion, session.claims.permissionsVersion]);
  const [failedNamespace, setFailedNamespace] = useState("");
  const [attempt, setAttempt] = useState(0);
  const retryStorage = () => { setFailedNamespace(""); setAttempt((value) => value + 1); };
  const [loaded, setLoaded] = useState<{ namespace: string; coordinator: DeliveryPhotoUploadCoordinator } | null>(null);
  const coordinator = loaded?.namespace === namespace ? loaded.coordinator : null;
  useEffect(() => {
    let current = true;
    void import("./delivery-photo-upload-memory").then(async (module) => {
      if (!current) return;
      const coordinator = module.getDeliveryPhotoUploadCoordinator(session);
      const ready = await (attempt ? coordinator.retryStorage() : coordinator.ready);
      if (current) { setFailedNamespace(ready ? "" : namespace); if (ready) setLoaded({ namespace, coordinator }); }
    }).catch(() => { if (current) setFailedNamespace(namespace); });
    return () => { current = false; };
  }, [attempt, namespace, session]);

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
    const rows = new Map<string, { job: DeliveryPhotoUploadProjection; pendingCount: number; retryJob?: DeliveryPhotoUploadProjection; attention?: DeliveryPhotoUploadProjection }>();
    for (const job of jobs) {
      let row = rows.get(job.customerId);
      if (!row) { row = { job, pendingCount: 0 }; rows.set(job.customerId, row); }
      if (isActiveDeliveryPhotoUpload(job)) row.pendingCount++;
      if (job.status === "paused" || job.status === "failed") row.attention ??= job;
      if (job.status === "failed" && job.errorCategory === "retryable") row.retryJob ??= job;
    }
    return rows;
  }, [jobs]);
  return { coordinator, jobs, byCustomer, ready: coordinator !== null, storageError: failedNamespace === namespace, retryStorage };
}
