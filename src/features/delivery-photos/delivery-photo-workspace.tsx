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

function DeliveryPhotoRow({ customer, count = 0, latestAt, first = false, job, uploadReady, onCapture, onAlbum, onRetry }: {
  customer: Customer; count?: number | undefined; latestAt?: string | undefined; first?: boolean; job?: DeliveryPhotoUploadProjection | undefined;
  uploadReady: boolean; onCapture: (customer: Customer) => void; onAlbum: (customer: Customer) => void; onRetry: (jobId: string) => void;
}) {
  const area = customer.administrativeDong || customer.district || "";
  const time = latestAt ? new Date(latestAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  const active = !uploadReady || isActiveDeliveryPhotoUpload(job);
  const status = job && job.status !== "completed" ? deliveryPhotoUploadStatusText(job) : "";
  return <li className={`${styles.row} ${first ? styles.first : ""}`}>
    <span className={styles.rowText}><strong>{customer.name}</strong><small role={job?.status === "failed" ? "alert" : status ? "status" : undefined}>{status || (count > 0 ? `사진 ${count}장${time ? ` · 마지막 등록 ${time}` : ""}` : area || "오늘 납품처")}</small></span>
    {job?.status === "failed" && job.errorCategory === "retryable" ? <button type="button" onClick={() => onRetry(job.jobId)}>다시 시도</button> : <>
      <button type="button" className={styles.camera} aria-label={`${customer.name} 카메라 촬영`} disabled={active} onClick={() => onCapture(customer)}>📷</button>
      <button type="button" className={styles.camera} aria-label={`${customer.name} 앨범 선택`} disabled={active} onClick={() => onAlbum(customer)}>앨범</button>
    </>}
  </li>;
}

function DeliveryPhotoSearchRow({ customer, count = 0, inToday, job, uploadReady, onAdd, onCapture, onAlbum, onRetry }: {
  customer: Customer; count?: number | undefined; inToday: boolean; job?: DeliveryPhotoUploadProjection | undefined;
  uploadReady: boolean; onAdd: (customerId: string) => void; onCapture: (customer: Customer) => void; onAlbum: (customer: Customer) => void; onRetry: (jobId: string) => void;
}) {
  const active = !uploadReady || isActiveDeliveryPhotoUpload(job);
  const status = job && job.status !== "completed" ? deliveryPhotoUploadStatusText(job) : "";
  return <li className={styles.searchRow}><span><strong>{customer.name}</strong><small role={job?.status === "failed" ? "alert" : status ? "status" : undefined}>{status
    || (count ? `사진 ${count}장 · 기록완료` : customer.administrativeDong || customer.district || "거래처")}</small></span>
    {inToday ? <span className={styles.inToday}>오늘 목록</span> : <button type="button" onClick={() => onAdd(customer.customerId)}>오늘 추가</button>}
    {job?.status === "failed" && job.errorCategory === "retryable" ? <button type="button" onClick={() => onRetry(job.jobId)}>다시 시도</button> : <>
      <button type="button" aria-label={`${customer.name} 카메라 촬영`} disabled={active} onClick={() => onCapture(customer)}>📷</button>
      <button type="button" aria-label={`${customer.name} 앨범 선택`} disabled={active} onClick={() => onAlbum(customer)}>앨범</button>
    </>}
  </li>;
}

export function DeliveryPhotoWorkspace({ session }: { session: AuthenticatedSession }) {
  const data = useDeliveryPhotoData(session);
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
  const knownIds = useMemo(() => new Set(activeCustomers.map((customer) => customer.customerId)), [activeCustomers]);
  const byId = useMemo(() => new Map(activeCustomers.map((customer) => [customer.customerId, customer])), [activeCustomers]);
  const routeIds = useMemo(() => resolveDeliveryPhotoDayCustomerIds(data.snapshot?.route?.customerIds ?? [], null, knownIds), [data.snapshot?.route?.customerIds, knownIds]);
  const todayIds = useMemo(() => resolveDeliveryPhotoDayCustomerIds(routeIds,
    data.snapshot?.day.isOverride ? data.snapshot.day.customerIds : null, knownIds), [routeIds, data.snapshot?.day, knownIds]);
  const summaries = useMemo(() => new Map(data.snapshot?.today.customers.map((item) => [item.customerId, item]) ?? []), [data.snapshot?.today.customers]);
  const counts = useMemo(() => new Map([...summaries].map(([id, summary]) => [id, summary.count])), [summaries]);
  const completion = useMemo(() => projectDeliveryPhotoCompletion(todayIds, counts), [todayIds, counts]);
  const searchResults = useMemo(() => query.trim() ? searchCustomers(activeCustomers, query).slice(0, 20) : [], [activeCustomers, query]);
  const ready = Boolean(data.snapshot && catalog.status === "ready");
  const capture = useCallback((customer: Customer) => { inputs.current?.openCamera(customer.customerId); }, []);
  const album = useCallback((customer: Customer) => { inputs.current?.openAlbum(customer.customerId); }, []);
  const retry = useCallback((jobId: string) => { uploads.coordinator?.retry(jobId); }, [uploads.coordinator]);

  const saveEditor = async (ids: readonly string[]): Promise<"saved" | "conflict" | "error"> => {
    if (!editor || !data.snapshot) return "error";
    try {
      const input = { requestId: crypto.randomUUID(), expectedRevision: editor.mode === "route"
        ? data.snapshot.route?.revision ?? null : data.snapshot.day.revision, customerIds: [...ids] };
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
    {data.loading && data.snapshot ? <p className={styles.freshness}>최신 목록을 확인하는 중입니다.</p> : null}
    {data.snapshot?.today.truncated ? <p className={styles.notice}>오늘 사진이 많아 기록완료 수가 정확하지 않을 수 있습니다. 관리자에게 확인하세요.</p> : null}
    <label className={styles.search}><span className={styles.srOnly}>거래처 검색</span><input {...searchInputProps} value={query} onChange={(event) => setQuery(event.target.value)} aria-label="납품사진 거래처 검색" placeholder="거래처 검색 · 초성" /></label>
    {query.trim() ? <section className={styles.section} aria-label="거래처 검색 결과"><h2>검색 결과</h2>
      {searchResults.length ? <ul className={styles.list}>{searchResults.map((customer) => <DeliveryPhotoSearchRow key={customer.customerId} customer={customer}
        count={summaries.get(customer.customerId)?.count} inToday={todayIds.includes(customer.customerId)} job={uploads.byCustomer.get(customer.customerId)}
        uploadReady={uploads.ready} onAdd={(customerId) => setEditor({ mode: "day", addId: customerId })} onCapture={capture} onAlbum={album} onRetry={retry} />)}</ul>
        : <p className={styles.empty}>일치하는 거래처가 없습니다.</p>}</section> : null}
    {!data.snapshot && data.loading ? <p className={styles.empty} role="status">오늘 납품처를 불러오는 중입니다.</p> : null}
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
          return customer ? <DeliveryPhotoRow key={id} customer={customer} count={summary?.count} latestAt={summary?.latest?.createdAt} job={uploads.byCustomer.get(id)} uploadReady={uploads.ready} onCapture={capture} onAlbum={album} onRetry={retry} /> : null;
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
    <DeliveryPhotoInputController ref={inputs} coordinator={uploads.coordinator} />
  </section>;
}
