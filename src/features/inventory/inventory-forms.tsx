"use client";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { INVENTORY_LOCATIONS, INVENTORY_LOCATION_LABELS, INVENTORY_MAX_QUANTITY, inventoryLotDraftSchema, type InventoryContext, type InventoryLocation, type InventoryLot, type InventoryLotDraft, type InventoryProduct, type InventoryProductDetail, type InventoryProductDraft, type InventoryMovementInput, type SaveInventoryProductInput } from "@/domain/inventory";
import { inventoryLotDateLabel, inventoryTransferPreview } from "./inventory-model";
import { InventoryPhotoPicker, inventoryPhotoBase64 } from "./inventory-photo";
import { inventoryRepository, inventoryErrorMessage } from "./inventory-repository";
import { INVENTORY_OFFLINE_DRAFT_MESSAGE, useInventoryConnection } from "./use-inventory-connection";
import { InventoryDateField, isInventoryInputDate } from "./inventory-date-field";
import styles from "./inventory.module.css";
import formStyles from "./inventory-form-design.module.css";

function useInventoryAction() {
  const online = useInventoryConnection();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const alive = useRef(true);
  const request = useRef({ signature: "", id: "" });
  useEffect(() => {
    alive.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!pending.current) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => { alive.current = false; window.removeEventListener("beforeunload", beforeUnload); };
  }, []);
  async function run<T>(payload: unknown, action: (requestId: string) => Promise<T>, success: (result: T) => void) {
    if (pending.current) return;
    // Recheck at the action boundary as an offline event may precede React's render.
    if (typeof navigator !== "undefined" && !navigator.onLine) { setError(INVENTORY_OFFLINE_DRAFT_MESSAGE); return; }
    const signature = JSON.stringify(payload);
    if (request.current.signature !== signature || !request.current.id) request.current = { signature, id: crypto.randomUUID() };
    pending.current = true; setBusy(true); setError("");
    try { const result = await action(request.current.id); if (alive.current) success(result); }
    catch (cause) { if (alive.current) setError(inventoryErrorMessage(cause)); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  return { busy, error, run, online };
}

function FormFooter({ id, busy, disabled = false, label, onClose, children }: { id: string; busy: boolean; disabled?: boolean; label: string; onClose: () => void; children?: ReactNode }) {
  const online = useInventoryConnection();
  return <BottomSheetActions busy={busy} className={styles.formActions ?? ""}>{!online ? <p role="alert">{INVENTORY_OFFLINE_DRAFT_MESSAGE}</p> : null}{children}<GlassButton disabled={busy} onClick={onClose}>취소</GlassButton><GlassButton variant="primary" type="submit" form={id} disabled={busy || disabled || !online}>{busy ? "저장 중…" : label}</GlassButton></BottomSheetActions>;
}
const ORIGIN_PRESETS = ["국내산", "수입산", "미확인"];
const SPECIFICATION_PRESETS = ["100g", "200g", "300g", "500g", "700g", "1000g", "1200g", "1500g", "2000g", "5000g"];
const UNIT_PRESETS = ["개", "봉", "팩", "병", "낱개"];
function PresetChoices({ label, presets, selected, disabled, onSelect }: { label: string; presets: readonly string[]; selected: string | null; disabled: boolean; onSelect: (value: string | null) => void }) {
  return <fieldset className={`${formStyles.expiryStatus} ${formStyles.presetChoices}`} disabled={disabled}><legend>{label}</legend><div>{[...presets, null].map((option) => <label key={option ?? label}><input type="radio" name={label} checked={option === selected} onChange={() => onSelect(option)} />{option ?? "직접입력"}</label>)}</div></fieldset>;
}
const newDraft = (location: InventoryLocation): InventoryProductDraft => ({ name: "", manufacturer: "", specification: "", origin: "", note: "", unitLabel: "개", unitsPerBox: 1, defaultLocationId: location, urgent: false });
function validLotDraft(draft: InventoryLotDraft, allowLegacy = false) { return (allowLegacy || draft.expiryState !== "not_applicable") && inventoryLotDraftSchema.safeParse(draft).success && (draft.expiryState !== "dated" || isInventoryInputDate(draft.expiryDate ?? "")); }
export function InventoryProductEditor({ product, location, onClose, onSaved }: { product: InventoryProduct | null; location: InventoryLocation; onClose: () => void; onSaved: (product: InventoryProduct) => void }) {
  const id = useId();
  const [draft, setDraft] = useState<InventoryProductDraft>(() => product ? { name: product.name, manufacturer: product.manufacturer, specification: product.specification, origin: product.origin, note: product.note, unitLabel: product.unitLabel, unitsPerBox: product.unitsPerBox, defaultLocationId: product.defaultLocationId, urgent: product.urgent } : newDraft(location));
  const [file, setFile] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [initialQuantity, setInitialQuantity] = useState<number>(Number.NaN);
  const [initialLot, setInitialLot] = useState<InventoryLotDraft>(blankLot);
  const [validationError, setValidationError] = useState("");
  const [specificationPicker, setSpecificationPicker] = useState(false);
  const [focusCustom, setFocusCustom] = useState<keyof Pick<InventoryProductDraft, "origin" | "specification" | "unitLabel"> | null>(null);
  const upload = useRef<{ file: File; id: string; ready: boolean } | null>(null);
  const action = useInventoryAction();
  const busy = action.busy || photoBusy;
  const set = <K extends keyof InventoryProductDraft>(key: K, value: InventoryProductDraft[K]) => setDraft((old) => ({ ...old, [key]: value }));
  const isCustom = (key: "origin" | "specification" | "unitLabel", presets: string[]) => focusCustom === key || !!draft[key] && !presets.includes(draft[key]);
  function selectPreset(key: "origin" | "specification" | "unitLabel", value: string | null) {
    setFocusCustom(value === null ? key : null);
    set(key, value ?? "");
  }
  const customInput = (label: string, key: "origin" | "specification" | "unitLabel", maxLength = 200, required = false) => <label className={styles.field}>{label}<input autoFocus={focusCustom === key} required={required} maxLength={maxLength} value={draft[key]} onChange={(event) => set(key, event.target.value)} disabled={busy || key === "unitLabel" && !!product?.hasHistory} /></label>;
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setValidationError("");
    if (!product && (!Number.isSafeInteger(initialQuantity) || initialQuantity < 1 || initialQuantity > INVENTORY_MAX_QUANTITY)) { setValidationError("초기 수량을 1 이상의 정수로 입력해주세요."); return; }
    if (!product && !validLotDraft(initialLot)) { setValidationError(initialLot.expiryState === "dated" ? "첫 유통기한에 실제 날짜를 YYYY-MM-DD로 입력해주세요." : "유통기한 정보를 확인해주세요."); return; }
    if (file && upload.current?.file !== file) upload.current = { file, id: crypto.randomUUID(), ready: false };
    const staged = file ? upload.current : null;
    const photoChange: SaveInventoryProductInput["photoChange"] = staged ? { action: "replace", uploadId: staged.id } : removed ? { action: "remove" } : undefined;
    const input: Omit<SaveInventoryProductInput, "requestId"> = { productId: product?.productId ?? null, expectedRevision: product?.revision ?? null, refreshOnReplay: true, draft, ...(!product ? { initialStock: { quantity: initialQuantity, lot: initialLot } } : {}), ...(photoChange ? { photoChange } : {}) };
    await action.run(input, async (requestId) => {
      if (staged && !staged.ready) { await inventoryRepository.uploadPhoto({ uploadId: staged.id, contentType: staged.file.type as "image/webp", fileBase64: await inventoryPhotoBase64(staged.file) }); staged.ready = true; }
      return inventoryRepository.save({ ...input, requestId });
    }, onSaved);
  }
  return <BottomSheet open title={product ? "품목 정보 수정" : "새 품목 등록"} onClose={onClose} dismissible={!busy}>
    <form id={id} onSubmit={submit} className={`${styles.sheet} ${formStyles.productForm}`} aria-busy={busy}>
      <InventoryPhotoPicker product={product} file={file} removed={removed} disabled={action.busy} onBusyChange={setPhotoBusy} onChange={(next, remove) => { setFile(next); setRemoved(remove); }} />
      <div className={formStyles.productSection}>
      <label className={styles.field}>품목명 <span className={styles.required}>필수</span><input required maxLength={200} value={draft.name} onChange={(event) => set("name", event.target.value)} disabled={busy} autoComplete="off" /></label>
      <label className={styles.field}>기본 보관 장소<select value={draft.defaultLocationId} onChange={(event) => set("defaultLocationId", event.target.value as InventoryLocation)} disabled={busy}>{INVENTORY_LOCATIONS.map((item) => <option key={item} value={item}>{INVENTORY_LOCATION_LABELS[item]}</option>)}</select></label>
      <hr className={formStyles.divider} />
      <label className={styles.field}>제조사<input maxLength={200} value={draft.manufacturer} onChange={(event) => set("manufacturer", event.target.value)} disabled={busy} /></label>
      <PresetChoices label="원산지" presets={ORIGIN_PRESETS} selected={isCustom("origin", ORIGIN_PRESETS) ? null : draft.origin} disabled={busy} onSelect={(value) => selectPreset("origin", value)} />
      {isCustom("origin", ORIGIN_PRESETS) ? customInput("원산지 직접입력", "origin") : null}
      <GlassButton aria-haspopup="dialog" aria-expanded={specificationPicker} disabled={busy} onClick={() => setSpecificationPicker(true)}>규격 · {draft.specification || "선택"}</GlassButton>
      {isCustom("specification", SPECIFICATION_PRESETS) ? customInput("규격 직접입력", "specification") : null}
      <PresetChoices label="기준 단위 (필수)" presets={UNIT_PRESETS} selected={isCustom("unitLabel", UNIT_PRESETS) ? null : draft.unitLabel} disabled={busy || !!product?.hasHistory} onSelect={(value) => selectPreset("unitLabel", value)} />
      {isCustom("unitLabel", UNIT_PRESETS) ? customInput("기준 단위 직접입력", "unitLabel", 20, true) : null}
      {product?.hasHistory ? <p className={styles.muted}>입출고 기록이 있는 품목은 기준 단위를 바꿀 수 없어요.</p> : null}
      {!product ? <><LotFields draft={initialLot} onChange={setInitialLot} disabled={busy} dateLabel="첫 유통기한 날짜" compact /><hr className={formStyles.divider} /><QuantityFields product={draft} value={initialQuantity} onChange={setInitialQuantity} disabled={busy} minimum={1} label="초기 수량 (필수)" /></> : null}
      <details><summary className={styles.label}>참고 메모 (선택)</summary><label className={styles.field}>메모<textarea maxLength={2000} rows={2} value={draft.note} onChange={(event) => set("note", event.target.value)} disabled={busy} /></label></details>
      </div>
      {validationError ? <p role="alert" className={styles.error}>{validationError}</p> : null}
      {action.error ? <p role="alert" className={styles.error}>{action.error}</p> : null}
    </form><FormFooter id={id} busy={busy} onClose={onClose} label={product ? "변경 저장" : "품목 등록"} />
    {specificationPicker ? <BottomSheet open title="규격 선택" onClose={() => setSpecificationPicker(false)}><PresetChoices label="규격" presets={SPECIFICATION_PRESETS} selected={isCustom("specification", SPECIFICATION_PRESETS) ? null : draft.specification} disabled={busy} onSelect={(value) => { selectPreset("specification", value); setSpecificationPicker(false); }} /></BottomSheet> : null}
  </BottomSheet>;
}

