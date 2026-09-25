"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import fieldList from "@/components/ui/field-list.module.css";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { OnnuriLoader } from "@/components/ui/onnuri-loader";
import { searchInputProps } from "@/components/ui/search-input-props";
import { useToast } from "@/components/ui/toast";
import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { useTimeGreeting } from "@/features/app-shell/time-greeting";
import { revalidationFreshnessText } from "@/lib/revalidation-coordinator";
import { restoreWorkspaceScroll } from "@/lib/workspace-scroll-memory";

import { CustomerCard, RecentCustomerCard } from "./customer-card";
import { CustomerDetail } from "./customer-detail";
import { CustomerDirectory } from "./customer-directory";
import { CustomerHome } from "./customer-home";
import { searchCustomers } from "./customer-search";
import { readCustomerWorkspaceSnapshot, updateCustomerWorkspaceUi } from "./customer-workspace-snapshot";
import { useRecentCustomers } from "./use-recent-customers";
import { customerHomeRecents } from "./recent-customer-history";
import { useCustomers } from "./use-customers";
import styles from "./customer.module.css";

const CustomerEditor = dynamic(() => import("./customer-editor").then((module) => module.CustomerEditor), {
  loading: () => <BottomSheet open title="거래처 정보" onClose={() => undefined} dismissible={false}><p role="status">입력 화면을 준비하고 있어요.</p></BottomSheet>,
});

