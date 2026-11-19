"use client";

/* eslint-disable @next/next/no-img-element -- Private images use revocable, authenticated blob URLs. */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { GalleryThumbnails } from "./gallery-thumbnails";
import styles from "./gallery.module.css";

type Photo = DeliveryPhotoMetadata;
export type GalleryAnchor = Pick<Photo, "photoId" | "deliveryDateKey">;
export function galleryDateLabel(date: string, today: string) {
  return `${date === today ? "오늘" : "어제"} ${date.slice(5).replace("-", ".")}`;
}

function Preview({ photo, pool, priority, label, selected, onClick }: {
  photo: Photo; pool: GalleryThumbnails; priority: number; label: string; selected: boolean;
  onClick: (origin: HTMLElement) => void;
}) {
  const [result, setResult] = useState<{ url: string } | { error: string } | null>(null);
  useEffect(() => pool.watch(photo.photoId, priority, setResult), [photo.photoId, pool, priority]);
  return <><button type="button" className={styles.openPhoto} tabIndex={selected ? 0 : -1} aria-label={label}
    onClick={(event) => onClick(event.currentTarget)}>
    <span className={styles.mat}>{result && "url" in result ? <img alt="" src={result.url} decoding="async" draggable={false}
      width={photo.thumbnail.width} height={photo.thumbnail.height} onError={() => setResult({ error: "미리보기를 열지 못했어요." })} />
      : <span className={styles.placeholder}><Icon name="images" size={24} />{result ? result.error : "미리보기 준비 중"}</span>}</span>
    </button>{selected && result && "error" in result && <button type="button" className={styles.retry}
      onClick={() => { setResult(null); pool.invalidate(photo.photoId); }}>미리보기 다시 불러오기</button>}</>;
}

type Step = { index: number; stride: number };
function position(track: HTMLDivElement): Step {
  const first = track.children[0] as HTMLElement;
  const second = track.children[1] as HTMLElement | undefined;
  const stride = second ? second.getBoundingClientRect().left - first.getBoundingClientRect().left : 0;
  return { index: stride ? Math.max(0, Math.min(track.children.length - 1, Math.round(track.scrollLeft / stride))) : 0, stride };
}

