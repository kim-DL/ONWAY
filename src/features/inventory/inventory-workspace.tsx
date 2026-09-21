"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { INVENTORY_LOCATIONS, INVENTORY_LOCATION_LABELS, type InventoryContext, type InventoryProduct } from "@/domain/inventory";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { GlassButton } from "@/components/ui/glass-button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { searchInputProps } from "@/components/ui/search-input-props";
import { inventoryCountEligible, inventoryScopeCountState, inventoryScopeIsUrgent, inventoryLocationsFor, inventoryOpeningLocation, matchesInventorySearch, type InventoryLocationFilter } from "./inventory-model";
import { readInventoryCountPreference, writeInventoryCountPreference } from "./inventory-count-preference";
import { inventoryErrorMessage, inventoryRepository } from "./inventory-repository";
import { InventoryDetail } from "./inventory-detail";
import { InventoryCard } from "./inventory-card";
import { inventoryKoreaDate, watchInventoryCalendar } from "./inventory-calendar";
import {
  commitInventoryCatalog, discardInventoryWorkspaceCatalog, getInventoryWorkspaceSession,
  subscribeInventoryCatalog,
  updateInventoryCatalogFreshness, updateInventorySnapshotContext, updateInventorySnapshotProduct,
  updateInventoryWorkspaceUi, type InventoryWorkspaceSnapshot,
} from "./inventory-workspace-snapshot";
import { INVENTORY_OFFLINE_DRAFT_MESSAGE, useInventoryConnection } from "./use-inventory-connection";
import { InventoryProductEditor, InventorySettingsForm } from "./inventory-forms";
import { revalidationFreshnessText, type RevalidationFreshness } from "@/lib/revalidation-coordinator";
import { restoreWorkspaceScroll } from "@/lib/workspace-scroll-memory";
import styles from "./inventory.module.css";

function preferenceStorage() { try { return window.sessionStorage; } catch { return undefined; } }

