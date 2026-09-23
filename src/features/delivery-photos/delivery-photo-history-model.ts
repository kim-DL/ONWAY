import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";

export function newestDeliveryPhotos(photos: readonly DeliveryPhotoMetadata[]) {
  return [...photos].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function deliveryPhotoRegisteredAt(value: string, includeYear = false) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    ...(includeYear ? { year: "numeric" as const } : {}),
    month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
}

export function deliveryPhotoCardLabel(customerName: string, photo: DeliveryPhotoMetadata) {
  return `${customerName} 납품사진, ${deliveryPhotoRegisteredAt(photo.createdAt)}, 등록자 ${photo.createdByName}`;
}
