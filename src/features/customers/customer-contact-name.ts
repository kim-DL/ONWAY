import type { CustomerContact } from "@/domain/customer";

/** Display legacy split fields together, without changing stored information. */
export function customerContactDisplayName(contact: Pick<CustomerContact, "name" | "role">): string {
  const name = contact.name.trim().replace(/\s+/gu, " ");
  const role = contact.role.trim().replace(/\s+/gu, " ");
  if (!name) return role;
  if (!role) return name;
  const words = ` ${name.toLocaleLowerCase("ko-KR")} `;
  if (words.includes(` ${role.toLocaleLowerCase("ko-KR")} `)) return name;
  return `${name} ${role}`;
}

/** Consolidation happens only when a staff member edits the unified field. */
export function updateCustomerContactName(contact: CustomerContact, name: string): CustomerContact {
  return { ...contact, name, role: "" };
}
