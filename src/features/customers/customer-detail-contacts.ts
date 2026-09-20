import type { CustomerContact } from "@/domain/customer";

import { sanitizeCustomerPhone } from "./customer-search";

/** Preserve stored order within each group and never mutate the shared catalog. */
export function customerDetailContacts(contacts: readonly CustomerContact[]) {
  const ordered = [...contacts].sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary));
  return {
    visible: ordered.slice(0, 2),
    additional: ordered.slice(2),
    phoneContact: ordered.find((contact) => sanitizeCustomerPhone(contact.phoneNumber)) ?? null,
  };
}
