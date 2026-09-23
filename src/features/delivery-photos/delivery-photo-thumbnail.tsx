"use client";

/* eslint-disable @next/next/no-img-element -- Authenticated relay bytes use revocable, memory-only blob URLs. */

import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

import { deliveryPhotoCardLabel, deliveryPhotoRegisteredAt } from "./delivery-photo-history-model";
import { useDeliveryPhotoImage } from "./use-delivery-photo-image";
import styles from "./delivery-photo-history.module.css";

export function DeliveryPhotoThumbnail({ photo, customerName, session, onOpen }: {
  photo: DeliveryPhotoMetadata;
  customerName: string;
  session: AuthenticatedSession;
  onOpen: (origin: HTMLElement) => void;
}) {
  const host = useRef<HTMLLIElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const image = useDeliveryPhotoImage(photo.photoId, "thumbnail", session, nearViewport);

  useEffect(() => {
    const target = host.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setNearViewport(true);
      observer.disconnect();
    }, { rootMargin: "160px 0px", threshold: 0 });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return <li ref={host} className={styles.item}>
    <button type="button" className={styles.card} aria-label={deliveryPhotoCardLabel(customerName, photo)}
      onFocus={() => setNearViewport(true)} onClick={(event) => onOpen(event.currentTarget)}>
      <span className={styles.frame} style={{ aspectRatio: `${photo.thumbnail.width} / ${photo.thumbnail.height}` }} data-image-state={image.status}>
        {image.status === "ready" ? <img src={image.url} alt="" width={photo.thumbnail.width} height={photo.thumbnail.height} decoding="async" onError={image.fail} />
          : <span className={styles.placeholder}><Icon name="camera" size={24} /><span>{image.status === "error" ? "미리보기 오류" : "미리보기 준비 중"}</span></span>}
      </span>
      <span className={styles.cardMeta}><strong>{deliveryPhotoRegisteredAt(photo.createdAt)}</strong><span>등록자 {photo.createdByName}</span></span>
    </button>
    {image.status === "error" ? <button type="button" className={styles.retry} onClick={image.retry}>미리보기 다시 불러오기</button> : null}
  </li>;
}
