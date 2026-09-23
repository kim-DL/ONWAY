"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

import { deliveryPhotoHistoryErrorMessage, deliveryPhotoHistoryRepository } from "./delivery-photo-history-repository";
import { newestDeliveryPhotos } from "./delivery-photo-history-model";
import { DeliveryPhotoThumbnail } from "./delivery-photo-thumbnail";
import styles from "./delivery-photo-history.module.css";

const DeliveryPhotoViewer = dynamic(() => import("./delivery-photo-viewer").then((module) => module.DeliveryPhotoViewer), { ssr: false });

type HistoryState = { status: "loading"; photos: DeliveryPhotoMetadata[] }
  | { status: "ready"; photos: DeliveryPhotoMetadata[] }
  | { status: "error"; photos: DeliveryPhotoMetadata[]; message: string };

export function DeliveryPhotoHistory({ customer, session, onClose }: {
  customer: Pick<Customer, "customerId" | "name">;
  session: AuthenticatedSession;
  onClose: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<HistoryState>({ status: "loading", photos: [] });
  const [viewer, setViewer] = useState<{ index: number; origin: HTMLElement } | null>(null);
  const sessionKey = `${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}`;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    queueMicrotask(() => { if (active) setState({ status: "loading", photos: [] }); });
    void deliveryPhotoHistoryRepository.list(customer.customerId, session, controller.signal).then((result) => {
      if (active && !controller.signal.aborted) setState({ status: "ready", photos: newestDeliveryPhotos(result.photos) });
    }).catch((error: unknown) => {
      if (active && !controller.signal.aborted) setState({ status: "error", photos: [], message: deliveryPhotoHistoryErrorMessage(error) });
    });
    return () => { active = false; controller.abort(); };
  }, [attempt, customer.customerId, session, sessionKey]);

  return <BottomSheet open title={`${customer.name} 납품사진`} onClose={onClose}>
    <section className={styles.history} aria-label={`${customer.name} 최근 납품사진`}>
      {state.status === "loading" ? <p className={styles.status} role="status">최근 납품사진을 불러오는 중입니다.</p> : null}
      {state.status === "error" ? <div className={styles.error} role="alert"><p>{state.message}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>다시 시도</button></div> : null}
      {state.status === "ready" ? <>
        <p className={styles.count}>최근 기록 <strong>{state.photos.length}장</strong></p>
        {state.photos.length ? <ul className={styles.grid}>{state.photos.map((photo, index) => <DeliveryPhotoThumbnail key={photo.photoId}
          photo={photo} customerName={customer.name} session={session} onOpen={(origin) => setViewer({ index, origin })} />)}</ul>
          : <p className={styles.status}>최근 확인할 수 있는 납품사진이 없습니다.</p>}
      </> : null}
    </section>
    {viewer ? <DeliveryPhotoViewer key={`${sessionKey}:${state.photos[viewer.index]?.photoId ?? "closed"}`} customerName={customer.name}
      session={session} photos={state.photos} initialIndex={viewer.index} origin={viewer.origin} onClose={() => setViewer(null)} /> : null}
  </BottomSheet>;
}
