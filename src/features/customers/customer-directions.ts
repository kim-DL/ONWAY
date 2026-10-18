import type { Customer } from "@/domain/customer";
import { buildKakaoDirectionsUrlToCoordinate } from "@/features/school-detail/kakao-directions";
import { isCustomerPoint } from "./customer-point";

/** Only route to the verified unloading pin; never guess a similarly named shop. */
export function customerDirectionsHref(customer: Pick<Customer, "name" | "deliveryPoint">): string | null {
  const point = customer.deliveryPoint;
  if (!isCustomerPoint(point)) return null;
  return buildKakaoDirectionsUrlToCoordinate(customer.name, point.latitude, point.longitude);
}
