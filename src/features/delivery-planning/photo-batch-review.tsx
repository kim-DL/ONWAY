"use client";
import { useState } from "react";
import type { Customer } from "@/domain/customer";
import { normalizeCustomerName } from "@/domain/customer";
import type { PhotoAlias, PhotoBatchDecision, PhotoBatchResult, PhotoBatchRow } from "@/domain/delivery-planning";
import { searchCustomers } from "@/features/customers/customer-search";
import { planningError, type PlanningRepository } from "./planning-repository";
import styles from "./photo-batch.module.css";

type Confirmation = Parameters<PlanningRepository["confirmBatch"]>[0];
type Choice = { customerId: string; skip: boolean; remember: boolean; aliasText: string };

function isAliasChoice(row: PhotoBatchRow, customer: Customer | undefined) {
  return Boolean(customer) && normalizeCustomerName(row.rawName) !== normalizeCustomerName(customer!.name);
}

function ReviewRow({ row, choice, customers, disabled, onChange }: {
  row: PhotoBatchRow; choice: Choice; customers: readonly Customer[]; disabled: boolean; onChange: (choice: Choice) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = customers.find((c) => c.customerId === choice.customerId);
  const matches = query.trim() ? searchCustomers(customers, query).slice(0, 8) : customers.filter((c) => row.candidateIds.includes(c.customerId));
  return <fieldset className={styles.reviewItem} disabled={disabled} aria-label={`${row.rawName || "판독 불가"} 확인`}>
    <legend>{row.rawName || "판독 불가"}</legend>
    <div className={styles.reviewItemHeading}><p>{choice.skip ? "이번 목록에서 제외" : row.reason}</p>
      <button type="button" className={styles.textButton} onClick={() => onChange({ ...choice, skip: !choice.skip })}>{choice.skip ? "제외 취소" : "제외"}</button></div>
    {!choice.skip && <>
      {row.address && <p className={styles.hint}>{row.address}</p>}
      {selected ? <div className={styles.chosenCustomer}><div><strong>{selected.name}</strong><small>{selected.deliveryAddress || selected.officialAddress}</small></div>
        <button type="button" className={styles.textButton} onClick={() => onChange({ ...choice, customerId: "" })}>다시 선택</button></div> : <>
        <label>기존 거래처 찾기<input value={query} placeholder="이름 · 초성으로 검색" onChange={(e) => setQuery(e.target.value)} /></label>
        <div className={styles.matchOptions}>{matches.map((customer) => <button type="button" key={customer.customerId} onClick={() => onChange({ ...choice, customerId: customer.customerId })}>
          <strong>{customer.name}</strong><small>{customer.deliveryAddress || customer.officialAddress || "주소 미등록"}</small>
        </button>)}</div>
        {query && !matches.length && <p className={styles.hint}>일치하는 거래처가 없어요. 검색어를 바꿔주세요.</p>}
      </>}
      {isAliasChoice(row, selected) && <>
        <label className={styles.checkbox}><input type="checkbox" checked={choice.remember} onChange={(e) => onChange({ ...choice, remember: e.target.checked })} /><span>이 줄임말 기억</span></label>
        {choice.remember && <label>기억할 이름<input value={choice.aliasText} maxLength={120} onChange={(e) => onChange({ ...choice, aliasText: e.target.value })} /></label>}
      </>}
    </>}
  </fieldset>;
}

export function PhotoBatchReview({ result, customers, aliases, deliveryDateKey, busy, onConfirm }: {
  result: PhotoBatchResult; customers: readonly Customer[]; aliases: readonly PhotoAlias[]; deliveryDateKey: string;
  busy: boolean; onConfirm: (input: Confirmation) => Promise<void>;
}) {
  const rows = result.rows.filter((row) => row.status === "review");
  const [choices, setChoices] = useState<Record<string, Choice>>(() => Object.fromEntries(rows.map((row) => [row.rowId, {
    customerId: "", skip: false, remember: !row.uncertain && Boolean(row.rawName), aliasText: row.rawName,
  }])));
  const [dateConfirmed, setDateConfirmed] = useState(result.dateConfirmed);
  const [pending, setPending] = useState<Confirmation | null>(null);
  const [error, setError] = useState("");
  const selected = rows.filter((row) => choices[row.rowId]?.customerId && !choices[row.rowId]?.skip);
  const needsDate = !result.dateConfirmed && selected.some((row) => row.dateStatus === "different" || row.dateStatus === "uncertain" || (result.kind === "invoice" && row.dateStatus === "absent"));
  const skipped = rows.filter((row) => choices[row.rowId]?.skip).length;
  const invalidAlias = selected.some((row) => {
    const choice = choices[row.rowId]!;
    const target = customers.find((customer) => customer.customerId === choice.customerId);
    return choice.remember && isAliasChoice(row, target) && !normalizeCustomerName(choice.aliasText);
  });
  const submit = async () => {
    const decisions: PhotoBatchDecision[] = rows.flatMap<PhotoBatchDecision>((row) => {
      const choice = choices[row.rowId]!;
      if (choice.skip) return [{ rowId: row.rowId, action: "skip" as const }];
      if (!choice.customerId) return [];
      const target = customers.find((c) => c.customerId === choice.customerId);
      const aliasText = choice.aliasText.trim() || row.rawName || target?.name || "거래처";
      const alias = aliases.find((item) => normalizeCustomerName(item.aliasText) === normalizeCustomerName(aliasText));
      return [{ rowId: row.rowId, action: "connect" as const, customerId: choice.customerId,
        rememberAlias: choice.remember && isAliasChoice(row, target) && normalizeCustomerName(aliasText) !== normalizeCustomerName(target?.name ?? ""), aliasText,
        expectedAliasRevision: alias?.revision ?? (normalizeCustomerName(aliasText) === normalizeCustomerName(row.rawName) ? row.aliasRevision : null) }];
    });
    const input = pending ?? { requestId: crypto.randomUUID(), scanId: result.scanId, expectedScanRevision: result.revision, deliveryDateKey, dateConfirmed, decisions };
    setPending(input); setError("");
    try { await onConfirm(input); }
    catch (cause) {
      setError(planningError(cause));
      const code = (cause as { code?: string })?.code?.replace(/^functions\//, "");
      if (["invalid-argument", "failed-precondition", "aborted", "already-exists", "permission-denied", "unauthenticated", "resource-exhausted"].includes(code ?? "")) setPending(null);
    }
  };
  return <div className={styles.review}>
    {rows.map((row) => <ReviewRow key={row.rowId} row={row} choice={choices[row.rowId]!} customers={customers} disabled={busy || Boolean(pending)}
      onChange={(choice) => setChoices((old) => ({ ...old, [row.rowId]: choice }))} />)}
    {needsDate && <><p className={styles.hint}>사진 날짜 {Array.from(new Set(selected.map((row) => row.date ?? "미확인"))).join(" · ")}</p><label className={styles.checkbox}><input type="checkbox" checked={dateConfirmed} disabled={busy || Boolean(pending)} onChange={(e) => setDateConfirmed(e.target.checked)} /><span>사진의 날짜와 관계없이 오늘 납품 건으로 등록</span></label></>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <button type="button" className={styles.primary} disabled={busy || (!pending && ((!selected.length && !skipped) || invalidAlias || (needsDate && !dateConfirmed)))} onClick={() => void submit()}>
      {pending && !busy ? "저장 결과 다시 확인" : busy ? "저장 중…" : selected.length ? `선택한 ${selected.length}곳 등록` : skipped ? `${skipped}개 항목 제외` : "거래처를 선택해주세요"}
    </button>
  </div>;
}
