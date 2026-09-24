import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { DeliveryPhotoSnapshot } from "./delivery-photo-memory";

export type DeliveryPhotoDeleteUpdate = (current: DeliveryPhotoSnapshot) => DeliveryPhotoSnapshot;

export function removeDeliveryPhotoFromToday(photo: DeliveryPhotoMetadata): DeliveryPhotoDeleteUpdate {
  return (snapshot) => {
    if (snapshot.today.deliveryDateKey !== photo.deliveryDateKey) return snapshot;
    const photos = snapshot.today.photos.filter((item) => item.photoId !== photo.photoId);
    if (photos.length === snapshot.today.photos.length) return snapshot;
    const prior = snapshot.today.customers.find((item) => item.customerId === photo.customerId);
    const count = Math.max(0, (prior?.count ?? 1) - 1);
    const customers = prior ? (count ? snapshot.today.customers.map((item) => item.customerId === photo.customerId
      ? { ...item, count, latest: photos.find((candidate) => candidate.customerId === photo.customerId) ?? null }
      : item) : snapshot.today.customers.filter((item) => item.customerId !== photo.customerId)) : snapshot.today.customers;
    return { ...snapshot, today: { ...snapshot.today, photos, customers }, refreshedAt: Date.now() };
  };
}
