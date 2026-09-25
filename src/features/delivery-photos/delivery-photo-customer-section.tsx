"use client";

import { useCallback, useEffect, useState } from "react";

import { Icon } from "@/components/ui/icon";
import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

import { DeliveryPhotoHistoryLoader } from "./delivery-photo-history-loader";
import { acceptDeliveryPhotoWrite, deliveryPhotoDateKey } from "./delivery-photo-memory";
import { deliveryPhotoHistoryRepository, type DeliveryPhotoHistoryResult } from "./delivery-photo-history-repository";

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });

export function DeliveryPhotoCustomerSection({ customer, session, className }: {
  customer: Pick<Customer, "customerId" | "name">;
  session: AuthenticatedSession;
  className: string;
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
  const latestText = latest ? `마지막 기록 ${timeFormat.format(new Date(latest.createdAt))} · ${latest.createdByName}` : "";
  return <>
    <section className={className} aria-label="납품사진 기록">
      <button type="button" onClick={() => { setHistorySeed(result); setOpen(true); }}
        aria-label={`${customer.name} 납품사진 기록, ${description}${latestText ? `, ${latestText}` : ""}`}>
        <span><strong>납품사진 기록</strong><small>{description}</small>{latestText ? <small>{latestText}</small> : null}</span>
        <Icon name="chevron-right" size={18} />
      </button>
    </section>
    {open ? <DeliveryPhotoHistoryLoader key={key} customer={customer} session={session} initialResult={historySeed ?? undefined}
      onResult={acceptResult} onClose={() => setOpen(false)}
      sync={(update) => acceptDeliveryPhotoWrite(`${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}:${deliveryPhotoDateKey()}`, update)} /> : null}
  </>;
}

export default DeliveryPhotoCustomerSection;
