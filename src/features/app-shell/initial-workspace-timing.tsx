"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

const InitialWorkspaceTimingContext = createContext<number | undefined>(undefined);

/** The first workspace continues launch feedback; navigation permanently retires it. */
export function InitialWorkspaceTiming({ navigationKey, startedAt, children }: {
  navigationKey: string;
  startedAt: number | undefined;
  children: ReactNode;
}) {
  const [initialKey, setInitialKey] = useState<string | null>(navigationKey);
  if (initialKey !== null && initialKey !== navigationKey) setInitialKey(null);
  return <InitialWorkspaceTimingContext.Provider value={initialKey === navigationKey ? startedAt : undefined}>
    {children}
  </InitialWorkspaceTimingContext.Provider>;
}

export function useInitialWorkspaceStartedAt(pending = true) {
  const startedAt = useContext(InitialWorkspaceTimingContext);
  const [initial, setInitial] = useState(true);
  // A retry after ready/error is a new operation even without navigation.
  if (initial && !pending) setInitial(false);
  return initial && pending ? startedAt : undefined;
}