export function InventoryWorkspace({ session, admin = false }: { session: AuthenticatedSession; admin?: boolean }) {
  const online = useInventoryConnection();
  const sessionKey = `${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}`;
  const workspaceSession = getInventoryWorkspaceSession(sessionKey);
  const initialCatalog = workspaceSession.snapshot.catalog;
  const initialUi = workspaceSession.snapshot.ui;
  const [context, setContext] = useState<InventoryContext | null>(initialCatalog?.context ?? null);
  const [products, setProducts] = useState<InventoryProduct[]>(initialCatalog?.products ?? []);
  const [loading, setLoading] = useState(!initialCatalog);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [location, setLocation] = useState<InventoryLocationFilter>(initialUi.location);
  const [query, setQuery] = useState(initialUi.query);
  const [urgentOnly, setUrgentOnly] = useState(initialUi.urgentOnly);
  const [limit, setLimit] = useState(initialUi.limit);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(initialUi.showInactive);
  const [notice, setNotice] = useState({ message: "", sequence: 0 });
  const [calendarObservedDate, setCalendarObservedDate] = useState(initialCatalog?.observedDate ?? "");
  const [calendarRefreshing, setCalendarRefreshing] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [countPreference, setCountPreference] = useState({ key: "", enabled: false });
  const [freshness, setFreshness] = useState<{ status: RevalidationFreshness; lastSuccessAt: number | null }>(initialCatalog
    ? { status: initialCatalog.freshness, lastSuccessAt: initialCatalog.lastSuccessAt }
    : { status: "idle", lastSuccessAt: null });
  const [optionsOpen, setOptionsOpen] = useState(false);
  const workspaceRef = useRef<HTMLElement>(null);
  const calendarWatcher = useRef<ReturnType<typeof watchInventoryCalendar> | null>(null);
  const catalogReady = useRef(Boolean(initialCatalog));
  const forcedRefresh = useRef(false);
  const hasCalendarContext = context !== null;
  const calendarReady = online && !calendarRefreshing && !calendarError;
  const refresh = useCallback(() => { forcedRefresh.current = true; setRefreshKey((value) => value + 1); }, []);
  const showNotice = useCallback((message: string) => setNotice((old) => ({ message, sequence: old.sequence + 1 })), []);
  const acceptContext = useCallback((next: InventoryContext) => {
    setContext(next);
    const key = `${sessionKey}:${next.today}`;
    // Preserve this screen's preference during refreshes even when browser
    // storage is unavailable. A different employee/session/day still resets it.
    setCountPreference((current) => current.key === key ? current : { key, enabled: readInventoryCountPreference(preferenceStorage(), sessionKey, next.today) });
  }, [sessionKey]);
  const countMode = !!context?.canWrite && countPreference.key === `${sessionKey}:${context.today}` && countPreference.enabled;
  const acceptCatalog = useCallback((catalog: NonNullable<InventoryWorkspaceSnapshot["catalog"]>) => {
    catalogReady.current = true;
    if (catalog.context) { acceptContext(catalog.context); setCalendarRefreshing(false); setCalendarError(""); }
    setProducts(catalog.products); setLoading(false); setError(""); setCalendarObservedDate(catalog.observedDate);
    setFreshness({ status: catalog.freshness, lastSuccessAt: catalog.lastSuccessAt });
  }, [acceptContext]);
  function changeCountMode(enabled: boolean) {
    if (!context?.canWrite || !calendarReady) return;
    writeInventoryCountPreference(preferenceStorage(), sessionKey, context.today, enabled);
    setCountPreference({ key: `${sessionKey}:${context.today}`, enabled });
  }
  function saved(product: InventoryProduct) {
    // A reconnect may still be reading earlier catalog pages. Preserve this
    // committed result, including a new product or a deletion, until it ends.
    if (!workspaceSession.reconciler.record(sessionKey, product)) return;
    updateInventorySnapshotProduct(sessionKey, product);
    setProducts((old) => product.status === "deleted" ? old.filter((item) => item.productId !== product.productId) : old.some((item) => item.productId === product.productId) ? old.map((item) => item.productId === product.productId ? product : item) : [...old, product]);
    // Mutations return the complete changed product; do not reread 1,000 rows
    // for each of the hundreds of weekly counts.
    setEditorOpen(false); showNotice("재고 정보를 저장했어요.");
  }
  useEffect(() => {
    let cancelled = false;
    let pending = false;
    let queuedAfterFlight = false;
    let queuedForce = false;
    const { coordinator, reconciler } = workspaceSession;
    const unsubscribeCatalog = subscribeInventoryCatalog(sessionKey, acceptCatalog);
    // Keep already-open drafts in this authenticated component's memory. There
    // is no persistent cache or queued write, and an auth failure still clears it.
    const clear = () => {
      coordinator.invalidate();
      if (pending) queuedAfterFlight = true;
      if (!cancelled) {
        if (catalogReady.current) {
          updateInventoryCatalogFreshness(sessionKey, "stale-error", null);
          setFreshness((current) => ({ status: "stale-error", lastSuccessAt: current.lastSuccessAt })); setError("");
        }
        else setError(INVENTORY_OFFLINE_DRAFT_MESSAGE);
      }
    };
    const load = async (force = false) => {
      if (pending || document.visibilityState === "hidden") return;
      if (!navigator.onLine) { clear(); setLoading(false); return; }
      const requestIsCurrent = coordinator.guardCurrentGeneration();
      const run = coordinator.run(async () => {
        if (!reconciler.begin()) throw new Error("Inventory revalidation overlap");
        try {
          const baselineCatalog = workspaceSession.snapshot.catalog;
          const baselineProducts = baselineCatalog?.products ?? [];
          let progressiveContext = baselineCatalog?.context ?? null;
          let progressiveProducts: InventoryProduct[] | null = null;
          let progressiveComplete = false;
          const publishProgress = () => {
            if (!progressiveProducts || !requestIsCurrent()) return;
            const mergedProducts = reconciler.reconcile(progressiveProducts, progressiveComplete ? [] : baselineProducts);
            if (!mergedProducts) return;
            commitInventoryCatalog(sessionKey, {
              context: progressiveContext, products: mergedProducts, observedDate: inventoryKoreaDate(),
              freshness: "refreshing", lastSuccessAt: coordinator.getLastSuccessAt(),
            }, reconciler);
          };
          const contextPromise = inventoryRepository.context().then((nextContext) => {
            progressiveContext = nextContext; publishProgress(); return nextContext;
          });
          const listPromise = inventoryRepository.list((nextProducts, progress) => {
            progressiveProducts = nextProducts; progressiveComplete = progress.complete; publishProgress();
          });
          const [nextContext, nextProducts] = await Promise.all([contextPromise, listPromise]);
          const mergedProducts = reconciler.reconcile(nextProducts);
          if (!mergedProducts) throw new Error("Inventory revalidation disposed");
          const refreshedAt = Date.now();
          const observedDate = inventoryKoreaDate();
          if (!requestIsCurrent() || !commitInventoryCatalog(sessionKey, { context: nextContext, products: mergedProducts, observedDate, freshness: "fresh", lastSuccessAt: refreshedAt }, reconciler)) {
            throw new Error("Inventory revalidation superseded");
          }
          return { nextContext, mergedProducts, observedDate, refreshedAt };
        } finally {
          reconciler.finish();
        }
      }, { force, hasData: catalogReady.current });
      if (run.kind === "skipped") return;
      if (force && run.kind === "joined") queuedForce = true;
      pending = true;
      if (catalogReady.current) {
        updateInventoryCatalogFreshness(sessionKey, "refreshing", null);
        setFreshness((current) => ({ status: "refreshing", lastSuccessAt: current.lastSuccessAt }));
      }
      setCalendarRefreshing(true);
      try {
        const { nextContext, mergedProducts, observedDate, refreshedAt } = await run.promise;
        if (!cancelled && navigator.onLine) {
          catalogReady.current = true;
          acceptContext(nextContext); setProducts(mergedProducts); setError(""); setCalendarObservedDate(observedDate); setCalendarError(""); setCalendarRefreshing(false);
          setFreshness({ status: "fresh", lastSuccessAt: refreshedAt });
        }
      } catch (cause) {
        if (!cancelled) {
          const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
          if (["unauthenticated", "permission-denied", "failed-precondition"].some((suffix) => code.endsWith(suffix))) {
            discardInventoryWorkspaceCatalog(sessionKey); catalogReady.current = false;
            setContext(null); setProducts([]); setSelectedId(null); setEditorOpen(false); setSettingsOpen(false);
          }
          if (catalogReady.current) {
            updateInventoryCatalogFreshness(sessionKey, "stale-error", null);
            setFreshness((current) => ({ status: "stale-error", lastSuccessAt: current.lastSuccessAt })); setError("");
          }
          else setError(inventoryErrorMessage(cause));
          setCalendarError(inventoryErrorMessage(cause));
        }
      }
      finally {
        pending = false;
        if (!cancelled) { setLoading(false); setCalendarRefreshing(false); }
        if (queuedForce && !cancelled) { queuedForce = false; void load(true); }
        else if (queuedAfterFlight && !cancelled) { queuedAfterFlight = false; void load(true); }
      }
    };
    const force = forcedRefresh.current || !catalogReady.current;
    forcedRefresh.current = false;
    void load(force);
    // No recurring full-catalog polling. Returning to the app refreshes stale
    // stock once, so removing the refresh button does not strand office users.
    const firstVisible = () => { if (document.visibilityState === "visible") void load(); };
    const onOnline = () => void load();
    window.addEventListener("online", onOnline); window.addEventListener("focus", firstVisible); window.addEventListener("offline", clear);
    document.addEventListener("visibilitychange", firstVisible);
    return () => { cancelled = true; unsubscribeCatalog(); window.removeEventListener("online", onOnline); window.removeEventListener("focus", firstVisible); window.removeEventListener("offline", clear); document.removeEventListener("visibilitychange", firstVisible); };
  }, [refreshKey, sessionKey, acceptContext, acceptCatalog, workspaceSession]);
  useEffect(() => {
    if (!hasCalendarContext || !calendarObservedDate) return;
    const watcher = watchInventoryCalendar({
      observedDate: calendarObservedDate,
      load: inventoryRepository.context,
      onRefreshing: setCalendarRefreshing,
      onContext: (nextContext) => {
        acceptContext(nextContext); updateInventorySnapshotContext(sessionKey, nextContext, inventoryKoreaDate());
        setCalendarError(""); showNotice("유통기한과 이번 주 실사 기준을 갱신했어요.");
      },
      onError: (cause) => {
        const message = inventoryErrorMessage(cause);
        setCalendarError(message);
        const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
        if (["unauthenticated", "permission-denied", "failed-precondition"].some((suffix) => code.endsWith(suffix))) {
          discardInventoryWorkspaceCatalog(sessionKey);
          setContext(null); setProducts([]); setSelectedId(null); setEditorOpen(false); setSettingsOpen(false); setError(message);
        }
      },
    });
    calendarWatcher.current = watcher;
    return () => { watcher.dispose(); if (calendarWatcher.current === watcher) calendarWatcher.current = null; };
  }, [hasCalendarContext, calendarObservedDate, session.uid, sessionKey, showNotice, acceptContext]);
  useEffect(() => {
    updateInventoryWorkspaceUi(sessionKey, { location, query, urgentOnly, showInactive, limit });
  }, [sessionKey, location, query, urgentOnly, showInactive, limit]);
  useLayoutEffect(() => {
    const scroller = workspaceRef.current?.closest(".workspace-content") as HTMLElement | null;
    if (!scroller) return;
    const remember = () => updateInventoryWorkspaceUi(sessionKey, { scrollTop: scroller.scrollTop });
    restoreWorkspaceScroll(scroller, initialUi.scrollTop);
    scroller.addEventListener("scroll", remember, { passive: true });
    return () => { remember(); scroller.removeEventListener("scroll", remember); };
  }, [sessionKey, initialUi.scrollTop]);
  useEffect(() => {
    if (!notice.message) return;
    const timer = setTimeout(() => setNotice((current) => current === notice ? { ...current, message: "" } : current), 3_400);
    return () => clearTimeout(timer);
  }, [notice]);
  const inactiveView = showInactive && !!context?.canWrite;
  const countControlsReady = calendarReady && !inactiveView;
  const rows = useMemo(() => products.filter((product) => product.status === (inactiveView ? "inactive" : "active") && (location === "all" || inventoryLocationsFor(product).includes(location))).sort((a, b) => a.name.localeCompare(b.name, "ko")), [products, location, inactiveView]);
  const countRows = context ? rows.filter((product) => inventoryCountEligible(product, context) || inventoryScopeCountState(product, location, context.cycle.cycleId) === "done") : [];
  const completed = context ? countRows.filter((product) => inventoryScopeCountState(product, location, context.cycle.cycleId) === "done").length : 0;
  const filtered = useMemo(() => rows.filter((product) => matchesInventorySearch(product, query)
    && (!countControlsReady || !urgentOnly || !!context && inventoryScopeIsUrgent(product, location, context.today, context.settings.urgentDays))), [rows, query, urgentOnly, context, location, countControlsReady]);
  const selectedProduct = products.find((product) => product.productId === selectedId);
  const locationLabel = location === "all" ? "전체" : INVENTORY_LOCATION_LABELS[location];
  const freshnessText = revalidationFreshnessText(freshness.status, freshness.lastSuccessAt);
  const optionsActive = showInactive || urgentOnly || countMode;
  return <section ref={workspaceRef} className={admin ? styles.workspace : `shell-page ${styles.workspace}`} data-admin={admin || undefined} data-write-actions={context?.canWrite || undefined} aria-label="재고 관리">
    <h1 className={styles.hiddenInput}>재고 관리</h1>
    {notice.message ? <p role="status" className={styles.success}>{notice.message}</p> : null}
    {context && online && !calendarReady ? <div className={styles.notice} role={calendarError ? "alert" : "status"}><p>{calendarRefreshing ? "날짜가 바뀌어 유통기한·실사 기준을 확인하고 있어요." : "날짜 기준을 갱신하지 못했어요. 기준을 다시 확인한 뒤 실사를 저장해주세요."}</p><p className={styles.muted}>기준 확인 전에는 유통기한·실사 필터를 잠시 멈추고 전체 품목을 보여드려요.</p>{calendarError ? <><p className={styles.muted}>{calendarError}</p><GlassButton disabled={calendarRefreshing} onClick={() => calendarWatcher.current?.refresh()}>날짜 기준 다시 확인</GlassButton></> : null}</div> : null}
    <div className={styles.locations} data-catalog role="group" aria-label="보관 장소">{(["all", ...INVENTORY_LOCATIONS] as const).map((item) => <button key={item} type="button" aria-pressed={location === item} onClick={() => { setLocation(item); setLimit(60); }}>{item === "all" ? "전체" : INVENTORY_LOCATION_LABELS[item]}</button>)}</div>
    {context && countControlsReady && countRows.length > 0 && (context.today === context.cycle.startDate || countMode) ? <div className={styles.progressCard} data-count-day><div><span><Icon name="clipboard" size={15} />{context.today === context.cycle.startDate ? "오늘은 재고조사일" : "재고조사 진행 중"}</span><strong>{completed}<small> / {countRows.length}개 확인</small></strong></div><progress value={completed} max={countRows.length} aria-label={`${locationLabel} 실사 ${countRows.length}개 중 ${completed}개 완료`} /></div> : null}
    <div className={styles.filters}><label className={styles.search}><Icon name="search" size={18} /><input {...searchInputProps} aria-label="품목 검색" placeholder="상품명 · 제조사" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(60); }} /></label>{context?.canWrite ? <button type="button" className={styles.optionsTrigger} aria-label="목록 옵션" aria-haspopup="dialog" aria-expanded={optionsOpen} data-active={optionsActive || undefined} onClick={() => setOptionsOpen(true)}><Icon name="sliders" size={20} /><span aria-hidden="true" /></button> : null}</div>
    {countMode ? <p className={styles.countModeStatus} role="status"><span aria-hidden="true" />재고조사 ON</p> : null}
    {error ? <div role="alert" className={styles.message}>{error}<GlassButton onClick={refresh}>다시 확인</GlassButton></div> : null}
    {freshnessText ? <p className={styles.resultCount} role="status" data-freshness={freshness.status}>{freshnessText}</p> : null}
    {loading ? <p role="status" className={styles.message}>재고를 불러오고 있어요.</p> : <><div className={styles.catalogMeta}><p className={styles.resultCount} aria-live="polite">{filtered.length.toLocaleString("ko-KR")}개 품목{inactiveView ? " · 비활성" : !context?.canWrite ? " · 읽기 전용" : ""}</p>{context?.canAdmin ? <GlassButton compact variant="quiet" aria-label="재고 설정" onClick={() => setSettingsOpen(true)}><Icon name="settings" size={16} />설정</GlassButton> : null}</div><div className={styles.list}>{filtered.slice(0, limit).map((product) => <InventoryCard key={product.productId} product={product} location={location} context={calendarReady ? context : null} countMode={countMode} onOpen={setSelectedId} />)}</div>{!filtered.length && !error ? <p className={styles.message}>{query || urgentOnly ? "조건에 맞는 품목이 없어요." : `${locationLabel}에 등록된 품목이 없어요.`}</p> : null}{filtered.length > limit ? <GlassButton className={styles.loadMore} onClick={() => setLimit((value) => value + 60)}>품목 더 보기</GlassButton> : null}</>}
    {context?.canWrite ? <div className={styles.stickyActions}><GlassButton variant="primary" aria-label="새 품목 등록" disabled={!online} onClick={() => setEditorOpen(true)}><Icon name="plus" />새 품목</GlassButton></div> : null}
    {context && selectedId && selectedProduct ? <InventoryDetail key={selectedId} productId={selectedId} initialLocation={inventoryOpeningLocation(selectedProduct, location)} context={context} calendarReady={calendarReady} countMode={countMode} onClose={() => setSelectedId(null)} onSaved={saved} /> : null}
    {context?.canWrite && editorOpen ? <InventoryProductEditor product={null} location={location === "all" ? "refrigerated" : location} canCreateManufacturer={context.canWrite} canManageManufacturers={context.canAdmin} onClose={() => setEditorOpen(false)} onSaved={(product) => { saved(product); setSelectedId(product.productId); }} /> : null}
    {context?.canAdmin && settingsOpen ? <InventorySettingsForm context={context} onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); showNotice("재고 설정을 저장했어요."); refresh(); }} /> : null}
    {context?.canWrite ? <BottomSheet open={optionsOpen} title="목록 옵션" onClose={() => setOptionsOpen(false)}><div className={styles.sheet}>
      <section className={styles.lotCard} aria-labelledby="inventory-display-options"><div className={styles.sectionHeading}><h3 id="inventory-display-options">표시 옵션</h3></div><label className={styles.optionToggle}><input type="checkbox" checked={showInactive} onChange={(event) => { setShowInactive(event.target.checked); setLimit(60); }} /><span>비활성 품목 보기</span></label><label className={styles.optionToggle} title={context ? `유통기한 D-${context.settings.urgentDays}일 이내, 기한 지난 상품 포함` : undefined}><input type="checkbox" disabled={inactiveView || !calendarReady || !context} checked={urgentOnly} onChange={(event) => { setUrgentOnly(event.target.checked); setLimit(60); }} /><span>임박 상품만 보기<small>{context ? `D-${context.settings.urgentDays}일` : "기준 확인 중"}</small></span></label></section>
      <section className={styles.lotCard} aria-labelledby="inventory-work-mode"><div className={styles.sectionHeading}><h3 id="inventory-work-mode">작업 모드</h3></div><label className={styles.countToggle} data-active={countMode || undefined}><input type="checkbox" role="switch" aria-label="재고조사 모드" checked={countMode} disabled={!calendarReady} onChange={(event) => changeCountMode(event.target.checked)} /><span className={styles.countToggleLabel}>재고조사</span><span className={styles.countToggleControl} aria-hidden="true"><span>OFF</span><span>ON</span></span></label></section>
    </div></BottomSheet> : null}
  </section>;
}
