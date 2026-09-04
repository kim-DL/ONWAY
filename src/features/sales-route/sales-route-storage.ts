"use client";

import "client-only";

import { activeSalesRouteSchema, type ActiveSalesRoute } from "./sales-route-contract";

function storageKey(sessionNamespace: string, cycleId: string) {
  return `onnuriway:private:v1:sales-route:${sessionNamespace}:${cycleId}`;
}

export function readActiveSalesRoute(sessionNamespace: string, cycleId: string) {
  try {
    const key = storageKey(sessionNamespace, cycleId);
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = activeSalesRouteSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    sessionStorage.removeItem(key);
  } catch {
    // The route can always be recalculated when private storage is unavailable.
  }
  return null;
}

export function readLatestActiveSalesRoute(sessionNamespace: string) {
  try {
    const prefix = `onnuriway:private:v1:sales-route:${sessionNamespace}:`;
    const candidates = Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith(prefix)))
      .flatMap((key) => {
        const raw = sessionStorage.getItem(key);
        if (!raw) return [];
        const parsed = activeSalesRouteSchema.safeParse(JSON.parse(raw));
        return parsed.success ? [parsed.data] : [];
      });
    return candidates.sort((left, right) => right.savedAt - left.savedAt)[0] ?? null;
  } catch {
    return null;
  }
}

export function writeActiveSalesRoute(sessionNamespace: string, cycleId: string, route: ActiveSalesRoute | null) {
  try {
    const key = storageKey(sessionNamespace, cycleId);
    if (route) sessionStorage.setItem(key, JSON.stringify(activeSalesRouteSchema.parse(route)));
    else sessionStorage.removeItem(key);
  } catch {
    // Keep the active in-memory route usable in hardened/private browser modes.
  }
}
