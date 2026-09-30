"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, type ChangeEvent } from "react";

import type { DeliveryPhotoUploadCoordinator } from "./delivery-photo-upload-memory";
import styles from "./photo.module.css";

export type DeliveryPhotoInputControllerHandle = {
  openCamera: (customerId: string) => boolean;
  openAlbum: (customerId: string) => boolean;
};

type PendingPicker = { customerId: string; source: "camera" | "album" };

export const DeliveryPhotoInputController = forwardRef<DeliveryPhotoInputControllerHandle, {
  coordinator: DeliveryPhotoUploadCoordinator | null;
}>(function DeliveryPhotoInputController({ coordinator }, ref) {
  const camera = useRef<HTMLInputElement>(null);
  const album = useRef<HTMLInputElement>(null);
  const pending = useRef<PendingPicker | null>(null);
  const returnedFromPicker = useRef(false);
  const reading = useRef(false);
  const sourceRead = useRef<AbortController | null>(null);
  const localJob = useRef<string | null>(null);
  const releasePicker = () => {
    pending.current = null;
    returnedFromPicker.current = false;
  };

  const open = (customerId: string, source: "camera" | "album") => {
    if (!coordinator || reading.current || (pending.current && !returnedFromPicker.current)
      || coordinator.getCustomerJob(customerId)?.status === "uploading"
      || coordinator.getCustomerJob(customerId)?.status === "queued"
      || coordinator.getCustomerJob(customerId)?.status === "preparing"
      || coordinator.getCustomerJob(customerId)?.errorCategory === "retryable") return false;
    const input = source === "camera" ? camera.current : album.current;
    if (!input) return false;
    // A cancelled picker may not emit `cancel` on every WebKit version. Only a
    // new click after focus returns can replace that stale intent.
    pending.current = { customerId, source };
    returnedFromPicker.current = false;
    input.value = "";
    input.click();
    return true;
  };

  useImperativeHandle(ref, () => ({
    openCamera: (customerId) => open(customerId, "camera"),
    openAlbum: (customerId) => open(customerId, "album"),
  }));

  useEffect(() => {
    const cameraInput = camera.current;
    const albumInput = album.current;
    const returned = () => { if (pending.current) returnedFromPicker.current = true; };
    const visible = () => { if (document.visibilityState === "visible") returned(); };
    const cancelled = () => releasePicker();
    window.addEventListener("focus", returned);
    document.addEventListener("visibilitychange", visible);
    cameraInput?.addEventListener("cancel", cancelled);
    albumInput?.addEventListener("cancel", cancelled);
    return () => {
      window.removeEventListener("focus", returned);
      document.removeEventListener("visibilitychange", visible);
      cameraInput?.removeEventListener("cancel", cancelled);
      albumInput?.removeEventListener("cancel", cancelled);
      sourceRead.current?.abort();
      if (localJob.current) coordinator?.dismiss(localJob.current);
      releasePicker();
    };
  }, [coordinator]);

  const selected = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const target = pending.current;
    const nativeFile = input.files?.item(0) ?? null;
    if (!coordinator || !target || !nativeFile || reading.current) { if (!nativeFile) releasePicker(); return; }
    const job = coordinator.begin(target.customerId, target.source);
    if (!job) { input.value = ""; releasePicker(); return; }
    localJob.current = job.jobId; reading.current = true;
    const controller = new AbortController(); sourceRead.current = controller;
    try {
      const preparation = await import("./delivery-photo-preparation");
      const source = await preparation.materializeDeliveryPhotoSource(nativeFile, controller.signal);
      // The native content provider is no longer needed after this independent copy.
      input.value = "";
      if (!coordinator.acceptSource(job.jobId, source)) coordinator.dismiss(job.jobId);
      localJob.current = null;
    } catch (error) {
      const preparation = await import("./delivery-photo-preparation");
      coordinator.failPreparation(job.jobId, preparation.deliveryPhotoPreparationMessage(error));
      localJob.current = null;
    } finally {
      input.value = ""; sourceRead.current = null; reading.current = false; releasePicker();
    }
  };

  return <>
    <input ref={camera} className={styles.srOnly} type="file" tabIndex={-1} accept="image/*" capture="environment"
      aria-label="납품사진 카메라 촬영" onChange={(event) => void selected(event)} />
    <input ref={album} className={styles.srOnly} type="file" tabIndex={-1} accept="image/*"
      aria-label="납품사진 앨범 선택" onChange={(event) => void selected(event)} />
  </>;
});
