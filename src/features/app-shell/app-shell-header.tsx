"use client";

import { Icon } from "@/components/ui/icon";
import { AppBrand } from "./app-brand";
import { useHeaderMotionPreference } from "./header-motion-preference";
import type { WorkMode } from "./shell-policy";
import styles from "./app-shell-header.module.css";

const MODE_OPTIONS = [
  { value: "delivery", label: "납품" },
  { value: "sales", label: "영업" },
] as const;

export function ShellHeader({ mode, availableModes, onModeChange, onDetailBack }: {
  mode: WorkMode;
  availableModes: readonly WorkMode[];
  onModeChange: (mode: WorkMode) => void;
  onDetailBack?: (() => void) | undefined;
}) {
  const { paused } = useHeaderMotionPreference();
  return (
    <header className={`workspace-header ${styles.header}`}>
      {onDetailBack ? (
        <button className="workspace-header__back" type="button" onClick={onDetailBack}>
          <Icon name="arrow-left" /><span>학교 목록</span>
        </button>
      ) : <AppBrand />}
      <div className={`workspace-header__controls ${styles.controls}`}>
        {availableModes.length > 1 ? (
          <div className={styles.modeFrame} data-motion={paused ? "paused" : "running"}>
            <div className={`mode-control ${styles.modeControl}`} role="group" aria-label="업무 모드">
              {MODE_OPTIONS.filter((option) => availableModes.includes(option.value)).map((option) => (
                <button
                  key={option.value}
                  className={styles.modeButton}
                  type="button"
                  data-mode={option.value}
                  aria-pressed={option.value === mode}
                  onClick={() => onModeChange(option.value)}
                >{option.label}</button>
              ))}
            </div>
          </div>
        ) : (
          <span className={`mode-label ${styles.singleMode}`} data-mode={mode}>
            <i aria-hidden="true" />{mode === "delivery" ? "납품 모드" : "영업 모드"}
          </span>
        )}
      </div>
    </header>
  );
}
