"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

import type { DeliveryPhotoDeleteUpdate } from "./delivery-photo-delete-model";
import { deliveryPhotoHistoryDateLabel, deliveryPhotoHistoryDates } from "./delivery-photo-history-model";
import { DeliveryPhotoThumbnail } from "./delivery-photo-thumbnail";
import styles from "./delivery-photo-history.module.css";
import dateStyles from "./delivery-photo-history-dates.module.css";

const DeliveryPhotoViewer = dynamic(() => import("./delivery-photo-viewer").then((module) => module.DeliveryPhotoViewer), { ssr: false });

export function DeliveryPhotoHistoryDates({ customerName, session, photos, fromDateKey, onDeleted }: {
  customerName: string;
  session: AuthenticatedSession;
  photos: DeliveryPhotoMetadata[];
  fromDateKey: string;
  onDeleted: (photoId: string, update: DeliveryPhotoDeleteUpdate) => void;
}) {
  const dates = deliveryPhotoHistoryDates(fromDateKey);
  const [selected, setSelected] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ index: number; origin: HTMLElement } | null>(null);
  const visible = selected ? photos.filter((photo) => photo.deliveryDateKey === selected) : photos;
  const groups = new Map<string, DeliveryPhotoMetadata[]>();
  for (const photo of visible) groups.set(photo.deliveryDateKey, [...(groups.get(photo.deliveryDateKey) ?? []), photo]);
  const sessionKey = `${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}`;

  return <div className={dateStyles.datesUi}>
    <p className={styles.count}>최근 기록 <strong>{photos.length}장</strong></p>
    <p className={dateStyles.retention}>사진은 최근 7일간 보관됩니다.</p>
    <div className={dateStyles.dates} role="group" aria-label="사진 기록 날짜">
      <button type="button" aria-pressed={selected === null} onClick={() => setSelected(null)}>전체</button>
      {dates.map((date) => <button key={date} type="button" aria-pressed={selected === date}
        onClick={() => setSelected(date)}>{deliveryPhotoHistoryDateLabel(date, dates)}</button>)}
    </div>
    {visible.length ? [...groups].map(([date, items]) => <section key={date} className={dateStyles.day} aria-label={`${date} 사진 기록`}>
      <h2>{deliveryPhotoHistoryDateLabel(date, dates)}</h2>
      <ul className={styles.grid}>{items.map((photo) => <DeliveryPhotoThumbnail key={photo.photoId}
        photo={photo} customerName={customerName} session={session}
        onOpen={(origin) => setViewer({ index: visible.indexOf(photo), origin })} />)}</ul>
    </section>) : <p className={styles.status}>{selected ? "이 날짜에 납품사진 기록이 없습니다." : "최근 확인할 수 있는 납품사진이 없습니다."}</p>}
    {viewer ? <DeliveryPhotoViewer key={`${sessionKey}:${visible[viewer.index]?.photoId ?? "closed"}`} customerName={customerName}
      session={session} photos={visible} initialIndex={viewer.index} origin={viewer.origin} onClose={() => setViewer(null)}
      onDeleted={(photoId, update) => { setViewer(null); onDeleted(photoId, update); }} /> : null}
  </div>;
}
