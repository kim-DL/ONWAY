import { describe, expect, it } from "vitest";

import { deliveryPhotoUploadStatusText, isActiveDeliveryPhotoUpload, type DeliveryPhotoUploadProjection } from "./delivery-photo-upload-state";

describe("memory-only delivery photo upload state", () => {
  const job = (status: DeliveryPhotoUploadProjection["status"], errorCategory: DeliveryPhotoUploadProjection["errorCategory"] = null): DeliveryPhotoUploadProjection => ({
    jobId: "job", requestId: "request", customerId: "a", source: "camera", status, errorCategory,
    message: status === "failed" ? "network" : "", startedAt: 1, updatedAt: 2,
  });

  it("labels preparation, queue, relay, completion and failure without fake progress", () => {
    expect(["preparing", "queued", "uploading", "completed"].map((status) => deliveryPhotoUploadStatusText(job(status as DeliveryPhotoUploadProjection["status"])))).toEqual([
      "사진 준비 중", "등록 대기 중", "사진 등록 중", "✓ 저장 완료",
    ]);
    expect(deliveryPhotoUploadStatusText(job("failed", "retryable"))).toBe("network");
  });

  it("retains failed photos in the capacity limit until explicitly removed and keeps the projection payload-free", () => {
    expect(isActiveDeliveryPhotoUpload(job("preparing"))).toBe(true);
    expect(isActiveDeliveryPhotoUpload(job("queued"))).toBe(true);
    expect(isActiveDeliveryPhotoUpload(job("uploading"))).toBe(true);
    expect(isActiveDeliveryPhotoUpload(job("failed", "retryable"))).toBe(true);
    expect(isActiveDeliveryPhotoUpload(job("failed", "input"))).toBe(true);
    expect(isActiveDeliveryPhotoUpload(job("failed", "auth"))).toBe(false);
    expect(isActiveDeliveryPhotoUpload(job("completed"))).toBe(false);
    expect(JSON.stringify(job("failed", "retryable"))).not.toMatch(/blob|file|base64|objectURL/i);
  });
});
