"use client";

import { type CSSProperties, useState } from "react";
import { cn } from "./cn";
import { LOADING_INDICATOR_DELAY } from "./loading-timing";
import { useLoadingStage } from "./use-loading-stage";
import { useMotionAllowed } from "./use-motion-permission";
import styles from "./loading.module.css";

export interface LoadingIndicatorProps {
  size?: "small" | "medium" | "large";
  tone?: "auto" | "delivery" | "customer" | "sales" | "inherit";
  variant?: "linear" | "circular";
  label?: string;
  /** Nearby text already announces the operation. */
  decorative?: boolean;
  className?: string | undefined;
  /** Milliseconds since Unix epoch; share this for one operation's fallbacks. */
  startedAt?: number | undefined;
}

export function LoadingIndicator({
  size = "medium", tone = "auto", variant = size === "small" ? "circular" : "linear",
  label = "불러오는 중", decorative = false, className, startedAt,
}: LoadingIndicatorProps) {
  const [mountedAt] = useState(Date.now);
  const stage = useLoadingStage(startedAt);
  const motionAllowed = useMotionAllowed();
  const offset = startedAt === undefined ? 0 : Math.min(0, startedAt + LOADING_INDICATOR_DELAY - mountedAt);
  return (
    <span className={cn(styles.indicator, className)} data-loading-indicator
      style={stage > 0 && offset ? { "--loading-offset": `${offset}ms` } as CSSProperties : undefined}
      data-size={size} data-tone={tone} data-variant={variant} data-visible={stage > 0}
      data-motion={stage > 0 && motionAllowed ? "running" : "paused"}
      role={decorative ? undefined : "status"} aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}>
      <span className={styles.track} data-loading-track aria-hidden="true"><span className={styles.segment} data-loading-segment /></span>
    </span>
  );
}
