"use client";

import { useMemo, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { SearchField } from "@/components/ui/search-field";
import type { Customer } from "@/domain/customer";
import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { searchCustomers } from "@/features/customers/customer-search";
import { DeliveryPhotoHistoryLoader } from "../delivery-photo-history-loader";
import type { DeliveryPhotoDeleteUpdate } from "../delivery-photo-delete-model";
import { GalleryTrack, galleryDateLabel } from "./gallery-track";
import type { GalleryThumbnails } from "./gallery-thumbnails";
import { useGalleryDay, type GalleryDay } from "./use-gallery-day";
import styles from "./gallery.module.css";

type CompareProps = {
  session: AuthenticatedSession; today: string; yesterday: string; pool: GalleryThumbnails; days: readonly GalleryDay[];
  revision: number; onDenied: () => void; sync: (change: DeliveryPhotoDeleteUpdate) => void; refresh: () => void;
};

function Comparison({ customer, session, today, yesterday, days, pool, revision, onDenied, sync, refresh }: CompareProps & { customer: Customer }) {
  const [history, setHistory] = useState(false);
  const [viewer, setViewer] = useState<{ photo: DeliveryPhotoMetadata; origin: HTMLElement } | null>(null);
  const [retry, setRetry] = useState(0);
  const current = useGalleryDay(session, today, today, true, revision + retry, onDenied, customer.customerId);
  const previous = useGalleryDay(session, today, yesterday, true, revision + retry, onDenied, customer.customerId);
  const sections = [current, previous].map((day, i) => ({ ...day, photos: day.loading && !day.photos.length
    ? days[i]!.photos.filter((photo) => photo.customerId === customer.customerId) : day.photos }));
  // The company request can find yesterday's first photo before the all-staff list reaches it.
  const [firstDay, setFirstDay] = useState<0 | 1 | null>(null);
  const firstWithPhotos = sections[0]!.photos.length ? 0 : !current.loading && sections[1]!.photos.length ? 1 : null;
  if (firstDay === null && firstWithPhotos !== null) setFirstDay(firstWithPhotos);
  return <>
    {(firstDay === 1 ? [1, 0] : [0, 1]).map((index) => {
      const date = index === 0 ? today : yesterday;
      const day = sections[index]!;
      const awaitingOrder = index === 1 && firstDay === null && current.loading;
      const photos = awaitingOrder ? [] : day.photos;
      const loading = day.loading || awaitingOrder;
      const label = galleryDateLabel(date, today);
      return <div key={date}>
        {photos.length ? <GalleryTrack title={label} photos={photos} today={today} yesterday={yesterday} pool={pool}
          caption={(photo) => `등록자 ${photo.createdByName}`} onOpen={(photo, origin) => setViewer({ photo, origin })} />
          : <><h3 className={styles.dayHeading}>{label}</h3>{!loading && !day.error && <p className={styles.message}>등록된 사진이 없습니다.</p>}</>}
        {loading && <p className={photos.length ? styles.srOnly : styles.message} role="status">{label} 사진 확인 중</p>}
        {day.error && <p className={styles.message} role="alert">{day.error} <button type="button" onClick={() => setRetry((n) => n + 1)}>다시 시도</button></p>}
      </div>;
    })}
    <button type="button" className={styles.historyLink} onClick={() => setHistory(true)}>최근 7일 사진 보기</button>
    {history && <DeliveryPhotoHistoryLoader customer={customer} session={session} onClose={() => setHistory(false)}
      sync={(change) => { sync(change); refresh(); }} />}
    {viewer && sections.some((day) => day.photos.some((photo) => photo.photoId === viewer.photo.photoId))
      && <DeliveryPhotoHistoryLoader inspection={viewer} customer={customer} session={session} onClose={() => setViewer(null)} />}
  </>;
}

export function GalleryCustomer({ customers, status, retryCatalog, onClose, ...props }: CompareProps & {
  customers: readonly Customer[]; status: string; retryCatalog: () => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const customer = customers.find((item) => item.customerId === selected);
  const matches = useMemo(() => {
    if (query.trim()) return searchCustomers(customers, query);
    const ids = new Set(props.days.flatMap((day) => day.photos.map((photo) => photo.customerId)));
    return customers.filter((item) => ids.has(item.customerId));
  }, [customers, props.days, query]);
  return <BottomSheet open title={customer?.name ?? "업체 찾기"} onClose={onClose}>
    <div className={styles.compare} data-comparing={Boolean(customer)}>
      {customer ? <><button type="button" className={styles.historyLink} onClick={() => setSelected(null)}>업체 다시 찾기</button>
        <Comparison key={customer.customerId} customer={customer} {...props} /></> : <>
        <SearchField value={query} onChange={setQuery} label="업체 찾기" placeholder="거래처 검색 · 초성" />
        {status === "error" ? <p role="alert" className={styles.message}>거래처를 불러오지 못했어요. <button type="button" onClick={retryCatalog}>다시 시도</button></p>
          : status === "loading" ? <p role="status" className={styles.message}>거래처 확인 중</p> : null}
        {query.trim() && status === "ready" && !matches.length && <p className={styles.message}>검색 결과가 없습니다.</p>}
        <ul className={styles.matches}>{matches.map((item) => <li key={item.customerId}><button type="button" onClick={() => setSelected(item.customerId)}>
          <strong>{item.name}</strong><small>{item.deliveryAddress || item.officialAddress || item.administrativeDong || item.customerId}</small>
        </button></li>)}</ul>
      </>}
    </div>
  </BottomSheet>;
}
