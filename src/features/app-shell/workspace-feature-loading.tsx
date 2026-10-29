"use client";

import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { LoadingStatus } from "@/components/ui/loading-status";
import { useInitialWorkspaceStartedAt } from "./initial-workspace-timing";
import styles from "./workspace-feature-loading.module.css";

type LoadingMode = "customer" | "inventory" | "sales" | "activity" | "delivery" | "detail";

const labels: Record<LoadingMode, string> = {
  customer: "거래처 화면 여는 중",
  inventory: "재고 화면 여는 중",
  sales: "영업 화면 여는 중",
  activity: "업무 목록 여는 중",
  delivery: "납품사진 화면 여는 중",
  detail: "학교 정보 여는 중",
};

/** Public shapes only: the authenticated shell owns navigation and access. */
export function WorkspaceFeatureLoading({ mode, label = labels[mode] }: { mode: LoadingMode; label?: string }) {
  const startedAt = useInitialWorkspaceStartedAt();
  return <section className={`shell-page ${styles.workspace}`} aria-label={label} data-workspace-loading={mode}>
    <div className={styles.heading} aria-hidden="true"><LoadingSkeleton kind="text" /><LoadingSkeleton kind="text" /></div>
    {mode === "inventory" || mode === "activity" ? <div className={styles.filters} aria-hidden="true">
      <LoadingSkeleton kind="text" /><LoadingSkeleton kind="text" /><LoadingSkeleton kind="text" />
    </div> : null}
    {mode === "customer" || mode === "inventory" ? <LoadingSkeleton kind="text" className={styles.search} /> : null}
    {mode === "sales" ? <LoadingSkeleton kind="card" className={styles.summary} /> : null}
    {mode === "detail" ? <div className={styles.detail} aria-hidden="true"><LoadingSkeleton kind="photo" /><LoadingSkeleton kind="card" /></div> :
      <div className={styles.rows} aria-hidden="true">{[0, 1, 2].map((row) => <div className={styles.row} key={row}>
        {mode === "customer" || mode === "delivery" ? <LoadingSkeleton kind="photo" className={styles.thumbnail} /> : null}
        <div className={styles.copy}><LoadingSkeleton kind="text" /><LoadingSkeleton kind="text" /></div>
        {mode === "inventory" ? <LoadingSkeleton kind="text" className={styles.quantity} /> : null}
      </div>)}</div>}
    <LoadingStatus label={label} detail="필요한 화면을 불러오고 있습니다." startedAt={startedAt} />
  </section>;
}
