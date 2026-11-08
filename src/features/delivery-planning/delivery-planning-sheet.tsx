"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import type { Customer } from "@/domain/customer";
import { DEFAULT_DELIVERY_VEHICLE, PLANNING_NOTICE, type PhotoBatchResult, type PhotoAlias, type PlanningContext, type PlanningLists, type RouteRecommendation } from "@/domain/delivery-planning";
import type { DeliveryPhotoDayResult } from "@/features/delivery-photos/delivery-photo-repository";
import { planningError, planningRepository, type PlanningRepository } from "./planning-repository";
import { PlanningSettingsForm } from "./planning-settings";
import styles from "./planning.module.css";

const PhotoBatchReview = dynamic(() => import("./photo-batch-review").then((module) => module.PhotoBatchReview), {
  ssr: false, loading: () => <p role="status">확인 항목 준비 중…</p>,
});
const PhotoAliasManager = dynamic(() => import("./photo-alias-manager").then((module) => module.PhotoAliasManager), {
  ssr: false, loading: () => <p role="status">기억한 줄임말 준비 중…</p>,
});

type Scan = { id: string; name: string; state: "waiting" | "reading" | "failed" | "done"; result?: PhotoBatchResult; error?: string };

export default function DeliveryPlanningSheet({ customers, day, onLists, onDay, onRefresh, onClose, onEditToday, mode = "invoice", repository = planningRepository }: {
  customers: readonly Customer[]; day: DeliveryPhotoDayResult;
  onLists: (lists: PlanningLists) => void; onDay: (day: DeliveryPhotoDayResult) => void; onRefresh: () => void; onClose: () => void;
  repository?: PlanningRepository;
  mode?: "invoice" | "route"; onEditToday?: () => void;
}) {
  const [context, setContext] = useState<PlanningContext | null>(null); const [configuring, setConfiguring] = useState(false);
  const [aliases, setAliases] = useState<PhotoAlias[]>([]); const [aliasError, setAliasError] = useState("");
  const [aliasesOpened, setAliasesOpened] = useState(false);
  const [scans, setScans] = useState<Scan[]>([]); const files = useRef(new Map<string, File>());
  const [actionBusy, setBusy] = useState(false); const running = useRef(false); const alive = useRef(true);
  const [processing, setProcessing] = useState(false); const draining = useRef(false);
  const pending = useRef<string[]>([]); const scanCount = useRef(0);
  const busy = actionBusy || processing;
  const [error, setError] = useState(""); const [lastId, setLastId] = useState("");
  const [recommendation, setRecommendation] = useState<RouteRecommendation | null>(null); const [applied, setApplied] = useState(false);
  const applyRequest = useRef<{ recommendationId: string; requestId: string } | null>(null);
  const camera = useRef<HTMLInputElement>(null); const gallery = useRef<HTMLInputElement>(null);
  const activeCustomers = customers.filter((c) => c.status === "active");
  const today = day.customerIds.map((id) => activeCustomers.find((c) => c.customerId === id)).filter((c): c is Customer => Boolean(c));
  const reviews = scans.reduce((count, scan) => count + (scan.result?.rows.filter((row) => row.status === "review").length ?? 0), 0);
  const saved = new Set(scans.flatMap((s) => s.result?.rows.flatMap((row) => row.status === "saved" && row.customerId ? [row.customerId] : []) ?? [])).size;
  const done = scans.filter((s) => s.state === "done" || s.state === "failed").length;
  const waiting = scans.filter((s) => s.state === "waiting").length;
  const failed = scans.filter((s) => s.state === "failed").length;
  const empty = scans.filter((s) => s.result?.rows.length === 0).length;
  const loadContext = async () => { try { const value = await repository.context(); if (alive.current) setContext(value); } catch (e) { if (alive.current) setError(planningError(e)); } };
  const loadAliases = async () => {
    try { const values = await repository.aliases(); if (alive.current) { setAliases(values); setAliasError(""); } }
    catch (cause) { if (alive.current) setAliasError(planningError(cause)); }
  };
  useEffect(() => {
    alive.current = true; const pendingFiles = files.current; const pendingQueue = pending.current;
    void repository.context().then((value) => { if (alive.current) setContext(value); }).catch((e: unknown) => { if (alive.current) setError(planningError(e)); });
    if (mode === "invoice") void repository.aliases().then((value) => { if (alive.current) setAliases(value); }).catch((e: unknown) => { if (alive.current) setAliasError(planningError(e)); });
    return () => { alive.current = false; pendingQueue.length = 0; pendingFiles.clear(); };
  }, [repository, mode]);
  useEffect(() => {
    if (!processing && !failed && !reviews) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [processing, failed, reviews]);
  const patch = (id: string, value: Partial<Scan>) => { if (alive.current) setScans((old) => old.map((s) => s.id === id ? { ...s, ...value } : s)); };
  const accept = (id: string, result: PhotoBatchResult) => {
    if (!alive.current) return;
    patch(id, { state: "done", result }); files.current.delete(id);
    setRecommendation(null); setApplied(false);
    if (result.lists) onLists(result.lists);
  };
  const read = async (id: string) => {
    const file = files.current.get(id); if (!file || !alive.current) return;
    patch(id, { state: "reading", error: "" });
    try {
      const { prepareInvoiceFile } = await import(/* webpackChunkName: "invoice-file" */ "./invoice-file");
      const image = await prepareInvoiceFile(file);
      if (!alive.current) return;
      accept(id, await repository.analyzeBatch({ requestId: id, deliveryDateKey: day.deliveryDateKey, ...image }));
    } catch (e) { patch(id, { state: "failed", error: planningError(e) }); if (alive.current) onRefresh(); }
  };
  const drain = async () => {
    if (draining.current || !alive.current) return;
    draining.current = true; setProcessing(true);
    try {
      // Capture can append while this worker awaits the server. Only one request runs at a time.
      while (alive.current && pending.current.length) {
        const id = pending.current.shift()!;
        await read(id);
      }
    } finally { draining.current = false; if (alive.current) setProcessing(false); }
  };
  const addFiles = (selected: File[]) => {
    if (running.current || !alive.current || !selected.length) return;
    if (selected.length > 20 || scanCount.current + selected.length > 60) { setError("한 번에 20장, 이 화면에서 최대 60장까지 확인할 수 있어요."); return; }
    if (selected.some((f) => f.size > 20 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/u.test(f.type))) { setError("20MB 이하의 JPEG·PNG·WebP 사진을 선택해주세요."); return; }
    setError(""); setRecommendation(null); setApplied(false);
    const queue = selected.map((file) => { const id = crypto.randomUUID(); files.current.set(id, file); return { id, name: file.name, state: "waiting" as const }; });
    scanCount.current += queue.length;
    pending.current.push(...queue.map((scan) => scan.id));
    setScans((old) => [...old, ...queue]);
    void drain();
  };
  const retry = (scan: Scan) => {
    if (running.current || draining.current || !files.current.has(scan.id)) return;
    // Retry the same request ID first: a lost response must not create a second paid call.
    setError(""); pending.current.push(scan.id); void drain();
  };
  const runAction = async <T,>(work: () => Promise<T>): Promise<T> => {
    if (running.current || draining.current) throw new Error("처리 중인 사진을 먼저 확인해주세요.");
    running.current = true; setBusy(true);
    try { return await work(); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  };
  const action = async (work: () => Promise<void>) => {
    if (running.current || draining.current) return;
    setError("");
    try { await runAction(work); } catch (e) { if (alive.current) { setError(planningError(e)); onRefresh(); } }
  };
  const applyRecommendation = async (route: RouteRecommendation) => {
    if (!alive.current) return;
    // Reuse the receipt after a lost response; never repeat the paid route calculation to retry saving.
    if (applyRequest.current?.recommendationId !== route.recommendationId) {
      applyRequest.current = { recommendationId: route.recommendationId, requestId: crypto.randomUUID() };
    }
    const result = await repository.apply({ ...applyRequest.current, deliveryDateKey: route.deliveryDateKey });
    if (alive.current) { onDay(result); setApplied(true); }
  };
  const canRecommend = context?.settings.originPoint && today.length >= 2 && today.length <= 20 && today.some((c) => c.customerId === lastId) && !reviews && !scans.some((s) => s.state === "failed");
  const guard = () => !scans.some((s) => s.result?.rows.some((row) => row.status === "review") || s.state === "failed") || window.confirm("확인하지 않은 사진은 보관되지 않습니다. 이미 저장한 납품처는 유지하고 닫을까요?");

  return <BottomSheet open title={mode === "route" ? "인공지능 경로 추천" : "사진으로 납품 준비"} onClose={onClose} beforeClose={guard} dismissible={!busy && !configuring}>
    <div className={styles.content}>
      {configuring && context ? <PlanningSettingsForm settings={context.settings} repository={repository}
        onSaved={(settings) => { setContext({ ...context, settings }); setConfiguring(false); setRecommendation(null); }} onCancel={() => setConfiguring(false)} /> : <>
        {mode === "invoice" && <section className={styles.captureCard} aria-label="등록할 사진 선택">
          <div className={styles.captureHeading}><svg viewBox="0 0 40 40" width="40" height="40" fill="none" aria-hidden="true"><rect x="9" y="5" width="23" height="30" rx="3" stroke="currentColor" strokeWidth="1.8"/><path d="M15 13h11M15 19h11M15 25h6M5 11v-5a4 4 0 0 1 4-4M26 38h5a4 4 0 0 0 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            <div><h3>사진으로 납품처 등록</h3><p>명세서 · 손글씨 거래처 목록</p></div></div>
          <div className={styles.captureActions}><button type="button" className={styles.primary} disabled={actionBusy || scans.length >= 60} onClick={() => camera.current?.click()}>사진 촬영</button><button type="button" disabled={actionBusy || scans.length >= 60} onClick={() => gallery.current?.click()}>갤러리에서 선택</button></div>
          {processing && <p className={styles.hint}>분석 중에도 계속 촬영할 수 있어요.</p>}
          <p className={styles.privacy}>등록용 사진은 Firebase에 저장하지 않아요.</p>
          <details className={styles.privacyDetail}><summary>사진 처리</summary><p>OpenAI로 전송해 분석합니다. 급식길에는 연결 결과만 남으며, OpenAI의 보존 정책은 별도로 적용됩니다.</p></details>
        </section>}
        <input ref={camera} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="납품처 카메라" onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.target.value = ""; void addFiles(picked); }} />
        <input ref={gallery} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="납품처 갤러리" onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.target.value = ""; void addFiles(picked); }} />
        {scans.length > 0 && <section className={styles.scanSection} aria-label="사진 처리 결과">
          <div className={styles.sectionTitle}><h3>인식 결과</h3><span role="status">{processing ? `${done}/${scans.length}장 처리 · 대기 ${waiting}장` : `${saved}곳 저장${reviews ? ` · ${reviews}곳 확인 필요` : ""}${empty ? ` · 인식 없음 ${empty}장` : ""}${failed ? ` · ${failed}장 재확인` : reviews || empty ? "" : " 완료"}`}</span></div>
          {processing && <progress className={styles.progress} value={done} max={scans.length} aria-label="사진 분석 진행률" />}
          <ul className={styles.scanList}>{scans.map((scan, index) => {
            const result = scan.result; const unresolved = result?.rows.filter((row) => row.status === "review") ?? [];
            const savedRows = result?.rows.filter((row) => row.status === "saved") ?? [];
            const skippedRows = result?.rows.filter((row) => row.status === "skipped") ?? [];
            return <li key={scan.id}>
              <div className={styles.scanRow}><span className={styles.scanNumber}>{String(index + 1).padStart(2, "0")}</span><div><strong>{result ? result.kind === "invoice" ? "명세서" : result.kind === "customer_list" ? "거래처 목록" : "사진 확인" : `사진 ${index + 1}`}</strong>
                <small>{result ? `${result.rows.length}개 항목${skippedRows.length ? ` · 제외 ${skippedRows.length}` : ""}` : scan.state === "reading" ? "거래처를 읽고 있어요…" : scan.state === "waiting" ? "순서대로 확인할게요" : ""}</small></div>
                <span className={result && result.rows.length && !unresolved.length ? styles.savedBadge : styles.reviewBadge}>{result ? !result.rows.length ? "판독 불가" : unresolved.length ? `${unresolved.length}곳 확인` : savedRows.length ? "저장됨" : "확인 완료" : scan.state === "failed" ? "재확인" : scan.state === "waiting" ? "대기" : "분석 중"}</span></div>
              {savedRows.length > 0 && <details className={styles.savedRows}><summary>{savedRows.length}개 항목 연결됨</summary>{savedRows.map((row) => <p key={row.rowId}><span>{row.rawName}</span><strong>{activeCustomers.find((c) => c.customerId === row.customerId)?.name ?? "거래처"}</strong></p>)}</details>}
              {result?.message && <p className={styles.hint}>{result.message}</p>}
              {scan.state === "failed" && <div className={styles.error}><p>{scan.error}</p><div className={styles.inlineActions}><button type="button" disabled={busy} onClick={() => retry(scan)}>저장 결과 다시 확인</button><button type="button" disabled={busy} onClick={() => { files.current.delete(scan.id); scanCount.current--; setScans((old) => old.filter((s) => s.id !== scan.id)); }}>이 장 제외</button></div><small>분석에 실패했다면 이 장을 제외한 뒤 다시 선택해주세요.</small></div>}
              {result && unresolved.length > 0 && <PhotoBatchReview key={`${scan.id}-${result.revision}`} result={result} customers={activeCustomers} aliases={aliases} deliveryDateKey={day.deliveryDateKey} busy={busy}
                onConfirm={(input) => runAction(async () => {
                  try { accept(scan.id, await repository.confirmBatch(input)); await loadAliases(); }
                  catch (cause) { if (alive.current) { onRefresh(); await loadAliases(); } throw cause; }
                })} />}
            </li>;
          })}</ul>
        </section>}
        {mode === "invoice" && <details className={styles.aliasManager} onToggle={(event) => { if (event.currentTarget.open) setAliasesOpened(true); }}>
          <summary>기억한 줄임말 <span>{aliases.filter((alias) => alias.enabled).length}</span></summary>
          {aliasesOpened && <PhotoAliasManager aliases={aliases} customers={activeCustomers} busy={busy} error={aliasError} onReload={() => void loadAliases()} onUpdate={(input) => runAction(async () => {
            const updated = await repository.updateAlias(input);
            if (alive.current) setAliases((old) => [...old.filter((alias) => alias.aliasKey !== updated.aliasKey), updated]);
          })} />}</details>}
        <section className={styles.routeSection} aria-label="납품 경로 추천">
          <div className={styles.sectionTitle}><h3>오늘의 납품 순서</h3><span>{today.length}곳</span></div>
          {!recommendation && <ol className={styles.routeList} aria-label="현재 오늘 납품처">{today.map((c, index) => <li key={c.customerId}><span>{index + 1}</span><strong>{c.name}</strong></li>)}</ol>}
          {onEditToday && <button type="button" className={styles.textButton} disabled={busy} onClick={() => { if (guard()) onEditToday(); }}>납품처 추가 · 순서 편집</button>}
          {today.length < 2 && <p className={styles.hint}>오늘 납품처를 2곳 이상 선택해주세요.</p>}
          <div className={styles.origin}><span className={styles.originDot} /><div><strong>회사에서 출발</strong><p>{context?.settings.originAddress ?? "출발지 확인 중…"}</p></div></div>
          <label className={styles.lastSelect}>마지막 납품처<select value={lastId} disabled={busy} onChange={(e) => { setLastId(e.target.value); setRecommendation(null); setApplied(false); }}><option value="">거래처 선택</option>{today.map((c) => <option key={c.customerId} value={c.customerId}>{c.name}</option>)}</select></label>
          <div className={styles.vehicleNote}><strong>봉고3 냉동탑차 · 높이 {(context?.settings.vehicle ?? DEFAULT_DELIVERY_VEHICLE).heightCm / 100}m</strong><p>{PLANNING_NOTICE}</p></div>
          {context && !context.settings.originPoint && <p className={styles.configNotice}>{context.canConfigure ? "회사 출발 위치를 설정해주세요." : "관리자의 출발지 설정이 필요해요."}</p>}
          {context?.canConfigure && <button type="button" className={styles.textButton} disabled={busy} onClick={() => setConfiguring(true)}>회사 출발지 설정</button>}
          {!context && <button type="button" disabled={busy} onClick={() => void loadContext()}>출발지 설정 다시 확인</button>}
          <button type="button" className={styles.recommendButton} disabled={busy || !canRecommend} onClick={() => void action(async () => {
            setRecommendation(null); setApplied(false);
            const result = await repository.recommend({ requestId: crypto.randomUUID(), deliveryDateKey: day.deliveryDateKey, expectedDayRevision: day.revision, lastCustomerId: lastId });
            if (alive.current) { setRecommendation(result); await applyRecommendation(result); }
          })}>{busy ? "처리 중…" : recommendation ? "인공지능으로 다시 계산" : "인공지능 경로 추천"}</button>
          {reviews > 0 && <p className={styles.hint}>확인이 필요한 항목을 연결하거나 제외해주세요.</p>}
          {today.length > 20 && <p className={styles.hint}>경로 추천은 한 번에 20곳까지 지원해요. 오늘 순서 편집을 이용해주세요.</p>}
          {recommendation && <div className={styles.recommendation}>
            <div className={styles.routeStats}><span>예상 이동<strong>{Math.ceil(recommendation.totalSeconds / 60)}<small>분</small></strong></span><span>전체 거리<strong>{(recommendation.totalMeters / 1000).toFixed(1)}<small>km</small></strong></span></div>
            <p className={styles.hint}>하차·납품 시간 제외</p>
            <ol className={styles.routeList}>{recommendation.customerIds.map((id, index) => <li key={id}><span>{index + 1}</span><div><strong>{activeCustomers.find((c) => c.customerId === id)?.name ?? "거래처"}</strong>{index === recommendation.customerIds.length - 1 && <small>마지막 납품처</small>}</div></li>)}</ol>
            <button type="button" className={styles.primary} disabled={busy || applied} onClick={() => void action(() => applyRecommendation(recommendation))}>{applied ? "오늘 순서에 적용했어요" : busy ? "오늘 목록에 저장 중…" : "오늘 목록 저장 다시 시도"}</button>
            {applied && onEditToday && <button type="button" className={styles.editOrder} disabled={busy} onClick={onEditToday}>순서 직접 바꾸기</button>}
          </div>}
        </section>
      </>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
    {!configuring && <BottomSheetActions busy={busy} className={styles.footer ?? ""}><span>{processing ? `저장 ${saved} · 대기 ${waiting}` : saved ? `${saved}곳 저장됨` : `오늘 ${today.length}곳`}</span>
      {mode === "invoice" && scans.length > 0 && <button type="button" disabled={actionBusy || scans.length >= 60} onClick={() => camera.current?.click()}>다음 촬영</button>}
      <button type="button" disabled={busy} onClick={() => { if (guard()) onClose(); }}>{busy ? "처리 중…" : "완료"}</button></BottomSheetActions>}
  </BottomSheet>;
}
