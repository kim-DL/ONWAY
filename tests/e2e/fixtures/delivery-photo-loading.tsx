import { createRoot } from "react-dom/client";
import { LoadingStatus } from "../../../src/components/ui/loading-status";
import styles from "../../../src/features/delivery-photos/photo.module.css";

createRoot(document.getElementById("root")!).render(<main className={styles.workspace}>
  <LoadingStatus className={styles.empty} label="오늘 납품처 불러오는 중" detail="오늘 납품 기록을 확인하고 있습니다." />
  <LoadingStatus className={styles.freshness} label="최신 목록 확인 중" detail="오늘 납품 기록을 확인하고 있습니다." />
</main>);
