"use client";

import type { CSSProperties } from "react";

import { Icon } from "@/components/ui/icon";
import { AppBrand } from "./app-brand";
import type { WorkMode } from "./shell-policy";
import styles from "./app-shell-header.module.css";

const MODE_OPTIONS = [
  { value: "customer", label: "거래처" },
  { value: "delivery", label: "학교" },
  { value: "sales", label: "영업" },
  { value: "inventory", label: "재고" },
] as const;

const GLASS_MATERIALS = {
  "--glass-three": 'url("/ui/mode-glass-three-v2.webp")',
  "--glass-four": 'url("/ui/mode-glass-four-v2.webp")',
} as CSSProperties;

export function ShellHeader({ mode, availableModes, onModeChange, onDetailBack }: {
  mode: WorkMode;
  availableModes: readonly WorkMode[];
  onModeChange: (mode: WorkMode) => void;
  onDetailBack?: (() => void) | undefined;
}) {
  const options = MODE_OPTIONS.filter((option) => availableModes.includes(option.value));

  return (
    <header className={`workspace-header ${styles.header}`} data-mode-count={options.length}>
      {onDetailBack ? (
        <button className="workspace-header__back" type="button" onClick={onDetailBack}>
          <Icon name="arrow-left" /><span>학교 목록</span>
        </button>
      ) : <AppBrand />}
      <div className={`workspace-header__controls ${styles.controls}`} style={GLASS_MATERIALS}>
        <div className={styles.modeControl} role="group" aria-label="업무 모드" data-mode-switcher="glass" data-motion="static">
          {options.map((option) => (
            <button
              key={option.value}
              className={styles.modeButton}
              type="button"
              data-mode={option.value}
              aria-pressed={option.value === mode}
              aria-label={option.label}
              onClick={() => { if (option.value !== mode) onModeChange(option.value); }}
            >
              <span className={styles.glassSurface} aria-hidden="true"><span className={styles.glassMaterial} /></span>
              <span className={styles.modeLabel}>{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
