"use client";

import { useMemo, useReducer, useState } from "react";

import { Icon } from "@/components/ui/icon";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { searchInputProps } from "@/components/ui/search-input-props";

import {
  addDeliveryPhotoCustomer,
  moveDeliveryPhotoCustomer,
  projectDeliveryPhotoCompletion,
  removeDeliveryPhotoCustomer,
  resolveDeliveryPhotoDayCustomerIds,
} from "./delivery-photo-domain";
import { initialDeliveryPhotoUploadState, reduceDeliveryPhotoUploadState } from "./delivery-photo-upload-state";
import styles from "./delivery-photo.module.css";

const compactListLimit = 5;
type DeliveryPhotoCustomerSummary = { customerId: string; name: string; area: string };
const emptyCustomers: readonly DeliveryPhotoCustomerSummary[] = Object.freeze([]);

function CustomerNameList({
  customerIds,
  customersById,
  actionLabel,
  onAction,
}: {
  customerIds: readonly string[];
  customersById: ReadonlyMap<string, DeliveryPhotoCustomerSummary>;
  actionLabel: string;
  onAction: (customerId: string) => void;
}) {
  return <ul className={styles.customerList}>{customerIds.map((customerId) => {
    const customer = customersById.get(customerId);
    if (!customer) return null;
    return <li key={customerId}><span><strong>{customer.name}</strong><small>{customer.area || "거래처"}</small></span><button type="button" onClick={() => onAction(customerId)}>{actionLabel}</button></li>;
  })}</ul>;
}

