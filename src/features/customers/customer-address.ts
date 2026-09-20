import type { Customer } from "@/domain/customer";

/** Prefer the unloading address; legacy region fields are not address substitutes. */
export function customerAddress(customer: Pick<Customer, "deliveryAddress" | "officialAddress">): string {
  return customer.deliveryAddress.trim() || customer.officialAddress.trim() || "주소 미등록";
}
