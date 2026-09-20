"use client";

import { cn } from "./cn";
import { useMotionAllowed } from "./use-motion-permission";
import styles from "./onnuri-loader.module.css";

interface OnnuriLoaderProps {
  size?: "small" | "medium" | "large";
  tone?: "auto" | "delivery" | "customer" | "sales" | "inherit";
  label?: string;
  /** Use when a nearby status region already announces the pending operation. */
  decorative?: boolean;
  className?: string;
}

const pieces = (
  <>
    <span className={styles.piece} data-loader-piece="first" />
    <span className={styles.piece} data-loader-piece="second" />
    <span className={styles.piece} data-loader-piece="third" />
    <span className={styles.piece} data-loader-piece="fourth" />
  </>
);

/** Actual pending work only. This is separate from the welcome cloud artwork. */
export function OnnuriLoader({ size = "medium", tone = "auto", label = "불러오는 중", decorative = false, className }: OnnuriLoaderProps) {
  const motionAllowed = useMotionAllowed();
  return <span className={cn(styles.loader, className)} data-onnuri-loader data-size={size} data-tone={tone}
    data-motion={motionAllowed ? "running" : "paused"} role={decorative ? undefined : "status"}
    aria-label={decorative ? undefined : label} aria-hidden={decorative || undefined}>
    <span className={styles.mark} aria-hidden="true">{pieces}</span>
  </span>;
}
