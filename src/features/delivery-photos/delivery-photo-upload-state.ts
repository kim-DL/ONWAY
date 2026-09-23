import type { DeliveryPhoto } from "@/domain/delivery-photo";
import type { DeliveryPhotoCreateErrorCategory } from "./delivery-photo-create-repository";

export type DeliveryPhotoUploadStatus = "preparing" | "queued" | "uploading" | "completed" | "failed";

export type DeliveryPhotoUploadProjection = {
  jobId: string;
  requestId: string;
  customerId: string;
  source: DeliveryPhoto["source"];
  status: DeliveryPhotoUploadStatus;
  errorCategory: DeliveryPhotoCreateErrorCategory | "preparation" | null;
  message: string;
  startedAt: number;
  updatedAt: number;
  photoId?: string;
};

export function isActiveDeliveryPhotoUpload(job: DeliveryPhotoUploadProjection | undefined): boolean {
  return !!job && (job.status === "preparing" || job.status === "queued" || job.status === "uploading"
    || job.status === "failed" && job.errorCategory === "retryable");
}

export function deliveryPhotoUploadStatusText(job: DeliveryPhotoUploadProjection): string {
  if (job.status === "preparing") return "사진 준비 중";
  if (job.status === "queued") return "업로드 대기";
  if (job.status === "uploading") return "업로드 중";
  if (job.status === "completed") return "등록 완료";
  return job.message || "사진을 등록하지 못했어요.";
}
