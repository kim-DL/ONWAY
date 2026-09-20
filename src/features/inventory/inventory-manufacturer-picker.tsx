"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { searchInputProps } from "@/components/ui/search-input-props";
import {
  canonicalInventoryManufacturerName, normalizeInventoryManufacturerName, type InventoryManufacturer,
} from "@/domain/inventory-manufacturer";
import { readRecentInventoryManufacturers, rememberInventoryManufacturer } from "./inventory-manufacturer-session";
import { inventoryManufacturerRepository } from "./inventory-manufacturer-repository";
import type { InventoryProduct, SaveInventoryProductInput } from "@/domain/inventory";
import styles from "./inventory-manufacturer-picker.module.css";

export type InventoryManufacturerSelection = Pick<InventoryManufacturer, "manufacturerId" | "name">;

export function filterInventoryManufacturers(items: InventoryManufacturer[], query: string) {
  const canonical = canonicalInventoryManufacturerName(query).toLocaleLowerCase("ko-KR");
  const normalized = normalizeInventoryManufacturerName(query);
  if (!canonical && !normalized) return items;
  return items.filter((item) => item.name.toLocaleLowerCase("ko-KR").includes(canonical)
    || !!normalized && item.normalizedName.includes(normalized));
}

export function inventoryManufacturerCandidates(items: InventoryManufacturer[], name: string) {
  const normalized = normalizeInventoryManufacturerName(name);
  if (!normalized) return [];
  return items.filter((item) => item.normalizedName.includes(normalized) || normalized.includes(item.normalizedName)).slice(0, 5);
}

function duplicateManufacturerError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  const details = "details" in error && error.details && typeof error.details === "object" ? error.details : null;
  return code.endsWith("already-exists") && details && "reason" in details && details.reason === "inventory-manufacturer-duplicate";
}

