import type { PhotoOutboxRecord } from "./delivery-photo-outbox";

export const MAX_PENDING_PHOTO_BYTES = 96 * 1024 * 1024;
export function outboxBytes(record: PhotoOutboxRecord) {
  return (record.source?.size ?? 0) + (record.prepared?.blob.size ?? 0) + (record.prepared?.preview?.size ?? 0);
}
