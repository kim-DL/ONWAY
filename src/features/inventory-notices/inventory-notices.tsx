"use client";

import dynamic from "next/dynamic";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { INVENTORY_ENABLED } from "@/features/inventory/inventory-feature";
import { emptyInbox, watchInbox, type InventoryNotice } from "./notice-repository";

const NoticeInbox = dynamic(() => import("./notice-controls").then(module => module.NoticeInbox));
const InlineNotice = dynamic(() => import("./notice-controls").then(module => module.InlineNotice));
const PolicySwitch = dynamic(() => import("./notice-controls").then(module => module.PolicySwitch));
export const RecipientSetting = dynamic(() => import("./notice-controls").then(module => module.RecipientSetting));

export type LiveCard = { latest: InventoryNotice; count: number };
const initial = { ...emptyInbox, live: null as LiveCard | null };
const Inbox = createContext({ ...initial, dismiss: () => {} });

export function InventoryNoticeProvider({ employeeId, children }: { employeeId: string; children: ReactNode }) {
  const [state, setState] = useState(initial);
  useEffect(() => {
    if (!INVENTORY_ENABLED) return;
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = watchInbox(employeeId, (snapshot, fresh) => {
      const inDialog = Boolean(document.querySelector("dialog[open]"));
      setState(prev => {
        let live = prev.live;
        if (!fresh || inDialog) live = null;
        else if (fresh[0]) live = { latest: fresh[0], count: fresh.length + (live?.count ?? 0) };
        return { ...snapshot, live };
      });
      if (fresh === null || fresh.length) clearTimeout(timer);
      if (fresh?.length) timer = setTimeout(() => setState(prev => ({ ...prev, live: null })), 6000);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [employeeId]);
  return <Inbox.Provider value={{ ...state, dismiss: () => setState(prev => prev.live ? { ...prev, live: null } : prev) }}>{children}</Inbox.Provider>;
}

export function ProductNotice({ productId, revision, onRefresh }: { productId: string; revision: number; onRefresh: () => void }) {
  const { rows } = useContext(Inbox);
  const row = rows.find(item => item.productId === productId && item.stockRevision > revision);
  if (!row) return null;
  return <InlineNotice row={row} onRefresh={onRefresh} />;
}

export function NoticeBell() {
  const { policy, rows, failed, ready, live, dismiss } = useContext(Inbox);
  if (!policy?.assigned || !policy.enabled || !policy.channel) return null;
  return <NoticeInbox key={policy.channel} channel={policy.channel} rows={rows} failed={failed} ready={ready} live={live} dismiss={dismiss} />;
}

export function PersonalNoticeSetting() {
  const { policy } = useContext(Inbox);
  return policy?.assigned ? <PolicySwitch policy={policy} /> : null;
}
