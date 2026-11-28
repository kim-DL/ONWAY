import { useEffect, useRef, type PointerEvent } from "react";
import { Icon } from "@/components/ui/icon";
import styles from "./camera.module.css";

export function ScanShutter({ live, disabled, onCapture, onHold }: {
  live: boolean; disabled: boolean; onCapture: () => void; onHold: (progress: number) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const hold = useRef<{ pointer: number; frame: number } | null>(null);
  const skipClick = useRef(false);
  function stop() {
    if (hold.current) cancelAnimationFrame(hold.current.frame);
    hold.current = null;
    button.current?.style.removeProperty("--hold-angle");
    button.current?.removeAttribute("data-holding");
  }
  useEffect(() => {
    const cancel = () => { skipClick.current = true; stop(); };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", cancel);
    return () => { stop(); window.removeEventListener("blur", cancel); document.removeEventListener("visibilitychange", cancel); };
  }, [disabled, live]);

  function begin(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || hold.current) return;
    skipClick.current = false;
    if (!live || disabled) return;
    const el = event.currentTarget;
    el.setPointerCapture(event.pointerId);
    const start = performance.now();
    const state = { pointer: event.pointerId, frame: 0 };
    hold.current = state;
    function step(now: number) {
      if (hold.current !== state || document.hidden) return;
      const elapsed = now - start;
      if (elapsed >= 180) {
        const progress = Math.min(1, (elapsed - 180) / 500);
        el.dataset.holding = "true";
        el.style.setProperty("--hold-angle", (progress * 360) + "deg");
        onHold(progress);
        if (progress === 1) { skipClick.current = true; stop(); onCapture(); return; }
      }
      state.frame = requestAnimationFrame(step);
    }
    state.frame = requestAnimationFrame(step);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    if (hold.current?.pointer !== event.pointerId) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) {
      skipClick.current = true; stop();
    }
  }
  return <button ref={button} type="button" className={styles.shutter} disabled={disabled}
    aria-label={live ? "사진 촬영" : "기기 카메라로 촬영"} onPointerDown={begin} onPointerMove={move}
    onPointerUp={event => {
      if (hold.current?.pointer !== event.pointerId) return;
      if (event.currentTarget.dataset.holding) skipClick.current = true;
      stop();
    }}
    onPointerCancel={() => { skipClick.current = true; stop(); }}
    onLostPointerCapture={() => { if (hold.current) { skipClick.current = true; stop(); } }}
    onContextMenu={event => { if (live) event.preventDefault(); }}
    onClick={event => { if (!skipClick.current || event.detail === 0) onCapture(); skipClick.current = false; }}>
    <span className={styles.shutterRing}><Icon name="camera" size={25} /></span><span>{live ? "촬영" : "기기 카메라"}</span>
  </button>;
}
