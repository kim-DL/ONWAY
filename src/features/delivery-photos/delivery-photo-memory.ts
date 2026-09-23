import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { DeliveryPhotoDayResult, DeliveryPhotoRouteResult, DeliveryPhotoTodayResult } from "./delivery-photo-repository";

export type DeliveryPhotoSnapshot = {
  route: DeliveryPhotoRouteResult;
  day: DeliveryPhotoDayResult;
  today: DeliveryPhotoTodayResult;
  refreshedAt: number;
};

let memory: { key: string; generation: number; snapshot: DeliveryPhotoSnapshot | null } | null = null;

export function deliveryPhotoDateKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function entry(key: string) {
  if (memory?.key !== key) memory = { key, generation: 0, snapshot: null };
  return memory;
}

export function readDeliveryPhotoSnapshot(key: string) { return entry(key).snapshot; }
export function beginDeliveryPhotoRead(key: string) { return entry(key).generation; }
export function commitDeliveryPhotoRead(key: string, generation: number, snapshot: DeliveryPhotoSnapshot) {
  if (memory?.key !== key || memory.generation !== generation) return memory?.key === key ? memory.snapshot : null;
  memory.snapshot = snapshot;
  return snapshot;
}
export function acceptDeliveryPhotoWrite(key: string, update: (current: DeliveryPhotoSnapshot) => DeliveryPhotoSnapshot) {
  if (memory?.key !== key) return null;
  memory.generation += 1;
  if (!memory.snapshot) return null;
  memory.snapshot = update(memory.snapshot);
  return memory.snapshot;
}

export function mergeConfirmedDeliveryPhoto(
  snapshot: DeliveryPhotoSnapshot,
  photo: DeliveryPhotoMetadata,
  currentDateKey = deliveryPhotoDateKey(),
): DeliveryPhotoSnapshot {
  if (photo.deliveryDateKey !== currentDateKey || snapshot.today.deliveryDateKey !== currentDateKey) return snapshot;
  const existingIndex = snapshot.today.photos.findIndex((item) => item.photoId === photo.photoId);
  if (existingIndex >= 0) {
    const photos = [...snapshot.today.photos]; photos[existingIndex] = photo;
    const customers = snapshot.today.customers.map((summary) => summary.customerId === photo.customerId
      ? { ...summary, latest: summary.latest?.photoId === photo.photoId ? photo : summary.latest }
      : summary);
    return { ...snapshot, today: { ...snapshot.today, photos, customers }, refreshedAt: Date.now() };
  }
  const prior = snapshot.today.customers.find((summary) => summary.customerId === photo.customerId);
  const nextSummary = { customerId: photo.customerId, count: (prior?.count ?? 0) + 1, latest: photo };
  const customers = prior
    ? snapshot.today.customers.map((summary) => summary.customerId === photo.customerId ? nextSummary : summary)
    : [nextSummary, ...snapshot.today.customers];
  return { ...snapshot, today: { ...snapshot.today, photos: [photo, ...snapshot.today.photos], customers }, refreshedAt: Date.now() };
}
export function clearDeliveryPhotoSnapshot(key?: string) {
  if (memory && (!key || memory.key === key)) memory = null;
}
