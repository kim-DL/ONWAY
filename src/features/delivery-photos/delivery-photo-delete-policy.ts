import { isVerifiedAdminSession } from "@/domain/auth";
import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

export function canDeleteDeliveryPhoto(photo: DeliveryPhotoMetadata, session: AuthenticatedSession, now = new Date()) {
  if (Date.parse(photo.expiresAt) <= now.valueOf()) return false;
  if (isVerifiedAdminSession(session.claims)) return true;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  return photo.createdByEmployeeId === session.claims.employeeId && photo.deliveryDateKey === today;
}
