"use client";

import type { MouseEvent } from "react";

import { Icon } from "@/components/ui/icon";
import fieldList from "@/components/ui/field-list.module.css";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Customer, CustomerContact } from "@/domain/customer";

import { getPrimaryCustomerContact, sanitizeCustomerPhone } from "./customer-search";
import { customerAddress } from "./customer-address";
import { customerContactDisplayName } from "./customer-contact-name";
import { CustomerOverviewPhoto } from "./customer-overview-photo";
import { customerDirectionsHref } from "./customer-directions";
import styles from "./customer.module.css";

export const primaryCustomerContact = getPrimaryCustomerContact;

export function customerPhoneHref(phone: string) {
  const sanitized = sanitizeCustomerPhone(phone);
  return sanitized ? `tel:${sanitized}` : null;
}

export function customerPasswordLabel(customer: Pick<Customer, "accessPasswordState" | "accessPassword">) {
  if (customer.accessPasswordState === "none") return "없음";
  return customer.accessPasswordState === "registered" && customer.accessPassword ? customer.accessPassword : "미등록";
}

export function confirmClosedCustomer(event: MouseEvent<HTMLAnchorElement>, customer: Pick<Customer, "name" | "status">) {
  event.stopPropagation();
  if (customer.status === "closed" && !window.confirm(`${customer.name}은(는) 폐업 처리된 거래처입니다. 계속 진행할까요?`)) {
    event.preventDefault();
  }
}

export function CustomerBadges({ customer }: { customer: Pick<Customer, "status" | "noticeType"> }) {
  return <span className={styles.badges}>
    {customer.status === "closed" ? <StatusBadge tone="neutral">폐업</StatusBadge> : null}
    {customer.noticeType === "new" ? <StatusBadge tone="info">신규</StatusBadge> : null}
    {customer.noticeType === "changed" ? <StatusBadge tone="attention">정보변경</StatusBadge> : null}
  </span>;
}

export function CustomerPhoneLink({ customer, contact, label = "전화" }: {
  customer: Pick<Customer, "name" | "status">;
  contact: CustomerContact;
  label?: string;
}) {
  const href = customerPhoneHref(contact.phoneNumber);
  if (!href) return null;
  return <a className={styles.phoneLink} href={href}
    aria-label={`${customer.name} ${customerContactDisplayName(contact) || "담당자"} ${label}`}
    onClick={(event) => confirmClosedCustomer(event, customer)}>
    <Icon name="phone" size={20} /><span className={styles.srOnly}>{label}</span>
  </a>;
}

export function CustomerCoreInformation({ customer }: { customer: Customer }) {
  return <dl className={styles.coreInfo}>
    <div><dt>출입비번</dt><dd className={styles.password}>{customerPasswordLabel(customer)}</dd></div>
    <div><dt>납품위치</dt><dd>{customer.deliveryLocationDescription || "미등록"}</dd></div>
  </dl>;
}

function CustomerPasswordSummary({ customer, id }: { customer: Customer; id: string }) {
  return <span id={id} className={styles.passwordSummary} data-customer-password-summary>
    <span>출입비번</span><strong>{customerPasswordLabel(customer)}</strong>
  </span>;
}

export function CustomerCardDirectionsLink({ customer }: { customer: Customer }) {
  const href = customerDirectionsHref(customer);
  if (!href) return <span className={styles.directionsLink} aria-disabled="true"><Icon name="route" size={18} />위치 미등록</span>;
  return <a className={styles.directionsLink} href={href} target="_blank" rel="noopener noreferrer"
    aria-label={`${customer.name} 납품지 길안내`} onClick={(event) => confirmClosedCustomer(event, customer)}>
    <Icon name="route" size={18} />길안내
  </a>;
}

export function CustomerCard({ customer, onSelect, compact = false }: { customer: Customer; onSelect: () => void; compact?: boolean }) {
  const contact = primaryCustomerContact(customer);
  const Heading = compact ? "h4" : "h2";
  return <article className={`${fieldList.row} ${styles.card}`} data-customer-card data-compact={compact || undefined} data-closed={customer.status === "closed" || undefined}>
    <button type="button" className={styles.cardSelect} onClick={onSelect} aria-label={`${customer.name} 상세 정보`} aria-describedby={compact ? `customer-card-password-${customer.customerId}` : undefined} />
    <div className={styles.cardBody}>
      <div className={styles.cardHeading}><Heading className={styles.cardName}>{customer.name}</Heading><CustomerBadges customer={customer} /><Icon name="chevron-right" size={17} className={styles.cardChevron} /></div>
      <p className={styles.region}>{customerAddress(customer)}</p>
      {compact ? <CustomerPasswordSummary customer={customer} id={`customer-card-password-${customer.customerId}`} /> : <CustomerCoreInformation customer={customer} />}
      <div className={styles.contactRow}>
        <div className={styles.contactText}>
          {contact ? <><span>{customerContactDisplayName(contact) || "담당자"}</span><strong>{contact.phoneNumber || "연락처 미등록"}</strong></> : "연락처 미등록"}
        </div>
        <div className={styles.contactActions}>
          {contact?.phoneNumber && <CustomerPhoneLink customer={customer} contact={contact} />}
          <CustomerCardDirectionsLink customer={customer} />
        </div>
      </div>
    </div>
  </article>;
}

/** Photo requests are intentionally limited to these five recent rows, not search results. */
export function RecentCustomerCard({ customer, onSelect }: { customer: Customer; onSelect: () => void }) {
  return <button type="button" className={`${fieldList.row} ${styles.recentItem}`} onClick={onSelect} aria-label={`${customer.name} 다시 열기`} aria-describedby={`customer-recent-address-${customer.customerId} customer-recent-password-${customer.customerId}`} data-customer-recent-card>
    <CustomerOverviewPhoto customer={customer} variant="thumbnail" />
    <span className={styles.recentCopy}>
      <span className={styles.recentName}><strong>{customer.name}</strong><CustomerBadges customer={customer} /></span>
      <span id={`customer-recent-address-${customer.customerId}`} className={styles.recentAddress}>{customerAddress(customer)}</span>
      <CustomerPasswordSummary customer={customer} id={`customer-recent-password-${customer.customerId}`} />
    </span>
    <Icon name="chevron-right" size={17} className={styles.cardChevron} />
  </button>;
}
