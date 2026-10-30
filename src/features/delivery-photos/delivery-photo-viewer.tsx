"use client";

/* eslint-disable @next/next/no-img-element -- Full evidence stays in a revocable, authenticated blob URL. */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { LoadingStatus } from "@/components/ui/loading-status";
import { usePhotoMorph } from "@/components/ui/photo-morph";
import morphStyles from "@/components/ui/photo-morph.module.css";
import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

import type { DeliveryPhotoDeleteUpdate } from "./delivery-photo-delete-model";
import { deliveryPhotoRegisteredAt } from "./delivery-photo-history-model";
import { useDeliveryPhotoImage } from "./use-delivery-photo-image";
import styles from "./delivery-photo-history.module.css";

const DeliveryPhotoDeleteAction = dynamic(() => import("./delivery-photo-delete-action").then((module) => module.DeliveryPhotoDeleteAction), { ssr: false });
const PhotoPanZoom = dynamic(() => import("@/components/ui/photo-pan-zoom").then((module) => module.PhotoPanZoom), { ssr: false,
  loading: () => <LoadingStatus label="사진 확대 준비 중" detail="확대·이동 기능을 준비하고 있습니다." /> });

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
  const [zoomed, setZoomed] = useState(false);
  const { stageRef, requestClose, beforeClose } = usePhotoMorph({
    origin: index === initialIndex ? origin : null,
    identity: image.status === "ready" ? photo?.photoId ?? "missing" : `loading:${photo?.photoId ?? "missing"}`,
    onClose,
    canReturn: index === initialIndex && !zoomed,
  });

  const navigate = useCallback((direction: -1 | 1) => {
    setZoomed(false);
    setIndex((current) => Math.max(0, Math.min(photos.length - 1, current + direction)));
  }, [photos.length]);
  useEffect(() => () => {
    // Image changes dispose their controls; restore the trigger only when the
    // complete viewer closes, rather than during previous/next navigation.
    queueMicrotask(() => { if (origin?.isConnected) origin.focus({ preventScroll: true }); });
  }, [origin]);

  if (!photo) return null;

  return createPortal(<div onKeyDown={(event) => {
    event.stopPropagation();
    if (event.defaultPrevented) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      navigate(event.key === "ArrowLeft" ? -1 : 1);
    }
  }}><BottomSheet open title={`${customerName} 납품사진 보기`} onClose={requestClose} beforeClose={beforeClose}>
    <div ref={stageRef} className={`${morphStyles.stage} ${styles.stage}`} data-photo-morph-stage data-photo-morph-state="open"
      role="region" aria-label={`${customerName} 납품사진 크게 보기`} tabIndex={0} data-zoomed={zoomed}>
      {image.status === "ready" ? <img src={image.url} alt={`${customerName} 납품사진, 등록자 ${photo.createdByName}`} decoding="async" draggable={false} onError={image.fail} />
        : image.status === "error" ? <div className={styles.failure} role="alert"><p>{image.message}</p><button type="button" onClick={image.retry}>사진 다시 불러오기</button></div>
          : <LoadingStatus key={photo.photoId} className={styles.loading} label="원본 사진 불러오는 중" detail="선택한 사진의 원본을 확인하고 있습니다." />}
    </div>
    {image.status === "ready" ? <PhotoPanZoom key={image.url} stageRef={stageRef} origin={null} onZoomedChange={setZoomed} onSwipe={navigate} /> : null}
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
