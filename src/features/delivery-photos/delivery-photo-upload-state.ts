export const MAX_PENDING_PHOTOS_PER_CUSTOMER = 3;
export const MAX_PENDING_PHOTOS_TOTAL = 8;

import type { DeliveryPhoto } from "@/domain/delivery-photo";
import type { DeliveryPhotoCreateErrorCategory } from "./delivery-photo-create-repository";

export type DeliveryPhotoUploadStatus = "persisting" | "preparing" | "queued" | "uploading" | "paused" | "completed" | "failed";

export type DeliveryPhotoUploadProjection = {
  jobId: string;
  requestId: string;
  customerId: string;
  source: DeliveryPhoto["source"];
  status: DeliveryPhotoUploadStatus;
  errorCategory: DeliveryPhotoCreateErrorCategory | "preparation" | "storage" | null;
  message: string;
  startedAt: number;
  updatedAt: number;
  photoId?: string;
  registeredDate?: string;
  durable?: boolean;
  attempts?: number;
  retryAt?: number;
};

export function isActiveDeliveryPhotoUpload(job: DeliveryPhotoUploadProjection | undefined): boolean {
  return !!job && job.status !== "completed" && job.errorCategory !== "auth"
    && !(job.status === "failed" && job.errorCategory === "preparation" && job.durable === false);
}

export function deliveryPhotoUploadStatusText(job: DeliveryPhotoUploadProjection): string {
  if (job.status === "persisting") return "기기에 보관 중";
  if (job.status === "paused") return job.message || "이전 날짜 사진 · 날짜 확인 후 전송해주세요";
  if (job.status === "preparing") return "사진 준비 중";
  if (job.status === "queued") return "등록 대기 중";
  if (job.status === "uploading") return "사진 등록 중";
  if (job.status === "completed") return "✓ 저장 완료";
  return job.message || "사진을 등록하지 못했어요.";
}
