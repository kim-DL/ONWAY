"use client";

import { collection, doc, getDocFromServer, getDocsFromServer, limit, onSnapshot, orderBy, query, startAfter, where,
  type Firestore, type QueryDocumentSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import type { InventoryLocation } from "@/domain/inventory";
import { NOTICE_FEED_PATH, NOTICE_POLICY_PATH, NOTICE_WINDOW, type NoticeCommand } from "../../../functions/src/inventory/inventory-notification-contract";

export type NoticePolicy = { assigned: boolean; enabled: boolean; revision: number; channel: string | null; readTime: number; readId: string };
export type InventoryNotice = {
  id: string; productId: string; productName: string; locationId: InventoryLocation; unitLabel: string;
  kind: "receive" | "issue" | "adjust"; delta: number; stockRevision: number; createdAt: number;
};
export type InboxSnapshot = { policy: NoticePolicy | null; rows: InventoryNotice[]; recentChanges: InventoryNotice[]; ready: boolean; failed: boolean };
export const emptyInbox: InboxSnapshot = { policy: null, rows: [], recentChanges: [], ready: false, failed: false };

function noticeQuery(db: Firestore, channel: string) {
  return query(collection(db, NOTICE_FEED_PATH), where("audience", "array-contains", channel), orderBy("createdAt", "desc"), limit(NOTICE_WINDOW));
}

function noticeRow(item: QueryDocumentSnapshot): InventoryNotice {
  const data = item.data();
  return { id: item.id, productId: data.productId, productName: data.productName, delta: data.delta,
    kind: data.kind ?? "adjust", locationId: data.locationId, unitLabel: data.unitLabel, stockRevision: data.stockRevision, createdAt: data.createdAt.seconds * 1000 + data.createdAt.nanoseconds / 1_000_000 };
}

export function unread(row: InventoryNotice, policy: NoticePolicy) {
  return row.createdAt > policy.readTime ||
    (row.createdAt === policy.readTime && row.id > policy.readId);
}

export async function acknowledgeInbox(channel: string, noticeId: string) {
  const services = getFirebaseClientServices();
  if (!services?.auth.currentUser) throw Error("로그인이 필요합니다.");
  await httpsCallable(services.functions, "acknowledgeInventoryInbox")({channel, noticeId});
}

export async function olderNotices(channel: string, afterId: string, policy: NoticePolicy) {
  const services = getFirebaseClientServices();
  const uid = services?.auth.currentUser?.uid;
  if (!services || !uid) throw new Error("로그인 상태를 확인해주세요.");
  const cursor = await getDocFromServer(doc(services.firestore, NOTICE_FEED_PATH, afterId));
  if (!cursor.exists()) throw new Error("알림을 다시 불러와주세요.");
  const page = await getDocsFromServer(query(noticeQuery(services.firestore, channel), startAfter(cursor)));
  if (uid !== services.auth.currentUser?.uid) throw new Error("로그인 상태를 확인해주세요.");
  return page.docs.map(noticeRow).filter(row => unread(row, policy));
}

export function watchNoticePolicy(employeeId: string, receive: (value: NoticePolicy | null, failed?: boolean) => void) {
  const services = getFirebaseClientServices();
  const uid = services?.auth.currentUser?.uid;
  if (!services || !uid) { receive(null, true); return () => {}; }
  return onSnapshot(doc(services.firestore, NOTICE_POLICY_PATH, employeeId), { includeMetadataChanges: true }, snapshot => {
    if (services.auth.currentUser?.uid !== uid || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
      receive(null); return;
    }
    const data = snapshot.data();
    receive({ assigned: data?.assigned === true, enabled: data?.enabled !== false, revision: data?.revision ?? 0,
      readTime: data?.readTime ?? 0, readId: data?.readId ?? "", channel: typeof data?.channel === "string" ? data.channel : null });
  }, () => receive(null, true));
}

// Each active interval starts with a server-confirmed baseline. A cache frame,
// tab restore or reconnect invalidates both the previous baseline and its card.
export function watchInbox(employeeId: string, receive: (snapshot: InboxSnapshot, fresh: InventoryNotice[] | null) => void) {
  let stopPolicy: (() => void) | undefined;
  let stopFeed: (() => void) | undefined;
  let generation = 0;
  let feedGeneration = 0;
  const restart = () => {
    const current = ++generation;
    stopFeed?.(); stopPolicy?.();
    receive(emptyInbox, null);
    if (!navigator.onLine || document.visibilityState === "hidden") return;
    let activePolicy: NoticePolicy | null = null;
    let confirmedRows: InventoryNotice[] | null = null;
    stopPolicy = watchNoticePolicy(employeeId, (policy, failed = false) => {
      if (current !== generation) return;
      if (policy?.assigned && policy.enabled && policy.channel && policy.channel === activePolicy?.channel) {
        activePolicy = policy;
        if (confirmedRows) receive({ policy, recentChanges: confirmedRows, rows: confirmedRows.filter(row => unread(row, policy)), ready: true, failed: false }, null);
        return;
      }
      activePolicy = policy?.assigned && policy.enabled ? policy : null;
      confirmedRows = null;
      const feed = ++feedGeneration;
      stopFeed?.();
      const base = { ...emptyInbox, policy, failed };
      receive(base, null);
      const services = getFirebaseClientServices();
      if (!policy?.assigned || !policy.enabled || !policy.channel || !services) return;
      const uid = services.auth.currentUser?.uid;
      const q = noticeQuery(services.firestore, policy.channel);
      let previous: { ids: Set<string>; newest: number } | null = null;
      const active = () => current === generation && feed === feedGeneration;
      stopFeed = onSnapshot(q, { includeMetadataChanges: true }, snapshot => {
        if (!active() || !activePolicy) return;
        const policy = activePolicy;
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites || uid !== services.auth.currentUser?.uid) {
          previous = null;
          confirmedRows = null;
          receive(base, null); return;
        }
        confirmedRows = snapshot.docs.map(noticeRow);
        const rows = confirmedRows.filter(row => unread(row, policy));
        const seen = previous;
        const fresh = seen ? rows.filter(row => row.createdAt >= seen.newest && !seen.ids.has(row.id)) : null;
        previous = { ids: new Set(rows.map(row => row.id)), newest: Math.max(seen?.newest ?? 0, rows[0]?.createdAt ?? 0) };
        receive({ policy, rows, recentChanges: confirmedRows, ready: true, failed: false }, fresh);
      }, () => { if (active()) receive({ ...base, failed: true }, null); });
    });
  };
  restart();
  window.addEventListener("offline", restart);
  window.addEventListener("online", restart);
  window.addEventListener("pageshow", restart);
  document.addEventListener("visibilitychange", restart);
  return () => {
    ++generation;
    stopFeed?.(); stopPolicy?.();
    window.removeEventListener("offline", restart);
    window.removeEventListener("online", restart);
    window.removeEventListener("pageshow", restart);
    document.removeEventListener("visibilitychange", restart);
  };
}

export async function saveNoticePolicy(input: NoticeCommand) {
  const services = getFirebaseClientServices();
  if (!services?.auth.currentUser) throw new Error("로그인 상태를 확인해주세요.");
  const name = "assigned" in input ? "assignInventoryNoticeRecipient" : "setInventoryNoticePreference";
  await httpsCallable(services.functions, name)(input);
}
