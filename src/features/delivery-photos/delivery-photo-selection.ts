export const DELIVERY_PHOTO_SOURCE_MAX_BYTES = 30 * 1024 * 1024;

export function deliveryPhotoSelectionError(file: File): string | null {
  if (file.size <= 0) return "delivery-photo/empty-source";
  if (file.size > DELIVERY_PHOTO_SOURCE_MAX_BYTES) return "delivery-photo/source-too-large";
  if (!["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif", "", "application/octet-stream"].includes(file.type)) {
    return "delivery-photo/unsupported-source";
  }
  return null;
}
