"use client";

import { useEffect, useState } from "react";

import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import type { RevalidationFreshness } from "@/lib/revalidation-coordinator";

import { customerErrorMessage, customerRepository } from "./customer-repository";
import {
  acceptCustomerWorkspaceWrite, discardCustomerWorkspaceCatalog, readCustomerWorkspaceSnapshot,
} from "./customer-workspace-snapshot";

type CustomerState = { key: string; status: "loading" | "ready" | "error"; customers: Customer[]; message: string; canRetainDraft: boolean; freshness: RevalidationFreshness; lastSuccessAt: number | null };

export function useCustomers(session: AuthenticatedSession, onSensitiveStateCleared?: () => void) {
  const key = `${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}`;
  const initialCatalog = readCustomerWorkspaceSnapshot(key).catalog;
  const [state, setState] = useState<CustomerState>(initialCatalog
    ? { key, status: "ready", customers: initialCatalog.customers, message: "", canRetainDraft: true, freshness: initialCatalog.freshness, lastSuccessAt: initialCatalog.lastSuccessAt }
    : { key, status: "loading", customers: [], message: "", canRetainDraft: false, freshness: "idle", lastSuccessAt: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const hasSnapshot = readCustomerWorkspaceSnapshot(key).catalog !== null;
    const offline = () => {
      if (!active) return;
      onSensitiveStateCleared?.();
      discardCustomerWorkspaceCatalog(key);
      setState({ key, status: "error", customers: [], message: "거래처 정보는 인터넷 연결 후 확인할 수 있어요.", canRetainDraft: false, freshness: "idle", lastSuccessAt: null });
    };
    const unsubscribe = customerRepository.subscribe(key, (customers, refreshedAt) => {
      if (!active) return;
      if (!navigator.onLine) { offline(); return; }
      setState({ key, status: "ready", customers, message: "", canRetainDraft: true, freshness: "fresh", lastSuccessAt: refreshedAt });
    }, (error, hadData) => {
      if (!active) return;
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      const canRetainDraft = navigator.onLine && !["permission-denied", "unauthenticated", "failed-precondition"].some((reason) => code.endsWith(reason));
      if (!canRetainDraft) { discardCustomerWorkspaceCatalog(key); onSensitiveStateCleared?.(); }
      setState((current) => canRetainDraft && (hadData || current.customers.length > 0) && current.key === key
        ? { ...current, status: "ready", message: "", canRetainDraft, freshness: "stale-error" }
        : { key, status: "error", customers: [], message: customerErrorMessage(error), canRetainDraft, freshness: "idle", lastSuccessAt: null });
    }, (freshness) => {
      if (!active) return;
      setState((current) => current.key === key && current.status === "ready"
        ? { ...current, freshness: freshness.status, lastSuccessAt: freshness.lastSuccessAt ?? current.lastSuccessAt }
        : current);
    }, { hasData: hasSnapshot, forceInitial: attempt > 0 });
    window.addEventListener("offline", offline);
    if (!navigator.onLine) offline();
    return () => { active = false; unsubscribe(); window.removeEventListener("offline", offline); };
  }, [key, attempt, onSensitiveStateCleared]);
  const current = state.key === key ? state : { key, status: "loading" as const, customers: [], message: "", canRetainDraft: false, freshness: "idle" as const, lastSuccessAt: null };
  return { ...current, accept: (customer: Customer) => {
    acceptCustomerWorkspaceWrite(key, customer);
    setState((existing) => existing.key === key && existing.status === "ready"
      ? { ...existing, customers: existing.customers.some((item) => item.customerId === customer.customerId)
        ? existing.customers.map((item) => item.customerId === customer.customerId ? customer : item)
        : [...existing.customers, customer] }
      : existing);
  }, retry: () => {
    setState((current) => current.key === key && current.customers.length > 0
      ? { ...current, freshness: "refreshing", message: "" }
      : { key, status: "loading", customers: [], message: "", canRetainDraft: false, freshness: "idle", lastSuccessAt: null });
    setAttempt((previous) => previous + 1);
  } };
}
