"use client";

import { useEffect, useRef, useState } from "react";
import { GlassButton } from "@/components/ui/glass-button";
import { INVENTORY_LOCATION_LABELS, type InventoryEvent } from "@/domain/inventory";
import { inventoryErrorMessage, inventoryRepository } from "./inventory-repository";
import styles from "./inventory.module.css";

const EVENT_LABELS: Record<InventoryEvent["kind"], string> = { receive: "입고", issue: "출고", adjust: "수량 조정", transfer: "장소 이동", count_match: "실사 · 수량 일치", count_adjust: "실사 · 수량 수정", lot_update: "유통기한 정보 수정" };
const eventTime = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });
type HistoryResult = { productId: string; requestKey: string; events: InventoryEvent[]; cursor: string | null; error: string };

export function InventoryHistory({ productId }: { productId: string }) {
  const [request, setRequest] = useState<{ productId: string; page: string | null; retry: number }>({ productId, page: null, retry: 0 });
  const [result, setResult] = useState<HistoryResult>({ productId, requestKey: "", events: [], cursor: null, error: "" });
  const queued = useRef(false);
  const page = request.productId === productId ? request.page : null;
  const retry = request.productId === productId ? request.retry : 0;
  const requestKey = JSON.stringify([productId, page, retry]);
  const owned = result.productId === productId;
  const events = owned ? result.events : [];
  const cursor = owned ? result.cursor : null;
  const busy = !owned || result.requestKey !== requestKey;
  const error = !busy && owned ? result.error : "";

  useEffect(() => {
    let cancelled = false;
    void inventoryRepository.history(productId, page).then((response) => {
      if (cancelled) return;
      setResult((old) => {
        const merged = new Map((page && old.productId === productId ? old.events : []).map((event) => [event.eventId, event]));
        for (const event of response.events) if (!merged.has(event.eventId)) merged.set(event.eventId, event);
        return { productId, requestKey, events: Array.from(merged.values()), cursor: response.nextCursor, error: "" };
      });
    }).catch((cause) => {
      if (cancelled) return;
      const code = cause && typeof cause === "object" && "code" in cause ? String(cause.code) : "";
      const denied = ["unauthenticated", "permission-denied"].some((suffix) => code.endsWith(suffix));
      setResult((old) => ({ productId, requestKey, events: !denied && old.productId === productId ? old.events : [], cursor: !denied && old.productId === productId ? old.cursor : null, error: inventoryErrorMessage(cause) }));
    }).finally(() => { if (!cancelled) queued.current = false; });
    return () => { cancelled = true; };
  }, [productId, page, requestKey]);

  function load(nextPage: string | null, retryFailed: boolean) {
    if (busy || queued.current) return;
    queued.current = true;
    setRequest({ productId, page: nextPage, retry: retryFailed || nextPage === page ? retry + 1 : 0 });
  }

  return <div className={styles.sheet} aria-busy={busy}>
    {events.map((event) => <article key={event.eventId} className={styles.lotCard}><div className={styles.row}><strong>{EVENT_LABELS[event.kind]}</strong><time className={styles.muted} dateTime={event.createdAt}>{eventTime.format(new Date(event.createdAt))}</time></div>{event.lines.map((line) => <p key={`${line.lotId}:${line.locationId}`} className={styles.muted}>{INVENTORY_LOCATION_LABELS[line.locationId]} · {line.before} → {line.after} {event.unitLabel} ({line.delta > 0 ? "+" : ""}{line.delta})</p>)}{event.reason ? <p className={styles.muted}>{event.reason}</p> : null}</article>)}
    {busy ? <p role="status">기록을 불러오고 있어요.</p> : !events.length && !error ? <p className={styles.muted}>아직 기록이 없어요.</p> : null}
    {error ? <><p className={styles.error} role="alert">{error}</p><GlassButton onClick={() => load(events.length ? page : null, true)}>기록 다시 불러오기</GlassButton></> : cursor ? <GlassButton disabled={busy} onClick={() => load(cursor, false)}>이전 기록 더 보기</GlassButton> : null}
  </div>;
}
