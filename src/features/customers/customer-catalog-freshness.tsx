import { revalidationFreshnessText, type RevalidationFreshness } from "@/lib/revalidation-coordinator";
import styles from "./customer.module.css";

export function CustomerCatalogFreshness({ freshness = "idle", lastSuccessAt = null, onRetry }: {
  freshness?: RevalidationFreshness; lastSuccessAt?: number | null; onRetry?: (() => void) | undefined;
}) {
  const text = revalidationFreshnessText(freshness, lastSuccessAt);
  if (!text) return null;
  return <div className={styles.resultsHeading} data-freshness={freshness} style={{ margin: "8px 2px 0", minHeight: 0, justifyContent: "flex-start" }}>
    <p className={styles.resultCount} role="status">{text}</p>
    {freshness === "stale-error" && onRetry ? <button type="button" className={styles.textButton} onClick={onRetry}>다시 불러오기</button> : null}
  </div>;
}
