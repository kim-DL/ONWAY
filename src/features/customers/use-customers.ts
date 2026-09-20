"use client";

import { useEffect, useState } from "react";

import type { Customer } from "@/domain/customer";
import type { AuthenticatedSession } from "@/features/auth/auth-context";

import { customerErrorMessage, customerRepository } from "./customer-repository";

type CustomerState = { key: string; status: "loading" | "ready" | "error"; customers: Customer[]; message: string; canRetainDraft: boolean };

export function useCustomers(session: AuthenticatedSession, onSensitiveStateCleared?: () => void) {
  const key = `${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}`;
  const [state, setState] = useState<CustomerState>({ key, status: "loading", customers: [], message: "", canRetainDraft: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const offline = () => {
      if (!active) return;
      onSensitiveStateCleared?.();
      setState({ key, status: "error", customers: [], message: "거래처 정보는 인터넷 연결 후 확인할 수 있어요.", canRetainDraft: false });
    };
    const unsubscribe = customerRepository.subscribe((customers) => {
      if (!active) return;
      if (!navigator.onLine) { offline(); return; }
      setState({ key, status: "ready", customers, message: "", canRetainDraft: true });
    }, (error) => {
      if (!active) return;
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      const canRetainDraft = navigator.onLine && !["permission-denied", "unauthenticated", "failed-precondition"].some((reason) => code.endsWith(reason));
      if (!canRetainDraft) onSensitiveStateCleared?.();
      setState({ key, status: "error", customers: [], message: customerErrorMessage(error), canRetainDraft });
    });
    window.addEventListener("offline", offline);
    if (!navigator.onLine) offline();
    return () => { active = false; unsubscribe(); window.removeEventListener("offline", offline); };
  }, [key, attempt, onSensitiveStateCleared]);
  const current = state.key === key ? state : { key, status: "loading" as const, customers: [], message: "", canRetainDraft: false };
  return { ...current, retry: () => {
    setState({ key, status: "loading", customers: [], message: "", canRetainDraft: false });
    setAttempt((previous) => previous + 1);
  } };
}