export function DeliveryPhotoWorkspace({ session }: { session: AuthenticatedSession }) {
  // Phase 1 deliberately has no repository. Later phases can replace these
  // Memory inputs with authorized customer/route/photo responses.
  const activeCustomers = emptyCustomers;
  const recentCustomers = emptyCustomers;
  const [routeCustomerIds, setRouteCustomerIds] = useState<readonly string[]>([]);
  const [dayOverrideCustomerIds, setDayOverrideCustomerIds] = useState<readonly string[] | null>(null);
  const [query, setQuery] = useState("");
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [editingRoute, setEditingRoute] = useState(false);
  const [uploadState] = useReducer(reduceDeliveryPhotoUploadState, initialDeliveryPhotoUploadState);
  const knownCustomerIds = useMemo(() => new Set(activeCustomers.map((customer) => customer.customerId)), [activeCustomers]);
  const customersById = useMemo(() => new Map(activeCustomers.map((customer) => [customer.customerId, customer])), [activeCustomers]);
  const normalizedRouteIds = useMemo(() => resolveDeliveryPhotoDayCustomerIds(routeCustomerIds, null, knownCustomerIds), [routeCustomerIds, knownCustomerIds]);
  const todayCustomerIds = useMemo(() => resolveDeliveryPhotoDayCustomerIds(normalizedRouteIds, dayOverrideCustomerIds, knownCustomerIds), [normalizedRouteIds, dayOverrideCustomerIds, knownCustomerIds]);
  const completion = useMemo(() => projectDeliveryPhotoCompletion(todayCustomerIds, new Map()), [todayCustomerIds]);
  const searchResults = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
    if (!normalizedQuery) return [];
    return activeCustomers.filter((customer) => customer.name.toLocaleLowerCase("ko-KR").includes(normalizedQuery)).slice(0, 8);
  }, [activeCustomers, query]);
  const visibleRecents = showAllRecent ? recentCustomers : recentCustomers.slice(0, compactListLimit);

  const addToday = (customerId: string) => {
    setDayOverrideCustomerIds(addDeliveryPhotoCustomer(todayCustomerIds, customerId, knownCustomerIds));
  };
  const addRoute = (customerId: string) => {
    setRouteCustomerIds(addDeliveryPhotoCustomer(normalizedRouteIds, customerId, knownCustomerIds));
  };

  return <section className={`shell-page ${styles.workspace}`} aria-labelledby="delivery-photo-heading" data-delivery-photo-workspace data-upload-state={uploadState.status}>
    <header className={styles.hero}>
      <p>DELIVERY PHOTO</p>
      <h1 id="delivery-photo-heading">납품사진</h1>
      <span>{session.displayName}님의 오늘 납품 순서를 빠르게 확인합니다.</span>
    </header>

    <div className={styles.grid}>
      <section className={styles.panel} aria-labelledby="delivery-photo-remaining-heading">
        <header><div><span className={styles.eyebrow}>TODAY</span><h2 id="delivery-photo-remaining-heading">오늘 남은 납품처</h2></div><strong>{completion.remainingCustomerIds.length}</strong></header>
        {completion.remainingCustomerIds.length ? <CustomerNameList customerIds={completion.remainingCustomerIds} customersById={customersById} actionLabel="오늘 제외" onAction={(customerId) => setDayOverrideCustomerIds(removeDeliveryPhotoCustomer(todayCustomerIds, customerId))} /> : <p className={styles.empty}>내 납품처를 구성하거나 검색에서 오늘 목록에 추가하세요.</p>}
      </section>

      <section className={styles.panel} aria-labelledby="delivery-photo-completed-heading">
        <header><div><span className={styles.eyebrow}>RECORDED</span><h2 id="delivery-photo-completed-heading">기록완료</h2></div><strong>{completion.completedCustomerIds.length}</strong></header>
        {completion.completedCustomerIds.length ? <CustomerNameList customerIds={completion.completedCustomerIds} customersById={customersById} actionLabel="사진 보기" onAction={() => undefined} /> : <p className={styles.empty}>오늘 등록된 사진을 기준으로 자동 분류됩니다.</p>}
      </section>

      <section className={styles.panel} aria-labelledby="delivery-photo-search-heading">
        <header><div><span className={styles.eyebrow}>FIND</span><h2 id="delivery-photo-search-heading">거래처 검색</h2></div></header>
        <label className={styles.search}><Icon name="search" /><input {...searchInputProps} value={query} onChange={(event) => setQuery(event.target.value)} aria-label="납품사진 거래처 검색" placeholder="거래처명 · 초성 검색" /></label>
        {searchResults.length ? <ul className={styles.customerList}>{searchResults.map((customer) => <li key={customer.customerId}><span><strong>{customer.name}</strong><small>{customer.area || "거래처"}</small></span><span className={styles.actions}><button type="button" onClick={() => addToday(customer.customerId)}>오늘 추가</button><button type="button" onClick={() => addRoute(customer.customerId)}>내 납품처</button></span></li>)}</ul> : query.trim() ? <p className={styles.empty}>일치하는 거래처가 없습니다.</p> : null}
      </section>

      <section className={styles.panel} aria-labelledby="delivery-photo-recent-heading">
        <header><div><span className={styles.eyebrow}>RECENT</span><h2 id="delivery-photo-recent-heading">최근 거래처</h2></div>{recentCustomers.length > compactListLimit ? <button type="button" className={styles.linkButton} onClick={() => setShowAllRecent((value) => !value)}>{showAllRecent ? "접기" : `전체 ${recentCustomers.length}곳`}</button> : null}</header>
        {visibleRecents.length ? <CustomerNameList customerIds={visibleRecents.map((customer) => customer.customerId)} customersById={customersById} actionLabel="오늘 추가" onAction={addToday} /> : <p className={styles.empty}>거래처 검색 기록이 생기면 여기에 표시됩니다.</p>}
      </section>

      <section className={`${styles.panel} ${styles.routePanel}`} aria-labelledby="delivery-photo-route-heading">
        <header><div><span className={styles.eyebrow}>MY ROUTE</span><h2 id="delivery-photo-route-heading">내 납품처</h2></div><button type="button" className={styles.linkButton} onClick={() => setEditingRoute((value) => !value)} aria-pressed={editingRoute}>{editingRoute ? "편집 완료" : "순서 편집"}</button></header>
        {normalizedRouteIds.length ? <ol className={styles.routeList}>{normalizedRouteIds.map((customerId, index) => {
          const customer = customersById.get(customerId);
          if (!customer) return null;
          return <li key={customerId}><span className={styles.order}>{index + 1}</span><strong>{customer.name}</strong>{editingRoute ? <span className={styles.actions}><button type="button" disabled={index === 0} aria-label={`${customer.name} 위로 이동`} onClick={() => setRouteCustomerIds(moveDeliveryPhotoCustomer(normalizedRouteIds, customerId, index - 1, knownCustomerIds))}><Icon name="arrow-up" /></button><button type="button" disabled={index === normalizedRouteIds.length - 1} aria-label={`${customer.name} 아래로 이동`} onClick={() => setRouteCustomerIds(moveDeliveryPhotoCustomer(normalizedRouteIds, customerId, index + 1, knownCustomerIds))}><Icon name="arrow-down" /></button><button type="button" aria-label={`${customer.name} 내 납품처에서 제외`} onClick={() => setRouteCustomerIds(removeDeliveryPhotoCustomer(normalizedRouteIds, customerId))}><Icon name="close" /></button></span> : null}</li>;
        })}</ol> : <p className={styles.empty}>검색에서 자주 방문하는 거래처를 내 납품처에 추가하세요.</p>}
      </section>
    </div>
  </section>;
}
