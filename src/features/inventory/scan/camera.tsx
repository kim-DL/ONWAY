"use client";

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { canonicalGtin } from "@/domain/inventory-scan";
import { readCustomerPhotoSource, validateCustomerPhotoFile } from "@/features/customers/customer-photo-preparation";
import { detectFrameGtin } from "./camera-decoder";
import { readScanMuted, ScanFeedback, writeScanMuted } from "./camera-feedback";
import { drawFrame, fitFrame, frameFromFile, frameToFile, sampleAim, type AimSample, type AimState } from "./camera-frame";
import { useCameraStream } from "./camera-stream";
import styles from "./camera.module.css";

interface CameraProps {
  onCapture: (source: File, barcode?: string) => void;
  onCode: (code: string) => void;
  onClose: () => void;
  hint?: string;
}
const aimText: Record<AimState, string> = {
  searching: "제품명이나 바코드를 중앙에 맞춰주세요",
  moving: "잠시 멈춰서 글씨를 맞춰주세요",
  steady: "화면이 안정됐어요. 촬영해주세요",
  dark: "글씨가 잘 보이도록 빛을 비춰주세요",
  glare: "빛이 반사되면 각도를 조금 바꿔주세요",
};

export function InventoryScanCamera({ onCapture, onCode, onClose, hint }: CameraProps) {
  const video = useRef<HTMLVideoElement>(null);
  const still = useRef<HTMLCanvasElement>(null);
  const album = useRef<HTMLInputElement>(null);
  const nativeCamera = useRef<HTMLInputElement>(null);
  const numberInput = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  const [feedback] = useState(() => new ScanFeedback());
  const [muted, setMuted] = useState(readScanMuted);
  const [aim, setAim] = useState<AimState>("searching");
  const [work, setWork] = useState<"idle" | "openingFile" | "captured">("idle");
  const [error, setError] = useState("");
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState("");
  const [invalidCode, setInvalidCode] = useState(false);
  const codeId = useId();
  const suspend = useCallback(() => {
    operation.current?.abort();
    operation.current = null;
    feedback.release();
    setWork("idle");
    setAim("searching");
  }, [feedback]);
  const stream = useCameraStream(video, suspend);
  const live = stream.status.kind === "ready";
  const busy = work !== "idle";

  useEffect(() => {
    return () => { operation.current?.abort(); feedback.release(); };
  }, [feedback]);
  useEffect(() => {
    if (manual) numberInput.current?.focus();
  }, [manual]);
  useEffect(() => {
    if (!live || busy || manual) return;
    if (!muted) feedback.unlock();
    const sample = document.createElement("canvas");
    sample.width = 48;
    sample.height = 32;
    const context = sample.getContext("2d", { willReadFrequently: true, alpha: false });
    if (!context) return;
    let previous: AimSample | undefined;
    const interval = window.setInterval(() => {
      const camera = video.current;
      if (!camera?.videoWidth || camera.readyState < 2 || document.hidden) return;
      try {
        const w = camera.videoWidth;
        const h = camera.videoHeight;
        context.drawImage(camera, w * 0.18, h * 0.25, w * 0.64, h * 0.5, 0, 0, sample.width, sample.height);
        const reading = sampleAim(context.getImageData(0, 0, sample.width, sample.height).data, sample.width, previous);
        if (reading.state !== previous?.state) {
          setAim(reading.state);
          if (reading.state === "steady" && !muted) feedback.settled();
        }
        previous = reading;
      } catch { /* Some cameras suppress sampling during a display or orientation change. */ }
    }, 220);
    return () => window.clearInterval(interval);
  }, [live, busy, manual, muted, feedback]);

  function unlockSound() { if (!muted) feedback.unlock(); }
  function toggleSound() {
    const next = !muted;
    setMuted(next);
    writeScanMuted(next);
    if (next) feedback.release();
    else feedback.unlock();
  }
  function close() {
    suspend();
    stream.stop.current();
    onClose();
  }
  function begin() {
    if (operation.current) return;
    const task = new AbortController();
    operation.current = task;
    setError("");
    setManual(false);
    setWork("openingFile");
    return task;
  }
  function failed(task: AbortController, cause: unknown) {
    if (task.signal.aborted || operation.current !== task) return;
    operation.current = null;
    setWork("idle");
    setError(cause instanceof Error ? cause.message : "사진을 준비하지 못했어요. 다시 촬영해주세요.");
  }
  async function acceptFrame(frame: HTMLCanvasElement, task: AbortController) {
    if (task.signal.aborted) return;
    if (still.current) {
      const fitted = fitFrame(frame.width, frame.height, 900);
      still.current.width = fitted.width;
      still.current.height = fitted.height;
      still.current.getContext("2d")?.drawImage(frame, 0, 0, fitted.width, fitted.height);
    }
    setWork("captured");
    if (!muted) feedback.captured();
    const photo = await frameToFile(frame);
    if (task.signal.aborted) return;
    const digits = await detectFrameGtin(frame, task.signal);
    if (task.signal.aborted || operation.current !== task) return;
    feedback.finishCapture();
    onCapture(photo, digits);
    if (task.signal.aborted || operation.current !== task) return;
    operation.current = null;
    setWork("idle");
  }
  async function takePhoto() {
    const camera = video.current;
    if (!camera?.videoWidth || camera.readyState < 2) { setError("카메라 화면이 보이면 다시 촬영해주세요."); return; }
    const task = begin();
    if (!task) return;
    try { await acceptFrame(drawFrame(camera, camera.videoWidth, camera.videoHeight), task); }
    catch (cause) { failed(task, cause); }
  }
  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const task = begin();
    if (!task) return;
    try {
      const message = validateCustomerPhotoFile(file);
      if (message) throw new Error(message);
      // Keep the native picker value until the provider's bytes have been copied.
      const source = await readCustomerPhotoSource(file, task.signal).catch(() => {
        throw new Error("사진 원본을 읽지 못했어요. 기기에 내려받은 사진을 다시 선택해주세요.");
      });
      const frame = await frameFromFile(source, task.signal);
      await acceptFrame(frame, task);
    } catch (cause) { failed(task, cause); }
    finally { if (input.files?.[0] === file) input.value = ""; }
  }
  function submitCode() {
    const digits = code.trim().replace(/[\s-]/g, "");
    if (!canonicalGtin(digits)) { setInvalidCode(true); numberInput.current?.focus(); return; }
    onCode(digits);
  }
  const statusText = stream.status.kind === "unavailable" ? stream.status.message
    : stream.status.kind === "paused" ? "카메라가 잠시 꺼졌어요."
    : "카메라를 여는 중이에요";
  const captured = work === "captured";
  return (
    <BottomSheet open title="제품 스캔" onClose={close}>
      <div className={styles.scanner} onPointerDownCapture={unlockSound} onKeyDownCapture={unlockSound}>
        <p className={styles.hint}>{hint || "포장이나 박스에서 제품명이 보이는 면을 비춰주세요. 바코드만 찍어도 돼요."}</p>
        <div className={styles.viewer} data-live={live || captured} data-captured={captured} data-aim={aim}>
          <video ref={video} autoPlay muted playsInline aria-hidden="true" className={styles.video} onLoadedMetadata={(event) => {
            const media = event.currentTarget;
            if (media.videoHeight) media.parentElement?.style.setProperty("--camera-ratio", String(media.videoWidth / media.videoHeight));
          }} />
          <canvas ref={still} aria-hidden="true" className={styles.still} />
          <button type="button" className={styles.sound} aria-label="효과음" aria-pressed={!muted} onClick={toggleSound}>
            <SoundGlyph muted={muted} />효과음 {muted ? "꺼짐" : "켜짐"}
          </button>
          {live && !captured ? <div className={styles.guide} aria-hidden="true"><i /><i /><i /><i /></div> : null}
          {!live && !captured ? <div className={styles.fallback}>
            <Icon name="camera" size={32} /><span role="status">{statusText}</span>
            {stream.status.kind !== "opening" ? <button type="button" disabled={busy} onClick={() => stream.start.current()}>카메라 다시 열기</button> : null}
          </div> : null}
          {live && !busy ? <p className={styles.aim}>{aimText[aim]}</p> : null}
          {busy ? <p className={styles.acquired} role="status">{captured ? "사진을 받았어요 · 바코드 확인 중" : "사진 여는 중"}</p> : null}
        </div>
        <div className={styles.controls}>
          <button type="button" className={styles.sideAction} disabled={busy} onClick={() => album.current?.click()}><Icon name="images" size={22} /><span>앨범</span></button>
          <button type="button" className={styles.shutter} disabled={busy} aria-label={live ? "사진 촬영" : "기기 카메라로 촬영"} onClick={() => { if (live) void takePhoto(); else nativeCamera.current?.click(); }}>
            <span className={styles.shutterRing}><Icon name="camera" size={25} /></span><span>{live ? "촬영" : "기기 카메라"}</span>
          </button>
          <button type="button" className={styles.sideAction} disabled={busy} aria-expanded={manual} aria-controls={codeId} onClick={() => { setManual(!manual); setInvalidCode(false); }}><BarcodeGlyph /><span>번호 입력</span></button>
        </div>
        <input ref={album} type="file" accept="image/*" hidden onChange={(event) => { void selectPhoto(event); }} />
        <input ref={nativeCamera} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { void selectPhoto(event); }} />
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div id={codeId} hidden={!manual} className={styles.manual}>
          <label htmlFor={codeId + "-input"}>바코드 아래 숫자</label>
          <div><input id={codeId + "-input"} ref={numberInput} type="text" inputMode="numeric" autoComplete="off" maxLength={30} value={code} aria-invalid={invalidCode} aria-describedby={invalidCode ? codeId + "-error" : undefined} onChange={(event) => { setCode(event.target.value); setInvalidCode(false); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submitCode(); } }} />
            <button type="button" onClick={submitCode}>조회</button></div>
          {invalidCode ? <p id={codeId + "-error"} role="alert" className={styles.error}>바코드 숫자와 마지막 검증 숫자를 확인해주세요.</p> : null}
        </div>
      </div>
    </BottomSheet>
  );
}

function BarcodeGlyph() {
  return <svg width="23" height="22" viewBox="0 0 24 22" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 6V3h3m14 0h3v3M2 16v3h3m14 0h3v-3M6 6v10m3-10v10m4-10v10m2-10v10m3-10v10" /></svg>;
}

function SoundGlyph({ muted }: { muted: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h3l4-4v12l-4-4H3z" />{muted ? <path d="m14 8 4 4m0-4-4 4" /> : <path d="M13 7a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12" />}</svg>;
}
