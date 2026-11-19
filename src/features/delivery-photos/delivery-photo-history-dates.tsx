"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

import type { DeliveryPhotoDeleteUpdate } from "./delivery-photo-delete-model";
import { deliveryPhotoHistoryDateLabel, deliveryPhotoHistoryDates } from "./delivery-photo-history-model";
import { deliveryPhotoHistoryRepository, deliveryPhotoHistoryErrorMessage } from "./delivery-photo-history-repository";
import { DeliveryPhotoThumbnail } from "./delivery-photo-thumbnail";
import styles from "./delivery-photo-history.module.css";
import dateStyles from "./delivery-photo-history-dates.module.css";

export const DeliveryPhotoViewer = dynamic(() => import("./delivery-photo-viewer").then((module) => module.DeliveryPhotoViewer), { ssr: false });

export function DeliveryPhotoHistoryDates({ customerId, customerName, session, photos, fromDateKey, onDeleted }: {
  customerId: string;
  customerName: string;
  session: AuthenticatedSession;
  photos: DeliveryPhotoMetadata[];
  fromDateKey: string;
  onDeleted: (photoId: string, update: DeliveryPhotoDeleteUpdate) => void;
}) {
  const dates = deliveryPhotoHistoryDates(fromDateKey);
  const [selection, select] = useState<{ date: string } | null>(null);
  const selected = selection?.date;
  const [viewer, setViewer] = useState<{ index: number; origin: HTMLElement } | null>(null);
  const [day, setDay] = useState<{ selection: { date: string }; photos?: DeliveryPhotoMetadata[]; error?: string } | null>(null);
  useEffect(() => {
    if (!selection) return;
    const controller = new AbortController();
    void deliveryPhotoHistoryRepository.list(customerId, session, controller.signal, selection.date).then((result) => {
      if (!controller.signal.aborted) setDay({ selection, photos: result.photos });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setDay({ selection, error: deliveryPhotoHistoryErrorMessage(error) });
    });
    return () => controller.abort();
  }, [customerId, selection, session]);
  const result = day?.selection === selection ? day : null;
  const visible = selected ? result?.photos ?? [] : photos;
  const groups: Record<string, DeliveryPhotoMetadata[]> = {};
  for (const photo of visible) (groups[photo.deliveryDateKey] ??= []).push(photo);

  return <div className={dateStyles.datesUi}>
    <p className={styles.count}>{selected ? "선택 날짜" : "최근 기록"} {(!selected || result?.photos) && <strong>{visible.length}장 표시</strong>}</p>
    <p className={dateStyles.retention}>사진은 최근 7일간 보관됩니다.</p>
    <div className={dateStyles.dates} role="group" aria-label="사진 기록 날짜">
      <button type="button" aria-pressed={!selected} onClick={() => select(null)}>전체</button>
      {dates.map((date) => <button key={date} type="button" aria-pressed={selected === date}
        onClick={() => { if (selected !== date) select({ date }); }}>{deliveryPhotoHistoryDateLabel(date, dates)}</button>)}
    </div>
    {selected && !result ? <p className={styles.status} role="status">이 날짜의 사진을 불러오는 중</p>
      : result?.error ? <div role="alert" className={styles.error}>{result.error} <button type="button" onClick={() => select({ date: result.selection.date })}>다시 시도</button></div>
      : visible.length ? Object.entries(groups).map(([date, items]) => <section key={date} className={dateStyles.day} aria-label={`${date} 사진 기록`}>
      <h2>{deliveryPhotoHistoryDateLabel(date, dates)}</h2>
      <ul className={styles.grid}>{items.map((photo) => <DeliveryPhotoThumbnail key={photo.photoId}
        photo={photo} customerName={customerName} session={session}
        onOpen={(origin) => setViewer({ index: visible.indexOf(photo), origin })} />)}</ul>
    </section>) : <p className={styles.status}>{selected ? "이 날짜에 납품사진 기록이 없습니다." : "최근 확인할 수 있는 납품사진이 없습니다."}</p>}
    {viewer ? <DeliveryPhotoViewer key={visible[viewer.index]?.photoId} customerName={customerName}
      session={session} photos={visible} initialIndex={viewer.index} origin={viewer.origin} onClose={() => setViewer(null)}
      onDeleted={(photoId, update) => { setViewer(null); onDeleted(photoId, update); }} /> : null}
  </div>;
}
