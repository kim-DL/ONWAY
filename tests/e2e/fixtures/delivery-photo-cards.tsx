import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { Customer } from "../../../src/domain/customer";
import { DeliveryPhotoMoreMenu } from "../../../src/features/delivery-photos/delivery-photo-more-menu";
import { DeliveryPhotoRow } from "../../../src/features/delivery-photos/delivery-photo-row";
import type { DeliveryPhotoUploadProjection } from "../../../src/features/delivery-photos/delivery-photo-upload-state";
import styles from "../../../src/features/delivery-photos/photo.module.css";
import { customers } from "./customer-ceramic-data";

const examples = [
  { ...customers[0]!, name: "새봄 급식", administrativeDong: "둔산동" },
  { ...customers[1]!, name: "햇살 가득한 어린이 급식센터 별관", administrativeDong: "갈마동", accessPassword: "1234*", accessPasswordState: "registered" as const },
  { ...customers[2]!, name: "온유 식당", administrativeDong: "탄방동" },
  { ...customers[3]!, name: "도담 학교", administrativeDong: "월평동" },
  { ...customers[4]!, name: "아침 공장", administrativeDong: "중촌동" },
];
const failed: DeliveryPhotoUploadProjection = { jobId: "retry-photo", requestId: "synthetic-request", customerId: examples[2]!.customerId,
  source: "camera", status: "failed", errorCategory: "retryable", message: "연결을 확인한 뒤 다시 시도해주세요.", startedAt: 1, updatedAt: 2, durable: true };

function Cards() {
  const [events, setEvents] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [more, setMore] = useState<Customer | null>(null);
  const record = (action: string, customerId: string) => setEvents(current => [...current, `${action}:${customerId}`]);
  return <div className="workspace-shell" data-mode="customer">
    <main className={styles.workspace} data-delivery-photo-workspace>
      <header className={styles.header}><h1>납품사진</h1></header>
      <label className={styles.search}><span className={styles.srOnly}>납품사진 거래처 검색</span><input aria-label="납품사진 거래처 검색" value="" readOnly placeholder="거래처 검색 · 초성" /></label>
      <h2 style={{ fontSize: "1rem" }}>검색 결과</h2>
      <ul className={styles.list} aria-label="검색된 납품처">
        {examples.map((customer, index) => <DeliveryPhotoRow key={customer.customerId} customer={customer}
          count={index === 1 ? 2 : 0} latestAt={index === 1 ? "2026-11-04T02:26:00.000Z" : undefined}
          uploadReady={index !== 4} inToday={index === 3 || added.includes(customer.customerId)}
          pendingCount={index === 3 ? 3 : 0} job={index === 2 ? failed : undefined} retryJob={index === 2 ? failed : undefined}
          onAdd={id => { setAdded(current => [...current, id]); record("add", id); }}
          onView={value => record("history", value.customerId)} onCapture={value => record("camera", value.customerId)}
          onMore={value => { record("more", value.customerId); setMore(value); }} onRetry={id => record("retry", id)} />)}
      </ul>
      <output aria-label="동작 기록" style={{ display: "block", fontSize: ".75rem", overflowWrap: "anywhere", paddingTop: 16 }}>{events.join("\n")}</output>
      {more ? <DeliveryPhotoMoreMenu customer={more} albumDisabled={more.customerId === examples[4]!.customerId}
        onAlbum={value => record("album", value.customerId)} onOpenCustomerDetail={id => record("detail", id)}
        onClose={() => setMore(null)} className={styles.moreActions} /> : null}
    </main>
  </div>;
}

createRoot(document.getElementById("root")!).render(<Cards />);
