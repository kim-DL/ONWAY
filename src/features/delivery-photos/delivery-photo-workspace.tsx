"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState } from "react";

import { searchInputProps } from "@/components/ui/search-input-props";
import { LoadingStatus } from "@/components/ui/loading-status";
import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { searchCustomers } from "@/features/customers/customer-search";

import { projectDeliveryPhotoCompletion, resolveDeliveryPhotoDayCustomerIds } from "./delivery-photo-domain";
import { DeliveryPhotoHistoryLoader } from "./delivery-photo-history-loader";
import { DeliveryPhotoInputController, type DeliveryPhotoInputControllerHandle } from "./delivery-photo-input-controller";
import { mergeConfirmedDeliveryPhoto, deliveryPhotoDateKey } from "./delivery-photo-memory";
import { deliveryPhotoErrorKind, deliveryPhotoRepository } from "./delivery-photo-repository";
import { useDeliveryPhotoData } from "./use-delivery-photo-data";
import { useDeliveryPhotoCatalog } from "./use-delivery-photo-catalog";
import { useDeliveryPhotoUploads } from "./use-delivery-photo-uploads";
import type { DeliveryPhotoEditorMode } from "./delivery-photo-editor";
import styles from "./photo.module.css";

const DeliveryPhotoRow = dynamic(() => import("./delivery-photo-row"), { ssr: false });
const DeliveryPhotoEditor = dynamic(() => import("./delivery-photo-editor"), { ssr: false });
const DeliveryPhotoMoreMenu = dynamic(() => import("./delivery-photo-more-menu"));
const DeliveryPhotoUploadPanel = dynamic(() => import("./delivery-photo-upload-panel"), { ssr: false });

