"use client";
import { useState } from "react";
import type { Customer } from "@/domain/customer";
import type { PhotoAlias } from "@/domain/delivery-planning";
import { searchCustomers } from "@/features/customers/customer-search";
import { planningError, type PlanningRepository } from "./planning-repository";
import styles from "./photo-batch.module.css";

type AliasUpdate = Parameters<PlanningRepository["updateAlias"]>[0];
export function PhotoAliasManager({ aliases, customers, busy, onUpdate, error, onReload }: {
  aliases: readonly PhotoAlias[]; customers: readonly Customer[]; busy: boolean;
  onUpdate: (input: AliasUpdate) => Promise<void>; error: string; onReload: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null); const [query, setQuery] = useState("");
  const [pending, setPending] = useState<AliasUpdate | null>(null); const [failure, setFailure] = useState("");
  const visible = aliases.filter((alias) => alias.enabled);
  const matches = query.trim() ? searchCustomers(customers, query).slice(0, 8) : [];
  const update = async (input: AliasUpdate) => {
    setPending(input); setFailure("");
    try { await onUpdate(input); setPending(null); setEditing(null); setQuery(""); }
    catch (cause) {
      setFailure(planningError(cause));
      const code = (cause as { code?: string })?.code?.replace(/^functions\//, "");
      if (["invalid-argument", "failed-precondition", "aborted", "already-exists", "permission-denied", "unauthenticated"].includes(code ?? "")) { setPending(null); onReload(); }
    }
  };
  return <div className={styles.aliasContent}>
    {error ? <div className={styles.error}><p>{error}</p><button type="button" disabled={busy} onClick={onReload}>다시 불러오기</button></div> : <>
      {!visible.length && <p className={styles.hint}>확인한 줄임말은 다음 사진에서도 기억해요.</p>}
      {visible.map((alias) => <div className={styles.aliasItem} key={alias.aliasKey}>
        <div className={styles.chosenCustomer}><div><strong>{alias.aliasText}</strong><small>{customers.find((c) => c.customerId === alias.customerId)?.name ?? `${alias.targetName} · 현재 사용 불가`}</small></div>
          <div className={styles.aliasActions}><button type="button" className={styles.textButton} disabled={busy || Boolean(pending)} onClick={() => { setEditing(editing === alias.aliasKey ? null : alias.aliasKey); setQuery(""); }}>변경</button>
            <button type="button" className={styles.textButton} disabled={busy || Boolean(pending)} onClick={() => void update({ requestId: crypto.randomUUID(), aliasKey: alias.aliasKey, expectedRevision: alias.revision, customerId: null })}>기억 해제</button></div></div>
        {editing === alias.aliasKey && <div className={styles.aliasEdit}><label>연결할 거래처<input value={query} disabled={busy || Boolean(pending)} placeholder="이름 · 초성으로 검색" onChange={(e) => setQuery(e.target.value)} /></label>
          <div className={styles.matchOptions}>{matches.map((customer) => <button type="button" key={customer.customerId} disabled={busy || Boolean(pending)} onClick={() => void update({ requestId: crypto.randomUUID(), aliasKey: alias.aliasKey, expectedRevision: alias.revision, customerId: customer.customerId })}>
            <strong>{customer.name}</strong><small>{customer.deliveryAddress || customer.officialAddress}</small></button>)}</div></div>}
      </div>)}
    </>}
    {failure && <p className={styles.error} role="alert">{failure}</p>}
    {pending && !busy && <button type="button" onClick={() => void update(pending)}>줄임말 저장 결과 다시 확인</button>}
  </div>;
}
