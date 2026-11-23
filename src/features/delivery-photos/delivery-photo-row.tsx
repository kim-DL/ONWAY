"use client";
import { Icon } from "@/components/ui/icon";
import type { Customer } from "@/domain/customer";
import { useId, type ReactNode } from "react";
import { deliveryPhotoCaptureHints, type DeliveryPhotoCaptureBlock } from "./delivery-photo-capture-hint";
import { deliveryPhotoUploadStatusText, type DeliveryPhotoUploadProjection } from "./delivery-photo-upload-state";
import styles from "./photo.module.css";

export function DeliveryPhotoRow({ customer, count = 0, latestAt, job, attention, onShowJob, pendingCount = 0, blocked, inToday, onView, onCapture, onMore, onRetry, directions }: {
  customer: Customer; count?: number | undefined; latestAt?: string | undefined; job?: DeliveryPhotoUploadProjection | undefined;
  pendingCount?: number | undefined; blocked: DeliveryPhotoCaptureBlock | null;
  attention?: DeliveryPhotoUploadProjection | undefined; onShowJob?: (id: string) => void; directions?: ReactNode;
  inToday?: boolean | undefined;
  onView: (customer: Customer) => void; onCapture: (customer: Customer) => void; onMore: (customer: Customer) => void; onRetry?: ((jobId: string) => void) | undefined;
}) {
  const password = customer.accessPasswordState === "registered" && customer.accessPassword;
  const place = customer.administrativeDong;
  const customerSecondary = password ? `${place}${place ? " · " : ""}출입비번 ${password}` : place;
  const time = latestAt ? new Date(Date.parse(latestAt) + 9 * 60 * 60 * 1_000).toISOString().slice(11, 16) : "";
  const hintId = useId();
  const status = job && job.status !== "completed" && job.jobId !== attention?.jobId ? deliveryPhotoUploadStatusText(job) : null;
  const photoSummary = count ? `사진 ${count}장${time ? ` · 마지막 등록 ${time}` : ""}` : "사진 기록";
  return <li className={styles.row}><div className={styles.photoMain}>
    <button type="button" className={styles.rowText} onClick={() => onView(customer)} aria-label={`${customer.name} 사진 기록`}>
      <strong>{customer.name}</strong>
      <span className={styles.rowMeta}>
        {customerSecondary && <small>{customerSecondary}</small>}
        <span className={styles.photoHistory}><Icon name="images" size={14} />{photoSummary}</span>
      </span>
    </button>
    {status && <p className={styles.uploadState}>{status}{pendingCount > 1 && !blocked && ` · 대기 ${pendingCount}장`}</p>}
    {attention && <p className={styles.uploadState}>{deliveryPhotoUploadStatusText(attention)}</p>}
    {blocked && <p id={hintId} className={styles.captureHint}>{deliveryPhotoCaptureHints[blocked]}</p>}
    {attention && (onRetry ? <button type="button" className={styles.recovery} onClick={() => onRetry(attention.jobId)}
      aria-label={`${customer.name} 사진 업로드 다시 시도`}>다시 시도</button>
      : onShowJob && <button type="button" className={styles.recovery} onClick={() => onShowJob(attention.jobId)}>
        {attention.status === "paused" ? "날짜 확인 필요" : attention.errorCategory === "storage" ? "보관 상태 확인" : "사진 상태 확인"}
      </button>)}
    {directions}
    {inToday && <span className={styles.inToday}><Icon name="check" size={13} />오늘 목록</span>}
  </div><div className={styles.photoActions}>
    <button type="button" data-camera-customer={customer.customerId} className={styles.photoPrimary} aria-label={`${customer.name} 카메라 촬영`} disabled={Boolean(blocked)} aria-describedby={blocked ? hintId : undefined}
      onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); onCapture(customer); }}>
      {/* Reuse the pre-sized static WebP without an image transformation service. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/ui/customer-ceramic-camera-v1.webp" alt="" width={40} height={40} /></button>
    <button type="button" aria-label={`${customer.name} 더보기`} aria-haspopup="dialog"
      onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); onMore(customer); }}><Icon name="more-refined" size={20} /></button>
  </div>
  </li>;
}


export default DeliveryPhotoRow;
