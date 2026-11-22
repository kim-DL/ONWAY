"use client";

import type { ComponentType } from "react";

import { Icon } from "@/components/ui/icon";
import { NoticeBrand } from "@/features/inventory-notices/inventory-notices";
// To restore the original glass appearance, import GlassModeControl as DefaultModeControl.
import { DepthModeControl as DefaultModeControl } from "./depth-mode-control";
import type { WorkMode } from "./shell-policy";
import styles from "./app-shell-header.module.css";

const MODE_OPTIONS = [
  { value: "customer", label: "거래처" },
  { value: "delivery", label: "학교" },
  { value: "sales", label: "영업" },
  { value: "inventory", label: "재고" },
] as const;

export interface ModeControlProps {
  mode: WorkMode;
  options: readonly { value: WorkMode; label: string }[];
  inDetail: boolean;
  onModeChange: (mode: WorkMode) => void;
  onActiveModeClick?: (() => void) | undefined;
}

export function ShellHeader({ mode, availableModes, onModeChange, onDetailBack, onActiveModeClick, ModeControl = DefaultModeControl }: {
  mode: WorkMode;
  availableModes: readonly WorkMode[];
  onModeChange: (mode: WorkMode) => void;
  onDetailBack?: (() => void) | undefined;
  onActiveModeClick?: (() => void) | undefined;
  ModeControl?: ComponentType<ModeControlProps>;
}) {
  const options = MODE_OPTIONS.filter((option) => availableModes.includes(option.value));

  return (
    <header className={`workspace-header ${styles.header}`} data-mode-count={options.length}>
      {onDetailBack ? (
        <button className="workspace-header__back" type="button" onClick={onDetailBack}>
          <Icon name="arrow-left" /><span>학교 목록</span>
        </button>
      ) : <NoticeBrand />}
      <div className={`workspace-header__controls ${styles.controls}`}>
        <ModeControl mode={mode} options={options}
          inDetail={Boolean(onDetailBack)} onModeChange={onModeChange} onActiveModeClick={onActiveModeClick} />
      </div>
    </header>
  );
}
