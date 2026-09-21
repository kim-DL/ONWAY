"use client";

import { lazy, Suspense, useId, useRef, useState, type FormEvent } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { INVENTORY_LOCATIONS, INVENTORY_LOCATION_LABELS, INVENTORY_MAX_QUANTITY, type InventoryLocation, type InventoryLotDraft, type InventoryProduct, type InventoryProductDraft, type SaveInventoryProductInput } from "@/domain/inventory";
import { InventoryPhotoPicker, inventoryPhotoBase64 } from "./inventory-photo";
import { inventoryRepository } from "./inventory-repository";
import { FormFooter, LotFields, QuantityFields, blankLot, useInventoryAction, validLotDraft, type InventoryProductEditorProps } from "./inventory-forms";
import styles from "./inventory.module.css";
import formStyles from "./inventory-form-design.module.css";

const InventoryManufacturerField = lazy(() => import("./inventory-manufacturer-field")
  .then((module) => ({ default: module.InventoryManufacturerField })));
const ORIGIN_PRESETS = ["국내산", "수입산", "미확인"];
const SPECIFICATION_PRESETS = ["100g", "200g", "300g", "500g", "700g", "1000g", "1200g", "1500g", "2000g", "5000g"];
const UNIT_PRESETS = ["개", "봉", "팩", "병"];
function PresetChoices({ label, presets, selected, disabled, displayLabel, wideCustom = false, onSelect }: { label: string; presets: readonly string[]; selected: string | null; disabled: boolean; displayLabel?: (value: string) => string; wideCustom?: boolean; onSelect: (value: string | null) => void }) {
  return <fieldset className={`${formStyles.expiryStatus} ${formStyles.presetChoices}`} disabled={disabled}><legend>{label}</legend><div>{[...presets, null].map((option) => <label key={option ?? label} className={!option && wideCustom ? formStyles.presetWide : undefined}><input type="radio" name={label} checked={option === selected} onChange={() => onSelect(option)} />{option ? displayLabel?.(option) ?? option : "직접입력"}</label>)}</div></fieldset>;
}
const newDraft = (location: InventoryLocation): InventoryProductDraft => ({ name: "", manufacturer: "", specification: "", origin: "", note: "", unitLabel: "개", unitsPerBox: 1, defaultLocationId: location, urgent: false });

