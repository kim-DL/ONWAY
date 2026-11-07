"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { Customer } from "@/domain/customer";
import type { DeliveryPhotoSnapshot } from "@/features/delivery-photos/delivery-photo-memory";
import styles from "./entry.module.css";
const Sheet = dynamic(() => import("./delivery-planning-sheet"), { ssr: false });

export default function PlanningEntry({ customers, snapshot, accept, refresh, onEditToday }: {
  customers: readonly Customer[]; snapshot: DeliveryPhotoSnapshot;
  accept: (update: (current: DeliveryPhotoSnapshot) => DeliveryPhotoSnapshot) => void; refresh: () => void;
  onEditToday: (onDone: () => void) => void;
}) {
  const [open, setOpen] = useState<"invoice" | "route" | null>(null);
  return <><div className={styles.entries}><button type="button" className={styles.entry} onClick={() => setOpen("invoice")}>
    <span aria-hidden="true">▤</span><span><strong>명세서로 등록</strong></span><span aria-hidden="true">›</span>
  </button><button type="button" className={styles.entry} onClick={() => setOpen("route")}>
    <span aria-hidden="true">↗</span><span><strong>인공지능 경로 추천</strong></span><span aria-hidden="true">›</span>
  </button></div>{open && <Sheet mode={open} customers={customers} day={snapshot.day} onClose={() => setOpen(null)} onRefresh={refresh}
    onEditToday={() => { setOpen(null); onEditToday(() => setOpen("route")); }}
    onLists={(lists) => accept((current) => ({ ...current,
      route: lists.route.revision >= (current.route?.revision ?? 0) ? lists.route : current.route,
      day: lists.day.deliveryDateKey === current.day.deliveryDateKey && (lists.day.revision ?? 0) >= (current.day.revision ?? 0) ? lists.day : current.day,
      refreshedAt: Date.now() }))}
    onDay={(day) => accept((current) => ({ ...current, day: day.deliveryDateKey === current.day.deliveryDateKey && (day.revision ?? 0) >= (current.day.revision ?? 0) ? day : current.day, refreshedAt: Date.now() }))} />}</>;
}
