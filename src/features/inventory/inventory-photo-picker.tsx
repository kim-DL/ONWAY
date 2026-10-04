"use client";
/* eslint-disable @next/next/no-img-element -- Private blob URLs already resized by the existing optimizer; never send them to a public image proxy. */
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { InventoryProduct } from "@/domain/inventory";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { registerPrivateBlobUrl, forgetPrivateBlobUrl } from "@/features/auth/private-client-state";
import { CUSTOMER_PHOTO_SOURCE_MAX_BYTES, prepareCustomerPhoto, readCustomerPhotoSource, validateCustomerPhotoFile } from "@/features/customers/customer-photo-preparation";
import { InventoryPhoto } from "./inventory-photo";
import styles from "./inventory.module.css";

export function inventoryPhotoPreparationMessage(cause: unknown): string {
  const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
  return code === "photo/source-timeout" ? "촬영한 사진을 가져오는 데 시간이 오래 걸려요. 다시 촬영해주세요."
    : code === "photo/source-unreadable" ? "촬영한 원본 사진을 읽지 못했어요. 다시 촬영해주세요."
    : "촬영한 사진을 준비하지 못했어요. 다시 촬영해주세요.";
}

export function InventoryPhotoPicker({ product, file, removed, disabled, onChange, onBusyChange }: {
  product: InventoryProduct | null; file: File | null; removed: boolean; disabled: boolean;
  onChange: (file: File | null, removed: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const selection = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const ownedPreview = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; selection.current?.abort(); selection.current = null; if (ownedPreview.current) forgetPrivateBlobUrl(ownedPreview.current); }; }, []);
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selected = input.files?.[0];
    if (!selected || selection.current || disabled) return;
    const validation = validateCustomerPhotoFile(selected);
    if (validation) { setError(selected.size > CUSTOMER_PHOTO_SOURCE_MAX_BYTES ? "촬영 사진은 30MB 이하여야 해요. 다시 촬영해주세요." : "촬영한 사진 형식을 확인하지 못했어요. 다시 촬영해주세요."); input.value = ""; return; }
    const controller = new AbortController(); selection.current = controller;
    setPreparing(true); onBusyChange(true); setError("");
    try {
      // Reuse the existing Android-safe album materialization and image optimizer.
      const source = await readCustomerPhotoSource(selected, controller.signal);
      input.value = "";
      const prepared = await prepareCustomerPhoto(source);
      if (mounted.current && selection.current === controller) {
        if (ownedPreview.current) forgetPrivateBlobUrl(ownedPreview.current);
        const url = URL.createObjectURL(prepared); registerPrivateBlobUrl(url); ownedPreview.current = url;
        setPreview(url); onChange(prepared, false);
      }
    } catch (cause) { if (mounted.current && selection.current === controller) setError(inventoryPhotoPreparationMessage(cause)); }
    finally { input.value = ""; if (mounted.current && selection.current === controller) { selection.current = null; setPreparing(false); onBusyChange(false); } }
  }
  const hasPhoto = !!(file && preview || product?.photo && !removed);
  return <div className={styles.photoPicker} data-selected={hasPhoto || undefined}>
    {file && preview ? <div className={styles.photo}><img src={preview} alt="저장할 제품 사진 미리보기" /></div> : product?.photo && !removed ? <InventoryPhoto key={product.photo.photoId} product={product} /> : null}
    {/* Keep the native selection mounted and enabled until its bytes are copied.
        Visible actions and the ref guard prevent another selection meanwhile. */}
    <input className={styles.hiddenInput} ref={camera} type="file" accept="image/*" capture="environment" onChange={choose} tabIndex={-1} aria-label="제품 사진 직접 촬영" disabled={disabled && !preparing} />
    <div className={styles.buttonRow}><GlassButton className={styles.photoCapture} aria-label="직접 촬영" disabled={disabled || preparing} onClick={() => camera.current?.click()}><span className={styles.photoCaptureIcon}><Icon name="camera" size={24} /></span><span><strong>{hasPhoto || error ? "다시 촬영" : "사진 촬영"}</strong>{!hasPhoto ? <small>카메라로 바로 기록</small> : null}</span>{!hasPhoto ? <Icon name="chevron-right" size={17} /> : null}</GlassButton>{hasPhoto ? <GlassButton className={styles.photoRemove} disabled={disabled || preparing} variant="quiet" onClick={() => { if (ownedPreview.current) forgetPrivateBlobUrl(ownedPreview.current); ownedPreview.current = null; setPreview(null); onChange(null, true); }}>사진 제거</GlassButton> : null}</div>
    {preparing ? <p role="status" className={styles.muted}>사진을 준비하고 있어요.</p> : null}{error ? <p role="alert" className={styles.error}>{error}</p> : null}
  </div>;
}

export async function inventoryPhotoBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  return btoa(binary);
}