export function InventoryProductEditorImpl({ product, location, canCreateManufacturer = true, onClose, onSaved }: InventoryProductEditorProps) {
  const id = useId();
  const [draft, setDraft] = useState<InventoryProductDraft>(() => product ? { name: product.name, manufacturer: product.manufacturer, specification: product.specification, origin: product.origin, note: product.note, unitLabel: product.unitLabel, unitsPerBox: product.unitsPerBox, defaultLocationId: product.defaultLocationId, urgent: product.urgent } : newDraft(location));
  const [file, setFile] = useState<File | null>(null);
  const [removed, setRemoved] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [initialQuantity, setInitialQuantity] = useState<number>(Number.NaN);
  const [initialLot, setInitialLot] = useState<InventoryLotDraft>(blankLot);
  const [validationError, setValidationError] = useState("");
  const [specificationPicker, setSpecificationPicker] = useState(false);
  const [clearManufacturerReference, setClearManufacturerReference] = useState(false);
  const [focusCustom, setFocusCustom] = useState<keyof Pick<InventoryProductDraft, "origin" | "specification" | "unitLabel"> | null>(null);
  const upload = useRef<{ file: File; id: string; ready: boolean } | null>(null);
  const manufacturerSave = useRef<((input: SaveInventoryProductInput) => Promise<InventoryProduct>) | null>(null);
  const action = useInventoryAction();
  const busy = action.busy || photoBusy;
  const set = <K extends keyof InventoryProductDraft>(key: K, value: InventoryProductDraft[K]) => setDraft((old) => ({ ...old, [key]: value }));
  const isCustom = (key: "origin" | "specification" | "unitLabel", presets: string[]) => focusCustom === key || !!draft[key] && !presets.includes(draft[key]);
  const unitPreset = draft.unitLabel === "낱개" ? "개" : UNIT_PRESETS.includes(draft.unitLabel) ? draft.unitLabel : null;
  const customUnit = focusCustom === "unitLabel" || !!draft.unitLabel && unitPreset === null;
  function selectPreset(key: "origin" | "specification" | "unitLabel", value: string | null) { setFocusCustom(value === null ? key : null); set(key, value ?? ""); }
  const customInput = (label: string, key: "origin" | "specification" | "unitLabel", maxLength = 200, required = false) => <label className={styles.field}>{label}<input autoFocus={focusCustom === key} required={required} maxLength={maxLength} value={draft[key]} onChange={(event) => set(key, event.target.value)} disabled={busy || key === "unitLabel" && !!product?.hasHistory} /></label>;
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setValidationError("");
    if (!product && (!Number.isSafeInteger(initialQuantity) || initialQuantity < 1 || initialQuantity > INVENTORY_MAX_QUANTITY)) { setValidationError("초기 수량을 1 이상의 정수로 입력해주세요."); return; }
    if (!product && !validLotDraft(initialLot)) { setValidationError(initialLot.expiryState === "dated" ? "첫 유통기한에 실제 날짜를 YYYY-MM-DD로 입력해주세요." : "유통기한 정보를 확인해주세요."); return; }
    if (file && upload.current?.file !== file) upload.current = { file, id: crypto.randomUUID(), ready: false };
    const staged = file ? upload.current : null;
    const photoChange: SaveInventoryProductInput["photoChange"] = staged ? { action: "replace", uploadId: staged.id } : removed ? { action: "remove" } : undefined;
    const input: Omit<SaveInventoryProductInput, "requestId"> = { productId: product?.productId ?? null, expectedRevision: product?.revision ?? null, refreshOnReplay: true, draft, ...(clearManufacturerReference ? { clearManufacturerReference: true } : {}), ...(!product ? { initialStock: { quantity: initialQuantity, lot: initialLot } } : {}), ...(photoChange ? { photoChange } : {}) };
    await action.run(input, async (requestId) => {
      if (staged && !staged.ready) { await inventoryRepository.uploadPhoto({ uploadId: staged.id, contentType: staged.file.type as "image/webp", fileBase64: await inventoryPhotoBase64(staged.file) }); staged.ready = true; }
      const saveInput = { ...input, requestId };
      return manufacturerSave.current ? manufacturerSave.current(saveInput) : inventoryRepository.save(saveInput);
    }, onSaved);
  }
  return <BottomSheet open title={product ? "품목 정보 수정" : "새 품목 등록"} onClose={onClose} dismissible={!busy}>
    <form id={id} onSubmit={submit} className={`${styles.sheet} ${formStyles.productForm}`} aria-busy={busy}>
      <InventoryPhotoPicker product={product} file={file} removed={removed} disabled={action.busy} onBusyChange={setPhotoBusy} onChange={(next, remove) => { setFile(next); setRemoved(remove); }} />
      <div className={formStyles.productSection}>
      <label className={styles.field}>품목명 <span className={styles.required}>필수</span><input required maxLength={200} value={draft.name} onChange={(event) => set("name", event.target.value)} disabled={busy} autoComplete="off" /></label>
      <label className={styles.field}>기본 보관 장소<select value={draft.defaultLocationId} onChange={(event) => set("defaultLocationId", event.target.value as InventoryLocation)} disabled={busy}>{INVENTORY_LOCATIONS.map((item) => <option key={item} value={item}>{INVENTORY_LOCATION_LABELS[item]}</option>)}</select></label>
      <hr className={formStyles.divider} />
      <div className={styles.field}><span>제조사</span><Suspense fallback={<span className={styles.muted} role="status">제조사 선택 준비 중…</span>}><InventoryManufacturerField name={draft.manufacturer} {...(draft.manufacturerId ? { manufacturerId: draft.manufacturerId } : {})} {...(product ? { productId: product.productId } : {})} allowCreate={canCreateManufacturer} disabled={busy} onSelect={(manufacturer, saveProduct) => { manufacturerSave.current = saveProduct; setDraft((old) => ({ ...old, manufacturerId: manufacturer.manufacturerId, manufacturer: manufacturer.name })); setClearManufacturerReference(false); }} onClear={(saveProduct) => { manufacturerSave.current = saveProduct; setDraft((old) => { const next = { ...old, manufacturer: "" }; delete next.manufacturerId; return next; }); setClearManufacturerReference(true); }} /></Suspense></div>
      <PresetChoices label="원산지" presets={ORIGIN_PRESETS} selected={isCustom("origin", ORIGIN_PRESETS) ? null : draft.origin} disabled={busy} onSelect={(value) => selectPreset("origin", value)} />
      {isCustom("origin", ORIGIN_PRESETS) ? customInput("원산지 직접입력", "origin") : null}
      <GlassButton aria-haspopup="dialog" aria-expanded={specificationPicker} disabled={busy} onClick={() => setSpecificationPicker(true)}>규격 · {draft.specification || "선택"}</GlassButton>
      {isCustom("specification", SPECIFICATION_PRESETS) ? customInput("규격 직접입력", "specification") : null}
      <PresetChoices label="기준 단위 (필수)" presets={UNIT_PRESETS} selected={customUnit ? null : unitPreset} disabled={busy || !!product?.hasHistory} displayLabel={(value) => value === "개" ? "낱개" : value} wideCustom onSelect={(value) => selectPreset("unitLabel", value)} />
      {customUnit ? customInput("기준 단위 직접입력", "unitLabel", 20, true) : null}
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
