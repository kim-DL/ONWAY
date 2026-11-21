"use client";

import { useEffect, useEffectEvent, useState } from "react";

import { DepthSurfaceButton } from "@/components/ui/depth-surface-button";
import type { ModeControlProps } from "./app-shell-header";
import type { WorkMode } from "./shell-policy";
import styles from "./depth-mode-control.module.css";

const PRESS_FEEDBACK_MS = 160;

interface ModePress {
  from: WorkMode;
  to: WorkMode;
  inDetail: boolean;
}

export function DepthModeControl({ mode, options, inDetail, onModeChange, onActiveModeClick }: ModeControlProps) {
  const [pending, setPending] = useState<ModePress | null>(null);

  function activate(target: WorkMode) {
    if (target !== mode) onModeChange(target);
    else onActiveModeClick?.();
  }

  const finishPress = useEffectEvent((press: ModePress) => {
    if (pending !== press) return;
    setPending(null);
    if (press.from === mode && press.inDetail === inDetail && options.some(option => option.value === press.to)) {
      activate(press.to);
    }
  });

  useEffect(() => {
    if (!pending) return;
    let timer: number | undefined;
    // Start the hold once the browser can paint the pressed surface.
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => finishPress(pending), PRESS_FEEDBACK_MS);
    });
    const stop = () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
    const cancelForHistory = () => {
      stop();
      setPending(null);
    };
    window.addEventListener("popstate", cancelForHistory);
    return () => {
      stop();
      window.removeEventListener("popstate", cancelForHistory);
    };
  }, [pending]);

  function chooseMode(target: WorkMode) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPending(null);
      activate(target);
    } else if (target === mode && !onActiveModeClick) {
      setPending(null);
    } else {
      setPending(current => current?.from === mode && current.to === target && current.inDetail === inDetail
        ? current : { from: mode, to: target, inDetail });
    }
  }

  return (
    <div className={styles.depthModeControl} role="group" aria-label="업무 모드" data-mode-switcher="depth" data-motion="static">
      {options.map(option => (
        <DepthSurfaceButton
          key={option.value}
          data-mode={option.value}
          aria-pressed={option.value === mode}
          aria-label={option.label}
          data-press-feedback={pending?.from === mode && pending.to === option.value && pending.inDetail === inDetail ? "" : undefined}
          onClick={() => chooseMode(option.value)}
        >
          <span className={styles.label}>{option.label}</span>
        </DepthSurfaceButton>
      ))}
    </div>
  );
}
