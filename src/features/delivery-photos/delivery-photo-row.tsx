"use client";
import { Icon } from "@/components/ui/icon";
import type { Customer } from "@/domain/customer";
import { MAX_PENDING_PHOTOS_PER_CUSTOMER, deliveryPhotoUploadStatusText, type DeliveryPhotoUploadProjection } from "./delivery-photo-upload-state";
import styles from "./photo.module.css";

export function DeliveryPhotoRow({ customer, count = 0, latestAt, job, retryJob, pendingCount = 0, uploadReady, captureAllowed = true, inToday, onAdd, onView, onCapture, onMore, onRetry }: {
  customer: Customer; count?: number | undefined; latestAt?: string | undefined; job?: DeliveryPhotoUploadProjection | undefined; retryJob?: DeliveryPhotoUploadProjection | undefined;
  pendingCount?: number | undefined; captureAllowed?: boolean | undefined;
  inToday?: boolean | undefined; onAdd?: ((customerId: string) => void) | undefined;
  uploadReady: boolean; onView: (customer: Customer) => void; onCapture: (customer: Customer) => void; onMore: (customer: Customer) => void; onRetry: (jobId: string) => void;
}) {
  const password = customer.accessPasswordState === "registered" && customer.accessPassword;
  const place = customer.administrativeDong;
  const customerSecondary = password ? `${place}${place ? " · " : ""}출입비번 ${password}` : place;
  const time = latestAt ? new Date(Date.parse(latestAt) + 9 * 60 * 60 * 1_000).toISOString().slice(11, 16) : "";
  const status = job && job.status !== "completed" && deliveryPhotoUploadStatusText(job);
  const active = !uploadReady || !captureAllowed || pendingCount >= MAX_PENDING_PHOTOS_PER_CUSTOMER;
  const photoSummary = count && `사진 ${count}장${time ? ` · 마지막 등록 ${time}` : ""}`;
  const detail = pendingCount ? `${pendingCount}장 전송 대기·진행 중` : status || photoSummary;
  return <li className={styles.row}><div className={styles.photoMain}>
    <button type="button" className={styles.rowText} onClick={() => onView(customer)} aria-label={`${customer.name} 사진 기록`}>
      <strong>{customer.name}</strong>
      {customerSecondary ? <small>{customerSecondary}</small> : null}
      {detail ? <small role={job?.status === "failed" ? "alert" : status ? "status" : undefined}>{detail}</small> : null}
    </button>
    {retryJob ? <button type="button" onClick={() => onRetry(retryJob.jobId)} aria-label={`${customer.name} 사진 업로드 다시 시도`}>재시도</button> : null}
    <button type="button" className={styles.photoPrimary} aria-label={`${customer.name} 카메라 촬영`} disabled={active}
      onClick={() => onCapture(customer)}><Icon name="camera" size={24} /></button>
    <button type="button" className={styles.photoMore} aria-label={`${customer.name} 더보기`} aria-haspopup="dialog"
      onClick={() => onMore(customer)}>⋯</button>
  </div>
    {onAdd ? <div className={styles.searchSupplement}>
      {inToday ? <span className={styles.inToday}>오늘 목록</span> : <button type="button" onClick={() => onAdd(customer.customerId)}>오늘 추가</button>}
    </div> : null}
  </li>;
}


export default DeliveryPhotoRow;
