"use client";

import { type ReactNode } from "react";
import { cn } from "./cn";
import { LoadingIndicator } from "./loading-indicator";
import { useLoadingStage } from "./use-loading-stage";
import styles from "./loading.module.css";

interface LoadingStatusProps {
  as?: "div" | "span";
  label: ReactNode;
  detail?: string | undefined;
  /** Buttons may already contain their own decorative indicator. */
  indicator?: boolean;
  className?: string | undefined;
  startedAt?: number | undefined;
}

export function LoadingStatus({ as: Element = "div", label, detail, indicator = true, className, startedAt }: LoadingStatusProps) {
  const stage = useLoadingStage(startedAt);
  return (
    <Element className={cn(styles.status, className)} role="status" aria-live="polite" data-loading-status>
      <span className={styles.label}>{label}</span>
      {indicator ? <LoadingIndicator decorative startedAt={startedAt} /> : null}
      {detail && stage === 2 ? <span className={styles.detail}>{detail}</span> : null}
    </Element>
  );
}
