"use client";

import { useEffect, useMemo, useState } from "react";

import { BottomSheet, BottomSheetActions } from "@/components/ui/bottom-sheet";
import { searchInputProps } from "@/components/ui/search-input-props";
import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { searchCustomers } from "@/features/customers/customer-search";

import { addDeliveryPhotoCustomer, moveDeliveryPhotoCustomer, removeDeliveryPhotoCustomer } from "./delivery-photo-domain";
import { useDeliveryPhotoRecents } from "./use-delivery-photo-recents";
import styles from "./delivery-photo.module.css";

export type DeliveryPhotoEditorMode = "route" | "day";

export function DeliveryPhotoEditor({ mode, session, customers, initialIds, initialAddId,
  onSave, onClose }: {
  mode: DeliveryPhotoEditorMode;
  session: AuthenticatedSession;
  customers: readonly Customer[];
  initialIds: readonly string[];
  initialAddId?: string | undefined;
  onSave: (ids: readonly string[]) => Promise<"saved" | "conflict" | "error">;
  onClose: () => void;
}) {
  const { recentCustomers, rememberCustomer } = useDeliveryPhotoRecents(session, customers);
  useEffect(() => { if (initialAddId) rememberCustomer(initialAddId); }, [initialAddId, rememberCustomer]);
  const knownIds = useMemo(() => new Set(customers.map((customer) => customer.customerId)), [customers]);
  const byId = useMemo(() => new Map(customers.map((customer) => [customer.customerId, customer])), [customers]);
  const [ids, setIds] = useState(() => initialAddId
    ? addDeliveryPhotoCustomer(initialIds, initialAddId, knownIds) : [...initialIds]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"conflict" | "error" | "">("");
  const dirty = ids.join("\0") !== initialIds.join("\0");
  const candidates = useMemo(() => (query.trim() ? searchCustomers(customers, query) : recentCustomers)
    .filter((customer) => customer.status === "active" && !ids.includes(customer.customerId)).slice(0, 20), [customers, ids, query, recentCustomers]);
  const title = mode === "route" ? "내 납품처 편집" : "오늘 순서 편집";
  const guard = () => !dirty || window.confirm("저장하지 않은 변경사항을 버릴까요?");
  const save = async () => {
    if (busy || !dirty || error === "conflict") return;
    setBusy(true);
    setError("");
    try {
      const result = await onSave(ids);
      if (result === "saved") onClose();
      else setError(result);
    } catch {
      setError("error");
    } finally { setBusy(false); }
  };

  return <BottomSheet open title={title} description={mode === "route"
    ? "앞으로 사용할 기본 납품처 목록입니다. 오늘만 바꾸려면 오늘 순서 편집을 이용하세요."
    : "변경사항은 오늘만 적용됩니다. 기본 납품처는 바뀌지 않습니다."} onClose={onClose} beforeClose={guard} dismissible={!busy}>
    <div className={styles.editorContent}>
      <p className={styles.count}>선택 {ids.length}/100곳</p>
      {ids.length ? <ol className={styles.selected} aria-label={mode === "route" ? "내 납품처 순서" : "오늘 납품 순서"}>{ids.map((id, index) => {
        const customer = byId.get(id);
        if (!customer) return null;
        return <li key={id}><span className={styles.number}>{index + 1}</span><strong>{customer.name}</strong><div className={styles.controls}>
          <button type="button" disabled={index === 0 || busy} aria-label={`${customer.name} 위로 이동`} onClick={() => setIds(moveDeliveryPhotoCustomer(ids, id, index - 1, knownIds))}>↑</button>
          <button type="button" disabled={index === ids.length - 1 || busy} aria-label={`${customer.name} 아래로 이동`} onClick={() => setIds(moveDeliveryPhotoCustomer(ids, id, index + 1, knownIds))}>↓</button>
          <button type="button" disabled={busy} aria-label={`${customer.name} ${mode === "day" ? "오늘만 제외" : "내 납품처에서 제외"}`} onClick={() => setIds(removeDeliveryPhotoCustomer(ids, id))}>×</button>
        </div></li>;
      })}</ol> : <p className={styles.hint}>거래처를 검색해 추가하세요.</p>}
      <label className={styles.search}><span>거래처 검색</span><input {...searchInputProps} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름 · 초성" /></label>
      {!query.trim() && recentCustomers.length ? <p className={styles.hint}>최근 거래처</p> : null}
      {candidates.length ? <ul className={styles.candidates}>{candidates.map((customer) => <li key={customer.customerId}><span>{customer.name}</span><button type="button" disabled={ids.length >= 100 || busy} aria-label={`${customer.name} ${mode === "day" ? "오늘만 추가" : "내 납품처에 추가"}`} onClick={() => {
        setIds(addDeliveryPhotoCustomer(ids, customer.customerId, knownIds));
        rememberCustomer(customer.customerId);
      }}>추가</button></li>)}</ul> : query.trim() ? <p className={styles.hint}>일치하는 거래처가 없습니다.</p> : null}
      {error === "conflict" ? <div role="alert" className={styles.error}>다른 기기에서 목록이 바뀌었습니다. 최신 목록을 확인한 뒤 다시 편집해 주세요.<button type="button" onClick={onClose}>최신 목록 보기</button></div> : null}
      {error === "error" ? <p role="alert" className={styles.error}>저장하지 못했습니다. 다시 시도해 주세요.</p> : null}
    </div>
    <BottomSheetActions busy={busy}><button type="button" onClick={onClose} disabled={busy}>취소</button><button type="button" onClick={() => void save()} disabled={!dirty || busy || error === "conflict"}>{busy ? "저장 중" : "저장"}</button></BottomSheetActions>
  </BottomSheet>;
}
