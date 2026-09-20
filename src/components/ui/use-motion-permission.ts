"use client";

import { useSyncExternalStore } from "react";
import { getHeaderMotionPaused, subscribeToHeaderMotion } from "@/features/app-shell/header-motion-preference";

const listeners = new Set<() => void>();
let unsubscribe: (() => void) | null = null;
let reducedMotion: MediaQueryList | null = null;

/** Motion is enhancement only; unavailable browser APIs fall back to a still UI. */
export function getMotionAllowed(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (document.visibilityState !== "visible" || getHeaderMotionPaused()) return false;
  try {
    return !(reducedMotion ?? window.matchMedia("(prefers-reduced-motion: reduce)")).matches;
  } catch {
    return false;
  }
}

export function subscribeToMotionAllowed(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    const notify = () => { for (const callback of listeners) callback(); };
    const stopPreference = subscribeToHeaderMotion(notify);
    document.addEventListener("visibilitychange", notify);
    try { reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)"); } catch { reducedMotion = null; }
    reducedMotion?.addEventListener?.("change", notify);
    unsubscribe = () => {
      stopPreference();
      document.removeEventListener("visibilitychange", notify);
      reducedMotion?.removeEventListener?.("change", notify);
      reducedMotion = null;
    };
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) { unsubscribe?.(); unsubscribe = null; }
  };
}

const getServerSnapshot = () => false;

/** One shared subscription for loaders and photo transitions; no frame timers. */
export function useMotionAllowed() {
  return useSyncExternalStore(subscribeToMotionAllowed, getMotionAllowed, getServerSnapshot);
}
