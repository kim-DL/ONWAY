"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { getLoadingStage, subscribeToLoadingStage } from "./loading-timing";

const getServerSnapshot = () => 0 as const;

export function useLoadingStage(startedAt?: number) {
  const [mountedAt] = useState(Date.now);
  const origin = startedAt ?? mountedAt;
  const subscribe = useCallback((notify: () => void) => subscribeToLoadingStage(origin, notify), [origin]);
  const getSnapshot = useCallback(() => getLoadingStage(origin), [origin]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
