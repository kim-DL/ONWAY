"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import type { Customer, CustomerContact } from "@/domain/customer";

import { customerAddress } from "./customer-address";
import { customerDirectionsHref } from "./customer-directions";
import { CustomerBadges, CustomerCoreInformation, CustomerPhoneLink, confirmClosedCustomer, customerPasswordLabel, customerPhoneHref } from "./customer-card";
import { customerDetailContacts } from "./customer-detail-contacts";
import { customerContactDisplayName } from "./customer-contact-name";
import { CustomerOverviewPhoto } from "./customer-overview-photo";
import styles from "./customer-detail.module.css";

const CustomerMap = dynamic(() => import("./customer-map").then((module) => module.CustomerMap), {
  loading: () => <div className={styles.mapLoading} role="status">지도를 준비하고 있어요.</div>,
});

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

export function CustomerDirectionsLink({ customer }: { customer: Customer }) {
  const href = customerDirectionsHref(customer);
  if (!href) return <span className={styles.action} aria-disabled="true"><Icon name="route" size={20} />위치 미등록</span>;
  return <a className={`${styles.action} ${styles.primaryAction}`} href={href} target="_blank" rel="noopener noreferrer" onClick={(event) => confirmClosedCustomer(event, customer)}><Icon name="route" size={20} />길찾기</a>;
}

function ContactList({ customer, contacts }: { customer: Customer; contacts: readonly CustomerContact[] }) {
  return <ul>{contacts.map((item) => <li key={item.id}>
    <span className={styles.contactIcon} aria-hidden="true"><Icon name="user" size={20} /></span>
    <div className={styles.contactCopy}><div><strong>{customerContactDisplayName(item) || "담당자"}</strong>{item.isPrimary ? <span className={styles.primaryLabel}>대표</span> : null}</div><p>{item.phoneNumber || "연락처 미등록"}</p></div>
    <CustomerPhoneLink customer={customer} contact={item} />
  </li>)}</ul>;
}

export function CustomerDetail({ customer, onClose, onEdit }: { customer: Customer; onClose: () => void; onEdit: () => void }) {
  const [markerInfo, setMarkerInfo] = useState(false);
  const markerInfoRef = useRef<HTMLElement>(null);
  const { visible: visibleContacts, additional: additionalContacts, phoneContact: contact } = customerDetailContacts(customer.contacts);
  const phoneHref = contact ? customerPhoneHref(contact.phoneNumber) : null;
  useEffect(() => {
    if (!markerInfo || !markerInfoRef.current) return;
    markerInfoRef.current.focus({ preventScroll: true });
    markerInfoRef.current.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest" });
  }, [markerInfo]);

  return <BottomSheet open title={customer.name} onClose={onClose}>
    <div className={styles.detail} data-customer-detail>
      <div className={styles.contextRow}><span><Icon name="building" size={16} />거래처 정보</span><CustomerBadges customer={customer} /></div>
      {customer.status === "closed" ? <p className={styles.warning}>폐업 처리된 거래처입니다. 방문 전 확인해주세요.</p> : null}

      {customer.overviewPhoto ? <figure className={styles.overviewPhoto}><CustomerOverviewPhoto customer={customer} expandable /><figcaption><span><Icon name="camera" size={15} />거래처 전경</span><span>건물 · 출입구 확인</span></figcaption></figure> : null}

      <section className={styles.arrival} aria-labelledby="customer-arrival-heading">
        <div className={styles.sectionTitle}><span className={styles.insetIcon}><Icon name="clipboard" size={20} /></span><h3 id="customer-arrival-heading">납품 안내</h3></div>
        <p className={styles.deliveryNote}>{customer.deliveryLocationDescription || "납품 위치 안내가 아직 없어요."}</p>
        <div className={styles.passwordRow}><span>출입 비밀번호</span><strong data-registered={customer.accessPasswordState === "registered" || undefined}>{customerPasswordLabel(customer)}</strong></div>
      </section>

      <section className={styles.contacts} aria-label="전체 연락처">
        <div className={styles.sectionTitle}><h3>연락처</h3><span>{customer.contacts.length}명</span></div>
        {visibleContacts.length ? <ContactList customer={customer} contacts={visibleContacts} /> : <p className={styles.empty}>연락처 미등록</p>}
        {additionalContacts.length ? <details className={styles.moreContacts}>
          <summary>전체 연락처 {customer.contacts.length}명<Icon name="arrow-down" size={16} /></summary>
          <ContactList customer={customer} contacts={additionalContacts} />
        </details> : null}
      </section>

      <section className={styles.location} aria-labelledby="customer-location-heading">
        <div className={styles.sectionTitle}><h3 id="customer-location-heading">납품 위치</h3><span><Icon name="location" size={14} />{customer.deliveryPoint ? "지정한 지점" : "위치 미등록"}</span></div>
        <p className={styles.deliveryAddress}>{customerAddress(customer)}</p>
        <CustomerMap point={customer.deliveryPoint} name={customer.name} hideHeading onMarkerClick={() => setMarkerInfo((current) => !current)} />
        {markerInfo && customer.deliveryPoint ? <section ref={markerInfoRef} tabIndex={-1} className={styles.markerInfo} aria-label="납품지점 정보" data-customer-marker-info>
          <div className={styles.sectionTitle}><h3>{customer.name}</h3><button type="button" className={styles.closeMarker} onClick={() => setMarkerInfo(false)} aria-label="납품지점 정보 접기"><Icon name="close" size={18} /></button></div>
          <CustomerCoreInformation customer={customer} />
        </section> : null}
      </section>

      {customer.changeNote ? <section className={styles.changeNote} aria-label="최근 변경사항"><Icon name="bell" size={18} /><div><h3>최근 변경사항</h3><p>{customer.changeNote}</p></div></section> : null}
      <details className={styles.metadata}>
        <summary>기본 정보<Icon name="arrow-down" size={16} /></summary>
        <dl><div><dt>거래처 주소</dt><dd>{customer.officialAddress || "미등록"}</dd></div><div><dt>최근 수정</dt><dd><time dateTime={customer.updatedAt}>{dateFormat.format(new Date(customer.updatedAt))}</time></dd></div></dl>
      </details>
      <BottomSheetActions className={styles.actions ?? ""}>
        <CustomerDirectionsLink customer={customer} />
        {phoneHref && contact ? <a className={styles.action} href={phoneHref} aria-label={`${customer.name} ${customerContactDisplayName(contact) || "담당자"} 바로 전화`} onClick={(event) => confirmClosedCustomer(event, customer)}><Icon name="phone" size={20} />전화</a> : <span className={styles.action} aria-disabled="true"><Icon name="phone" size={20} />연락처 없음</span>}
        <button type="button" className={styles.action} onClick={onEdit}><Icon name="settings" size={20} />정보 수정</button>
      </BottomSheetActions>
    </div>
  </BottomSheet>;
}
