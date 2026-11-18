import type { Customer } from "@/domain/customer";

/** Prefer the unloading address; legacy region fields are not address substitutes. */
export function registeredCustomerAddress(customer: Pick<Customer, "deliveryAddress" | "officialAddress">): string {
  return customer.deliveryAddress.trim() || customer.officialAddress.trim();
}

export function customerAddress(customer: Pick<Customer, "deliveryAddress" | "officialAddress">): string {
  return registeredCustomerAddress(customer) || "주소 미등록";
}
