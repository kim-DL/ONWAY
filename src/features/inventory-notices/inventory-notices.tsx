"use client";

import { AppBrand } from "../app-shell/app-brand";
import dynamic from "next/dynamic";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { INVENTORY_ENABLED } from "@/features/inventory/inventory-feature";
import { emptyInbox, watchInbox, type InboxSnapshot, type InventoryNotice } from "./notice-repository";

const NoticeInbox = dynamic(() => import("./notice-controls").then(module => module.NoticeInbox));
const InlineNotice = dynamic(() => import("./notice-controls").then(module => module.InlineNotice));
const DeviceSetting = dynamic(() => import("./device-setting").then(module => module.DeviceSetting));
const PolicySwitch = dynamic(() => import("./notice-controls").then(module => module.PolicySwitch));
export const RecipientSetting = dynamic(() => import("./notice-controls").then(module => module.RecipientSetting));

export type LiveCard = { latest: InventoryNotice; count: number };
const initial = { ...emptyInbox, live: null as LiveCard | null };
const Inbox = createContext({ ...initial, openInbox: () => {} });

export function useConfirmedInventoryChanges() {
  const { policy, ready, recentChanges } = useContext(Inbox);
  return { channel: ready && policy?.assigned && policy.enabled ? policy.channel : null, recentChanges };
}

export function InventoryNoticeProvider({ employeeId, children }: { employeeId: string; children: ReactNode }) {
  const [state, setState] = useState(initial);
  const [selection, setSelection] = useState<InboxSnapshot | null>(null);
  const current = useRef<InboxSnapshot>(emptyInbox);
  const pending = useRef(false);
  const openInbox = useCallback(() => {
    const snapshot = current.current;
    if (snapshot.ready || snapshot.failed) setSelection(snapshot);
    else pending.current = true;
  }, []);

  useEffect(() => {
    if (!INVENTORY_ENABLED) return;
    let timer: ReturnType<typeof setTimeout>;
    const url = new URL(location.href);
    if (url.searchParams.has("inventoryInbox")) {
      pending.current = true;
      url.searchParams.delete("inventoryInbox");
      history.replaceState(history.state, "", url);
    }
    const openFromNotification = (event: MessageEvent) => {
      if (event.data === "OPEN_INVENTORY_INBOX") openInbox();
    };
    navigator.serviceWorker?.addEventListener("message", openFromNotification);
    const unsubscribe = watchInbox(employeeId, (snapshot, fresh) => {
      current.current = snapshot;
      if (!snapshot.policy?.assigned || !snapshot.policy.enabled) {
        setSelection(null);
        if (snapshot.policy) pending.current = false;
      } else if (pending.current && (snapshot.ready || snapshot.failed)) {
        pending.current = false;
        setSelection(snapshot);
      }
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
    return () => {
      clearTimeout(timer);
      unsubscribe();
      navigator.serviceWorker?.removeEventListener("message", openFromNotification);
    };
  }, [employeeId, openInbox]);

  const channel = state.policy?.enabled && state.policy.assigned && state.policy.channel;
  return <Inbox.Provider value={{ ...state, openInbox }}>
    {children}
    {channel && <NoticeInbox key={channel} live={state.live}
      selection={selection?.policy?.channel === channel ? selection : null}
      onClose={() => { setSelection(null); setState(prev => ({ ...prev, live: null })); }} />}
  </Inbox.Provider>;
}

export function ProductNotice({ productId, revision, loading, onRefresh }: {
  productId: string; revision: number | undefined; loading: boolean; onRefresh: () => void;
}) {
  const { policy, ready, recentChanges } = useContext(Inbox);
  const [pending, setPending] = useState<{ channel: string; row: InventoryNotice } | null>(null);
  const channel = policy?.assigned && policy.enabled ? policy.channel : null;
  let next = pending;
  if (pending && (pending.row.productId !== productId || (policy && pending.channel !== channel)
    || (revision !== undefined && revision >= pending.row.stockRevision))) next = null;
  if (ready && channel && (revision !== undefined || next)) {
    // Keep a change for this open detail even after it leaves the latest feed page.
    for (const row of recentChanges) {
      if (row.productId === productId && row.stockRevision > (revision ?? -1)
        && row.stockRevision > (next?.row.stockRevision ?? -1)) next = { channel, row };
    }
  }
  if (next !== pending) setPending(next);
  if (!ready || !next || next.channel !== channel) return null;
  return <InlineNotice row={next.row} loading={loading} onRefresh={onRefresh} />;
}

export function NoticeBrand({recipientsOnly=false}: {recipientsOnly?:boolean}) {
  const {policy,rows,openInbox}=useContext(Inbox);
  const enabled=policy?.assigned && policy.enabled && policy.channel;
  if(recipientsOnly && !enabled) return null;
  return <AppBrand openInbox={enabled ? openInbox : undefined} unread={Boolean(rows.length)} />;
}

export function PersonalNoticeSetting() {
  const { policy } = useContext(Inbox);
  return policy?.assigned ? <><PolicySwitch policy={policy} />{policy.enabled && policy.channel && <DeviceSetting channel={policy.channel}/>}</> : null;
}
