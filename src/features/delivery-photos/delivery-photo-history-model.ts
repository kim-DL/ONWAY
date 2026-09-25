import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";

export function newestDeliveryPhotos(photos: readonly DeliveryPhotoMetadata[]) {
  return [...photos].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function deliveryPhotoHistoryDates(fromDateKey: string) {
  const start = Date.parse(`${fromDateKey}T00:00:00Z`);
  return Array.from({ length: 8 }, (_, index) => new Date(start + (7 - index) * 86_400_000).toISOString().slice(0, 10));
}

export function deliveryPhotoHistoryDateLabel(dateKey: string, dates: readonly string[]) {
  if (dateKey === dates[0]) return "오늘";
  if (dateKey === dates[1]) return "어제";
  const [, month, day] = dateKey.split("-").map(Number);
  return `${month}월 ${day}일`;
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
