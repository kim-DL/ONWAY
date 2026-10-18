"use client";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { BottomSheetActions } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { attachPhotoGestures } from "./inventory-photo-gestures";
import styles from "./inventory-photo-pan-zoom.module.css";

export function InventoryPhotoPanZoom({ stageRef, origin, onZoomedChange }: {
  stageRef: RefObject<HTMLDivElement | null>; origin: HTMLElement | null; onZoomedChange: (zoomed: boolean) => void;
}) {
  const api = useRef<ReturnType<typeof attachPhotoGestures> | null>(null);
  const [status, setStatus] = useState({ percent: 100, max: 2.5, ready: false, zoomed: false, atMax: false });
  const hint = useId();
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const description = stage.getAttribute("aria-describedby");
    stage.classList.add(styles.viewport!); stage.setAttribute("aria-describedby", hint);
    let zoomed = false;
    api.current = attachPhotoGestures(stage, (view, max, nextZoomed) => {
      if (zoomed !== nextZoomed) { zoomed = nextZoomed; onZoomedChange(zoomed); }
      const percent = Math.round(view.scale * 100);
      const atMax = view.scale >= max - .0001;
      setStatus((previous) => previous.ready && previous.percent === percent && previous.max === max && previous.zoomed === nextZoomed && previous.atMax === atMax ? previous : { percent, max, ready: true, zoomed: nextZoomed, atMax });
    });
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
  }, [stageRef, origin, onZoomedChange, hint]);
  return <>
    <p className={styles.help} id={hint}><output aria-label="사진 배율" aria-live="off">{status.percent}%</output><span>휠 또는 두 손가락으로 확대 · 끌어서 이동 · 두 번 눌러 확대/복원</span></p>
    <BottomSheetActions className={styles.actions ?? ""}>
      <GlassButton aria-label="사진 축소" disabled={!status.ready || !status.zoomed} onClick={() => api.current?.zoomOut()}>−</GlassButton>
      <GlassButton aria-label="사진 확대" disabled={!status.ready || status.atMax} onClick={() => api.current?.zoomIn()}>＋</GlassButton>
      <GlassButton aria-label="사진 1.8배 빠른 확대" disabled={!status.ready} onClick={() => api.current?.quick()}>1.8배</GlassButton>
      <GlassButton disabled={!status.ready || !status.zoomed} onClick={() => api.current?.reset()}>화면 맞춤</GlassButton>
    </BottomSheetActions>
  </>;
}
