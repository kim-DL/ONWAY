"use client";

/* eslint-disable @next/next/no-img-element -- Camera previews use local revocable Blob URLs, never remote downloads. */
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { DeliveryPhotoUploadCoordinator } from "./delivery-photo-upload-memory";
import { deliveryPhotoUploadStatusText, isActiveDeliveryPhotoUpload, type DeliveryPhotoUploadProjection } from "./delivery-photo-upload-state";
import styles from "./delivery-photo-upload-panel.module.css";
const DeliveryPhotoLocalPreview = dynamic(() => import("./delivery-photo-local-preview").then((module) => module.DeliveryPhotoLocalPreview), { ssr: false });

export default function DeliveryPhotoUploadPanel({ coordinator, jobs, names }: {
  coordinator: DeliveryPhotoUploadCoordinator; jobs: readonly DeliveryPhotoUploadProjection[]; names: ReadonlyMap<string, { name: string }>;
}) {
  const [viewed, setViewed] = useState<{ jobId: string; origin: HTMLElement } | null>(null);
  useEffect(() => {
    const removed = (event: Event) => {
      for (const job of coordinator.getSnapshot()) if (job.photoId === (event as CustomEvent<string>).detail) coordinator.dismiss(job.jobId);
    };
    window.addEventListener("onnuriway:delivery-photo-removed", removed);
    return () => window.removeEventListener("onnuriway:delivery-photo-removed", removed);
  }, [coordinator]);
  const preview = viewed ? coordinator.getPreview(viewed.jobId) : null;
  const shown = [...jobs].reverse();
  const pending = jobs.some(isActiveDeliveryPhotoUpload);
  return <section className={styles.panel} aria-label="촬영 사진과 저장 상태">
    <h2>촬영 사진 · 저장 상태</h2>
    <p>미리보기를 눌러 크게 확인하세요. 저장 중에도 거래처별 3장까지 촬영할 수 있어요.</p>
    {pending ? <p>미전송 사진은 이 기기에 임시 보관되며, 로그아웃하면 삭제됩니다.</p> : null}
    <ul className={styles.list}>{shown.map((job, index) => {
      const image = coordinator.getPreview(job.jobId);
      const retryable = coordinator.canRetry(job.jobId);
      return <li key={job.jobId} className={styles.card} data-photo-job-status={job.status}>
        {image ? <button type="button" className={styles.preview} onClick={(event) => setViewed({ jobId: job.jobId, origin: event.currentTarget })} aria-label={`촬영 사진 ${index + 1} 크게 보기`}>
          <img src={image.thumbnail} alt={`${names.get(job.customerId)?.name ?? "납품처"} 촬영 미리보기`} width={160} height={120} />
        </button> : <div className={styles.placeholder}>{job.status === "failed" ? "미리보기 없음" : "미리보기 준비 중"}</div>}
        <div className={styles.status}><strong>{names.get(job.customerId)?.name ?? "납품처"}</strong>
          <span role={job.status === "failed" ? "alert" : "status"}>{deliveryPhotoUploadStatusText(job)}</span>
          {job.status === "completed" && job.registeredDate ? <small>서버 등록일 {job.registeredDate}</small> : null}
          {job.durable && job.status !== "completed" ? <small>사진은 이 기기에 보관 중이에요.</small> : null}
          {retryable ? <button type="button" onClick={() => { void coordinator.retry(job.jobId); }}>{job.status === "paused" ? "날짜 확인 후 전송" : job.errorCategory === "storage" ? "보관 다시 시도" : "다시 시도"}</button> : null}
          {job.status === "failed" || job.status === "paused" ? <button type="button" onClick={() => {
            if (window.confirm("이 기기에 보관된 대기 사진을 버릴까요? 이미 저장된 사진 기록은 유지됩니다.")) coordinator.dismiss(job.jobId);
          }}>대기 사진 버리기</button> : null}
        </div>
      </li>;
    })}</ul>
    {preview && viewed ? <DeliveryPhotoLocalPreview key={viewed.jobId} url={preview.full} origin={viewed.origin} onClose={() => setViewed(null)} /> : null}
  </section>;
}
