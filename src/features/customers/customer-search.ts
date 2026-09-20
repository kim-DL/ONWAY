import { normalizeCustomerName, type Customer } from "@/domain/customer";

const names = new Intl.Collator("ko-KR", { numeric: true, sensitivity: "base" });

export function searchCustomers(customers: readonly Customer[], query: string): Customer[] {
  const needle = normalizeCustomerName(query);
  if (!needle) return [];
  return customers.flatMap((customer) => {
    const name = customer.normalizedName;
    const rank = name === needle ? 0 : name.startsWith(needle) ? 1 : name.includes(needle) ? 2
      : customer.choseongName.startsWith(needle) ? 3 : customer.choseongName.includes(needle) ? 4 : -1;
    return rank < 0 ? [] : [{ customer, rank }];
  }).sort((a, b) => a.rank - b.rank
    || Number(a.customer.status === "closed") - Number(b.customer.status === "closed")
    || names.compare(a.customer.name, b.customer.name)
    || a.customer.customerId.localeCompare(b.customer.customerId))
    .map(({ customer }) => customer);
}

export function getPrimaryCustomerContact(customer: Pick<Customer, "contacts">) {
  return customer.contacts.find((contact) => contact.isPrimary) ?? customer.contacts[0] ?? null;
}

export function sanitizeCustomerPhone(value: string): string {
  const sanitized = value.trim().replace(/[() .-]/g, "");
  return /^\+?\d{3,20}$/.test(sanitized) ? sanitized : "";
}
