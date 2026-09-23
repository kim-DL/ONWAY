"use client";

import { useEffect, useState } from "react";

import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { customerRepository } from "@/features/customers/customer-repository";
import { readCustomerWorkspaceSnapshot } from "@/features/customers/customer-workspace-snapshot";

/** Uses the existing customer Memory catalog and its revalidation coordinator. */
export function useDeliveryPhotoCatalog(session: AuthenticatedSession, onSensitiveStateCleared: () => void) {
  const key = `${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}`;
  const [state, setState] = useState<{ key: string; customers: Customer[]; status: "loading" | "ready" | "error" }>(() => {
    const catalog = readCustomerWorkspaceSnapshot(key).catalog;
    return { key, customers: catalog?.customers ?? [], status: catalog ? "ready" : "loading" };
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const cached = readCustomerWorkspaceSnapshot(key).catalog;
    const unsubscribe = customerRepository.subscribe(key,
      (customers) => { if (active) setState({ key, customers, status: "ready" }); },
      (error, hadData) => {
        if (!active) return;
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        const sensitive = ["permission-denied", "unauthenticated", "failed-precondition"].some((reason) => code.endsWith(reason));
        if (sensitive) onSensitiveStateCleared();
        const retained = !sensitive && hadData ? readCustomerWorkspaceSnapshot(key).catalog?.customers ?? [] : [];
        setState({ key, customers: retained, status: retained.length ? "ready" : "error" });
      }, undefined, { hasData: Boolean(cached), forceInitial: attempt > 0 });
    return () => { active = false; unsubscribe(); };
  }, [key, attempt, onSensitiveStateCleared]);
  return { ...(state.key === key ? state : { key, customers: [] as Customer[], status: "loading" as const }),
    retry: () => setAttempt((value) => value + 1) };
}
