import { describe, expect, it } from "vitest";

import { initialDeliveryPhotoUploadState, reduceDeliveryPhotoUploadState } from "./delivery-photo-upload-state";

describe("memory-only delivery photo upload state", () => {
  it("supports the explicit idle/preparing/uploading/completed lifecycle", () => {
    const preparing = reduceDeliveryPhotoUploadState(initialDeliveryPhotoUploadState, { type: "prepare", customerId: "a", source: "camera" });
    const uploading = reduceDeliveryPhotoUploadState(preparing, { type: "upload" });
    const completed = reduceDeliveryPhotoUploadState(uploading, { type: "complete", photoId: "photo_1" });
    expect([initialDeliveryPhotoUploadState.status, preparing.status, uploading.status, completed.status]).toEqual(["idle", "preparing", "uploading", "completed"]);
    expect(reduceDeliveryPhotoUploadState(completed, { type: "reset" })).toBe(initialDeliveryPhotoUploadState);
  });

  it("retains only small retry context after failure and ignores invalid transitions", () => {
    const preparing = reduceDeliveryPhotoUploadState(initialDeliveryPhotoUploadState, { type: "prepare", customerId: "a", source: "album" });
    const failed = reduceDeliveryPhotoUploadState(preparing, { type: "fail", message: "network" });
    expect(failed).toEqual({ status: "failed", customerId: "a", source: "album", message: "network" });
    expect(reduceDeliveryPhotoUploadState(failed, { type: "retry" }).status).toBe("preparing");
    expect(reduceDeliveryPhotoUploadState(initialDeliveryPhotoUploadState, { type: "upload" })).toBe(initialDeliveryPhotoUploadState);
    expect(JSON.stringify(failed)).not.toMatch(/blob|file|base64|objectURL/i);
  });
});
