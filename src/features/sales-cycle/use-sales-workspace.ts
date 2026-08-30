"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AuthenticatedSession } from "@/features/auth/auth-context";
import {
  readCachedSalesWorkspace,
  writeCachedSalesWorkspace,
  type CachedSalesWorkspace,
} from "./sales-workspace-cache";
import {
  createSalesSessionNamespace,
  loadSalesWorkspace,
  SalesWorkspaceSetupRequiredError,
} from "./sales-workspace-repository";

export type SalesWorkspaceIssue = "setup-required" | "unavailable";

type SalesWorkspaceState = {
  status: "loading" | "ready" | "error";
  workspace: CachedSalesWorkspace | null;
  refreshing: boolean;
  stale: boolean;
  issue: SalesWorkspaceIssue | null;
};

export function useSalesWorkspace(session: AuthenticatedSession, cycleId?: string | null) {
  const sessionNamespace = useMemo(() => createSalesSessionNamespace(session), [session]);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SalesWorkspaceState>({
    status: "loading",
    workspace: null,
    refreshing: false,
    stale: false,
    issue: null,
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const cached = await readCachedSalesWorkspace(sessionNamespace, cycleId).catch(() => null);
      if (cancelled) return;
      if (cached) {
        setState({ status: "ready", workspace: cached, refreshing: true, stale: true, issue: null });
      } else {
        setState({ status: "loading", workspace: null, refreshing: false, stale: false, issue: null });
      }
      try {
        const workspace = await loadSalesWorkspace(sessionNamespace, cycleId);
        if (cancelled) return;
        setState({ status: "ready", workspace, refreshing: false, stale: false, issue: null });
        await writeCachedSalesWorkspace(workspace).catch(() => undefined);
      } catch (error) {
        if (cancelled) return;
        setState((current) => current.workspace
          ? { ...current, status: "ready", refreshing: false, stale: true, issue: "unavailable" }
          : {
              status: "error",
              workspace: null,
              refreshing: false,
              stale: false,
              issue: error instanceof SalesWorkspaceSetupRequiredError ? "setup-required" : "unavailable",
            });
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [attempt, cycleId, sessionNamespace]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  return { ...state, retry };
}
