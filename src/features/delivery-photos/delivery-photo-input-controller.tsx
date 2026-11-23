"use client";

import dynamic from "next/dynamic";
import { Fragment, forwardRef, useEffect, useImperativeHandle, useRef, useState, type ChangeEvent } from "react";
import { flushSync } from "react-dom";

import type { DeliveryPhotoUploadCoordinator } from "./delivery-photo-upload-memory";
import type { DeliveryPhotoUploadProjection } from "./delivery-photo-upload-state";
import styles from "./photo.module.css";

export type DeliveryPhotoInputControllerHandle = {
  openCamera: (customerId: string) => boolean;
  openAlbum: (customerId: string) => boolean;
};

const PendingPhotoChoice = dynamic(() => import("./delivery-photo-more-menu").then(menu => menu.PendingPhotoChoice));
type PickerTarget = { customerId: string; source: "camera" | "album" };
type PendingPicker = PickerTarget & { input: HTMLInputElement };

export const DeliveryPhotoInputController = forwardRef<DeliveryPhotoInputControllerHandle, {
  coordinator: DeliveryPhotoUploadCoordinator | null;
  jobs: readonly DeliveryPhotoUploadProjection[];
  names: ReadonlyMap<string, { name: string }>;
  onSelected?: (customerId: string) => void;
  canSelect?: (customerId: string) => boolean;
}>(function DeliveryPhotoInputController({ coordinator, jobs, names, onSelected, canSelect }, ref) {
  const camera = useRef<HTMLInputElement>(null);
  const album = useRef<HTMLInputElement>(null);
  const [pickerVersion, setPickerVersion] = useState(0);
  const [choice, setChoice] = useState<(PickerTarget & { previous: PendingPicker }) | null>(null);
  const pending = useRef<PendingPicker | null>(null);
  const returnedFromPicker = useRef(false);
  const reading = useRef(false);
  const localJob = useRef<string | null>(null);
  const selectedJob = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedJob.current) return;
    const job = jobs.find((entry) => entry.jobId === selectedJob.current);
    if (!job) return;
    if (job.status === "failed") selectedJob.current = null;
    if (job.status === "queued" || job.status === "uploading" || job.status === "completed") {
      selectedJob.current = null;
      onSelected?.(job.customerId);
    }
  }, [jobs, onSelected]);
  const releasePicker = () => {
    pending.current = null;
    returnedFromPicker.current = false;
    setChoice(null);
  };

  const open = (customerId: string, source: PickerTarget["source"], replace?: PendingPicker) => {
    if (reading.current || !coordinator?.canBegin(customerId) || canSelect?.(customerId) === false) return false;
    if (replace && replace !== pending.current) return false;
    if (pending.current) {
      if (!returnedFromPicker.current) return false;
      if (!replace) {
        setChoice({ previous: pending.current, customerId, source });
        return false;
      }
      // A late native event still targets its old input after explicit replacement.
      flushSync(() => { setChoice(null); setPickerVersion(version => version + 1); });
    }
    const input = source === "camera" ? camera.current : album.current;
    if (!input) return false;
    pending.current = { customerId, source, input };
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
    const returned = () => { if (pending.current) returnedFromPicker.current = true; };
    const visible = () => { if (document.visibilityState === "visible") returned(); };
    const cancelled = (event: Event) => { if (event.target === pending.current?.input) releasePicker(); };
    const beforeUnload = (event: BeforeUnloadEvent) => { if (localJob.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("focus", returned);
    window.addEventListener("pageshow", returned);
    document.addEventListener("resume", returned);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", visible);
    document.addEventListener("cancel", cancelled, true);
    return () => {
      window.removeEventListener("focus", returned);
      window.removeEventListener("pageshow", returned);
      document.removeEventListener("resume", returned);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", visible);
      document.removeEventListener("cancel", cancelled, true);
      // Source copying belongs to the session coordinator. Changing workspace
      // must not discard a photo; logout still aborts it through private cleanup.
      releasePicker();
    };
  }, [coordinator]);

  const selected = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const target = pending.current;
    if (!target || target.input !== input) return;
    setChoice(null);
    const nativeFile = input.files?.item(0) ?? null;
    if (!coordinator || !nativeFile || reading.current) { if (!nativeFile) releasePicker(); return; }
    if (canSelect && !canSelect(target.customerId)) { input.value = ""; releasePicker(); return; }
    const job = coordinator.begin(target.customerId, target.source);
    if (!job) { input.value = ""; releasePicker(); return; }
    localJob.current = job.jobId; reading.current = true;
    try {
      selectedJob.current = job.jobId;
      await coordinator.acceptNativeSource(job.jobId, nativeFile);
      localJob.current = null;
    } catch (error) {
      const preparation = await import(/* webpackChunkName: "delivery-photo-preparation" */ "./delivery-photo-preparation");
      coordinator.failPreparation(job.jobId, preparation.deliveryPhotoPreparationMessage(error));
      localJob.current = null;
    } finally {
      input.value = ""; reading.current = false; releasePicker();
    }
  };

  return <><Fragment key={pickerVersion}>
    <input ref={camera} className={styles.srOnly} type="file" tabIndex={-1} accept="image/*" capture="environment"
      aria-label="납품사진 카메라 촬영" onChange={(event) => void selected(event)} />
    <input ref={album} className={styles.srOnly} type="file" tabIndex={-1} accept="image/*"
      aria-label="납품사진 앨범 선택" onChange={(event) => void selected(event)} />
  </Fragment>{choice && <PendingPhotoChoice previousName={names.get(choice.previous.customerId)?.name ?? "이전 거래처"}
    nextName={names.get(choice.customerId)?.name ?? "선택한 거래처"} source={choice.source}
    disabled={!coordinator?.canBegin(choice.customerId) || canSelect?.(choice.customerId) === false}
    onWait={() => setChoice(null)} onReplace={() => open(choice.customerId, choice.source, choice.previous)} />}</>;
});
