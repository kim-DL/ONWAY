"use client";

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

import { createRecentCustomerHistoryStore, recentCustomerStorageKey, resolveRecentCustomers } from "./recent-customer-history";

export function useRecentCustomers(session: AuthenticatedSession, customers: readonly Customer[]) {
  const key = recentCustomerStorageKey(session);
  const store = useMemo(() => createRecentCustomerHistoryStore(key), [key]);
  const authorizedIds = useMemo(() => new Set(customers.map((customer) => customer.customerId)), [customers]);
  const current = useRef<{ store: typeof store; authorizedIds: ReadonlySet<string> } | null>(null);

  useEffect(() => {
    current.current = { store, authorizedIds };
    return () => { current.current = null; };
  }, [store, authorizedIds]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const recentCustomers = useMemo(() => resolveRecentCustomers(snapshot.ids, customers), [snapshot.ids, customers]);
  const rememberCustomer = useCallback((customerId: string) => {
    if (current.current?.store === store) store.remember(customerId, current.current.authorizedIds);
  }, [store]);
  const clearRecentCustomers = useCallback(() => {
    if (current.current?.store === store) store.clear();
  }, [store]);

  return { recentCustomers, rememberCustomer, clearRecentCustomers, ready: snapshot.ready };
}
