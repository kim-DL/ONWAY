import type { Customer } from "@/domain/customer";
import { buildKakaoDirectionsUrlToCoordinate } from "@/features/school-detail/kakao-directions";

/** Only route to the verified unloading pin; never guess a similarly named shop. */
export function customerDirectionsHref(customer: Pick<Customer, "name" | "deliveryPoint">): string | null {
  const point = customer.deliveryPoint;
  if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
    || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return null;
  return buildKakaoDirectionsUrlToCoordinate(customer.name, point.latitude, point.longitude);
}
