"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

// Same scoped IDs-only wire format as the existing customer recent history.
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const limit = 20;

export function deliveryPhotoRecentKey(session: AuthenticatedSession) {
  return `onnuriway:private:recent-customers:v1:${encodeURIComponent(session.uid)}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}`;
}

export function parseDeliveryPhotoRecentIds(raw: string | null): string[] {
  if (!raw || raw.length > 4096) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !idPattern.test(id))) return [];
    return [...new Set(value as string[])].slice(0, limit);
  } catch { return []; }
}

/** Loaded only with the picker; no customer records or queries reach storage. */
export function useDeliveryPhotoRecents(session: AuthenticatedSession, customers: readonly Customer[]) {
  const key = deliveryPhotoRecentKey(session);
  const [state, setState] = useState<{ key: string; ids: string[] }>({ key, ids: [] });
  const latest = useRef(state);
  const authorized = useMemo(() => new Set(customers.map((customer) => customer.customerId)), [customers]);
  const read = useCallback(() => {
    try { return parseDeliveryPhotoRecentIds(localStorage.getItem(key)); }
    catch { return latest.current.key === key ? latest.current.ids : []; }
  }, [key]);
  useEffect(() => {
    const publish = () => {
      const next = { key, ids: read() };
      latest.current = next;
      setState(next);
    };
    publish();
    const onStorage = (event: StorageEvent) => {
      try {
        if (event.storageArea === localStorage && (event.key === key || event.key === null)) publish();
      } catch { /* blocked storage keeps this picker in Memory */ }
    };
    window.addEventListener("storage", onStorage);
    return () => { window.removeEventListener("storage", onStorage); latest.current = { key, ids: [] }; };
  }, [key, read]);
  const rememberCustomer = useCallback((customerId: string) => {
    if (!authorized.has(customerId) || !idPattern.test(customerId)) return;
    const ids = [customerId, ...read().filter((id) => id !== customerId && authorized.has(id))].slice(0, limit);
    try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* memory-only fallback */ }
    latest.current = { key, ids };
    setState(latest.current);
  }, [authorized, key, read]);
  const recentCustomers = useMemo(() => {
    const byId = new Map(customers.map((customer) => [customer.customerId, customer]));
    return (state.key === key ? state.ids : []).flatMap((id) => {
      const customer = byId.get(id);
      return customer ? [customer] : [];
    });
  }, [customers, key, state]);
  return { recentCustomers, rememberCustomer };
}
