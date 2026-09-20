"use client";

import { useRef, useState, useSyncExternalStore } from "react";

import { BottomSheet, useBottomSheetClose } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { AppBrand } from "./app-brand";
import { useHeaderMotionPreference } from "./header-motion-preference";
import type { WorkMode } from "./shell-policy";
import styles from "./app-shell-header.module.css";

const MODE_OPTIONS = [
  { value: "customer", label: "거래처", icon: "building", description: "거래처 정보 · 납품 안내" },
  { value: "delivery", label: "학교납품", icon: "home", description: "학교 정보 · 납품 안내" },
  { value: "sales", label: "영업/홍보", icon: "sparkles", description: "담당 학교 · 방문 기록" },
  { value: "inventory", label: "재고", icon: "clipboard", description: "입출고 · 재고조사" },
] as const;

function ModePickerOptions({ options, mode, selecting, onSelect }: {
  options: readonly (typeof MODE_OPTIONS)[number][];
  mode: WorkMode;
  selecting: boolean;
  onSelect: (mode: WorkMode, requestClose: (() => void) | null) => void;
}) {
  const requestClose = useBottomSheetClose();
  return <div className={styles.pickerList} role="group" aria-label="업무 모드" aria-busy={selecting || undefined}>
    {options.map((option) => <button key={option.value} className={styles.pickerOption} type="button"
      data-mode={option.value} aria-pressed={option.value === mode} disabled={selecting}
      onClick={() => onSelect(option.value, requestClose)}>
      <span className={styles.optionIcon}><Icon name={option.icon} size={22} /></span>
      <span className={styles.optionCopy}><strong>{option.label}</strong><span>{option.description}</span></span>
      {option.value === mode ? <span className={styles.currentMarker}><Icon name="check" size={16} /><span>현재</span></span> : <Icon name="chevron-right" className={styles.optionChevron} size={18} />}
    </button>)}
  </div>;
}

const pageIsHidden = () => document.visibilityState !== "visible";
const hiddenBeforeHydration = () => true;
function subscribeToPageVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

export function ShellHeader({ mode, availableModes, onModeChange, onDetailBack }: {
  mode: WorkMode;
  availableModes: readonly WorkMode[];
  onModeChange: (mode: WorkMode) => void;
  onDetailBack?: (() => void) | undefined;
}) {
  const { paused } = useHeaderMotionPreference();
  const hidden = useSyncExternalStore(subscribeToPageVisibility, pageIsHidden, hiddenBeforeHydration);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const pendingMode = useRef<WorkMode | null>(null);
  const options = MODE_OPTIONS.filter((option) => availableModes.includes(option.value));
  const currentOption = options.find((option) => option.value === mode) ?? options[0];
  const motion = paused || hidden ? "paused" : "running";
  const closePicker = () => {
    const nextMode = pendingMode.current;
    pendingMode.current = null;
    setPickerOpen(false);
    setSelecting(false);
    // Finish the sheet's Back event before AppShell writes the chosen mode.
    // Otherwise its own popstate listener could restore the previous mode.
    if (nextMode) queueMicrotask(() => onModeChange(nextMode));
  };
  const selectMode = (nextMode: WorkMode, requestClose: (() => void) | null) => {
    if (pendingMode.current || !availableModes.includes(nextMode)) return;
    pendingMode.current = nextMode;
    setSelecting(true);
    if (requestClose) requestClose();
    else closePicker();
  };
  return (
    <header className={`workspace-header ${styles.header}`} data-mode-count={options.length}>
      {onDetailBack ? (
        <button className="workspace-header__back" type="button" onClick={onDetailBack}>
          <Icon name="arrow-left" /><span>학교 목록</span>
        </button>
      ) : <AppBrand />}
      <div className={`workspace-header__controls ${styles.controls}`}>
        {options.length > 1 && currentOption ? (
          <>
          <div className={`${styles.modeFrame} ${styles.segmentedFrame}`} data-mode-switcher="segmented" data-motion={motion}>
            <div className={`mode-control ${styles.modeControl}`} role="group" aria-label="업무 모드" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
              {options.map((option) => (
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
          <div className={`${styles.modeFrame} ${styles.compactFrame}`} data-mode-switcher="compact" data-motion={motion}>
            <button className={styles.modeTrigger} type="button" data-mode={currentOption.value}
              aria-label={`업무 모드 변경, 현재 ${currentOption.label}`} aria-haspopup="dialog" aria-expanded={pickerOpen}
              onClick={() => setPickerOpen(true)}>
              <span className={styles.triggerIcon}><Icon name={currentOption.icon} size={19} /></span>
              <span className={styles.triggerCopy}><small>모드 전환</small><span key={currentOption.value} className={styles.currentLabel}>{currentOption.label}</span></span>
              <Icon name="chevron-right" className={styles.triggerChevron} size={16} />
            </button>
          </div>
          </>
        ) : (
          <span className={`mode-label ${styles.singleMode}`} data-mode={mode}>
            <i aria-hidden="true" />{MODE_OPTIONS.find((option) => option.value === mode)?.label} 모드
          </span>
        )}
      </div>
      {pickerOpen && options.length > 1 ? <BottomSheet open title="업무 모드 선택" onClose={closePicker}>
        <ModePickerOptions options={options} mode={mode} selecting={selecting} onSelect={selectMode} />
      </BottomSheet> : null}
    </header>
  );
}
