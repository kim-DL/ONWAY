"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { INVENTORY_LOCATION_LABELS, inventoryUnitDisplayLabel } from "../../../functions/src/inventory/inventory-labels";
import { NOTICE_WINDOW } from "../../../functions/src/inventory/inventory-notification-contract";
import type { LiveCard } from "./inventory-notices";
import { acknowledgeInbox, type InboxSnapshot, olderNotices, saveNoticePolicy, watchNoticePolicy, type InventoryNotice, type NoticePolicy } from "./notice-repository";
import styles from "./inventory-notices.module.css";

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

const movementLabels = { receive: "입고", issue: "출고", adjust: "수량 조정" } as const;

function change(row: InventoryNotice) {
  return (row.delta < 0 ? "−" : "+") + Math.abs(row.delta).toLocaleString("ko-KR") + inventoryUnitDisplayLabel(row.unitLabel);
}
function NoticeLine({ row }: { row: InventoryNotice }) {
  return <><strong className={styles.name}>{row.productName}</strong>
    <b className={styles.amount} data-increase={row.delta > 0}>{change(row)}</b></>;
}

export function InlineNotice({ row, onRefresh }: { row: InventoryNotice; onRefresh: () => void }) {
  return <div className={styles.inline}><span role="status">{INVENTORY_LOCATION_LABELS[row.locationId]} {movementLabels[row.kind]} · {change(row)}</span>
    <button type="button" onClick={onRefresh}>최신 수량 보기</button></div>;
}

export function NoticeInbox({ selection, live, onClose }: {
  selection: InboxSnapshot | null; live: LiveCard | null; onClose: () => void;
}) {
  const latest = live?.latest;
  return <>
    {createPortal(<div className={styles.announce} role="status" aria-live="polite" aria-atomic="true">
      {!selection && latest ? <div className={styles.card}><div className={styles.line}><NoticeLine row={latest} /></div>
        <small>{INVENTORY_LOCATION_LABELS[latest.locationId]} · {movementLabels[latest.kind]}{live.count > 1 ? ` 외 ${live.count - 1}건` : ""}</small>
      </div> : null}
    </div>, document.body)}
    <BottomSheet open={Boolean(selection)} title="재고 알림함" onClose={onClose}>
      {selection?.failed ? <p role="status">알림을 불러오지 못했어요. 연결 상태를 확인해주세요.</p>
        : selection?.rows.length && selection.policy?.channel
          ? <NoticeHistory rows={selection.rows} channel={selection.policy.channel} policy={selection.policy} />
          : <p className={styles.caption}>확인하지 않은 알림이 없습니다.</p>}
    </BottomSheet>
  </>;
}

function NoticeHistory({ rows, channel, policy }: { rows: InventoryNotice[]; channel: string; policy: NoticePolicy }) {
  const [ackFailed, setAckFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const newest = rows[0]!.id;
  useEffect(() => {
    let active = true;
    void acknowledgeInbox(channel, newest).then(() => { if (active) setAckFailed(false); })
      .catch(() => { if (active) setAckFailed(true); });
    return () => { active = false; };
  }, [channel, newest, attempt]);
  const [pages, setPages] = useState<InventoryNotice[][]>([]);
  const [loading, setLoading] = useState(false);
  const [end, setEnd] = useState("");
  const [error, setError] = useState("");
  const pending = useRef(false);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => { list.current?.closest(".bottom-sheet__body")?.scrollTo({ top: 0 }); }, [pages]);
  const visible = pages.at(-1) ?? rows;
  const tail = visible.at(-1)!.id;
  async function earlier() {
    if (pending.current) return;
    pending.current = true; setLoading(true); setError("");
    try {
      const older = await olderNotices(channel, tail, policy);
      if (older.length) setPages(current => [...current, older]);
      else setEnd(tail);
    } catch { setError("이전 알림을 불러오지 못했어요. 다시 시도해주세요."); }
    finally { pending.current = false; setLoading(false); }
  }
  return <><ul ref={list} className={styles.history}>{visible.map(row => <li key={row.id}>
    <div className={styles.line}><NoticeLine row={row} /></div>
    <small>{INVENTORY_LOCATION_LABELS[row.locationId]} · {movementLabels[row.kind]}<time dateTime={new Date(row.createdAt).toISOString()}>{timeFormat.format(row.createdAt)}</time></small>
  </li>)}</ul>
    {ackFailed && <p role="status">읽음 상태를 저장하지 못했어요. <button type="button" onClick={() => setAttempt(value => value + 1)}>다시 저장</button></p>}
    {error && <p role="status">{error}</p>}
    {(pages.length > 0 || (visible.length === NOTICE_WINDOW && tail !== end)) && <div className={styles.paging}>
      {pages.length > 0 && <button type="button" disabled={loading} onClick={() => { setPages(current => current.slice(0, -1)); setError(""); }}>더 최근 알림</button>}
      {visible.length === NOTICE_WINDOW && tail !== end && <button type="button" disabled={loading} onClick={() => void earlier()}>{loading ? "확인 중…" : "이전 알림 보기"}</button>}
    </div>}
  </>;
}

export function PolicySwitch({ policy, employeeId, disabled }: { policy: NoticePolicy; employeeId?: string; disabled?: boolean }) {
  const assignment = employeeId !== undefined;
  const checked = assignment ? policy.assigned : policy.enabled;
  const label = assignment ? "재고 알림 수신 직원" : "재고 변경 알림";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function toggle() {
    if (pending.current) return;
    pending.current = true;
    setSaving(true); setError("");
    try {
      const command = { requestId: crypto.randomUUID(), expectedRevision: policy.revision };
      await saveNoticePolicy(assignment ? { ...command, employeeId, assigned: !checked } : { ...command, enabled: !checked });
    } catch {
      setError("저장하지 못했어요. 연결과 현재 수신 설정을 확인해주세요.");
    } finally { pending.current = false; setSaving(false); }
  }
  return <div className={styles.setting}>
    {!assignment && <span className="settings-list__icon"><Icon name="bell" /></span>}
    <span><strong>{label}</strong><small>{error || (assignment ? "다른 직원의 입고·출고·수량 조정 알림을 받습니다." : "꺼 둔 동안에는 새 알림을 받지 않습니다.")}</small></span>
    <button type="button" className={assignment ? undefined : "pwa-install-action"} role="switch" aria-label={label} aria-checked={checked} disabled={saving || disabled} onClick={() => void toggle()}>
      {saving ? "저장 중" : checked ? "켜짐" : "꺼짐"}
    </button>
  </div>;
}

export function RecipientSetting({ employeeId, disabled }: { employeeId: string; disabled: boolean }) {
  const [policy, setPolicy] = useState<NoticePolicy | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => watchNoticePolicy(employeeId, (next, error) => { setPolicy(next); setFailed(Boolean(error)); }), [employeeId, retry]);
  if (!policy) return <div className={styles.setting}>{failed ? <><span>재고 알림 수신 설정을 불러오지 못했어요.</span><button type="button" onClick={() => setRetry(value => value + 1)}>다시 확인</button></> : "재고 알림 수신 설정 확인 중…"}</div>;
  return <PolicySwitch policy={policy} employeeId={employeeId} disabled={disabled && !policy.assigned} />;
}
