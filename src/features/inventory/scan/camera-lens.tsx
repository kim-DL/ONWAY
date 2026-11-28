import { useEffect, useState, type MouseEvent, type RefObject } from "react";
import styles from "./camera.module.css";

type Point = { x: number; y: number };
type LensSettings = { focusMode?: string; pointsOfInterest?: Point[]; torch?: boolean; zoom?: number };
type Capabilities = { torch?: boolean | boolean[]; focusMode?: string[]; zoom?: { min: number; max: number; step?: number } };

export function cameraLens(track: MediaStreamTrack) {
  let caps: Capabilities = {};
  try { caps = (track.getCapabilities?.() ?? {}) as Capabilities; } catch { /* Embedded browsers can hide capabilities. */ }
  const focusModes = caps.focusMode ?? [];
  const hasTorch = Array.isArray(caps.torch) ? caps.torch.includes(true) && caps.torch.includes(false) : caps.torch === true;
  const settings = track.getSettings?.() ?? {};
  const baseZoom = settings.zoom ?? (caps.zoom && Math.max(1, caps.zoom.min)) ?? 1;
  const range = caps.zoom;
  const step = range?.step || 0;
  const target = range ? Math.min(range.max, baseZoom * 2) : baseZoom;
  const nearZoom = range && step ? range.min + Math.floor((target - range.min) / step + 1e-6) * step : target;
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() as { pointsOfInterest?: boolean } | undefined;
  const pointMode = focusModes.includes("continuous") ? "continuous" : focusModes.includes("single-shot") ? "single-shot" : undefined;
  let applied: LensSettings = {};
  let queue = Promise.resolve();
  // Each applyConstraints replaces the last request. Keep the other successful camera controls.
  function apply(change: LensSettings) {
    const result = queue.then(async () => {
      if (track.readyState === "ended") throw new Error("카메라가 꺼졌어요.");
      const next = { ...applied, ...change };
      await track.applyConstraints({ advanced: [next as MediaTrackConstraintSet] });
      applied = next;
      const actual = track.getSettings?.();
      if (change.torch !== undefined && typeof actual?.torch === "boolean") return change.torch === actual.torch;
      if (change.zoom !== undefined && actual?.zoom !== undefined) return Math.abs(actual.zoom - change.zoom) < 0.01;
      return true;
    });
    queue = result.then(() => {}, () => {});
    return result;
  }
  return { hasTorch, torchOn: settings.torch === true, baseZoom, nearZoom, pointMode: supported?.pointsOfInterest ? pointMode : undefined,
    continuous: focusModes.includes("continuous"), apply };
}

/** Video uses object-fit: contain. Ignore the bars around the image. */
export function focusPoint(video: HTMLVideoElement, x: number, y: number): Point | null {
  const rect = video.getBoundingClientRect();
  const scale = Math.min(rect.width / video.videoWidth, rect.height / video.videoHeight);
  const width = video.videoWidth * scale, height = video.videoHeight * scale;
  if (!width || !height) return null;
  const point = { x: (x - rect.left - (rect.width - width) / 2) / width, y: (y - rect.top - (rect.height - height) / 2) / height };
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 ? point : null;
}

export function CameraLensControls({ track, video, disabled }: { track: MediaStreamTrack; video: RefObject<HTMLVideoElement | null>; disabled: boolean }) {
  const [lens] = useState(() => cameraLens(track));
  const [torch, setTorch] = useState(lens.torchOn);
  const [zoomed, setZoomed] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (lens.continuous) void lens.apply({ focusMode: "continuous" }).catch(() => {});
  }, [lens]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 3000);
    return () => clearTimeout(timer);
  }, [message]);
  async function change(next: LensSettings, success: () => void, failure: string) {
    if (waiting || disabled) return;
    setWaiting(true);
    setMessage("");
    try {
      const confirmed = await lens.apply(next);
      success();
      if (!confirmed) setMessage("전환을 요청했어요. 카메라 화면에서 확인해 주세요.");
    }
    catch { setMessage(failure); }
    finally { setWaiting(false); }
  }
  function focus(event: MouseEvent<HTMLButtonElement>) {
    if (!video.current) return;
    const point = event.detail ? focusPoint(video.current, event.clientX, event.clientY) : { x: 0.5, y: 0.5 };
    if (!point || !lens.pointMode) return;
    void change({ focusMode: lens.pointMode, pointsOfInterest: [point] }, () => setMessage("누른 곳에 초점을 요청했어요."), "조금 물러나거나 기기 카메라로 촬영해 주세요.");
  }
  return <>
    {lens.pointMode && <button type="button" className={styles.focusPad} aria-label="누른 곳에 초점 맞추기" disabled={disabled || waiting} onClick={focus}><span className={styles.focusHint}>글씨를 눌러 초점</span></button>}
    <div className={styles.lensTools}>
      {lens.hasTorch && <button type="button" aria-label="손전등" aria-pressed={torch} disabled={disabled || waiting}
        onClick={() => void change({ torch: !torch }, () => setTorch(!torch), "손전등을 전환하지 못했어요. 기기 카메라를 이용해 주세요.")}>손전등 {torch ? "끄기" : "켜기"}</button>}
      {lens.nearZoom > lens.baseZoom + 0.1 && <button type="button" aria-label="작은 글씨 확대" aria-pressed={zoomed} disabled={disabled || waiting}
        onClick={() => void change({ zoom: zoomed ? lens.baseZoom : lens.nearZoom }, () => setZoomed(!zoomed), "이 카메라에서는 확대할 수 없어요.")}>{zoomed ? "확대 해제" : "확대"}</button>}
    </div>
    {message && <span className={styles.lensMessage} role="status">{message}</span>}
  </>;
}