function QuantityFields({ product, value, onChange, disabled, minimum = 0, label = "수량" }: { product: Pick<InventoryProduct, "unitLabel">; value: number; onChange: (value: number) => void; disabled: boolean; minimum?: number; label?: string }) {
  const id = useId();
  const invalid = Number.isFinite(value) && (!Number.isSafeInteger(value) || value < minimum || value > INVENTORY_MAX_QUANTITY);
  const fieldLabel = `${label} (${product.unitLabel || "개"})`;
  return <label className={styles.field}>{fieldLabel}<input type="number" inputMode="numeric" placeholder="예: 10" required min={minimum} max={INVENTORY_MAX_QUANTITY} step={1} value={Number.isFinite(value) ? value : ""} aria-label={fieldLabel} aria-invalid={invalid} aria-describedby={invalid ? `${id}-quantity-error` : undefined} onChange={(event) => onChange(event.target.valueAsNumber)} disabled={disabled} />{invalid ? <span id={`${id}-quantity-error`} className={styles.error}>{value > INVENTORY_MAX_QUANTITY ? "입력 가능한 수량을 초과했어요." : minimum === 0 ? "0 이상의 정수를 입력해주세요." : "1 이상의 정수를 입력해주세요."}</span> : null}</label>;
}
function LotFields({ draft, onChange, disabled, dateLabel = "유통기한 날짜", compact = false }: { draft: InventoryLotDraft; onChange: (draft: InventoryLotDraft) => void; disabled: boolean; dateLabel?: string; compact?: boolean }) {
  const id = useId();
  return <><div className={formStyles.expiryFields}><fieldset className={formStyles.expiryStatus} disabled={disabled}><legend>유통기한 상태</legend><div>{(["dated", "unknown"] as const).map((state) => <label key={state}><input type="radio" name={`${id}-expiry-state`} value={state} checked={draft.expiryState === state} onChange={() => onChange({ ...draft, expiryState: state, expiryDate: state === "dated" ? draft.expiryDate ?? "" : null })} /><span>{state === "dated" ? "날짜 입력" : "미확인"}</span></label>)}</div></fieldset>{draft.expiryState === "not_applicable" ? <p className={styles.muted}>기존 ‘해당 없음’ 기록을 유지하고 있어요. 바꾸려면 위에서 상태를 선택해주세요.</p> : null}{draft.expiryState === "dated" ? <InventoryDateField label={dateLabel} value={draft.expiryDate ?? ""} onChange={(value) => onChange({ ...draft, expiryDate: value })} disabled={disabled} /> : null}</div>{!compact ? <details><summary className={styles.label}>추가 구분명 (선택)</summary><label className={styles.field}>재고 구분명<input maxLength={200} placeholder="예: 9월 첫 입고" value={draft.label} onChange={(event) => onChange({ ...draft, label: event.target.value })} disabled={disabled} /></label></details> : null}</>;
}
const blankLot: InventoryLotDraft = { label: "", expiryState: "dated", expiryDate: "" };
const lotOption = (lot: InventoryLot, product: InventoryProduct) => `${inventoryLotDateLabel(lot)} · ${lot.quantity.toLocaleString("ko-KR")} ${product.unitLabel}${lot.label ? ` · ${lot.label}` : ""}`;

