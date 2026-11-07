"use client";
import { useEffect, useRef, useState } from "react";
import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import type { Customer } from "@/domain/customer";
import { DEFAULT_DELIVERY_VEHICLE, PLANNING_NOTICE, type InvoiceResult, type PlanningContext, type PlanningLists, type RouteRecommendation } from "@/domain/delivery-planning";
import type { DeliveryPhotoDayResult } from "@/features/delivery-photos/delivery-photo-repository";
import { searchCustomers } from "@/features/customers/customer-search";
import { prepareInvoiceFile } from "./invoice-file";
import { planningError, planningRepository, type PlanningRepository } from "./planning-repository";
import { PlanningSettingsForm } from "./planning-settings";
import styles from "./planning.module.css";

type Scan = { id: string; name: string; state: "waiting" | "reading" | "failed" | "done"; result?: InvoiceResult; error?: string };

function InvoiceReview({ result, customers, busy, onConfirm }: { result: InvoiceResult; customers: readonly Customer[]; busy: boolean; onConfirm: (id: string, dateConfirmed: boolean) => void }) {
  const [query, setQuery] = useState(""); const [selected, setSelected] = useState(result.candidateIds.length === 1 ? result.candidateIds[0]! : "");
  const [dateConfirmed, setDateConfirmed] = useState(false);
  const matches = query.trim() ? searchCustomers(customers, query).slice(0, 8) : customers.filter((c) => result.candidateIds.includes(c.customerId));
  return <div className={styles.review}>
    <p>{result.reason}</p><label>기존 거래처 찾기<input value={query} disabled={busy} placeholder="이름 · 초성으로 검색" onChange={(e) => setQuery(e.target.value)} /></label>
    <div className={styles.matchOptions}>{matches.map((customer) => <label key={customer.customerId} className={selected === customer.customerId ? styles.selectedMatch : ""}>
      <input type="radio" name={`match-${result.scanId}`} checked={selected === customer.customerId} disabled={busy} onChange={() => setSelected(customer.customerId)} />
      <span><strong>{customer.name}</strong><small>{customer.officialAddress || customer.deliveryAddress || "주소 미등록"}</small></span>
    </label>)}</div>
    {query && !matches.length && <p>기존 거래처를 찾지 못했어요. 거래처 등록 화면에서 먼저 등록해주세요.</p>}
    <label className={styles.checkbox}><input type="checkbox" checked={dateConfirmed} disabled={busy} onChange={(e) => setDateConfirmed(e.target.checked)} /><span>{result.fields.invoiceDate ?? "날짜 미확인"} · 오늘 납품 건 확인</span></label>
    <button type="button" className={styles.primary} disabled={!selected || !dateConfirmed || busy} onClick={() => onConfirm(selected, dateConfirmed)}>이 거래처로 저장</button>
  </div>;
}