export function GalleryTrack({ title, photos, today, yesterday, dayStates, caption, pool, enabled = true, initialAnchor,
  onAnchor, onOpen }: {
  title: string; photos: readonly Photo[]; today: string; yesterday: string; dayStates?: readonly string[];
  caption: (photo: Photo) => string; pool: GalleryThumbnails; enabled?: boolean; initialAnchor?: GalleryAnchor | undefined;
  onAnchor?: (photo: Photo) => void; onOpen: (photo: Photo, origin: HTMLElement) => void;
}) {
  const id = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLElement>(null);
  const timer = useRef(0);
  const touching = useRef(false);
  const buttonTarget = useRef<number | null>(null);
  const remembered = useRef(new Map<string, string>());
  const [anchor, setAnchor] = useState<GalleryAnchor & { index?: number }>(initialAnchor ?? photos[0]!);
  const [movingPhotos, setMovingPhotos] = useState<readonly Photo[] | null>(null);
  const [near, setNear] = useState(false);
  const [during, setDuring] = useState(0);
  const items = movingPhotos ?? photos;
  const found = items.findIndex((photo) => photo.photoId === anchor?.photoId);
  const previousDate = anchor?.deliveryDateKey;
  const neighbor = Math.min(anchor.index ?? 0, items.length - 1);
  const selected = found >= 0 ? found : neighbor >= 0 && items[neighbor]?.deliveryDateKey === previousDate ? neighbor
    : Math.max(0, items.findIndex((photo) => photo.deliveryDateKey === previousDate));
  const photo = items[selected]!;
  const pendingAnchor = found < 0 && Boolean(dayStates?.[anchor.deliveryDateKey === today ? 0 : 1]);
  if (!movingPhotos && !pendingAnchor && (anchor.photoId !== photo.photoId || anchor.index !== selected)) {
    setAnchor({ photoId: photo.photoId, deliveryDateKey: photo.deliveryDateKey, index: selected });
  }

  const align = useCallback((index: number, behavior: ScrollBehavior = "instant") => {
    const track = trackRef.current;
    const card = track?.children[index];
    if (!track || !card) return;
    const rect = card.getBoundingClientRect();
    const delta = rect.left + rect.width / 2 - track.getBoundingClientRect().left - track.clientWidth / 2;
    if (Math.abs(delta) > .5) track.scrollTo({ left: track.scrollLeft + delta, behavior });
  }, []);

  // WebKit can preserve the old scrollLeft when a new card is inserted ahead of the selected ID.
  // Correct the new geometry before paint, including after a viewport or text-size change.
  useLayoutEffect(() => {
    if (!movingPhotos) align(selected);
  }, [align, movingPhotos, selected, photo.photoId]);
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track || movingPhotos) return;
    const observer = new ResizeObserver(() => align(selected));
    observer.observe(track);
    return () => observer.disconnect();
  }, [align, movingPhotos, selected]);
  useLayoutEffect(() => {
    // A first visible photo is also an anchor. Wait for yesterday's page when restoring across midnight.
    if (movingPhotos || pendingAnchor) return;
    remembered.current.set(photo.deliveryDateKey, photo.photoId);
    onAnchor?.(photo);
  }, [movingPhotos, onAnchor, pendingAnchor, photo]);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const observer = new IntersectionObserver(([entry]) => setNear(Boolean(entry?.isIntersecting)), { rootMargin: "80px 0px" });
    observer.observe(row);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const settle = () => {
    const track = trackRef.current;
    if (!track || touching.current) return;
    window.clearTimeout(timer.current);
    const index = buttonTarget.current ?? position(track).index;
    if (buttonTarget.current !== null) align(index);
    buttonTarget.current = null;
    const landed = items[index];
    if (landed) {
      setAnchor({ photoId: landed.photoId, deliveryDateKey: landed.deliveryDateKey, index });
      remembered.current.set(landed.deliveryDateKey, landed.photoId);
      onAnchor?.(landed);
    }
    setMovingPhotos(null);
  };
  const settleRef = useRef(settle);
  useLayoutEffect(() => { settleRef.current = settle; });
  const later = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => settleRef.current(), 140);
  };
  const move = (index: number, jump = false) => {
    if (index < 0 || index >= items.length) return;
    if (jump || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      buttonTarget.current = null;
      align(index);
      setAnchor({ photoId: items[index]!.photoId, deliveryDateKey: items[index]!.deliveryDateKey, index }); setMovingPhotos(null);
    } else {
      buttonTarget.current = index;
      setMovingPhotos(items); setDuring(index); align(index, "smooth"); later();
    }
  };
  const jumpTo = (date: string) => {
    const saved = items.findIndex((item) => item.photoId === remembered.current.get(date));
    move(saved >= 0 ? saved : items.findIndex((item) => item.deliveryDateKey === date), true);
  };
  const visibleIndex = movingPhotos ? during : selected;
  return <section className={styles.row} ref={rowRef} aria-labelledby={id} data-gallery-row>
    <header className={styles.rowHeader}><h2 id={id}>{title}</h2>
      {dayStates && <div className={styles.days} role="group" aria-label="등록일 선택">
        {[today, yesterday].map((date, index) => <button type="button" key={date} aria-pressed={photo.deliveryDateKey === date}
          disabled={!items.some((item) => item.deliveryDateKey === date)} onClick={() => jumpTo(date)}
          aria-label={`${galleryDateLabel(date, today)} ${dayStates[index] ?? ""}`.trim()}>{galleryDateLabel(date, today)}</button>)}
      </div>}
    </header>
    <div className={styles.track} ref={trackRef} role="group" aria-roledescription="캐러셀" aria-label={`${title} 사진`}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          const index = selected + (event.key === "ArrowRight" ? 1 : -1);
          move(index, true);
          trackRef.current?.children[index]?.querySelector("button")?.focus({ preventScroll: true });
        }
      }}
      onTouchStart={() => { buttonTarget.current = null; touching.current = true; }}
      onWheel={() => { buttonTarget.current = null; }}
      onTouchEnd={() => { touching.current = false; later(); }} onTouchCancel={() => { touching.current = false; later(); }}
      onScroll={() => {
        const track = trackRef.current!;
        const { index, stride } = position(track);
        if (!movingPhotos && index === selected && Math.abs(track.scrollLeft - index * stride) < 1) return;
        setDuring(index); setMovingPhotos(items); later();
      }} onScrollEnd={() => settleRef.current()}>
      {items.map((item, index) => <div key={item.photoId} className={styles.slide} data-photo-id={item.photoId} data-current={index === selected}>
        {enabled && near && Math.abs(index - visibleIndex) <= 1
          ? <Preview photo={item} pool={pool} priority={index === visibleIndex ? 0 : 1} selected={index === selected}
            label={`${caption(item)} · ${galleryDateLabel(item.deliveryDateKey, today)} 사진 크게 보기`}
            onClick={(origin) => index === selected ? onOpen(item, origin) : move(index)} /> : <span className={styles.mat} />}
      </div>)}
    </div>
    <div className={styles.caption}>
      {items.length > 1 && <button type="button" aria-label="이전 사진" disabled={selected === 0} onClick={() => move(selected - 1)}><Icon name="chevron-right" className={styles.previous} size={16} /></button>}
      <strong aria-live="polite" aria-atomic="true" style={{ visibility: movingPhotos ? "hidden" : "visible" }}>{caption(photo)}<span className={styles.srOnly}> · {galleryDateLabel(photo.deliveryDateKey, today)}, {selected + 1} / {items.length}</span></strong>
      {items.length > 1 && <button type="button" aria-label="다음 사진" disabled={selected === items.length - 1} onClick={() => move(selected + 1)}><Icon name="chevron-right" size={16} /></button>}
    </div>
  </section>;
}
