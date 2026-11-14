"use client";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { BottomSheetActions } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { attachPhotoGestures } from "./photo-gestures";
import styles from "./photo-pan-zoom.module.css";

export function PhotoPanZoom({ stageRef, origin, onZoomedChange, onSwipe }: {
  stageRef: RefObject<HTMLDivElement | null>; origin: HTMLElement | null; onZoomedChange: (zoomed: boolean) => void;
  onSwipe?: (direction: -1 | 1) => void;
}) {
  const api = useRef<ReturnType<typeof attachPhotoGestures> | null>(null);
  const [status, setStatus] = useState<{ percent: number; zoomed: boolean; atMax: boolean } | null>(null);
  const hint = useId();
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const description = stage.getAttribute("aria-describedby");
    stage.classList.add(styles.viewport!); stage.setAttribute("aria-describedby", hint);
    let zoomed = false;
    api.current = attachPhotoGestures(stage, (view, geometry, nextZoomed) => {
      if (zoomed !== nextZoomed) { zoomed = nextZoomed; onZoomedChange(zoomed); }
      const percent = Math.round(view.scale / geometry.nativeScale * 100);
      const atMax = view.scale >= geometry.max - .0001;
      setStatus((previous) => previous?.percent === percent && previous.zoomed === nextZoomed && previous.atMax === atMax ? previous : { percent, zoomed: nextZoomed, atMax });
    }, onSwipe);
    return () => {
      api.current?.dispose(); api.current = null; stage.classList.remove(styles.viewport!);
      if (description === null) stage.removeAttribute("aria-describedby"); else stage.setAttribute("aria-describedby", description);
      // Safari does not focus a button on a pointer click. Restore the photo
      // trigger after the dialog's own focus cleanup, including nested sheets.
      queueMicrotask(() => {
        const trigger = origin?.matches("button, [tabindex]") ? origin : origin?.querySelector<HTMLElement>("button");
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      });
    };
  }, [stageRef, origin, onZoomedChange, hint, onSwipe]);
  return <>
    <p className={styles.help} id={hint}><output aria-label="사진 배율" aria-live="off">{status ? `${status.percent}%` : "준비 중"}</output><span>저장된 사진 기준 · 휠·두 손가락 확대 · 끌어서 이동 · 두 번 눌러 확대/복원</span></p>
    <BottomSheetActions className={styles.actions ?? ""}>
      <GlassButton aria-label="사진 축소" disabled={!status?.zoomed} onClick={() => api.current?.zoomOut()}>−</GlassButton>
      <GlassButton aria-label="사진 확대" disabled={!status || status.atMax} onClick={() => api.current?.zoomIn()}>＋</GlassButton>
      <GlassButton disabled={!status} onClick={() => api.current?.nativeSize()}>원본 크기</GlassButton>
      <GlassButton disabled={!status?.zoomed} onClick={() => api.current?.reset()}>화면 맞춤</GlassButton>
    </BottomSheetActions>
  </>;
}
