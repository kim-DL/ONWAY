"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState } from "react";

import { searchInputProps } from "@/components/ui/search-input-props";
import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { searchCustomers } from "@/features/customers/customer-search";

import { projectDeliveryPhotoCompletion, resolveDeliveryPhotoDayCustomerIds } from "./delivery-photo-domain";
import { DeliveryPhotoInputController, type DeliveryPhotoInputControllerHandle } from "./delivery-photo-input-controller";
import { mergeConfirmedDeliveryPhoto, deliveryPhotoDateKey } from "./delivery-photo-memory";
import { deliveryPhotoErrorKind, deliveryPhotoRepository } from "./delivery-photo-repository";
import { deliveryPhotoUploadStatusText, isActiveDeliveryPhotoUpload, type DeliveryPhotoUploadProjection } from "./delivery-photo-upload-state";
import { useDeliveryPhotoData } from "./use-delivery-photo-data";
import { useDeliveryPhotoCatalog } from "./use-delivery-photo-catalog";
import { useDeliveryPhotoUploads } from "./use-delivery-photo-uploads";
import type { DeliveryPhotoEditorMode } from "./delivery-photo-editor";
import styles from "./delivery-photo.module.css";

const DeliveryPhotoEditor = dynamic(() => import("./delivery-photo-editor").then((module) => module.DeliveryPhotoEditor), { ssr: false });
const DeliveryPhotoHistory = dynamic(() => import("./delivery-photo-history").then((module) => module.DeliveryPhotoHistory), { ssr: false });

function deliveryPhotoActions(customer: Customer, job: DeliveryPhotoUploadProjection | undefined, uploadReady: boolean,
  onCapture: (customer: Customer) => void, onAlbum: (customer: Customer) => void, onRetry: (jobId: string) => void) {
  const active = !uploadReady || isActiveDeliveryPhotoUpload(job);
  return job?.status === "failed" && job.errorCategory === "retryable"
    ? <button type="button" onClick={() => onRetry(job.jobId)}>다시 시도</button>
    : <><button type="button" aria-label={`${customer.name} 카메라 촬영`} disabled={active} onClick={() => onCapture(customer)}>📷</button>
      <button type="button" aria-label={`${customer.name} 앨범 선택`} disabled={active} onClick={() => onAlbum(customer)}>앨범</button></>;
}

export function DeliveryPhotoRow({ customer, count = 0, latestAt, first = false, job, uploadReady, onView, onCapture, onAlbum, onRetry }: {
  customer: Customer; count?: number | undefined; latestAt?: string | undefined; first?: boolean; job?: DeliveryPhotoUploadProjection | undefined;
  uploadReady: boolean; onView?: ((customer: Customer) => void) | undefined; onCapture: (customer: Customer) => void; onAlbum: (customer: Customer) => void; onRetry: (jobId: string) => void;
}) {
  const password = customer.accessPasswordState === "registered" && customer.accessPassword;
  const customerSecondary = password ? `${customer.administrativeDong}${customer.administrativeDong ? " · " : ""}출입비번 ${password}` : customer.administrativeDong;
  const time = latestAt ? new Date(Date.parse(latestAt) + 9 * 60 * 60 * 1_000).toISOString().slice(11, 16) : "";
  const status = job && job.status !== "completed" && deliveryPhotoUploadStatusText(job);
  const photoSummary = count && `사진 ${count}장${time ? ` · 마지막 등록 ${time}` : ""}`;
  const detail = status || photoSummary;
  const rowInformation = <><strong>{customer.name}</strong>
    {customerSecondary ? <small>{customerSecondary}</small> : null}
    {detail ? <small role={job?.status === "failed" ? "alert" : status ? "status" : undefined}>{detail}</small> : null}</>;
  return <li className={`${styles.row} ${first ? styles.first : ""}`}>
    {onView ? <button type="button" className={styles.rowText} onClick={() => onView(customer)}
      aria-label={`${customer.name} 납품사진 보기, ${photoSummary}`}>{rowInformation}</button> : <span className={styles.rowText}>{rowInformation}</span>}
    {deliveryPhotoActions(customer, job, uploadReady, onCapture, onAlbum, onRetry)}
  </li>;
}

function DeliveryPhotoSearchRow({ customer, count = 0, inToday, job, uploadReady, onAdd, onCapture, onAlbum, onRetry }: {
  customer: Customer; count?: number | undefined; inToday: boolean; job?: DeliveryPhotoUploadProjection | undefined;
  uploadReady: boolean; onAdd: (customerId: string) => void; onCapture: (customer: Customer) => void; onAlbum: (customer: Customer) => void; onRetry: (jobId: string) => void;
}) {
  const status = job && job.status !== "completed" && deliveryPhotoUploadStatusText(job);
  return <li className={styles.searchRow}><span><strong>{customer.name}</strong><small role={job?.status === "failed" ? "alert" : status ? "status" : undefined}>{status
    || (count ? `사진 ${count}장 · 기록완료` : customer.administrativeDong || customer.district || "거래처")}</small></span>
    {inToday ? <span className={styles.inToday}>오늘 목록</span> : <button type="button" onClick={() => onAdd(customer.customerId)}>오늘 추가</button>}
    {deliveryPhotoActions(customer, job, uploadReady, onCapture, onAlbum, onRetry)}
  </li>;
}