export function CustomerWorkspace({ session }: { session: AuthenticatedSession }) {
  const sessionKey = `${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}`;
  const initialSnapshot = readCustomerWorkspaceSnapshot(sessionKey);
  const greeting = useTimeGreeting();
  const { showToast } = useToast();
  const [query, setQuery] = useState(initialSnapshot.ui.query);
  const [searchOpen, setSearchOpen] = useState(initialSnapshot.ui.searchOpen);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreSearchFocus = useRef(false);
  const workspaceRef = useRef<HTMLElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const clearSensitiveState = useCallback(() => { setSelectedId(null); setEditing(null); setQuery(""); setDirectoryOpen(false); }, []);
  const catalog = useCustomers(session, clearSensitiveState);
  const { recentCustomers, rememberCustomer, clearRecentCustomers, ready: recentsReady } = useRecentCustomers(session, catalog.customers);
  const homeRecentCustomers = customerHomeRecents(recentCustomers);
  const results = useMemo(() => searchCustomers(catalog.customers, query), [catalog.customers, query]);
  const selected = catalog.status === "ready" ? catalog.customers.find((customer) => customer.customerId === selectedId) : undefined;
  const freshnessText = revalidationFreshnessText(catalog.freshness, catalog.lastSuccessAt);
  useEffect(() => {
    updateCustomerWorkspaceUi(sessionKey, { query, searchOpen });
  }, [sessionKey, query, searchOpen]);
  useLayoutEffect(() => {
    const scroller = workspaceRef.current?.closest(".workspace-content") as HTMLElement | null;
    if (!scroller) return;
    const remember = () => updateCustomerWorkspaceUi(sessionKey, { scrollTop: scroller.scrollTop });
    restoreWorkspaceScroll(scroller, initialSnapshot.ui.scrollTop);
    scroller.addEventListener("scroll", remember, { passive: true });
    return () => { remember(); scroller.removeEventListener("scroll", remember); };
  }, [sessionKey, initialSnapshot.ui.scrollTop]);
  useEffect(() => {
    if (searchOpen) {
      searchRef.current?.focus({ preventScroll: true });
      searchRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    } else if (restoreSearchFocus.current) {
      restoreSearchFocus.current = false;
      searchTriggerRef.current?.focus({ preventScroll: true });
    }
  }, [searchOpen]);
  const closeSearch = () => {
    searchRef.current?.blur();
    restoreSearchFocus.current = true;
    setQuery("");
    setSearchOpen(false);
  };
  const openCustomer = (customerId: string) => {
    rememberCustomer(customerId);
    setSelectedId(customerId);
  };
  return <section ref={workspaceRef} className={`shell-page ${styles.workspace}`} aria-labelledby="customer-heading" data-customer-workspace data-search-open={searchOpen || undefined}>
    <CustomerHome greeting={`${session.displayName}님, ${greeting}.`} searchTriggerRef={searchTriggerRef} onOpenSearch={() => setSearchOpen(true)} onOpenDirectory={() => setDirectoryOpen(true)} onRegister={() => setEditing("new")} registerDisabled={catalog.status !== "ready"}
      searchContent={searchOpen ? <div className={styles.searchPanel}>
        <label className={styles.search}><Icon name="search" size={22} /><input {...searchInputProps} name="customer-query" ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") { event.preventDefault(); closeSearch(); }
        }} placeholder="거래처명 · 초성 검색" aria-label="거래처명 또는 초성 검색" />{query ? <button type="button" className={styles.iconButton} onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="검색어 지우기"><Icon name="close" size={18} /></button> : null}</label>
        <button type="button" className={styles.searchClose} onClick={closeSearch} aria-label="검색 닫기">닫기</button>
      </div> : undefined} />
    {catalog.status === "error" ? <div className={styles.empty} role="alert"><Icon name="wifi-off" size={26} /><p>{catalog.message}</p><GlassButton compact onClick={catalog.retry}>다시 불러오기</GlassButton></div>
      : catalog.status === "loading" ? <div className={styles.empty} role="status"><OnnuriLoader tone="customer" decorative /><p>거래처 정보를 불러오고 있어요.</p></div>
        : <>{freshnessText ? <p className={styles.freshness} role="status" data-freshness={catalog.freshness}>{freshnessText}</p> : null}{!query.trim() ? <section className={styles.recentSection} aria-labelledby="customer-recents-heading" data-customer-recents>
          <header className={styles.recentHeading}><h2 id="customer-recents-heading">최근 검색 거래처</h2>{recentCustomers.length ? <button type="button" className={styles.textButton} onClick={() => { if (window.confirm("최근 검색한 거래처 기록을 지울까요? 거래처 정보는 삭제되지 않습니다.")) clearRecentCustomers(); }}>기록 지우기</button> : null}</header>
          {!recentsReady ? <p className={styles.resultCount} role="status">최근 거래처를 확인하고 있어요.</p> : homeRecentCustomers.length ? <ul className={`${fieldList.list} ${styles.recentList}`}>{homeRecentCustomers.map((customer) => <li key={customer.customerId}>
            <RecentCustomerCard customer={customer} onSelect={() => openCustomer(customer.customerId)} />
          </li>)}</ul> : <button type="button" className={styles.recentEmpty} onClick={() => { setSearchOpen(true); searchRef.current?.focus(); }}>
            <span className={styles.recentIcon} aria-hidden="true"><Icon name="clock" size={23} /></span>
            <span><strong>자주 찾는 거래처로 더 빠르게</strong><span>검색 후 선택한 거래처 5곳이 여기에 모여요.</span></span>
            <Icon name="chevron-right" size={17} />
          </button>}
        </section>
          : <><div className={styles.resultsHeading}><p className={styles.resultCount} role="status">검색 결과 <strong>{results.length}</strong>곳</p><button type="button" className={styles.textButton} onClick={() => setQuery("")}>최근 거래처</button></div>{results.length ? <ul className={`${fieldList.list} ${styles.results}`}>{results.map((customer) => <li key={customer.customerId}><CustomerCard customer={customer} onSelect={() => openCustomer(customer.customerId)} /></li>)}</ul> : <div className={styles.empty}><Icon name="search" size={25} /><h2>등록된 거래처를 찾을 수 없습니다.</h2><p>거래처명의 일부나 초성으로 다시 찾아보세요.</p></div>}</>}</>}
    {directoryOpen ? <CustomerDirectory customers={catalog.customers} status={catalog.status} message={catalog.message} onRetry={catalog.retry} onSelect={openCustomer} onClose={() => setDirectoryOpen(false)} /> : null}
    {selected && !editing ? <CustomerDetail key={selected.customerId} customer={selected} onClose={() => setSelectedId(null)} onEdit={() => setEditing(selected)} /> : null}
    {editing && catalog.canRetainDraft ? <CustomerEditor key={editing === "new" ? "new" : `${editing.customerId}:${editing.revision}`} customer={editing === "new" ? null : editing} refreshMessage={catalog.status === "error" ? "목록 갱신이 지연되고 있어요. 작성 중인 내용은 유지됩니다." : ""} onClose={() => setEditing(null)} onSaved={(customer) => { catalog.accept(customer); setEditing(null); setSelectedId(customer.customerId); rememberCustomer(customer.customerId); catalog.retry(); showToast("거래처 정보를 저장했어요.", "success"); }} /> : null}
  </section>;
}
