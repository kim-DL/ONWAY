"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AuthenticatedSession } from "@/features/auth/auth-context";
import {
  readCachedSalesWorkspace,
  writeCachedSalesWorkspace,
  type CachedSalesWorkspace,
} from "./sales-workspace-cache";
import { createSalesSessionNamespace, loadSalesWorkspace } from "./sales-workspace-repository";

type SalesWorkspaceState = {
  status: "loading" | "ready" | "error";
  workspace: CachedSalesWorkspace | null;
  refreshing: boolean;
  stale: boolean;
};

export function useSalesWorkspace(session: AuthenticatedSession, cycleId?: string | null) {
  const sessionNamespace = useMemo(() => createSalesSessionNamespace(session), [session]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SalesWorkspaceState>({
    status: "loading",
    workspace: null,
    refreshing: false,
    stale: false,
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const cached = await readCachedSalesWorkspace(sessionNamespace, cycleId).catch(() => null);
      if (cancelled) return;
      if (cached) {
        setState({ status: "ready", workspace: cached, refreshing: true, stale: true });
      } else {
        setState({ status: "loading", workspace: null, refreshing: false, stale: false });
      }
      try {
        const workspace = await loadSalesWorkspace(sessionNamespace, cycleId);
        if (cancelled) return;
        setState({ status: "ready", workspace, refreshing: false, stale: false });
        await writeCachedSalesWorkspace(workspace).catch(() => undefined);
      } catch {
        if (cancelled) return;
        setState((current) => current.workspace
          ? { ...current, status: "ready", refreshing: false, stale: true }
          : { status: "error", workspace: null, refreshing: false, stale: false });
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [attempt, cycleId, sessionNamespace]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  return { ...state, retry };
}
