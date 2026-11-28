"use client";

import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { prepareCustomerPhoto } from "@/features/customers/customer-photo-preparation";
import type { InventoryProduct } from "@/domain/inventory";
import type { BarcodeMatch, FoodCandidate, FoodQuery, ScanBarcodeLink } from "@/domain/inventory-scan";
import { inventoryErrorMessage, inventoryRepository } from "../inventory-repository";
import { primeScanSound } from "./audio-gesture";
import { InventoryScanCamera } from "./camera";
import { BarcodeReview, FoodResults, InternalMatches } from "./catalog-review";
import type { ExistingReceipt, ScanEditor } from "./editor-types";
import type { RegistrationMetrics } from "./metrics";
import { ScanPhotos, type ScanPhoto } from "./photo-strip";
import { scanRepository } from "./repository";
import { editorValue, labelSuggestions, sameText, supplementSpecification, type Suggestion } from "./review-model";
import { SuggestedFields } from "./suggestions";
import styles from "./review.module.css";

const ScanRegion = lazy(() => import("./region"));
type ReadingPhoto = Pick<ScanPhoto, "id" | "ordinal" | "file"> & { regionOf?: string };
type FoodState = Awaited<ReturnType<typeof scanRepository.food>>;
type CodeState = { raw: string; match: BarcodeMatch };
function scanError(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    if (code.endsWith("resource-exhausted")) return "사진 판독 한도에 도달했어요. 아래에서 직접 입력할 수 있어요.";
    if (code.endsWith("permission-denied") || code.endsWith("unauthenticated")) return inventoryErrorMessage(error);
  }
  return "판독 결과를 가져오지 못했어요. 결과를 다시 확인하거나 아래에서 직접 입력해주세요.";
}
export function ScanReview({ editor, products, metrics, onExisting }: {
  editor: ScanEditor; products: InventoryProduct[]; metrics: RegistrationMetrics;
  onExisting: (item: ExistingReceipt, links: ScanBarcodeLink[]) => void;
}) {
  const current = useRef(editor);
  const generation = useRef(0);
  const foodGeneration = useRef(0);
  const [camera, setCamera] = useState(true);
  const [photos, setPhotos] = useState<ScanPhoto[]>([]);
  const [cover, setCover] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [code, setCode] = useState<CodeState | null>(null);
  const [food, setFood] = useState<FoodState | null>(null);
  const [foodBusy, setFoodBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [conflict, setConflict] = useState<Suggestion[] | null>(null);
  const [retry, setRetry] = useState<ReadingPhoto | null>(null);
  const [regionOpen, setRegionOpen] = useState(false);
  useLayoutEffect(() => {
    current.current = editor;
    metrics.reviewValues(field => editorValue(field, editor.draft, editor.lot));
  }, [editor, metrics]);
  const block = editor.blockSave;
  useLayoutEffect(() => { block(busy || !!conflict || (!!code && code.match.status !== "missing")); },
    [block, busy, conflict, code]);
  useEffect(() => () => { ++generation.current; ++foodGeneration.current; }, []);
  const alive = (token: number) => generation.current === token;
  function incorporate(items: Suggestion[]) {
    const fields = current.current;
    const additions = items.map(item => supplementSpecification(suggestions, item));
    for (const item of additions) {
      metrics.suggest(item.field, item.value, item.replaces);
      fields.apply(item, false);
    }
    setSuggestions(old => {
      const combined = new Map(old.map(item => [[item.field, item.value, item.unit, item.source].join("|"), item]));
      for (const item of additions) combined.set([item.field, item.value, item.unit, item.source].join("|"), item);
      return [...combined.values()].slice(-32);
    });
  }
  function reviewItems(items: Suggestion[]) {
    const name = items.find(item => item.field === "name");
    const previous = current.current.draft.name;
    if (name && previous && !sameText(name.value, previous)) { setConflict(items); return; }
    incorporate(items);
  }
  async function searchFood(query: FoodQuery) {
    const seq = ++foodGeneration.current;
    setFoodBusy(true); setFood(null);
    try { const next = await scanRepository.food(query); if (foodGeneration.current === seq) setFood(next); }
    catch { if (foodGeneration.current === seq) setFood({ status: "unavailable", items: [], more: false }); }
    finally { if (foodGeneration.current === seq) setFoodBusy(false); }
  }
  function resetCode() {
    ++foodGeneration.current; setFoodBusy(false); setCode(null); setFood(null);
  }
  async function readCode(raw: string, token: number, fromPhoto = false) {
    resetCode();
    if (!fromPhoto) setStatus("급식길 바코드 조회 중…");
    try {
      const match = await scanRepository.barcode(raw);
      if (!alive(token)) return false;
      setCode({ raw, match });
      if (match.status === "missing") void searchFood({ by: "code", value: raw });
      else if (!fromPhoto) setStatus(match.status === "matched" ? "기존 품목을 찾았어요." : "바코드에 연결된 품목을 확인해주세요.");
      return match.status !== "missing";
    } catch {
      if (!fromPhoto && alive(token)) setStatus("사내 바코드를 조회하지 못했어요. 잠시 후 다시 스캔해주세요.");
      return null;
    }
  }
  async function readPhoto(shot: ReadingPhoto, token: number, retryFailed = false) {
    setStatus(shot.regionOf ? "선택한 영역의 날짜·원산지를 읽는 중…" : "AI가 제품 모양과 포장의 글씨를 살펴보는 중…");
    const stop = metrics.analyze();
    try {
      const reading = await scanRepository.analyze(shot.file, shot.id, retryFailed);
      if (!alive(token)) return;
      const source = "사진 " + shot.ordinal + (shot.regionOf ? " · 선택 영역" : "");
      const items = labelSuggestions(reading, source).filter(item => !shot.regionOf || item.field === "expiry" || item.field === "origin");
      reviewItems(items);
      if (!shot.regionOf) setPhotos(old => old.map(photo => photo.id === shot.id ? { ...photo, visual: reading.visual } : photo));
      setStatus(reading.kind === "multiple" ? (shot.regionOf ? "여러 제품이 보여요. 한 제품의 표시만 들어오게 범위를 바꿔 주세요." : "서로 다른 제품이 보여요. 한 품목만 비춰주세요.")
        : shot.regionOf ? (items.length ? "선택한 영역에서 읽은 값과 표시 원문을 확인해 주세요." : "표시와 값을 함께 읽지 못했어요. 범위를 바꾸거나 아래에서 입력해 주세요.")
        : !items.length && reading.visual ? "AI가 사진에서 찾은 제품 후보를 확인해주세요."
        : items.length ? "초안이 준비됐어요. 읽은 값과 이번 입고를 확인해주세요."
        : "읽을 수 있는 항목이 없어요. 제품명이나 라벨이 보이는 면을 촬영해주세요.");
      metrics.review();
    } catch (error) { if (alive(token)) { setRetry(shot); setStatus(scanError(error)); } }
    finally { stop(); }
  }
  async function capture(file: File, raw?: string) {
    const token = ++generation.current;
    const shot = { id: crypto.randomUUID(), file, ordinal: metrics.photographed() };
    setPhotos(old => [...old, shot]); setCamera(false); setBusy(true); setRetry(null);
    setStatus("촬영한 사진을 받았어요.");
    try {
      await Promise.all([readPhoto(shot, token), raw && readCode(raw, token, true)]);
    } finally { if (alive(token)) setBusy(false); }
  }
  async function onlyCode(raw: string) {
    const token = ++generation.current;
    setCamera(false); setBusy(true); setRetry(null);
    const found = await readCode(raw, token);
    if (alive(token)) {
      if (found === false) setStatus("처음 보는 바코드예요. 사진을 추가하거나 제품 후보를 확인해주세요.");
      metrics.review();
      setBusy(false);
    }
  }
  async function analyzeAgain(shot: ReadingPhoto, retryFailed = false) {
    const token = ++generation.current;
    setBusy(true); setRetry(null);
    try { await readPhoto(shot, token, retryFailed); } finally { if (alive(token)) setBusy(false); }
  }
  async function chooseCover(shot: ScanPhoto) {
    if (cover === shot.id) { setCover(null); editor.setPhoto(null); return; }
    const token = ++generation.current;
    setBusy(true);
    try {
      const file = await prepareCustomerPhoto(shot.file);
      if (alive(token)) { current.current.setPhoto(file); setCover(shot.id); }
    } catch { if (alive(token)) setStatus("대표 사진을 준비하지 못했어요. 다른 사진을 선택해주세요."); }
    finally { if (alive(token)) setBusy(false); }
  }
  function removePhoto(shot: ScanPhoto) {
    setPhotos(old => old.filter(p => p.id !== shot.id));
    const fromPhoto = (item: Suggestion) => item.source.split(" + ").some(source => source === "사진 " + shot.ordinal || source === "사진 " + shot.ordinal + " · 선택 영역");
    setSuggestions(old => old.filter(item => !fromPhoto(item)));
    if (conflict?.some(fromPhoto)) setConflict(null);
    if (retry?.id === shot.id || retry?.regionOf === shot.id) setRetry(null);
    if (cover === shot.id) { setCover(null); current.current.setPhoto(null); }
    setStatus("사진을 제외했어요. 이미 입력된 값은 아래에서 수정할 수 있어요.");
  }
  async function openExisting(id: string) {
    const token = ++generation.current;
    setBusy(true);
    try {
      const detail = await inventoryRepository.detail(id);
      if (!alive(token)) return;
      if (detail.product.status !== "active") { setStatus("사용 중지된 품목이에요. 다른 품목을 확인해주세요."); return; }
      const fields = current.current;
      onExisting({ detail, location: fields.draft.defaultLocationId, lot: { ...fields.lot } }, fields.links);
    } catch (error) { if (alive(token)) setStatus(inventoryErrorMessage(error)); }
    finally { if (alive(token)) setBusy(false); }
  }
  function pickFood(item: FoodCandidate) {
    const values: Suggestion[] = [{ field: "name", value: item.name, evidence: item.name, source: "식품안전나라" }];
    if (item.manufacturer) values.push({ field: "manufacturer", value: item.manufacturer, evidence: item.manufacturer, source: "식품안전나라" });
    reviewItems(values); setFood(null); setStatus("선택한 제품 후보를 사진과 대조해주세요.");
    metrics.review();
  }
  const disabled = busy || editor.busy;
  const missing = [!editor.draft.origin && "원산지", editor.lot.expiryState === "dated" && !editor.lot.expiryDate && "소비·유통기한"].filter(Boolean);
  return <section className={styles.panel} aria-label="스캔 검토">
    <div className={styles.heading}><Icon name="camera" size={20} /><strong>촬영한 제품 확인</strong></div>
    <p role="status">{status || "제품명이나 바코드가 보이는 면을 촬영해주세요."}</p>
    {busy && <button type="button" className={styles.textButton} onClick={() => {
      ++generation.current; metrics.review(); setBusy(false); setStatus("아래에서 직접 입력을 이어가세요.");
    }}>기다리지 않고 직접 입력</button>}
    <fieldset className={styles.controls} disabled={disabled}>
      {photos.map(shot => shot.visual && <div className={styles.group} key={shot.id}>
        <small>AI 제품 추정 · 사진 {shot.ordinal}</small><strong>{shot.visual.name}</strong><span>{shot.visual.clues}</span>
        {!sameText(editor.draft.name, shot.visual.name) && <GlassButton compact onClick={() => {
          const visual = shot.visual!;
          metrics.suggest("name", visual.name);
          editor.apply({ field: "name", value: visual.name, evidence: visual.clues, source: "AI 제품 추정" }, true);
        }}>이 이름 사용</GlassButton>}
      </div>)}
      <SuggestedFields editor={editor} suggestions={suggestions} />
      {photos.length > 0 && !busy && missing.length > 0 && <small className={styles.hint}>{missing.join(" · ")} 표시를 확인해 주세요. {photos.length < 3 ? "사진에서 표시를 선택하거나 다른 면을 촬영할 수 있어요." : "사진에서 표시를 선택하거나 아래에서 입력할 수 있어요."}</small>}
      {code && <BarcodeReview code={code.raw} match={code.match} links={editor.links} disabled={disabled}
        onLinks={editor.setLinks} onIgnore={resetCode} onExisting={openExisting} />}
      {editor.links.length > 0 && <details className={styles.matches}><summary>저장할 바코드 {editor.links.length}개</summary>
        {editor.links.map(link => <button type="button" className={styles.choice} key={link.code}
          onClick={() => editor.setLinks(editor.links.filter(other => other.code !== link.code))}>
          {link.level === "case" ? "박스" : "기준 단위"} · {link.code} · 연결 선택 해제</button>)}</details>}
      {foodBusy && <small role="status">식품안전나라 조회 중…</small>}
      {food && <FoodResults data={food} onPick={pickFood} />}
      {conflict && <div className={styles.group} role="alert"><strong>품목명이 다르게 읽혔어요</strong>
        <span>현재 ‘{editor.draft.name}’ · 새 후보 ‘{conflict.find(i => i.field === "name")?.value}’</span>
        <div className={styles.row}><GlassButton compact onClick={() => { incorporate(conflict); setConflict(null); }}>같은 품목 · 후보 확인</GlassButton>
        <GlassButton compact onClick={() => setConflict(null)}>새 후보 제외</GlassButton></div></div>}
      <div className={styles.row}>
        {photos.length < 3 && <GlassButton disabled={!!conflict} onClick={() => { primeScanSound(); setCamera(true); }}><Icon name="camera" size={16} />{photos.length ? "다른 면 촬영" : code ? "제품 사진으로 AI 판독" : "스캔 열기"}</GlassButton>}
        {photos.length > 0 && <GlassButton disabled={!!conflict} onClick={() => setRegionOpen(true)}>사진에서 날짜·원산지 선택</GlassButton>}
        {retry && <GlassButton disabled={!!conflict} onClick={() => void analyzeAgain(retry, true)}>{retry.regionOf ? "이 영역 다시 읽기" : "이 사진 판독하기"}</GlassButton>}
        {editor.draft.name.trim().length >= 2 && <GlassButton disabled={foodBusy || !!conflict} onClick={() => void searchFood({ by: "name", value: editor.draft.name.trim().slice(0, 100) })}>식품안전나라 제품명 조회</GlassButton>}
      </div>
      <ScanPhotos photos={photos} cover={cover} disabled={disabled} onCover={chooseCover} onRemove={removePhoto} />
      <InternalMatches products={products} name={editor.draft.name} linked={editor.links.length > 0} onExisting={openExisting} />
    </fieldset>
    {suggestions.length > 0 && <small className={styles.hint}>{[!editor.draft.name && "품목명", !editor.draft.manufacturer && "제조사", !editor.draft.specification && "규격"].filter(Boolean).join(" · ") || "기본 정보"} 확인 · 실제 입고 수량은 아래에서 입력해주세요.</small>}
    {regionOpen && photos.length > 0 && <Suspense fallback={<p role="status">사진 여는 중…</p>}>
      <ScanRegion photos={photos} onClose={() => setRegionOpen(false)} onRead={(shot, file) => {
        setRegionOpen(false);
        void analyzeAgain({ id: crypto.randomUUID(), regionOf: shot.id, ordinal: shot.ordinal, file });
      }} /></Suspense>}
    {camera && <InventoryScanCamera hint={photos.length ? "같은 제품의 소비·유통기한이나 원산지가 인쇄된 면을 비춰주세요" : "제품명, 포장 라벨 또는 바코드를 비춰주세요"} onCapture={capture} onCode={onlyCode} onClose={() => { setCamera(false); metrics.review(); }} />}
  </section>;
}
