"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";
import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { deliveryPhotoDateKey } from "../delivery-photo-memory";
import { DeliveryPhotoHistoryLoader } from "../delivery-photo-history-loader";
import type { useDeliveryPhotoCatalog } from "../use-delivery-photo-catalog";
import type { useDeliveryPhotoData } from "../use-delivery-photo-data";
import { GalleryCustomer } from "./gallery-customer";
import { GalleryThumbnails } from "./gallery-thumbnails";
import { GalleryTrack, type GalleryAnchor } from "./gallery-track";
import { useGalleryDay, type GalleryDay } from "./use-gallery-day";
import styles from "./gallery.module.css";

type Props = {
  session: AuthenticatedSession; catalog: ReturnType<typeof useDeliveryPhotoCatalog>; data: ReturnType<typeof useDeliveryPhotoData>;
  onBack: () => void;
};
const oneDay = 86_400_000;

function observeDate(change: () => void) {
  let timer = 0;
  const wake = () => {
    change();
    window.clearTimeout(timer);
    const midnight = Date.parse(`${deliveryPhotoDateKey()}T00:00:00+09:00`) + oneDay;
    timer = window.setTimeout(wake, Math.max(1, midnight - Date.now()));
  };
  wake();
  window.addEventListener("pageshow", wake);
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", wake);
  document.addEventListener("resume", wake);
  return () => {
    window.clearTimeout(timer);
    window.removeEventListener("pageshow", wake);
    window.removeEventListener("focus", wake);
    document.removeEventListener("visibilitychange", wake);
    document.removeEventListener("resume", wake);
  };
}

