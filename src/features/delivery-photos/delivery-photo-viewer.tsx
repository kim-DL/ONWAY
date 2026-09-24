"use client";

/* eslint-disable @next/next/no-img-element -- Full evidence stays in a revocable, authenticated blob URL. */

import dynamic from "next/dynamic";
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { usePhotoMorph } from "@/components/ui/photo-morph";
import morphStyles from "@/components/ui/photo-morph.module.css";
import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

import type { DeliveryPhotoDeleteUpdate } from "./delivery-photo-delete-model";
import { deliveryPhotoRegisteredAt } from "./delivery-photo-history-model";
import { useDeliveryPhotoImage } from "./use-delivery-photo-image";
import styles from "./delivery-photo-history.module.css";

const DeliveryPhotoDeleteAction = dynamic(() => import("./delivery-photo-delete-action").then((module) => module.DeliveryPhotoDeleteAction), { ssr: false });

export function DeliveryPhotoViewer({ customerName, session, photos, initialIndex, origin, onClose, onDeleted }: {
  customerName: string;
  session: AuthenticatedSession;
  photos: DeliveryPhotoMetadata[];
  initialIndex: number;
  origin: HTMLElement | null;
  onClose: () => void;
  onDeleted: (photoId: string, update: DeliveryPhotoDeleteUpdate) => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const photo = photos[index] ?? photos[0];
  const image = useDeliveryPhotoImage(photo?.photoId ?? "", "evidence", session, Boolean(photo));
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gestureStart = useRef<{ x: number; y: number } | null>(null);
  const { stageRef, requestClose, beforeClose } = usePhotoMorph({
    origin: index === initialIndex ? origin : null,
    identity: image.status === "ready" ? photo?.photoId ?? "missing" : `loading:${photo?.photoId ?? "missing"}`,
    onClose,
    canReturn: index === initialIndex,
  });

  const navigate = useCallback((direction: -1 | 1) => {
    setIndex((current) => Math.max(0, Math.min(photos.length - 1, current + direction)));
  }, [photos.length]);

  if (!photo) return null;
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gestureStart.current ??= { x: event.clientX, y: event.clientY };
  };
  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = gestureStart.current;
    pointers.current.delete(event.pointerId);
    if (start && pointers.current.size === 0) {
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY)) navigate(deltaX < 0 ? 1 : -1);
    }
    if (pointers.current.size === 0) gestureStart.current = null;
  };

  return createPortal(<div onKeyDown={(event) => {
    event.stopPropagation();
    if (event.defaultPrevented) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      navigate(event.key === "ArrowLeft" ? -1 : 1);
    }
  }}><BottomSheet open title={`${customerName} 납품사진 보기`} onClose={requestClose} beforeClose={beforeClose}>
    <div ref={stageRef} className={`${morphStyles.stage} ${styles.stage}`} data-photo-morph-stage data-photo-morph-state="open"
      role="region" aria-label={`${customerName} 납품사진 크게 보기`} onPointerDown={pointerDown} onPointerUp={pointerUp}
      onPointerCancel={() => { pointers.current.clear(); gestureStart.current = null; }}>
      {image.status === "ready" ? <img src={image.url} alt={`${customerName} 납품사진, 등록자 ${photo.createdByName}`} decoding="async" draggable={false} onError={image.fail} />
        : image.status === "error" ? <div className={styles.failure} role="alert"><p>{image.message}</p><button type="button" onClick={image.retry}>사진 다시 불러오기</button></div>
          : <p className={styles.loading} role="status">원본 사진을 불러오는 중입니다.</p>}
    </div>
    <div className={styles.metadata}><strong>{deliveryPhotoRegisteredAt(photo.createdAt, true)}</strong><span>등록자 {photo.createdByName}</span></div>
    <BottomSheetActions className={styles.actions ?? ""}>
      <span className={styles.position} role="status" aria-live="polite">{index + 1} / {photos.length}</span>
      <button type="button" disabled={index === 0} onClick={() => navigate(-1)}><Icon name="arrow-left" />이전</button>
      <button type="button" disabled={index === photos.length - 1} onClick={() => navigate(1)}>다음<Icon name="chevron-right" /></button>
      <DeliveryPhotoDeleteAction key={photo.photoId} photo={photo} session={session} onDeleted={onDeleted} />
      <button type="button" onClick={requestClose}><Icon name="close" />닫기</button>
    </BottomSheetActions>
  </BottomSheet></div>, document.body);
}