export function DeliveryPhotoWorkspace({ session, onOpenCustomerDetail }: { session: AuthenticatedSession; onOpenCustomerDetail?: (customerId: string) => void }) {
  const data = useDeliveryPhotoData(session);
  const snapshot = data.snapshot;
  const catalog = useDeliveryPhotoCatalog(session, data.clear);
  const inputs = useRef<DeliveryPhotoInputControllerHandle>(null);
  const acceptData = data.accept; const refreshData = data.refresh;
  const acceptConfirmed = useCallback((photo: Parameters<typeof mergeConfirmedDeliveryPhoto>[1]) => {
    if (photo.deliveryDateKey !== deliveryPhotoDateKey()) { refreshData(); return; }
    acceptData((current) => mergeConfirmedDeliveryPhoto(current, photo));
  }, [acceptData, refreshData]);
  const uploads = useDeliveryPhotoUploads(session, acceptConfirmed, Boolean(snapshot), refreshData);
  const activeCustomers = useMemo(() => catalog.customers.filter((customer) => customer.status === "active"), [catalog.customers]);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{ mode: DeliveryPhotoEditorMode; addId?: string } | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [moreCustomer, setMoreCustomer] = useState<Customer | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(activeCustomers.map((customer) => [customer.customerId, customer])), [activeCustomers]);
  const routeIds = useMemo(() => resolveDeliveryPhotoDayCustomerIds(snapshot?.route?.customerIds ?? [], null, byId), [snapshot?.route?.customerIds, byId]);
  const todayIds = useMemo(() => resolveDeliveryPhotoDayCustomerIds(routeIds,
    snapshot?.day.isOverride ? snapshot.day.customerIds : null, byId), [routeIds, snapshot?.day, byId]);
  const summaries = useMemo(() => new Map(snapshot?.today.customers.map((item) => [item.customerId, item]) ?? []), [snapshot?.today.customers]);
  const completion = useMemo(() => projectDeliveryPhotoCompletion(todayIds,
    (id) => summaries.get(id)?.count ?? 0), [todayIds, summaries]);
  const searchResults = useMemo(() => query.trim() ? searchCustomers(activeCustomers, query).slice(0, 20) : [], [activeCustomers, query]);
  const ready = Boolean(snapshot && catalog.status === "ready");
  const capture = (customer: Customer) => { if (inputs.current?.openCamera(customer.customerId)) setCaptureId(customer.customerId); };
  const album = (customer: Customer) => { if (inputs.current?.openAlbum(customer.customerId)) setCaptureId(customer.customerId); };
  const retry = (jobId: string) => { void uploads.coordinator?.retry(jobId); };
  const captureAvailable = (customerId: string) => uploads.coordinator?.canBegin(customerId) ?? false;
  const renderRow = (id: string, search = false) => {
    const customer = byId.get(id); if (!customer) return null;
    const summary = summaries.get(id);
    return <DeliveryPhotoRow key={id} customer={customer} count={summary?.count} latestAt={summary?.latest?.createdAt}
      job={uploads.byCustomer.get(id)} retryJob={uploads.retryByCustomer.get(id)} pendingCount={uploads.pendingByCustomer.get(id) ?? 0}
      captureAllowed={captureAvailable(id)} uploadReady={uploads.ready} inToday={todayIds.includes(id)}
      onAdd={search ? (customerId) => setEditor({ mode: "day", addId: customerId }) : undefined}
      onView={setHistoryCustomer} onCapture={capture} onMore={setMoreCustomer} onRetry={retry} />;
  };

  const saveEditor = async (ids: readonly string[]): Promise<"saved" | "conflict" | "error"> => {
    if (!editor || !snapshot) return "error";
    try {
      const input = { requestId: crypto.randomUUID(), expectedRevision: editor.mode === "route"
        ? snapshot.route?.revision ?? null : snapshot.day.revision, customerIds: [...ids] };
      if (editor.mode === "route") {
        const route = await deliveryPhotoRepository.saveRoute(input);
        data.accept((current) => ({ ...current, route, day: current.day.isOverride ? current.day
          : { ...current.day, customerIds: route.customerIds }, refreshedAt: Date.now() }));
      } else {
        const day = await deliveryPhotoRepository.saveDay(input);
        data.accept((current) => ({ ...current, day, refreshedAt: Date.now() }));
      }
      return "saved";
    } catch (error) {
      const kind = deliveryPhotoErrorKind(error);
      if (kind === "auth") { data.clear(); return "error"; }
      if (kind === "conflict") { data.refresh(); return "conflict"; }
      return "error";
    }
  };

  return <section className={`shell-page ${styles.workspace}`} aria-labelledby="delivery-photo-heading" data-delivery-photo-workspace>
    <header className={styles.header}><h1 id="delivery-photo-heading">납품사진</h1>
      <div className={styles.summary}><strong>{ready ? `남음 ${completion.remainingCustomerIds.length}곳 · 기록완료 ${completion.completedCustomerIds.length}곳` : "오늘 목록"}</strong>
        {ready && todayIds.length ? <button type="button" onClick={() => setEditor({ mode: "day" })}>순서 편집</button> : null}</div>
    </header>
    {uploads.storageError ? <p className={styles.notice} role="alert">사진 보관을 준비하지 못했어요. 기기 저장 공간과 브라우저의 저장소 허용을 확인한 뒤 앱을 다시 열어주세요.</p> : null}
    {data.error || catalog.status === "error" ? <div className={styles.notice} role="alert">{data.error || "거래처 정보를 불러오지 못했습니다."} <button type="button" onClick={() => {
      if (data.error) data.refresh();
      if (catalog.status === "error") catalog.retry();
    }}>다시 시도</button></div> : null}
    {data.loading && snapshot ? <LoadingStatus className={styles.freshness} label="최신 목록 확인 중" detail="오늘 납품 기록을 확인하고 있습니다." /> : null}
    {snapshot?.today.truncated ? <p className={styles.notice}>오늘 사진이 많아 기록완료 수가 정확하지 않을 수 있습니다. 관리자에게 확인하세요.</p> : null}
    <label className={styles.search}><span className={styles.srOnly}>거래처 검색</span><input {...searchInputProps} value={query} onChange={(event) => setQuery(event.target.value)} aria-label="납품사진 거래처 검색" placeholder="거래처 검색 · 초성" /></label>
    {query.trim() ? <section className={styles.section} aria-label="거래처 검색 결과"><h2>검색 결과</h2>
      {searchResults.length ? <ul className={styles.list}>{searchResults.filter((customer) => customer.customerId !== captureId).map((customer) => renderRow(customer.customerId, true))}</ul>
        : <p className={styles.empty}>일치하는 거래처가 없습니다.</p>}</section> : null}
    {!snapshot && data.loading ? <LoadingStatus className={styles.empty} label="오늘 납품처 불러오는 중" detail="오늘 납품 기록을 확인하고 있습니다." /> : null}
    {captureId && byId.has(captureId) ? <section className={styles.section} aria-label="추가 촬영 납품처">
        <h2>촬영 중인 납품처</h2><ul className={styles.list}>{renderRow(captureId)}</ul>
        <button type="button" onClick={() => setCaptureId(null)}>촬영 영역 닫기</button>
      </section> : null}
    {uploads.coordinator && uploads.jobs.length ? <DeliveryPhotoUploadPanel coordinator={uploads.coordinator} jobs={uploads.jobs} names={byId} /> : null}
    {ready ? <>
      <section className={styles.section} aria-labelledby="delivery-photo-remaining-heading"><h2 id="delivery-photo-remaining-heading">오늘 남은 납품처</h2>
        {completion.remainingCustomerIds.length ? <ul className={styles.list}>{completion.remainingCustomerIds.filter((id) => id !== captureId).map((id) => renderRow(id))}</ul> : <p className={styles.empty}>{todayIds.length ? "오늘 목록의 모든 거래처에 사진 기록이 있습니다." : "오늘 납품처가 비어 있습니다. 내 납품처를 설정해 주세요."}</p>}
      </section>
      <details className={styles.completed}><summary>기록완료 {completion.completedCustomerIds.length}곳</summary>
        {completion.completedCustomerIds.length ? <ul className={styles.list}>{completion.completedCustomerIds.filter((id) => id !== captureId).map((id) => renderRow(id))}</ul> : <p className={styles.empty}>아직 기록된 납품사진이 없습니다.</p>}
      </details>
      <div className={styles.secondaryActions}>
        <button type="button" onClick={() => setEditor({ mode: "route" })}>{routeIds.length ? "내 납품처 편집" : "내 납품처 설정"}</button>
        <button type="button" onClick={() => setEditor({ mode: "day" })}>오늘 거래처 추가</button>
        <button type="button" onClick={() => data.refresh()}>새로고침</button>
      </div>
    </> : null}
    {editor && ready ? <DeliveryPhotoEditor key={`${editor.mode}:${editor.addId ?? ""}`} mode={editor.mode} session={session} customers={activeCustomers}
      initialIds={editor.mode === "route" ? routeIds : todayIds} initialAddId={editor.addId}
      onSave={saveEditor} onClose={() => setEditor(null)} /> : null}
    {historyCustomer ? <DeliveryPhotoHistoryLoader key={`${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}:${historyCustomer.customerId}`}
      customer={historyCustomer} session={session} onClose={() => setHistoryCustomer(null)} sync={data.accept} /> : null}
    {moreCustomer ? <DeliveryPhotoMoreMenu customer={moreCustomer} albumDisabled={!captureAvailable(moreCustomer.customerId)}
      onAlbum={album} onOpenCustomerDetail={onOpenCustomerDetail} onClose={() => setMoreCustomer(null)} className={styles.moreActions!} /> : null}
    <DeliveryPhotoInputController ref={inputs} coordinator={uploads.coordinator} />
  </section>;
}
