"use client";

import { useCallback, useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

import { DeliveryPhotoHistoryLoader } from "./delivery-photo-history-loader";
import { DeliveryPhotoActionIcon } from "./delivery-photo-action-icon";
import { deliveryPhotoRegisteredAt } from "./delivery-photo-history-model";
import { acceptDeliveryPhotoWrite, deliveryPhotoDateKey } from "./delivery-photo-memory";
import { deliveryPhotoHistoryRepository, type DeliveryPhotoHistoryResult } from "./delivery-photo-history-repository";
import styles from "./delivery-photo-customer-section.module.css";

export function DeliveryPhotoCustomerSection({ customer, session, onRecord }: {
  customer: Pick<Customer, "customerId" | "name" | "status">;
  session: AuthenticatedSession;
  onRecord?: (() => void) | undefined;
}) {
  const [result, setResult] = useState<DeliveryPhotoHistoryResult | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [historySeed, setHistorySeed] = useState<DeliveryPhotoHistoryResult | null>(null);
  const key = `${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}:${customer.customerId}`;
  const acceptResult = useCallback((value: DeliveryPhotoHistoryResult) => { setResult(value); setError(false); }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void deliveryPhotoHistoryRepository.list(customer.customerId, session, controller.signal)
      .then((value) => { if (active) { setResult(value); setError(false); } })
      .catch(() => { if (active && !controller.signal.aborted) setError(true); });
    return () => { active = false; controller.abort(); };
  }, [key, customer.customerId, session]);

  const photos = result?.photos;
  const latest = photos?.[0];
  const description = error ? "기록을 불러오지 못했어요. 열어서 다시 시도해주세요."
    : !photos ? "최근 기록 확인 중"
      : photos.length === 0 ? "최근 7일 · 등록된 납품사진 없음"
        : `최근 7일 · 사진 ${photos.length >= 30 ? "30장 이상" : `${photos.length}장`}`;
  const latestText = latest ? `최근 등록 ${deliveryPhotoRegisteredAt(latest.createdAt)} · ${latest.createdByName}` : "";
  return <>
    <section className={styles.section} aria-label="납품사진 기록">
      <button type="button" className={styles.history} onClick={() => { setHistorySeed(result); setOpen(true); }}
        aria-label={`${customer.name} 납품사진 기록, ${description}${latestText ? `, ${latestText}` : ""}`}>
        <DeliveryPhotoActionIcon variant="history" />
        <span className={styles.copy}><strong>납품사진 기록</strong><small>{description}</small>{latest ? <span className={styles.latest}>
          <time dateTime={latest.createdAt}>최근 등록 {deliveryPhotoRegisteredAt(latest.createdAt)}</time><span>{latest.createdByName}</span>
        </span> : null}</span>
        <Icon name="chevron-right" size={18} />
      </button>
      {onRecord ? <button type="button" className={styles.record} onClick={onRecord} disabled={customer.status !== "active"}
        aria-label={`${customer.name} 납품사진 기록하기`}>
        <DeliveryPhotoActionIcon variant="camera" />
        <span className={styles.copy}><strong>납품사진 기록하기</strong><small>{customer.status === "active" ? "촬영하거나 앨범에서 선택해요" : "폐업 처리된 거래처는 새 사진을 기록할 수 없어요"}</small></span>
        <Icon name="chevron-right" size={18} />
      </button> : null}
    </section>
    {open ? <DeliveryPhotoHistoryLoader key={key} customer={customer} session={session} initialResult={historySeed ?? undefined}
      onResult={acceptResult} onClose={() => setOpen(false)}
      sync={(update) => acceptDeliveryPhotoWrite(`${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}:${deliveryPhotoDateKey()}`, update)} /> : null}
  </>;
}

export default DeliveryPhotoCustomerSection;
