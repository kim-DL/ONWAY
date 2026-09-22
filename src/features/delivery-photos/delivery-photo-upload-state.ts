import type { DeliveryPhoto } from "@/domain/delivery-photo";

type UploadContext = { customerId: string; source: DeliveryPhoto["source"] };
export type DeliveryPhotoUploadState =
  | { status: "idle" }
  | ({ status: "preparing" } & UploadContext)
  | ({ status: "uploading" } & UploadContext)
  | ({ status: "completed"; photoId: string } & UploadContext)
  | ({ status: "failed"; message: string } & UploadContext);

export type DeliveryPhotoUploadEvent =
  | ({ type: "prepare" } & UploadContext)
  | { type: "upload" }
  | { type: "complete"; photoId: string }
  | { type: "fail"; message: string }
  | { type: "retry" }
  | { type: "reset" };

export const initialDeliveryPhotoUploadState: DeliveryPhotoUploadState = Object.freeze({ status: "idle" });

export function reduceDeliveryPhotoUploadState(
  state: DeliveryPhotoUploadState,
  event: DeliveryPhotoUploadEvent,
): DeliveryPhotoUploadState {
  if (event.type === "reset") return initialDeliveryPhotoUploadState;
  if (event.type === "prepare") return { status: "preparing", customerId: event.customerId, source: event.source };
  if (event.type === "upload" && state.status === "preparing") return { ...state, status: "uploading" };
  if (event.type === "complete" && state.status === "uploading") return { ...state, status: "completed", photoId: event.photoId };
  if (event.type === "fail" && (state.status === "preparing" || state.status === "uploading")) return { ...state, status: "failed", message: event.message };
  if (event.type === "retry" && state.status === "failed") return { status: "preparing", customerId: state.customerId, source: state.source };
  return state;
}
