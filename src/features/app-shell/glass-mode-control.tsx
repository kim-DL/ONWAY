"use client";

import type { CSSProperties } from "react";

import type { ModeControlProps } from "./app-shell-header";
import styles from "./glass-mode-control.module.css";

const GLASS_MATERIALS = {
  "--glass-three": 'url("/ui/mode-glass-three-v2.webp")',
  "--glass-four": 'url("/ui/mode-glass-four-v2.webp")',
} as CSSProperties;

export function GlassModeControl({ mode, options, onModeChange, onActiveModeClick }: ModeControlProps) {
  return (
    <div className={styles.glassModeControl} style={GLASS_MATERIALS}
      role="group" aria-label="업무 모드" data-mode-switcher="glass" data-motion="static">
      {options.map(option => (
        <button
          key={option.value}
          className={styles.modeButton}
          type="button"
          data-mode={option.value}
          aria-pressed={option.value === mode}
          aria-label={option.label}
          onClick={() => { if (option.value !== mode) onModeChange(option.value); else onActiveModeClick?.(); }}
        >
          <span className={styles.glassSurface} aria-hidden="true"><span className={styles.glassMaterial} /></span>
          <span className={styles.modeLabel}>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