export function InventoryManufacturerPicker({ current, productId, sessionNamespace, allowCreate, onSelect, onClear, onClose }: {
  current: { manufacturerId?: string | undefined; name: string };
  productId?: string | undefined;
  sessionNamespace: string;
  allowCreate: boolean;
  onSelect: (manufacturer: InventoryManufacturerSelection, saveProduct: (input: SaveInventoryProductInput) => Promise<InventoryProduct>) => void;
  onClear: (saveProduct: (input: SaveInventoryProductInput) => Promise<InventoryProduct>) => void;
  onClose: () => void;
}) {
  const listId = useId();
  const addInput = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const request = useRef({ signature: "", id: "" });
  const [manufacturers, setManufacturers] = useState<InventoryManufacturer[]>([]);
  const [resolvedCurrent, setResolvedCurrent] = useState(current);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"select" | "add">("select");
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    void Promise.all([inventoryManufacturerRepository.list(), productId ? inventoryManufacturerRepository.reference(productId) : Promise.resolve(null)]).then(([items, detail]) => {
      if (alive) {
        setManufacturers(items.filter((item) => item.active));
        if (detail) setResolvedCurrent({ name: detail.product.manufacturer,
          ...(detail.product.manufacturerId ? { manufacturerId: detail.product.manufacturerId } : {}) });
      }
    }).catch(() => { if (alive) setLoadError("제조사 목록을 불러오지 못했어요. 연결을 확인하고 다시 시도해주세요."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [attempt, productId]);

  useEffect(() => {
    if (mode !== "add") return;
    const frame = requestAnimationFrame(() => addInput.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const filtered = useMemo(() => filterInventoryManufacturers(manufacturers, query), [manufacturers, query]);
  const activeById = useMemo(() => new Map(manufacturers.map((item) => [item.manufacturerId, item])), [manufacturers]);
  const recent = readRecentInventoryManufacturers(sessionNamespace).map((item) => activeById.get(item.manufacturerId)).filter((item): item is InventoryManufacturer => !!item);
  const candidates = useMemo(() => inventoryManufacturerCandidates(manufacturers, newName), [manufacturers, newName]);
  const currentIsMissing = !!resolvedCurrent.manufacturerId && !loading && !activeById.has(resolvedCurrent.manufacturerId);
  const enteredName = canonicalInventoryManufacturerName(query);

  function choose(manufacturer: InventoryManufacturerSelection) {
    rememberInventoryManufacturer(sessionNamespace, manufacturer);
    onSelect(manufacturer, inventoryManufacturerRepository.saveProduct);
  }
  function openAdd(name = "") {
    if (!allowCreate) return;
    setNewName(name); setCreateError(""); setMode("add");
  }
  function moveOption(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (!delta || !optionRefs.current.length) return;
    event.preventDefault();
    optionRefs.current[(index + delta + optionRefs.current.length) % optionRefs.current.length]?.focus({ preventScroll: true });
  }
  async function createManufacturer() {
    const name = canonicalInventoryManufacturerName(newName);
    if (!name || creating) return;
    if (request.current.signature !== name) request.current = { signature: name, id: crypto.randomUUID() };
    setCreating(true); setCreateError("");
    try {
      const manufacturer = await inventoryManufacturerRepository.create({ requestId: request.current.id, name });
      rememberInventoryManufacturer(sessionNamespace, manufacturer); onSelect(manufacturer, inventoryManufacturerRepository.saveProduct);
    } catch (error) {
      setCreateError(duplicateManufacturerError(error)
        ? "같은 제조사가 이미 있어요. 아래 기존 제조사를 선택해주세요."
        : "제조사를 추가하지 못했어요. 입력한 이름과 연결 상태를 확인해주세요.");
    } finally { setCreating(false); }
  }

  return <BottomSheet open title={mode === "add" ? "새 제조사 추가" : "제조사 선택"} onClose={onClose} dismissible={!creating}>
    <div className={styles.picker}>
      {mode === "select" ? <>
        {loading ? <p className={styles.status} role="status">제조사 목록을 불러오고 있어요.</p> : null}
        {loadError ? <div className={styles.section} role="alert"><p className={styles.error}>{loadError}</p><GlassButton onClick={() => { setLoading(true); setLoadError(""); setAttempt((value) => value + 1); }}>다시 시도</GlassButton></div> : null}
        {!loading && !loadError ? <>
          {currentIsMissing ? <p className={styles.current}><strong>현재 제조사 · {resolvedCurrent.name || "이름 없음"}</strong>비활성 또는 현재 선택 목록에 없는 연결을 유지하고 있어요.</p> : null}
          {recent.length ? <section className={styles.section} aria-labelledby={`${listId}-recent`}><h3 id={`${listId}-recent`}>최근 사용</h3><div className={styles.recent}>{recent.map((item) => <button key={item.manufacturerId} type="button" onClick={() => choose(item)}>{item.name}</button>)}</div></section> : null}
          <label className={styles.field}>제조사 검색<input {...searchInputProps} value={query} role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={listId} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); optionRefs.current[0]?.focus({ preventScroll: true }); } }} /></label>
          <section className={styles.section} aria-labelledby={`${listId}-all`}><h3 id={`${listId}-all`}>{query ? "검색 결과" : "전체 제조사"}</h3>
            <ul id={listId} className={styles.list} role="listbox" aria-label="제조사 목록">
              <li role="presentation"><button ref={(element) => { optionRefs.current[0] = element; }} className={styles.option} type="button" role="option" aria-selected={!resolvedCurrent.name && !resolvedCurrent.manufacturerId} onKeyDown={(event) => moveOption(event, 0)} onClick={() => onClear(inventoryManufacturerRepository.saveProduct)}><span>제조사 없음</span>{!resolvedCurrent.name && !resolvedCurrent.manufacturerId ? <Icon name="check" size={16} /> : null}</button></li>
              {filtered.map((item, index) => <li role="presentation" key={item.manufacturerId}><button ref={(element) => { optionRefs.current[index + 1] = element; }} className={styles.option} type="button" role="option" aria-selected={resolvedCurrent.manufacturerId === item.manufacturerId} onKeyDown={(event) => moveOption(event, index + 1)} onClick={() => choose(item)}><span>{item.name}</span>{resolvedCurrent.manufacturerId === item.manufacturerId ? <Icon name="check" size={16} /> : null}</button></li>)}
            </ul>
            {!filtered.length ? <p className={styles.status} role="status">일치하는 제조사가 없어요.</p> : null}
          </section>
          {allowCreate ? <GlassButton className={styles.add} onClick={() => openAdd(enteredName)}><Icon name="plus" size={18} />{enteredName && !filtered.length ? `“${enteredName}” 새 제조사로 추가` : "새 제조사 추가"}</GlassButton> : null}
        </> : null}
      </> : <>
        <label className={styles.field}>제조사명<input ref={addInput} maxLength={200} value={newName} onChange={(event) => { setNewName(event.target.value); setCreateError(""); }} disabled={creating} /></label>
        {candidates.length ? <section className={styles.section} aria-labelledby={`${listId}-candidates`}><h3 id={`${listId}-candidates`}>비슷한 기존 제조사</h3><p className={styles.candidateHelp}>같은 제조사라면 새로 추가하지 않고 선택해주세요.</p><ul className={styles.list} role="listbox" aria-label="비슷한 기존 제조사">{candidates.map((item) => <li role="presentation" key={item.manufacturerId}><button className={styles.option} type="button" role="option" aria-selected="false" onClick={() => choose(item)}><span>{item.name}</span></button></li>)}</ul></section> : null}
        {createError ? <p className={styles.error} role="alert">{createError}</p> : null}
        <div className={styles.actions}><GlassButton disabled={creating} onClick={() => { setMode("select"); setCreateError(""); }}>목록으로</GlassButton><GlassButton variant="primary" disabled={creating || !canonicalInventoryManufacturerName(newName)} onClick={() => void createManufacturer()}>{creating ? "추가 중…" : "추가 후 선택"}</GlassButton></div>
      </>}
    </div>
  </BottomSheet>;
}
