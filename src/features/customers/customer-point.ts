import type { CustomerPoint } from "@/domain/customer";

/** The same unloading-pin boundary applies to directions, maps and region lookup. */
export function isCustomerPoint(point: CustomerPoint | null | undefined): point is CustomerPoint {
  return Boolean(point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180);
}
