"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
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

function revisionManufacturerError(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && String(error.code).endsWith("aborted");
}

type ManufacturerManagement = {
  manufacturer: InventoryManufacturer;
  mode: "menu" | "rename" | "deactivate";
};

export function InventoryManufacturerPicker({ current, productId, sessionNamespace, allowCreate, canAdmin, onSelect, onClear, onClose }: {
  current: { manufacturerId?: string | undefined; name: string };
  productId?: string | undefined;
  sessionNamespace: string;
  allowCreate: boolean;
  canAdmin: boolean;
  onSelect: (manufacturer: InventoryManufacturerSelection, saveProduct: (input: SaveInventoryProductInput) => Promise<InventoryProduct>) => void;
  onClear: (saveProduct: (input: SaveInventoryProductInput) => Promise<InventoryProduct>) => void;
  onClose: () => void;
}) {
  const listId = useId();
  const addInput = useRef<HTMLInputElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const request = useRef({ signature: "", id: "" });
  const updateRequest = useRef({ signature: "", id: "" });
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
  const [management, setManagement] = useState<ManufacturerManagement | null>(null);
  const [renameName, setRenameName] = useState("");
  const [managementError, setManagementError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [pickerFeedback, setPickerFeedback] = useState<{ tone: "status" | "error"; message: string } | null>(null);

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
    const target = mode === "add" ? addInput : management?.mode === "rename" ? renameInput : null;
    if (!target) return;
    const frame = requestAnimationFrame(() => target.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [mode, management?.mode]);

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
  function openManagement(manufacturer: InventoryManufacturer) {
    if (!canAdmin) return;
    setRenameName(manufacturer.name); setManagementError(""); setPickerFeedback(null);
    setManagement({ manufacturer, mode: "menu" });
  }
  function closeManagement() {
    if (updating) return;
    setManagement(null); setManagementError("");
  }
  async function refreshActiveManufacturers() {
    const items = (await inventoryManufacturerRepository.list()).filter((item) => item.active);
    setManufacturers(items);
    return items;
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
  async function updateManufacturer(kind: "rename" | "deactivate") {
    if (!management || updating || management.mode !== kind) return;
    const manufacturer = management.manufacturer;
    const name = canonicalInventoryManufacturerName(renameName);
    if (kind === "rename" && (!name || name === manufacturer.name)) return;
    const signature = JSON.stringify({ kind, manufacturerId: manufacturer.manufacturerId,
      expectedRevision: manufacturer.revision, ...(kind === "rename" ? { name } : {}) });
    if (updateRequest.current.signature !== signature || !updateRequest.current.id) {
      updateRequest.current = { signature, id: crypto.randomUUID() };
    }
    setUpdating(true); setManagementError(""); setPickerFeedback(null);
    try {
      const updated = await inventoryManufacturerRepository.update({
        requestId: updateRequest.current.id, manufacturerId: manufacturer.manufacturerId,
        expectedRevision: manufacturer.revision, ...(kind === "rename" ? { name } : { active: false as const }),
      });
      setManufacturers((items) => kind === "deactivate"
        ? items.filter((item) => item.manufacturerId !== updated.manufacturerId)
        : items.map((item) => item.manufacturerId === updated.manufacturerId ? updated : item));
      setManagement(null);
      setPickerFeedback({ tone: "status", message: kind === "rename"
        ? "제조사 선택 목록의 이름을 변경했어요. 기존 품목의 제조사명은 그대로 유지됩니다."
        : "제조사를 신규 선택 목록에서 숨겼어요. 기존 품목의 제조사명과 연결은 그대로 유지됩니다." });
      try { await refreshActiveManufacturers(); }
      catch { setPickerFeedback({ tone: "status", message: "변경은 저장되었어요. 최신 제조사 목록은 picker를 다시 열어 확인해주세요." }); }
    } catch (error) {
      if (kind === "rename" && duplicateManufacturerError(error)) {
        setManagementError("같은 이름의 제조사가 이미 있어요. 이름을 확인하고 기존 제조사를 사용해주세요.");
      } else if (revisionManufacturerError(error)) {
        try {
          await refreshActiveManufacturers();
          setPickerFeedback({ tone: "error", message: "다른 관리자가 먼저 변경했어요. 최신 목록을 불러왔으니 다시 관리 메뉴를 열어주세요." });
        } catch {
          setLoadError("최신 제조사 목록을 불러오지 못했어요. picker를 닫았다가 다시 열어주세요.");
          setPickerFeedback({ tone: "error", message: "다른 관리자가 먼저 변경했어요. 최신 목록을 다시 확인해주세요." });
        }
        setManagement(null);
      } else {
        setManagementError(kind === "rename"
          ? "제조사 이름을 수정하지 못했어요. 입력한 이름과 연결 상태를 확인해주세요."
          : "제조사를 비활성화하지 못했어요. 연결 상태를 확인하고 다시 시도해주세요.");
      }
    } finally { setUpdating(false); }
  }

  return <><BottomSheet open title={mode === "add" ? "새 제조사 추가" : "제조사 선택"} onClose={onClose} dismissible={!creating && !updating}>
    <div className={styles.picker}>
      {mode === "select" ? <>
        {pickerFeedback ? <p className={pickerFeedback.tone === "error" ? styles.error : styles.success} role={pickerFeedback.tone === "error" ? "alert" : "status"}>{pickerFeedback.message}</p> : null}
        {loading ? <p className={styles.status} role="status">제조사 목록을 불러오고 있어요.</p> : null}
        {loadError ? <div className={styles.section} role="alert"><p className={styles.error}>{loadError}</p><GlassButton onClick={() => { setLoading(true); setLoadError(""); setAttempt((value) => value + 1); }}>다시 시도</GlassButton></div> : null}
        {!loading && !loadError ? <>
          {currentIsMissing ? <p className={styles.current}><strong>현재 제조사 · {resolvedCurrent.name || "이름 없음"}</strong>비활성 또는 현재 선택 목록에 없는 연결을 유지하고 있어요.</p> : null}
          {recent.length ? <section className={styles.section} aria-labelledby={`${listId}-recent`}><h3 id={`${listId}-recent`}>최근 사용</h3><div className={styles.recent}>{recent.map((item) => <button key={item.manufacturerId} type="button" onClick={() => choose(item)}>{item.name}</button>)}</div></section> : null}
          <label className={styles.field}>제조사 검색<input {...searchInputProps} value={query} role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={listId} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); optionRefs.current[0]?.focus({ preventScroll: true }); } }} /></label>
          <section className={styles.section} aria-labelledby={`${listId}-all`}><h3 id={`${listId}-all`}>{query ? "검색 결과" : "전체 제조사"}</h3>
            <ul id={listId} className={styles.list} role="listbox" aria-label="제조사 목록">
              <li role="presentation"><button ref={(element) => { optionRefs.current[0] = element; }} className={styles.option} type="button" role="option" aria-selected={!resolvedCurrent.name && !resolvedCurrent.manufacturerId} onKeyDown={(event) => moveOption(event, 0)} onClick={() => onClear(inventoryManufacturerRepository.saveProduct)}><span>제조사 없음</span>{!resolvedCurrent.name && !resolvedCurrent.manufacturerId ? <Icon name="check" size={16} /> : null}</button></li>
              {filtered.map((item, index) => <li className={canAdmin ? styles.optionRow : undefined} role="presentation" key={item.manufacturerId}><button ref={(element) => { optionRefs.current[index + 1] = element; }} className={styles.option} type="button" role="option" aria-selected={resolvedCurrent.manufacturerId === item.manufacturerId} onKeyDown={(event) => moveOption(event, index + 1)} onClick={() => choose(item)}><span>{item.name}</span>{resolvedCurrent.manufacturerId === item.manufacturerId ? <Icon name="check" size={16} /> : null}</button>{canAdmin ? <button className={styles.manage} type="button" aria-label={`${item.name} 관리`} aria-haspopup="dialog" aria-expanded={management?.manufacturer.manufacturerId === item.manufacturerId} onClick={(event) => { event.stopPropagation(); openManagement(item); }}><span aria-hidden="true">⋯</span></button> : null}</li>)}
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
  </BottomSheet>
    {management ? <BottomSheet open title={management.mode === "rename" ? "제조사 이름 수정" : management.mode === "deactivate" ? "제조사 비활성화" : "제조사 관리"} description={management.manufacturer.name} onClose={closeManagement} dismissible={!updating}>
      {management.mode === "menu" ? <div className={styles.managementMenu}>
        <GlassButton onClick={() => { setRenameName(management.manufacturer.name); setManagementError(""); setManagement({ ...management, mode: "rename" }); }}><Icon name="clipboard" size={18} /><span>이름 수정</span><Icon name="chevron-right" size={16} /></GlassButton>
        <GlassButton variant="danger" onClick={() => { setManagementError(""); setManagement({ ...management, mode: "deactivate" }); }}><Icon name="close" size={18} /><span>비활성화</span><Icon name="chevron-right" size={16} /></GlassButton>
        <GlassButton onClick={closeManagement}>취소</GlassButton>
      </div> : management.mode === "rename" ? <>
        <div className={styles.managementForm}>
          <p className={styles.managementNotice}>제조사 선택 목록의 이름이 변경됩니다.<br />기존 품목에 저장된 제조사명은 변경되지 않습니다.</p>
          <label className={styles.field}>수정할 제조사명<input ref={renameInput} maxLength={200} value={renameName} onChange={(event) => { setRenameName(event.target.value); setManagementError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void updateManufacturer("rename"); } }} disabled={updating} /></label>
          {managementError ? <p className={styles.error} role="alert">{managementError}</p> : null}
        </div>
        <BottomSheetActions busy={updating} className={styles.managementFooter ?? ""}><GlassButton disabled={updating} onClick={() => { setManagementError(""); setManagement({ ...management, mode: "menu" }); }}>취소</GlassButton><GlassButton variant="primary" disabled={updating || !canonicalInventoryManufacturerName(renameName) || canonicalInventoryManufacturerName(renameName) === management.manufacturer.name} onClick={() => void updateManufacturer("rename")}>{updating ? "수정 중…" : "이름 수정"}</GlassButton></BottomSheetActions>
      </> : <>
        <div className={styles.managementForm}>
          <p className={styles.managementNotice}>신규 제조사 선택 목록에서 숨깁니다.<br />기존 품목의 제조사명과 연결은 유지됩니다.</p>
          <p className={styles.status}>비활성화한 제조사는 이 화면에서 다시 활성화할 수 없어요. 다시 사용해야 한다면 별도 확인이 필요합니다.</p>
          {managementError ? <p className={styles.error} role="alert">{managementError}</p> : null}
        </div>
        <BottomSheetActions busy={updating} className={styles.managementFooter ?? ""}><GlassButton disabled={updating} onClick={() => { setManagementError(""); setManagement({ ...management, mode: "menu" }); }}>취소</GlassButton><GlassButton variant="danger" disabled={updating} onClick={() => void updateManufacturer("deactivate")}>{updating ? "처리 중…" : "비활성화"}</GlassButton></BottomSheetActions>
      </>}
    </BottomSheet> : null}
  </>;
}
