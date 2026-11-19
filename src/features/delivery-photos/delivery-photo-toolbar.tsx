"use client";

import dynamic from "next/dynamic";
import { useLayoutEffect, useRef, type ComponentProps, type ReactNode } from "react";
import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import type { projectDeliveryPhotoCompletion } from "./delivery-photo-domain";
import { SearchField } from "@/components/ui/search-field";
import { Icon } from "@/components/ui/icon";
import { LoadingStatus } from "@/components/ui/loading-status";
import type { useDeliveryPhotoUploads } from "./use-delivery-photo-uploads";
import type { useDeliveryPhotoData } from "./use-delivery-photo-data";
import type { useDeliveryPhotoCatalog } from "./use-delivery-photo-catalog";
import photoStyles from "./photo.module.css";
import styles from "./toolbar.module.css";

export const WorkspacePhotoGallery = dynamic(() => import(/* webpackChunkName: "delivery-photo-gallery" */ "./gallery/delivery-photo-gallery"), {
  loading: () => <LoadingStatus label="갤러리 여는 중" />,
});

export default function DeliveryPhotoToolbar({ summary, progress, query, onQueryChange, galleryOpen, onOpenGallery, children }: {
  summary: string;
  progress?: number | undefined;
  query: string;
  onQueryChange: (value: string) => void;
  onOpenGallery?: (() => void) | undefined;
  galleryOpen?: boolean | undefined;
  children?: ReactNode;
}) {
  const galleryButton = useRef<HTMLButtonElement>(null);
  const returnScroll = useRef<number | null>(null);
  useLayoutEffect(() => {
    const scroller = galleryButton.current?.closest(".workspace-content");
    if (galleryOpen && scroller) scroller.scrollTop = 0;
    else if (returnScroll.current !== null) {
      if (scroller) scroller.scrollTop = returnScroll.current;
      galleryButton.current?.focus({ preventScroll: true });
      returnScroll.current = null;
    }
  }, [galleryOpen]);
  return <>
    <header className={styles.header}>
      <h1 id="delivery-photo-heading">납품사진</h1>
    </header>
    <div className={`${photoStyles.searchActions} ${styles.searchActions}`}>
      <SearchField value={query} onChange={onQueryChange} label="납품사진 거래처 검색" placeholder="거래처 검색 · 초성" />
      {onOpenGallery && <button type="button" ref={galleryButton} onClick={() => {
        returnScroll.current = galleryButton.current?.closest(".workspace-content")?.scrollTop ?? 0;
        onOpenGallery();
      }}>
        <span><Icon name="images" size={19} strokeWidth={1.75} /></span>갤러리
      </button>}
    </div>
    <div className={styles.dayBar}>
      <div className={styles.progress}>
        <strong role="status">{summary}</strong>
        {progress !== undefined && <span className={styles.progressTrack} aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </span>}
      </div>
      {children}
    </div>
  </>;
}

function DeliveryPhotoNotices({ uploads, targetVisible, data, catalog }: {
  uploads: ReturnType<typeof useDeliveryPhotoUploads>; targetVisible: boolean; data: ReturnType<typeof useDeliveryPhotoData>; catalog: ReturnType<typeof useDeliveryPhotoCatalog>;
}) {
  return <>
    {uploads.storageError ? <p className={photoStyles.notice} role="alert">기기에 보관된 사진을 확인하지 못했어요. <button type="button" onClick={uploads.retryStorage}>보관함 다시 읽기</button></p>
      : !uploads.ready && !targetVisible ? <p className={photoStyles.freshness} role="status">기기에 보관된 사진을 확인하고 있어요.</p> : null}
    {data.error || catalog.status === "error" ? <div className={photoStyles.notice} role="alert">{data.error || "거래처 정보를 불러오지 못했습니다."} <button type="button" onClick={() => {
      if (data.error) data.refresh();
      if (catalog.status === "error") catalog.retry();
    }}>다시 시도</button></div> : null}
    {data.loading && data.snapshot ? <LoadingStatus className={photoStyles.freshness} label="최신 목록 확인 중" detail="오늘 납품 기록을 확인하고 있습니다." /> : null}
    {data.snapshot?.today.truncated ? <p className={photoStyles.notice}>오늘 사진이 많아 기록완료 수가 정확하지 않을 수 있습니다. 관리자에게 확인하세요.</p> : null}
  </>;
}


const PlanningEntry = dynamic(() => import("../delivery-planning/planning-entry"), { ssr: false });

export function WorkspacePhotoToolbar({ session, customers, completion, data, catalog, uploads, targetVisible, onEdit, query, onQueryChange, galleryOpen, onOpenGallery, children }:
  ComponentProps<typeof DeliveryPhotoNotices> & {
    session: AuthenticatedSession; customers: readonly Customer[]; completion: ReturnType<typeof projectDeliveryPhotoCompletion>;
    onEdit: (edit: { mode: "day" | "route"; onDone?: () => void }) => void;
    query: string; onQueryChange: (value: string) => void; galleryOpen?: boolean | undefined; onOpenGallery?: (() => void) | undefined; children: ReactNode;
  }) {
  const snapshot = data.snapshot;
  const ready = Boolean(snapshot && catalog.status === "ready");
  const remaining = completion.remainingCustomerIds.length;
  const completed = completion.completedCustomerIds.length;
  return <>
    <DeliveryPhotoToolbar galleryOpen={galleryOpen}
      onOpenGallery={onOpenGallery && (() => { if (snapshot && !data.loading) data.refresh(); onOpenGallery(); })}
      summary={ready ? `남음 ${remaining}곳 · 기록완료 ${completed}곳` : "오늘 목록"}
      progress={ready && remaining + completed > 0 ? completed / (remaining + completed) * 100 : undefined}
      query={query} onQueryChange={onQueryChange}>
      {ready && snapshot && <PlanningEntry key={`${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}:${snapshot.day.deliveryDateKey}`}
        customers={customers} snapshot={snapshot} accept={data.accept} refresh={data.refresh}
        onEdit={onEdit} />}
    </DeliveryPhotoToolbar>
    {children}
    <DeliveryPhotoNotices data={data} catalog={catalog} uploads={uploads} targetVisible={targetVisible} />
  </>;
}
