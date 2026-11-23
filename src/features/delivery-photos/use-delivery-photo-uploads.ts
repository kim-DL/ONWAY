"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import type { DeliveryPhotoUploadCoordinator } from "./delivery-photo-upload-memory";
import { isActiveDeliveryPhotoUpload, type DeliveryPhotoUploadProjection } from "./delivery-photo-upload-state";

const EMPTY_UPLOADS: readonly DeliveryPhotoUploadProjection[] = Object.freeze([]);
type PhotoCaptureRuntime = {
  namespace: string;
  coordinator: DeliveryPhotoUploadCoordinator;
  Inputs: typeof import("./delivery-photo-input-controller").DeliveryPhotoInputController;
};

export function useDeliveryPhotoUploads(session: AuthenticatedSession, onConfirmed: (photo: DeliveryPhotoMetadata) => void, canMerge = true, reconcile?: () => void) {
  const namespace = JSON.stringify([session.uid, session.claims.employeeId, session.claims.sessionVersion, session.claims.permissionsVersion]);
  const [failedNamespace, setFailedNamespace] = useState("");
  const [attempt, setAttempt] = useState(0);
  const retryStorage = useCallback(() => { setFailedNamespace(""); setAttempt((value) => value + 1); }, []);
  const [loaded, setLoaded] = useState<PhotoCaptureRuntime | null>(null);
  const runtime = loaded?.namespace === namespace ? loaded : null;
  const coordinator = runtime?.coordinator ?? null;
  useEffect(() => {
    let current = true;
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      removeReturnListeners();
      retryStorage();
    };
    function removeReturnListeners() {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
      document.removeEventListener("resume", onReturn);
    }
    function reportFailure() {
      if (!current) return;
      window.addEventListener("focus", onReturn);
      document.addEventListener("visibilitychange", onReturn);
      document.addEventListener("resume", onReturn);
      setFailedNamespace(namespace);
    }
    const openStorage = import("./delivery-photo-upload-memory").then(async (module) => {
      if (!current) return null;
      const coordinator = module.getDeliveryPhotoUploadCoordinator(session);
      return await coordinator.retryStorage() ? coordinator : null;
    });
    // Both must be ready before enabling the first native camera tap.
    void Promise.all([openStorage, import("./delivery-photo-input-controller")]).then(([coordinator, picker]) => {
      if (!current) return;
      if (!coordinator) { reportFailure(); return; }
      setFailedNamespace("");
      setLoaded({ namespace, coordinator, Inputs: picker.DeliveryPhotoInputController });
    }).catch(reportFailure);
    return () => { current = false; removeReturnListeners(); };
  }, [attempt, namespace, retryStorage, session]);

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
    const rows = new Map<string, { job: DeliveryPhotoUploadProjection; pendingCount: number; attention?: DeliveryPhotoUploadProjection }>();
    for (const job of jobs) {
      let row = rows.get(job.customerId);
      if (!row) { row = { job, pendingCount: 0 }; rows.set(job.customerId, row); }
      if (isActiveDeliveryPhotoUpload(job)) {
        if (row.pendingCount === 0) row.job = job;
        row.pendingCount++;
      }
      if (job.status === "paused" || job.status === "failed") row.attention ??= job;
    }
    return rows;
  }, [jobs]);
  return { coordinator, Inputs: runtime?.Inputs, jobs, byCustomer, ready: runtime !== null, storageError: failedNamespace === namespace, retryStorage };
}
