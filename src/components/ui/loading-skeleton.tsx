import { cn } from "./cn";
import styles from "./loading.module.css";

interface LoadingSkeletonProps {
  kind?: "row" | "card" | "photo" | "text";
  className?: string | undefined;
}

/** Reserves the content's shape without adding another animation or live region. */
export function LoadingSkeleton({ kind = "row", className }: LoadingSkeletonProps) {
  return (
    <div className={cn(styles.skeleton, className)} data-loading-skeleton={kind} aria-hidden="true">
      {kind === "row" || kind === "card" ? <i className={styles.placeholderMark} /> : null}
      {kind === "row" || kind === "card" ? <div className={styles.placeholderCopy}><i /><i /></div> : null}
    </div>
  );
}
