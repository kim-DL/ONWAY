"use client";

import dynamic from "next/dynamic";
import type { ComponentProps, ReactNode } from "react";
import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import type { projectDeliveryPhotoCompletion } from "./delivery-photo-domain";
import { SearchField } from "@/components/ui/search-field";
import { WelcomeGreeting } from "@/features/app-shell/welcome-greeting";
import { useTimeGreeting } from "@/features/app-shell/time-greeting";
import { splitGreeting } from "@/features/app-shell/typing-greeting";
import { LoadingStatus } from "@/components/ui/loading-status";
import type { useDeliveryPhotoUploads } from "./use-delivery-photo-uploads";
import type { useDeliveryPhotoData } from "./use-delivery-photo-data";
import type { useDeliveryPhotoCatalog } from "./use-delivery-photo-catalog";
import photoStyles from "./photo.module.css";
import styles from "./toolbar.module.css";

export default function DeliveryPhotoToolbar({ displayName, summary, ready, hasToday, onEdit, query, onQueryChange, children }: {
  displayName: string;
  summary: string;
  ready: boolean;
  hasToday: boolean;
  onEdit: (mode: "route" | "day") => void;
  query: string;
  onQueryChange: (value: string) => void;
  children?: ReactNode;
}) {
  const greeting = useTimeGreeting();
  const nameLength = splitGreeting(displayName).length;
  const helloEnd = nameLength + splitGreeting("님 안녕하세요.").length;
  return <>
    <header className={styles.header}>
      <div className={styles.summary}><h1 id="delivery-photo-heading">납품사진</h1><strong>{summary}</strong></div>
      <div className={styles.welcome}><WelcomeGreeting variant="copy" className={styles.greetingCopy!}
        renderCharacters={(characters) => <>
          <span className={styles.hello}><span className={styles.welcomeName} title={displayName}>{characters.slice(0, nameLength)}</span><span className={styles.helloSuffix}>{characters.slice(nameLength, helloEnd)}</span></span>
          <span className={styles.welcomeMessage}>{characters.slice(helloEnd + 1)}</span>
        </>}>
        {`${displayName}님 안녕하세요.\n${greeting}.`}
      </WelcomeGreeting></div>
    </header>
    {children}
    {ready ? <div className={styles.manageActions} role="group" aria-label="납품처 관리">
      <button type="button" onClick={() => onEdit("route")}>내 납품처</button>
      <button type="button" onClick={() => onEdit("day")}>오늘 납품처</button>
      <button type="button" disabled={!hasToday} onClick={() => onEdit("day")}>순서 편집</button>
    </div> : null}
    <SearchField value={query} onChange={onQueryChange} label="납품사진 거래처 검색" placeholder="거래처 검색 · 초성" />
  </>;
}

function DeliveryPhotoNotices({ uploads, targetVisible, data, catalog }: {
  uploads: ReturnType<typeof useDeliveryPhotoUploads>; targetVisible: boolean; data: ReturnType<typeof useDeliveryPhotoData>; catalog: ReturnType<typeof useDeliveryPhotoCatalog>;
}) {
  return <>
    {uploads.storageError ? <p className={photoStyles.notice} role="alert">기기에 보관된 사진을 확인하지 못했어요. <button type="button" onClick={uploads.retryStorage}>보관함 다시 읽기</button></p>
      : !uploads.ready && !targetVisible ? <p className={photoStyles.notice} role="status">기기에 보관된 사진을 확인하고 있어요.</p> : null}
    {data.error || catalog.status === "error" ? <div className={photoStyles.notice} role="alert">{data.error || "거래처 정보를 불러오지 못했습니다."} <button type="button" onClick={() => {
      if (data.error) data.refresh();
      if (catalog.status === "error") catalog.retry();
    }}>다시 시도</button></div> : null}
    {data.loading && data.snapshot ? <LoadingStatus className={photoStyles.freshness} label="최신 목록 확인 중" detail="오늘 납품 기록을 확인하고 있습니다." /> : null}
    {data.snapshot?.today.truncated ? <p className={photoStyles.notice}>오늘 사진이 많아 기록완료 수가 정확하지 않을 수 있습니다. 관리자에게 확인하세요.</p> : null}
  </>;
}


const PlanningEntry = dynamic(() => import("../delivery-planning/planning-entry"), { ssr: false });

export function WorkspacePhotoToolbar({ session, customers, hasToday, completion, data, catalog, uploads, targetVisible, onEdit, query, onQueryChange, children }:
  ComponentProps<typeof DeliveryPhotoNotices> & {
    session: AuthenticatedSession; customers: readonly Customer[]; hasToday: boolean; completion: ReturnType<typeof projectDeliveryPhotoCompletion>;
    onEdit: (edit: { mode: "day" | "route"; onDone?: () => void }) => void;
    query: string; onQueryChange: (value: string) => void; children: ReactNode;
  }) {
  const snapshot = data.snapshot;
  const ready = Boolean(snapshot && catalog.status === "ready");
  return <>
    <DeliveryPhotoToolbar displayName={session.displayName} ready={ready} hasToday={hasToday} onEdit={(mode) => onEdit({ mode })}
      summary={ready ? `남음 ${completion.remainingCustomerIds.length}곳 · 기록완료 ${completion.completedCustomerIds.length}곳` : "오늘 목록"} query={query} onQueryChange={onQueryChange}>
      {ready && snapshot && <PlanningEntry key={`${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}:${snapshot.day.deliveryDateKey}`}
        customers={customers} snapshot={snapshot} accept={data.accept} refresh={data.refresh}
        onEditToday={(onDone) => onEdit({ mode: "day", onDone })} />}
    </DeliveryPhotoToolbar>
    {children}
    <DeliveryPhotoNotices data={data} catalog={catalog} uploads={uploads} targetVisible={targetVisible} />
  </>;
}
