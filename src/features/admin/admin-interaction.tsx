"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast";

type AdminInteraction = {
  begin: () => (() => void) | null;
  canNavigate: () => boolean;
};

const Context = createContext<AdminInteraction>({ begin: () => () => {}, canNavigate: () => true });

/** Keeps an in-flight administrative change (and its one-time result) on screen. */
export function AdminInteractionProvider({ children }: { children: ReactNode }) {
  const pending = useRef<symbol | null>(null);
  const { showToast } = useToast();
  const canNavigate = useCallback(() => {
    if (!pending.current) return true;
    showToast("진행 중인 작업을 마치고 결과를 확인해주세요.");
    return false;
  }, [showToast]);
  const begin = useCallback(() => {
    if (!canNavigate()) return null;
    const operation = Symbol("admin-operation");
    pending.current = operation;
    return () => { if (pending.current === operation) pending.current = null; };
  }, [canNavigate]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!pending.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  return <Context value={{ begin, canNavigate }}>{children}</Context>;
}

export function useAdminInteraction() { return useContext(Context); }
