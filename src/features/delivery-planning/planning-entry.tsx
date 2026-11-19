"use client";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { BottomSheet, useBottomSheetClose } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import type { Customer } from "@/domain/customer";
import type { DeliveryPhotoSnapshot } from "@/features/delivery-photos/delivery-photo-memory";
import styles from "./entry.module.css";
const Sheet = dynamic(() => import("./delivery-planning-sheet"), { ssr: false });

const groups = [
  { title: "목록 편집", actions: [
    { id: "day", icon: "calendar", title: "오늘 납품처", hint: "업체 추가·제외 및 순서 편집" },
    { id: "saved", icon: "clipboard", title: "내 납품처", hint: "앞으로 사용할 기본 목록 편집" },
  ] },
  { title: "납품 준비", actions: [
    { id: "invoice", asset: "/ui/delivery-invoice-stack.svg", title: "송장 사진으로 등록", hint: "사진 속 업체를 오늘 목록에 추가" },
    { id: "route", asset: "/ui/delivery-smart-route.svg", title: "인공지능 경로 추천", hint: "이동 경로를 바탕으로 순서 추천" },
  ] },
] as const;
type Tool = typeof groups[number]["actions"][number]["id"];

function PlanningActions({ onChoose }: { onChoose: (tool: Tool) => void }) {
  const close = useBottomSheetClose();
  return <div className={styles.tools}>{groups.map((group) => <div key={group.title} className={styles.group}>
    <h3>{group.title}</h3>
    {group.actions.map((action) => <button key={action.id} type="button" aria-label={action.title}
      onClick={() => { onChoose(action.id); close?.(); }}>
      <span className={styles.icon}>{"asset" in action
        ?
        // eslint-disable-next-line @next/next/no-img-element -- Presized local SVG.
        <img src={action.asset} width={26} height={26} alt="" />
        : <Icon name={action.icon} size={22} />}</span>
      <span><strong>{action.title}</strong><small>{action.hint}</small></span>
      <Icon name="chevron-right" size={16} />
    </button>)}
  </div>)}</div>;
}

export default function PlanningEntry({ customers, snapshot, accept, refresh, onEdit }: {
  customers: readonly Customer[]; snapshot: DeliveryPhotoSnapshot;
  accept: (update: (current: DeliveryPhotoSnapshot) => DeliveryPhotoSnapshot) => void; refresh: () => void;
  onEdit: (edit: { mode: "day" | "route"; onDone?: () => void }) => void;
}) {
  const [open, setOpen] = useState<"manage" | "invoice" | "route" | null>(null);
  const selection = useRef<Tool | null>(null);
  const closeManagement = () => {
    const selected = selection.current;
    selection.current = null;
    if (selected === "invoice" || selected === "route") setOpen(selected);
    else {
      setOpen(null);
      if (selected) onEdit({ mode: selected === "day" ? "day" : "route" });
    }
  };
  return <>
    <button type="button" className={styles.trigger} aria-haspopup="dialog" aria-expanded={open === "manage"}
      onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); setOpen("manage"); }}>
      <Icon name="sliders-refined" size={18} />납품처 관리
    </button>
    {open === "manage" && <BottomSheet open title="납품처 관리" onClose={closeManagement}>
      <PlanningActions onChoose={(tool) => { selection.current = tool; }} />
    </BottomSheet>}
    {(open === "invoice" || open === "route") && <Sheet mode={open} customers={customers} day={snapshot.day} onClose={() => setOpen(null)} onRefresh={refresh}
    onEditToday={() => { setOpen(null); onEdit({ mode: "day", onDone: () => setOpen("route") }); }}
    onLists={(lists) => accept((current) => ({ ...current,
      route: lists.route.revision >= (current.route?.revision ?? 0) ? lists.route : current.route,
      day: lists.day.deliveryDateKey === current.day.deliveryDateKey && (lists.day.revision ?? 0) >= (current.day.revision ?? 0) ? lists.day : current.day,
      refreshedAt: Date.now() }))}
    onDay={(day) => accept((current) => ({ ...current, day: day.deliveryDateKey === current.day.deliveryDateKey && (day.revision ?? 0) >= (current.day.revision ?? 0) ? day : current.day, refreshedAt: Date.now() }))} />}</>;
}
