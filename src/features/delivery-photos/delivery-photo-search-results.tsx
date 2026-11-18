"use client";

import type { ReactNode } from "react";
import type { Customer } from "@/domain/customer";
import styles from "./photo.module.css";

export default function DeliveryPhotoSearchResults({ matches, show, renderRow }: {
  matches: readonly Customer[]; show: (id: string) => boolean; renderRow: (id: string) => ReactNode;
}) {
  const visible = matches.filter((customer) => show(customer.customerId));
  return <section className={styles.section} data-photo-list="search" aria-label="거래처 검색 결과">
    <h2>검색 결과</h2>
    {visible.length ? <ul className={styles.list}>{visible.map((customer) => renderRow(customer.customerId))}</ul>
      : <p className={styles.empty}>{matches.length ? "해당 거래처는 촬영 카드에 표시되어 있어요." : "일치하는 거래처가 없습니다."}</p>}
  </section>;
}