export function DeliveryPhotoWorkspace({ session }: { session: AuthenticatedSession }) {
  const data = useDeliveryPhotoData(session);
  const snapshot = data.snapshot;
  const catalog = useDeliveryPhotoCatalog(session, data.clear);
  const inputs = useRef<DeliveryPhotoInputControllerHandle>(null);
  const acceptData = data.accept; const refreshData = data.refresh;
  const acceptConfirmed = useCallback((photo: Parameters<typeof mergeConfirmedDeliveryPhoto>[1]) => {
    if (photo.deliveryDateKey !== deliveryPhotoDateKey()) { refreshData(); return; }
    acceptData((current) => mergeConfirmedDeliveryPhoto(current, photo));
  }, [acceptData, refreshData]);
  const uploads = useDeliveryPhotoUploads(session, acceptConfirmed);
  const activeCustomers = useMemo(() => catalog.customers.filter((customer) => customer.status === "active"), [catalog.customers]);
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{ mode: DeliveryPhotoEditorMode; addId?: string } | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const knownIds = useMemo(() => new Set(activeCustomers.map((customer) => customer.customerId)), [activeCustomers]);
  const byId = useMemo(() => new Map(activeCustomers.map((customer) => [customer.customerId, customer])), [activeCustomers]);
  const routeIds = useMemo(() => resolveDeliveryPhotoDayCustomerIds(snapshot?.route?.customerIds ?? [], null, knownIds), [snapshot?.route?.customerIds, knownIds]);
  const todayIds = useMemo(() => resolveDeliveryPhotoDayCustomerIds(routeIds,
    snapshot?.day.isOverride ? snapshot.day.customerIds : null, knownIds), [routeIds, snapshot?.day, knownIds]);
  const summaries = useMemo(() => new Map(snapshot?.today.customers.map((item) => [item.customerId, item]) ?? []), [snapshot?.today.customers]);
  const completion = useMemo(() => projectDeliveryPhotoCompletion(todayIds,
    new Map([...summaries].map(([id, summary]) => [id, summary.count]))), [todayIds, summaries]);
  const searchResults = useMemo(() => query.trim() ? searchCustomers(activeCustomers, query).slice(0, 20) : [], [activeCustomers, query]);
  const ready = Boolean(snapshot && catalog.status === "ready");
  const capture = (customer: Customer) => { inputs.current?.openCamera(customer.customerId); };
  const album = (customer: Customer) => { inputs.current?.openAlbum(customer.customerId); };
  const retry = (jobId: string) => { uploads.coordinator?.retry(jobId); };

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
    {data.error || catalog.status === "error" ? <div className={styles.notice} role="alert">{data.error || "거래처 정보를 불러오지 못했습니다."} <button type="button" onClick={() => {
      if (data.error) data.refresh();
      if (catalog.status === "error") catalog.retry();
    }}>다시 시도</button></div> : null}
    {data.loading && snapshot ? <p className={styles.freshness}>최신 목록을 확인하는 중입니다.</p> : null}
    {snapshot?.today.truncated ? <p className={styles.notice}>오늘 사진이 많아 기록완료 수가 정확하지 않을 수 있습니다. 관리자에게 확인하세요.</p> : null}
    <label className={styles.search}><span className={styles.srOnly}>거래처 검색</span><input {...searchInputProps} value={query} onChange={(event) => setQuery(event.target.value)} aria-label="납품사진 거래처 검색" placeholder="거래처 검색 · 초성" /></label>
    {query.trim() ? <section className={styles.section} aria-label="거래처 검색 결과"><h2>검색 결과</h2>
      {searchResults.length ? <ul className={styles.list}>{searchResults.map((customer) => <DeliveryPhotoSearchRow key={customer.customerId} customer={customer}
        count={summaries.get(customer.customerId)?.count} inToday={todayIds.includes(customer.customerId)} job={uploads.byCustomer.get(customer.customerId)}
        uploadReady={uploads.ready} onAdd={(customerId) => setEditor({ mode: "day", addId: customerId })} onCapture={capture} onAlbum={album} onRetry={retry} />)}</ul>
        : <p className={styles.empty}>일치하는 거래처가 없습니다.</p>}</section> : null}
    {!snapshot && data.loading ? <p className={styles.empty} role="status">오늘 납품처를 불러오는 중입니다.</p> : null}
    {ready ? <>
      <section className={styles.section} aria-labelledby="delivery-photo-remaining-heading"><h2 id="delivery-photo-remaining-heading">오늘 남은 납품처</h2>
        {completion.remainingCustomerIds.length ? <ul className={styles.list}>{completion.remainingCustomerIds.map((id, index) => {
          const customer = byId.get(id);
          return customer ? <DeliveryPhotoRow key={id} customer={customer} first={index === 0} job={uploads.byCustomer.get(id)} uploadReady={uploads.ready} onCapture={capture} onAlbum={album} onRetry={retry} /> : null;
        })}</ul> : <p className={styles.empty}>{todayIds.length ? "오늘 목록의 모든 거래처에 사진 기록이 있습니다." : "오늘 납품처가 비어 있습니다. 내 납품처를 설정해 주세요."}</p>}
      </section>
      <details className={styles.completed}><summary>기록완료 {completion.completedCustomerIds.length}곳</summary>
        {completion.completedCustomerIds.length ? <ul className={styles.list}>{completion.completedCustomerIds.map((id) => {
          const customer = byId.get(id);
          const summary = summaries.get(id);
          return customer ? <DeliveryPhotoRow key={id} customer={customer} count={summary?.count} latestAt={summary?.latest?.createdAt} job={uploads.byCustomer.get(id)} uploadReady={uploads.ready} onView={setHistoryCustomer} onCapture={capture} onAlbum={album} onRetry={retry} /> : null;
        })}</ul> : <p className={styles.empty}>아직 기록된 납품사진이 없습니다.</p>}
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
    {historyCustomer ? <DeliveryPhotoHistory key={`${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}:${historyCustomer.customerId}`}
      customer={historyCustomer} session={session} onClose={() => setHistoryCustomer(null)} sync={data.accept} /> : null}
    <DeliveryPhotoInputController ref={inputs} coordinator={uploads.coordinator} />
  </section>;
}