function GalleryWindow({ session, catalog, data, today, anchors }: Omit<Props, "onBack"> & { today: string; anchors: Map<string, GalleryAnchor> }) {
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - oneDay).toISOString().slice(0, 10);
  const [finding, setFinding] = useState(false);
  const [viewer, setViewer] = useState<{ photo: DeliveryPhotoMetadata; origin: HTMLElement } | null>(null);
  const [revision, setRevision] = useState(0);
  const { refresh: refreshWorkspace, clear: deny } = data;
  const refresh = useCallback(() => { refreshWorkspace(); setRevision((n) => n + 1); }, [refreshWorkspace]);
  useEffect(() => {
    let last = 0;
    const resume = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine || Date.now() - last < 500) return;
      last = Date.now(); refresh();
    };
    const timer = window.setInterval(resume, 60_000);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    document.addEventListener("resume", resume);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
      document.removeEventListener("resume", resume);
    };
  }, [refresh]);
  useLayoutEffect(() => {
    for (const [id, anchor] of anchors) if (anchor.deliveryDateKey !== today && anchor.deliveryDateKey !== yesterday) anchors.delete(id);
  }, [anchors, today, yesterday]);
  const match = data.snapshot?.today.deliveryDateKey === today ? data.snapshot.today : null;
  // A complete workspace list serves today immediately. A missing/partial workspace has a read-only fallback.
  const needToday = !match || match.truncated;
  const paged = useGalleryDay(session, today, today, needToday, revision, deny);
  const previous = useGalleryDay(session, today, yesterday, true, revision, deny);
  const current = useMemo<GalleryDay>(() => {
    if (!match) return paged;
    if (!match.truncated) return { photos: match.photos, loading: data.loading, error: data.error };
    const unique = new Map([...paged.photos, ...match.photos].map((photo) => [photo.photoId, photo]));
    return { ...paged, photos: [...unique.values()] };
  }, [data.error, data.loading, match, paged]);
  const days = useMemo(() => [current, previous], [current, previous]);
  const states = useMemo(() => days.map((day) => day.error ? "조회 실패" : day.loading ? "확인 중" : ""), [days]);
  const names = useMemo(() => new Map(catalog.customers.map((customer) => [customer.customerId, customer.name])), [catalog.customers]);
  const caption = useCallback((photo: DeliveryPhotoMetadata) => names.get(photo.customerId) ??
    (catalog.status === "loading" ? "업체명 확인 중" : "업체명 확인 불가"), [names, catalog.status]);
  const groups = useMemo(() => {
    const result = new Map<string, DeliveryPhotoMetadata[]>();
    const photos = days.flatMap((day) => day.photos).sort((a, b) =>
      b.deliveryDateKey.localeCompare(a.deliveryDateKey) || b.createdAt.localeCompare(a.createdAt) || b.photoId.localeCompare(a.photoId));
    for (const photo of photos) {
      const row = result.get(photo.createdByEmployeeId);
      if (row) row.push(photo); else result.set(photo.createdByEmployeeId, [photo]);
    }
    return result;
  }, [days]);
  const [order, setOrder] = useState<string[]>([]);
  const rows = useMemo(() => {
    const kept = order.filter((id) => groups.has(id));
    const seen = new Set(kept);
    return kept.concat([...groups.keys()].filter((id) => !seen.has(id)));
  }, [groups, order]);
  if (order.length !== rows.length || rows.some((id, i) => id !== order[i])) setOrder(rows);
  const pool = useMemo(() => new GalleryThumbnails(session, today, deny), [deny, session, today]);
  useLayoutEffect(() => () => pool.clear(), [pool]);
  const onOpen = (photo: DeliveryPhotoMetadata, origin: HTMLElement) => setViewer({ photo, origin });
  const showViewer = viewer && days.some((day) => day.photos.some((item) => item.photoId === viewer.photo.photoId));
  return <>
    <button type="button" className={styles.find} aria-haspopup="dialog" onClick={() => setFinding(true)}>
      <span><Icon name="search-refined" size={16} /></span>업체 찾기
    </button>
    <div className={styles.rows}>
      {catalog.status === "error" && <p role="alert" className={styles.message}>업체명을 불러오지 못했어요. <button type="button" onClick={catalog.retry}>다시 시도</button></p>}
      {days.map((day, i) => day.error && <p key={i} role="alert" className={styles.message}>{i === 0 ? "오늘" : "어제"} · {day.error} <button type="button" onClick={refresh}>다시 시도</button></p>)}
      {!rows.length && (days.some((day) => day.loading) ? <p className={styles.message} role="status">납품사진 불러오는 중</p>
        : !days.some((day) => day.error) && <p className={styles.message}>어제와 오늘 등록된 납품사진이 없습니다.</p>)}
      {rows.map((id) => <GalleryTrack key={id} title={groups.get(id)![0]!.createdByName} photos={groups.get(id)!} today={today}
        yesterday={yesterday} dayStates={states} pool={pool} enabled={!finding} caption={caption} initialAnchor={anchors.get(id)}
        onAnchor={(photo) => anchors.set(id, { photoId: photo.photoId, deliveryDateKey: photo.deliveryDateKey })} onOpen={onOpen} />)}
    </div>
    {finding && <GalleryCustomer session={session} today={today} yesterday={yesterday} days={days} pool={pool}
      customers={catalog.customers} status={catalog.status} retryCatalog={catalog.retry} onClose={() => setFinding(false)} sync={data.accept}
      revision={revision + (data.snapshot?.refreshedAt ?? 0)} refresh={refresh} onDenied={deny} />}
    {showViewer && <DeliveryPhotoHistoryLoader key={viewer.photo.photoId}
      customer={{ name: caption(viewer.photo), customerId: viewer.photo.customerId }} session={session}
      inspection={viewer} onClose={() => setViewer(null)} />}
  </>;
}

export default function DeliveryPhotoGallery({ onBack, ...props }: Props) {
  const today = useSyncExternalStore(observeDate, deliveryPhotoDateKey, deliveryPhotoDateKey);
  const [anchors] = useState(() => new Map<string, GalleryAnchor>());
  useLayoutEffect(() => { if (props.data.authBlocked) anchors.clear(); }, [anchors, props.data.authBlocked]);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return <section className={`shell-page ${styles.page}`} aria-labelledby="gallery-heading">
    <header className={styles.top}><button type="button" className={styles.back} onClick={onBack} aria-label="납품사진으로 돌아가기"><Icon name="arrow-left" /></button>
      <h1 id="gallery-heading" tabIndex={-1} ref={heading}>납품사진 갤러리</h1></header>
    {props.data.authBlocked ? <p role="alert" className={styles.message}>사진 이용 권한을 확인하지 못했어요. <button type="button" onClick={props.data.refresh}>다시 확인</button></p>
      : <GalleryWindow key={today} {...props} today={today} anchors={anchors} />}
  </section>;
}