export default function DeliveryPlanningSheet({ customers, day, onLists, onDay, onRefresh, onClose, onEditToday, mode = "invoice", repository = planningRepository }: {
  customers: readonly Customer[]; day: DeliveryPhotoDayResult;
  onLists: (lists: PlanningLists) => void; onDay: (day: DeliveryPhotoDayResult) => void; onRefresh: () => void; onClose: () => void;
  repository?: PlanningRepository;
  mode?: "invoice" | "route"; onEditToday?: () => void;
}) {
  const [context, setContext] = useState<PlanningContext | null>(null); const [configuring, setConfiguring] = useState(false);
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
  const reviews = scans.filter((s) => s.result?.status === "review").length;
  const saved = new Set(scans.flatMap((s) => s.result?.status === "saved" && s.result.customerId ? [s.result.customerId] : [])).size;
  const done = scans.filter((s) => s.state === "done" || s.state === "failed").length;
  const waiting = scans.filter((s) => s.state === "waiting").length;
  const failed = scans.filter((s) => s.state === "failed").length;
  const loadContext = async () => { try { const value = await repository.context(); if (alive.current) setContext(value); } catch (e) { if (alive.current) setError(planningError(e)); } };
  useEffect(() => {
    alive.current = true; const pendingFiles = files.current; const pendingQueue = pending.current;
    void repository.context().then((value) => { if (alive.current) setContext(value); }).catch((e: unknown) => { if (alive.current) setError(planningError(e)); });
    return () => { alive.current = false; pendingQueue.length = 0; pendingFiles.clear(); };
  }, [repository]);
  useEffect(() => {
    if (!processing && !failed && !reviews) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [processing, failed, reviews]);
  const patch = (id: string, value: Partial<Scan>) => { if (alive.current) setScans((old) => old.map((s) => s.id === id ? { ...s, ...value } : s)); };
  const accept = (id: string, result: InvoiceResult) => {
    if (!alive.current) return;
    patch(id, { state: "done", result }); files.current.delete(id);
    setRecommendation(null); setApplied(false);
    if (result.lists) onLists(result.lists);
  };
  const read = async (id: string) => {
    const file = files.current.get(id); if (!file || !alive.current) return;
    patch(id, { state: "reading", error: "" });
    try {
      const image = await prepareInvoiceFile(file);
      if (!alive.current) return;
      accept(id, await repository.analyze({ requestId: id, deliveryDateKey: day.deliveryDateKey, ...image }));
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
  const action = async (work: () => Promise<void>) => {
    if (running.current || draining.current) return;
    running.current = true; setBusy(true); setError("");
    try { await work(); } catch (e) { if (alive.current) { setError(planningError(e)); onRefresh(); } }
    finally { running.current = false; if (alive.current) setBusy(false); }
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
  const guard = () => !scans.some((s) => s.result?.status === "review" || s.state === "failed") || window.confirm("확인하지 않은 명세서 사진은 보관되지 않습니다. 이미 저장한 납품처는 유지하고 닫을까요?");

  return <BottomSheet open title={mode === "route" ? "인공지능 경로 추천" : "명세서로 납품 준비"} onClose={onClose} beforeClose={guard} dismissible={!busy && !configuring}>
    <div className={styles.content}>
      {configuring && context ? <PlanningSettingsForm settings={context.settings} repository={repository}
        onSaved={(settings) => { setContext({ ...context, settings }); setConfiguring(false); setRecommendation(null); }} onCancel={() => setConfiguring(false)} /> : <>
        {mode === "invoice" && <section className={styles.captureCard} aria-label="명세서 사진 선택">
          <div className={styles.captureHeading}><svg viewBox="0 0 40 40" width="40" height="40" fill="none" aria-hidden="true"><rect x="9" y="5" width="23" height="30" rx="3" stroke="currentColor" strokeWidth="1.8"/><path d="M15 13h11M15 19h11M15 25h6M5 11v-5a4 4 0 0 1 4-4M26 38h5a4 4 0 0 0 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            <div><h3>오늘 명세서</h3></div></div>
          <div className={styles.captureActions}><button type="button" className={styles.primary} disabled={actionBusy || scans.length >= 60} onClick={() => camera.current?.click()}>명세서 촬영</button><button type="button" disabled={actionBusy || scans.length >= 60} onClick={() => gallery.current?.click()}>갤러리에서 선택</button></div>
          {processing && <p className={styles.hint}>분석 중에도 계속 촬영할 수 있어요.</p>}
          <p className={styles.privacy}>명세서 사진은 Firebase에 저장하지 않아요.</p>
          <details className={styles.privacyDetail}><summary>사진 처리</summary><p>OpenAI로 전송해 분석합니다. 급식길에는 연결 결과만 남으며, OpenAI의 보존 정책은 별도로 적용됩니다.</p></details>
        </section>}
        <input ref={camera} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="명세서 카메라" onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.target.value = ""; void addFiles(picked); }} />
        <input ref={gallery} hidden type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="명세서 갤러리" onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.target.value = ""; void addFiles(picked); }} />
        {scans.length > 0 && <section className={styles.scanSection} aria-label="명세서 처리 결과">
          <div className={styles.sectionTitle}><h3>명세서 확인</h3><span role="status">{processing ? `${done}/${scans.length}장 처리 · 대기 ${waiting}장` : `${saved}곳 저장${reviews ? ` · ${reviews}장 확인 필요` : ""}${failed ? ` · ${failed}장 재확인` : reviews ? "" : " 완료"}`}</span></div>
          {processing && <progress className={styles.progress} value={done} max={scans.length} aria-label="명세서 분석 진행률" />}
          <ul className={styles.scanList}>{scans.map((scan, index) => <li key={scan.id}>
            <div className={styles.scanRow}><span className={styles.scanNumber}>{String(index + 1).padStart(2, "0")}</span><div><strong>{scan.result?.fields.recipientName || `명세서 ${index + 1}`}</strong>
              <small>{scan.result?.fields.recipientAddress || (scan.state === "reading" ? "상호와 주소를 읽고 있어요…" : scan.state === "waiting" ? "순서대로 확인할게요" : "")}</small></div>
              <span className={scan.result?.status === "saved" ? styles.savedBadge : styles.reviewBadge}>{scan.result?.status === "saved" ? "저장됨" : scan.result ? "확인 필요" : scan.state === "failed" ? "재확인" : scan.state === "waiting" ? "대기" : "분석 중"}</span></div>
            {scan.result?.status === "saved" && <p className={styles.savedDetail}>연결: {activeCustomers.find((c) => c.customerId === scan.result?.customerId)?.name ?? "거래처"}</p>}
            {scan.state === "failed" && <div className={styles.error}><p>{scan.error}</p><div className={styles.inlineActions}><button type="button" disabled={busy} onClick={() => retry(scan)}>저장 결과 다시 확인</button><button type="button" disabled={busy} onClick={() => { files.current.delete(scan.id); scanCount.current--; setScans((old) => old.filter((s) => s.id !== scan.id)); }}>이 장 제외</button></div><small>분석에 실패했다면 이 장을 제외한 뒤 다시 선택해주세요.</small></div>}
            {scan.result?.status === "review" && <InvoiceReview result={scan.result} customers={activeCustomers} busy={busy} onConfirm={(customerId, dateConfirmed) => void action(async () => {
              const result = await repository.confirm({ requestId: crypto.randomUUID(), scanId: scan.id, deliveryDateKey: day.deliveryDateKey, customerId, dateConfirmed }); accept(scan.id, result);
            })} />}
          </li>)}</ul>
        </section>}
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
          {reviews > 0 && <p className={styles.hint}>확인이 필요한 명세서를 먼저 연결해주세요.</p>}
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
