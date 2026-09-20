import type { KakaoLocalClient } from "../sync/kakao-local-client.js";
import { customerRegionSchema, type CustomerPoint, type CustomerRegion } from "./customer-contract.js";

export async function reverseCustomerAddress(
  client: Pick<KakaoLocalClient, "reverseAddress" | "reverseAdministrativeRegion">,
  point: CustomerPoint,
): Promise<CustomerRegion> {
  const [address, region] = await Promise.allSettled([
    client.reverseAddress(point), client.reverseAdministrativeRegion(point),
  ]);
  // A regional name is not a delivery address. An address lookup failure must
  // not silently confirm the pin with only a district/dong or stale text.
  if (address.status === "rejected") throw address.reason;
  return customerRegionSchema.parse({
    district: region.status === "fulfilled" ? region.value.district : "",
    administrativeDong: region.status === "fulfilled" ? region.value.administrativeDong : "",
    address: address.value.roadAddress || address.value.addressName,
  });
}