export function InventoryMovementForm({ detail, location, kind, initialLotId, inspectionCycleId, onClose, onSaved }: { detail: InventoryProductDetail; location: InventoryLocation; kind: InventoryMovementInput["kind"]; initialLotId?: string; inspectionCycleId?: string; onClose: () => void; onSaved: (product: InventoryProduct, detail?: InventoryProductDetail) => void }) {
  const id = useId(); const action = useInventoryAction();
  const lots = detail.lots.filter((lot) => lot.locationId === location).sort((a, b) => (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999"));
  const [lotId, setLotId] = useState(initialLotId ?? (kind === "receive" ? "" : lots[0]?.lotId ?? ""));
  const [quantity, setQuantity] = useState(kind === "adjust" ? lots.find((lot) => lot.lotId === (initialLotId ?? lots[0]?.lotId))?.quantity ?? Number.NaN : Number.NaN);
  const [draft, setDraft] = useState<InventoryLotDraft>(blankLot);
  const [toLocation, setToLocation] = useState<InventoryLocation | "">("");
  const title = kind === "receive" ? "입고 기록" : kind === "issue" ? "출고 기록" : kind === "transfer" ? "보관 장소 이동" : "수량 조정";
  const selectedLot = lots.find((lot) => lot.lotId === lotId);
  const transferPreview = inventoryTransferPreview(detail.product, selectedLot, location, toLocation, quantity);
  const validQuantity = Number.isSafeInteger(quantity) && quantity >= (kind === "adjust" ? 0 : 1) && quantity <= INVENTORY_MAX_QUANTITY;
  const canSubmit = validQuantity && (initialLotId === undefined || initialLotId === lotId) && (kind === "receive" && !lotId && initialLotId === undefined ? validLotDraft(draft) : !!selectedLot) && (kind !== "issue" || quantity <= (selectedLot?.quantity ?? 0)) && (kind !== "transfer" || !!transferPreview);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    const input: Omit<InventoryMovementInput, "requestId"> = { productId: detail.product.productId, expectedStockRevision: detail.product.stockRevision, kind, locationId: location, lotId: lotId || null, quantity, reason: "", includeDetail: true, ...(inspectionCycleId ? { inspectionCycleId } : {}), ...(kind === "receive" && !lotId ? { newLot: draft } : {}), ...(kind === "transfer" && toLocation ? { toLocationId: toLocation } : {}) };
    void action.run(input, (requestId) => inventoryRepository.movement({ ...input, requestId }), (result) => onSaved(result.product, result.replayed ? undefined : result.detail));
  }
  return <BottomSheet open title={title} description={`${detail.product.name} · ${INVENTORY_LOCATION_LABELS[location]}`} onClose={onClose} dismissible={!action.busy}><form id={id} className={styles.sheet} onSubmit={submit}>
    {initialLotId === undefined && (kind === "receive" || lots.length > 1) ? <label className={styles.field}>유통기한 선택<select value={lotId} required={kind !== "receive"} onChange={(event) => { const nextId = event.target.value; setLotId(nextId); setQuantity(kind === "adjust" ? lots.find((lot) => lot.lotId === nextId)?.quantity ?? Number.NaN : Number.NaN); }} disabled={action.busy}>{kind === "receive" ? <option value="">새 유통기한으로 추가</option> : null}{lots.map((lot) => <option key={lot.lotId} value={lot.lotId}>{lotOption(lot, detail.product)}</option>)}</select></label> : selectedLot ? <div className={styles.notice}><strong>{inventoryLotDateLabel(selectedLot)}</strong><p className={styles.muted}>현재 {selectedLot.quantity.toLocaleString("ko-KR")} {detail.product.unitLabel}</p>{selectedLot.label ? <details><summary>추가 구분명</summary><p className={styles.muted}>{selectedLot.label}</p></details> : null}</div> : <p role="status" className={styles.notice}>{initialLotId === undefined ? "이 장소에는 처리할 재고가 없어요." : "선택한 재고를 다시 확인해주세요. 창을 닫고 다시 열어주세요."}</p>}
    {kind === "receive" && !lotId && initialLotId === undefined ? <LotFields draft={draft} onChange={setDraft} disabled={action.busy} /> : null}
    {kind === "transfer" ? <label className={styles.field}>도착 보관 장소<select required value={toLocation} disabled={action.busy} onChange={(event) => setToLocation(event.target.value as InventoryLocation | "")}><option value="">이동할 장소 선택</option>{INVENTORY_LOCATIONS.filter((item) => item !== location).map((item) => <option key={item} value={item}>{INVENTORY_LOCATION_LABELS[item]}</option>)}</select></label> : null}
    {kind === "transfer" ? <p className={styles.muted}>유통기한을 유지하며, 전체 재고 수량은 바뀌지 않아요.</p> : null}
    <QuantityFields key={`${kind}:${lotId}`} product={detail.product} value={quantity} onChange={setQuantity} disabled={action.busy} minimum={kind === "adjust" ? 0 : 1} label={kind === "adjust" ? "조정 후 최종 수량" : kind === "issue" ? "출고 수량" : kind === "transfer" ? "이동 수량" : "입고 수량"} />
    {kind === "transfer" ? <div aria-live="polite" className={styles.notice}>{transferPreview && toLocation ? <><strong>이동 후 장소별 수량</strong><p className={styles.muted}>{INVENTORY_LOCATION_LABELS[location]}: {detail.product.quantityByLocation[location]} → {transferPreview.sourceAfter} {detail.product.unitLabel}</p><p className={styles.muted}>{INVENTORY_LOCATION_LABELS[toLocation]}: {detail.product.quantityByLocation[toLocation]} → {transferPreview.destinationAfter} {detail.product.unitLabel}</p></> : <span>도착 장소와 이동 수량을 입력해주세요.</span>}</div> : null}
    {kind === "issue" && quantity > (selectedLot?.quantity ?? 0) ? <p role="alert" className={styles.error}>현재 재고보다 많이 출고할 수 없어요.</p> : null}
    {action.error ? <p role="alert" className={styles.error}>{action.error}</p> : null}
  </form><FormFooter id={id} busy={action.busy} disabled={!canSubmit} onClose={onClose} label={title} /></BottomSheet>;
}

export function InventoryCountForm({ detail, location, context: initialContext, calendarReady = true, countMode = false, onClose, onSaved }: { detail: InventoryProductDetail; location: InventoryLocation; context: InventoryContext; calendarReady?: boolean; countMode?: boolean; onClose: () => void; onSaved: (product: InventoryProduct, detail?: InventoryProductDetail) => void }) {
  const id = useId(); const action = useInventoryAction();
  const [context] = useState(initialContext);
  const cycleChanged = context.cycle.cycleId !== initialContext.cycle.cycleId;
  const lots = detail.lots.filter((lot) => lot.locationId === location && lot.quantity > 0).sort((a, b) => (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999"));
  const counts = lots.map((lot) => ({ lotId: lot.lotId, quantity: lot.quantity }));
  const validCounts = counts.every((count) => Number.isSafeInteger(count.quantity) && count.quantity >= 0 && count.quantity <= INVENTORY_MAX_QUANTITY);
  const total = counts.reduce((sum, count) => sum + count.quantity, 0);
  const quantitiesReady = validCounts && total <= INVENTORY_MAX_QUANTITY && total === detail.product.quantityByLocation[location];
  const canSubmit = countMode && calendarReady && !cycleChanged && initialContext.canWrite && detail.product.status === "active" && quantitiesReady;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    const input = { productId: detail.product.productId, locationId: location, cycleId: context.cycle.cycleId, expectedStockRevision: detail.product.stockRevision, counts, reason: "", matchOnly: true, includeDetail: true };
    void action.run(input, (requestId) => inventoryRepository.count({ ...input, requestId }), (result) => onSaved(result.product, result.replayed ? undefined : result.detail));
  }
  return <BottomSheet open title="실물 수량 확인" description={`${detail.product.name} · ${INVENTORY_LOCATION_LABELS[location]} · ${context.cycle.startDate} 실사`} onClose={onClose} dismissible={!action.busy}><form id={id} onSubmit={submit} className={styles.sheet}>
    <p className={formStyles.confirmQuestion}>{lots.length > 1 ? "유통기한별 재고가 실제 수량과 일치하나요?" : "재고 수량과 실제 수량이 일치하나요?"}</p>
    {cycleChanged ? <p role="alert" className={styles.error}>새 실사 기간이 시작됐어요. 이 창을 닫고 실물 확인을 다시 열어주세요.</p> : !countMode ? <p role="alert" className={styles.error}>실사 모드를 켠 뒤 수량 일치를 확인해주세요.</p> : !calendarReady ? <p role="alert" className={styles.error}>날짜 기준을 다시 확인하고 있어요. 확인이 끝나면 저장할 수 있어요.</p> : !quantitiesReady ? <p role="alert" className={styles.error}>최신 재고를 다시 불러온 뒤 확인해주세요.</p> : null}
    {lots.length ? <ul className={formStyles.countList} aria-label="확인할 유통기한별 재고">{lots.map((lot) => <li key={lot.lotId}><span>{inventoryLotDateLabel(lot)}{lot.label ? <small>{lot.label}</small> : null}</span><strong>{lot.quantity.toLocaleString("ko-KR")} <small>{detail.product.unitLabel}</small></strong></li>)}</ul> : <div className={formStyles.zeroCount}><strong>0 <small>{detail.product.unitLabel}</small></strong><p>실제 재고도 없는지 확인해주세요.</p></div>}
    {action.error ? <p role="alert" className={styles.error}>{action.error}</p> : null}
  </form><FormFooter id={id} busy={action.busy} disabled={!canSubmit} onClose={onClose} label={lots.length > 1 ? "수량 일치 · 실사 완료" : "일치 확인"} /></BottomSheet>;
}

export function InventoryLotEditor({ detail, lot, onClose, onSaved, onMovement }: { detail: InventoryProductDetail; lot: InventoryLot; onClose: () => void; onSaved: (product: InventoryProduct, detail?: InventoryProductDetail) => void; onMovement?: (kind: "receive" | "issue" | "adjust", lotId: string) => void }) {
  const id = useId(); const action = useInventoryAction();
  const [draft, setDraft] = useState<InventoryLotDraft>({ label: lot.label, expiryDate: lot.expiryDate, expiryState: lot.expiryState });
  const dirty = draft.label !== lot.label || draft.expiryState !== lot.expiryState || draft.expiryDate !== lot.expiryDate;
  const valid = validLotDraft(draft, lot.expiryState === "not_applicable" && draft.expiryState === "not_applicable");
  const moveDisabled = action.busy || !action.online || dirty || detail.product.status !== "active";
  return <BottomSheet open title="유통기한 수정" onClose={onClose} dismissible={!action.busy}><form id={id} className={styles.sheet} onSubmit={(event) => { event.preventDefault(); if (!valid || !dirty) return; const input = { productId: detail.product.productId, lotId: lot.lotId, expectedStockRevision: detail.product.stockRevision, draft, reason: "", includeDetail: true }; void action.run(input, (requestId) => inventoryRepository.updateLot({ ...input, requestId }), (result) => onSaved(result.product, result.replayed ? undefined : result.detail)); }}><LotFields draft={draft} onChange={setDraft} disabled={action.busy} />{action.error ? <p className={styles.error} role="alert">{action.error}</p> : null}</form><FormFooter id={id} busy={action.busy} disabled={!valid || !dirty} onClose={onClose} label="변경 저장">{onMovement ? <div className={formStyles.lotActions}>{dirty ? <p role="status">날짜 변경을 먼저 저장해주세요.</p> : null}<div role="group" aria-label="이 유통기한 재고 관리">{([{ kind: "issue", label: "출고", icon: "arrow-up" }, { kind: "receive", label: "입고", icon: "arrow-down" }, { kind: "adjust", label: "조정", icon: "settings" }] as const).map(({ kind, label, icon }) => <GlassButton key={kind} className={formStyles[kind]} disabled={moveDisabled || (kind === "issue" && lot.quantity <= 0)} onClick={() => { if (!moveDisabled && !(kind === "issue" && lot.quantity <= 0)) onMovement(kind, lot.lotId); }}><Icon name={icon} size={17} />{label}</GlassButton>)}</div></div> : null}</FormFooter></BottomSheet>;
}

export function InventoryStatusForm({ product, remove, onClose, onSaved }: { product: InventoryProduct; remove: boolean; onClose: () => void; onSaved: (product: InventoryProduct) => void }) {
  const id = useId(); const action = useInventoryAction(); const [reason, setReason] = useState("");
  const title = remove ? "품목 삭제" : product.status === "active" ? "품목 비활성화" : "품목 다시 활성화";
  return <BottomSheet open title={title} description={product.name} onClose={onClose} dismissible={!action.busy}><form id={id} onSubmit={(event) => { event.preventDefault(); const input = { productId: product.productId, expectedRevision: product.revision, refreshOnReplay: true, reason }; void action.run({ ...input, remove, status: product.status }, (requestId) => remove ? inventoryRepository.remove({ ...input, requestId }) : inventoryRepository.status({ ...input, requestId, status: product.status === "active" ? "inactive" : "active" }), onSaved); }} className={styles.sheet}><p className={styles.notice}>{remove ? "품목을 목록에서 제외해요. 재고 수량과 입출고·실사 기록은 보관되고, 처리한 직원이 이력에 남아요." : product.status === "active" ? "품목을 일반 목록에서 잠시 숨겨요. 재고와 기록은 그대로 보관되며, 필요할 때 다시 활성화할 수 있어요." : "보관된 재고와 기록을 유지하며 일반 목록에 다시 표시해요."}</p><label className={styles.field}>처리 사유{remove ? " (필수)" : ""}<textarea required={remove} rows={3} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} disabled={action.busy} /></label>{action.error ? <p className={styles.error} role="alert">{action.error}</p> : null}</form><BottomSheetActions busy={action.busy} className={styles.formActions ?? ""}>{!action.online ? <p role="alert">{INVENTORY_OFFLINE_DRAFT_MESSAGE}</p> : null}<GlassButton onClick={onClose} disabled={action.busy}>취소</GlassButton><GlassButton variant={remove ? "danger" : "primary"} form={id} type="submit" disabled={action.busy || !action.online}>{action.busy ? "처리 중…" : title}</GlassButton></BottomSheetActions></BottomSheet>;
}

export function InventorySettingsForm({ context, onClose, onSaved }: { context: InventoryContext; onClose: () => void; onSaved: () => void }) {
  const id = useId(); const action = useInventoryAction(); const [weekday, setWeekday] = useState(context.settings.pendingWeekday ?? context.settings.weekday); const [urgentDays, setUrgentDays] = useState(context.settings.urgentDays);
  return <BottomSheet open title="재고 관리 설정" onClose={onClose} dismissible={!action.busy}><form id={id} className={styles.sheet} onSubmit={(event) => { event.preventDefault(); const input = { expectedRevision: context.settings.revision, weekday, urgentDays }; void action.run(input, (requestId) => inventoryRepository.settings({ ...input, requestId }), onSaved); }}><label className={styles.field}>매주 실사 시작 요일<select value={weekday} onChange={(event) => setWeekday(Number(event.target.value))} disabled={action.busy}>{["일", "월", "화", "수", "목", "금", "토"].map((day, index) => <option key={day} value={index}>{day}요일</option>)}</select></label><p className={styles.muted}>요일 변경은 현재 실사 기간이 끝난 뒤 적용돼요. 이미 확인한 기록은 초기화하지 않아요.{context.settings.effectiveDate ? ` 적용 예정일 ${context.settings.effectiveDate}` : ""}</p><label className={styles.field}>유통기한 임박 기준 (일 이내)<input type="number" inputMode="numeric" required min={0} max={365} step={1} value={Number.isNaN(urgentDays) ? "" : urgentDays} onChange={(event) => setUrgentDays(event.target.valueAsNumber)} disabled={action.busy} /></label>{action.error ? <p className={styles.error} role="alert">{action.error}</p> : null}</form><FormFooter id={id} busy={action.busy} onClose={onClose} label="설정 저장" /></BottomSheet>;
}
