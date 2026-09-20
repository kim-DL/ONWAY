"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";

import { Icon } from "@/components/ui/icon";
import { OnnuriLoader } from "@/components/ui/onnuri-loader";
import type { Customer } from "@/domain/customer";
import { forgetPrivateBlobUrl, registerPrivateBlobUrl } from "@/features/auth/private-client-state";
import { CustomerOverviewPhoto } from "./customer-overview-photo";
import { prepareCustomerPhoto, readCustomerPhotoSource, photoPreparationErrorMessage, validateCustomerPhotoFile } from "./customer-photo-preparation";
import styles from "./customer-editor.module.css";

function SelectedPhotoPreview({ file }: { file: File }) {
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<{ file: File; attempt: number; url: string | null; error: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    let url: string | null = null;
    void prepareCustomerPhoto(file).then((prepared) => {
      if (!active) return;
      url = registerPrivateBlobUrl(URL.createObjectURL(prepared));
      setPreview({ file, attempt, url, error: null });
    }).catch((error: unknown) => {
      if (active) setPreview({ file, attempt, url: null, error: photoPreparationErrorMessage(error) ?? "사진을 준비하지 못했어요. 다시 시도해주세요." });
    });
    return () => { active = false; if (url) forgetPrivateBlobUrl(url); };
  }, [file, attempt]);
  const current = preview?.file === file && preview.attempt === attempt ? preview : null;
  return <div className={styles.selectedPhoto} aria-busy={!current}>
    {/* A private object URL is intentionally never sent to an image proxy. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {current?.url && !current.error ? <img src={current.url} alt="선택한 거래처 전경사진 미리보기" decoding="async" onError={() => setPreview((value) => value?.url === current.url ? { ...value, error: "사진 표시를 다시 준비해주세요." } : value)} /> : <div className={styles.photoPreparation}>
      {current?.error ? <Icon name="refresh" size={25} /> : <OnnuriLoader tone="customer" decorative />}
      <p role="status">{current?.error ?? "사진을 준비하고 있어요."}</p>
      {current?.error ? <button type="button" onClick={() => setAttempt((value) => value + 1)}>다시 준비</button> : null}
    </div>}
  </div>;
}

export function CustomerPhotoPicker({ customer, file, removed, disabled, onChange, onReadingChange }: {
  customer: Customer | null; file: File | null; removed: boolean; disabled: boolean; onChange: (file: File | null) => void; onReadingChange?: (reading: boolean) => void;
}) {
  const inputId = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const sourceRead = useRef<AbortController | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const selectionRun = useRef(0);
  useEffect(() => () => { selectionRun.current += 1; sourceRead.current?.abort(); sourceRead.current = null; }, []);
  const hasPhoto = Boolean(file || (!removed && customer?.overviewPhoto));
  const selectPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selected = input.files?.[0];
    if (!selected || disabled || sourceRead.current) return;
    const message = validateCustomerPhotoFile(selected);
    setError(message ?? "");
    if (message) { input.value = ""; return; }
    const run = ++selectionRun.current;
    const controller = new AbortController(); sourceRead.current = controller;
    setReading(true); onReadingChange?.(true);
    try {
      const source = await readCustomerPhotoSource(selected, controller.signal);
      if (selectionRun.current === run) onChange(source);
    } catch (cause) {
      if (selectionRun.current === run) setError(photoPreparationErrorMessage(cause) ?? "앨범 사진을 읽지 못했어요. 다시 선택해주세요.");
    } finally {
      // Android album providers can hold a temporary native file reference.
      // Release it only after the bytes belong to this app, not before reading.
      input.value = "";
      if (selectionRun.current === run) { sourceRead.current = null; setReading(false); onReadingChange?.(false); }
    }
  };
  return <section className={styles.photoPicker} aria-labelledby={`${inputId}-heading`}>
    <div className={styles.photoHeading}><h4 id={`${inputId}-heading`}>전경사진</h4><span>{hasPhoto ? "1장 선택됨" : "선택 · 1장"}</span></div>
    {file ? <SelectedPhotoPreview file={file} /> : !removed && customer?.overviewPhoto ? <CustomerOverviewPhoto customer={customer} variant="preview" className={styles.existingPhoto ?? ""} /> : null}
    <input ref={cameraRef} type="file" tabIndex={-1} accept="image/*" capture="environment" disabled={disabled && !reading} className={styles.fileInput} aria-label="거래처 전경사진 촬영" onChange={(event) => void selectPhoto(event)} />
    <input ref={albumRef} id={inputId} type="file" tabIndex={-1} accept="image/*" disabled={disabled && !reading} className={styles.fileInput} aria-label="거래처 전경사진 선택" onChange={(event) => void selectPhoto(event)} />
    <input ref={filesRef} type="file" tabIndex={-1} disabled={disabled && !reading} className={styles.fileInput} aria-label="거래처 전경사진 파일에서 선택" onChange={(event) => void selectPhoto(event)} />
    <div className={styles.photoActions}>
      <button type="button" className={styles.photoSource} disabled={disabled || reading} onClick={() => cameraRef.current?.click()}><span className={styles.photoSourceIcon}><Icon name="camera" size={21} /></span><span>직접 촬영</span></button>
      <button type="button" className={styles.photoSource} disabled={disabled || reading} onClick={() => albumRef.current?.click()}><span className={styles.photoSourceIcon}><svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="17" height="17" rx="2" /><path d="m4 15 5-5 5 5 3-3 4 4M1 7v14a2 2 0 0 0 2 2h14" /><circle cx="16" cy="8" r="1.5" /></svg></span><span>앨범에서 선택</span></button>
    </div>
    {reading ? <p className={styles.photoHint} role="status"><OnnuriLoader size="small" tone="customer" decorative /> 앨범에서 사진을 가져오고 있어요.</p> : null}
    {hasPhoto ? <div className={styles.photoSelectionRow}><span>{file ? "저장하면 사진이 등록돼요." : "등록된 전경사진"}</span><button type="button" className={styles.photoRemove} disabled={disabled || reading} onClick={() => { setError(""); onChange(null); }}><Icon name="trash" size={16} />사진 제거</button></div> : null}
    {removed && customer?.overviewPhoto ? <p className={styles.photoHint}>저장하면 전경사진이 제거됩니다.</p> : null}
    {error ? <><p className={styles.photoError} role="alert">{error}</p><button type="button" className={styles.photoRemove} disabled={disabled || reading} onClick={() => filesRef.current?.click()}>파일에서 선택</button></> : null}
  </section>;
}
