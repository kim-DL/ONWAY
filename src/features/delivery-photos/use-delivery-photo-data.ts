"use client";

import { useCallback, useEffect, useState } from "react";

import type { AuthenticatedSession } from "@/features/auth/auth-context";

import {
  acceptDeliveryPhotoWrite, beginDeliveryPhotoRead, clearDeliveryPhotoSnapshot,
  commitDeliveryPhotoRead, deliveryPhotoDateKey, readDeliveryPhotoSnapshot,
  type DeliveryPhotoSnapshot,
} from "./delivery-photo-memory";
import { deliveryPhotoErrorKind, deliveryPhotoRepository } from "./delivery-photo-repository";

const FRESH_MS = 60_000;

export function useDeliveryPhotoData(session: AuthenticatedSession) {
  const dateKey = deliveryPhotoDateKey();
  const key = `${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}:${dateKey}`;
  const [state, setState] = useState<{ key: string; snapshot: DeliveryPhotoSnapshot | null; loading: boolean; error: string }>(() => ({
    key, snapshot: readDeliveryPhotoSnapshot(key), loading: true, error: "",
  }));
  const [attempt, setAttempt] = useState(0);
  const current = state.key === key ? state : { key, snapshot: readDeliveryPhotoSnapshot(key), loading: true, error: "" };

  useEffect(() => {
    let active = true;
    let pending = false;
    const publish = (snapshot: DeliveryPhotoSnapshot | null, error = "", loading = false) => {
      if (active) setState({ key, snapshot, loading, error });
    };
    const load = async (force = false) => {
      if (!active || pending) return;
      const cached = readDeliveryPhotoSnapshot(key);
      pending = force || !cached || Date.now() - cached.refreshedAt >= FRESH_MS;
      queueMicrotask(() => publish(cached, "", pending));
      if (!pending) return;
      const generation = beginDeliveryPhotoRead(key);
      try {
        const [route, day, today] = await Promise.all([deliveryPhotoRepository.getRoute(), deliveryPhotoRepository.getDay(), deliveryPhotoRepository.listToday()]);
        if (!active) return;
        if (day.deliveryDateKey !== today.deliveryDateKey || day.deliveryDateKey !== dateKey || dateKey !== deliveryPhotoDateKey()) throw new Error("Delivery photo date changed.");
        publish(commitDeliveryPhotoRead(key, generation, { route, day, today, refreshedAt: Date.now() }));
      } catch (error) {
        if (!active) return;
        const auth = deliveryPhotoErrorKind(error) === "auth";
        if (auth) clearDeliveryPhotoSnapshot(key);
        publish(auth ? null : readDeliveryPhotoSnapshot(key), auth
          ? "사용 권한을 확인하지 못했습니다. 다시 로그인해주세요."
          : "최신 정보를 불러오지 못했습니다.");
      } finally { pending = false; }
    };
    const resume = () => {
      if (document.visibilityState !== "visible" || navigator.onLine === false) return;
      if (dateKey !== deliveryPhotoDateKey()) setAttempt((value) => value + 1);
      else void load();
    };
    void load(attempt > 0);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    document.addEventListener("resume", resume);
    const midnight = Date.parse(`${dateKey}T00:00:00+09:00`) + 86_400_000;
    const rollover = window.setTimeout(resume, Math.max(0, midnight - Date.now()));
    return () => {
      active = false;
      window.clearTimeout(rollover);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
      document.removeEventListener("resume", resume);
    };
  }, [key, dateKey, attempt]);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  const accept = useCallback((update: (current: DeliveryPhotoSnapshot) => DeliveryPhotoSnapshot) => {
    const snapshot = acceptDeliveryPhotoWrite(key, update);
    if (snapshot) setState({ key, snapshot, loading: false, error: "" });
  }, [key]);
  const clear = useCallback(() => {
    clearDeliveryPhotoSnapshot(key);
    setState({ key, snapshot: null, loading: false, error: "" });
  }, [key]);
  return { ...current, refresh, accept, clear };
}
