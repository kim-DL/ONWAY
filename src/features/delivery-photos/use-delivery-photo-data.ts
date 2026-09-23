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
  const key = `${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}:${deliveryPhotoDateKey()}`;
  const [state, setState] = useState<{ key: string; snapshot: DeliveryPhotoSnapshot | null; loading: boolean; error: string }>(() => ({
    key, snapshot: readDeliveryPhotoSnapshot(key), loading: true, error: "",
  }));
  const [attempt, setAttempt] = useState(0);
  const current = state.key === key ? state : { key, snapshot: readDeliveryPhotoSnapshot(key), loading: true, error: "" };

  useEffect(() => {
    let active = true;
    const cached = readDeliveryPhotoSnapshot(key);
    if (cached && attempt === 0 && Date.now() - cached.refreshedAt < FRESH_MS) {
      queueMicrotask(() => { if (active) setState({ key, snapshot: cached, loading: false, error: "" }); });
      return () => { active = false; };
    }
    const generation = beginDeliveryPhotoRead(key);
    queueMicrotask(() => { if (active) setState({ key, snapshot: cached, loading: true, error: "" }); });
    void Promise.all([deliveryPhotoRepository.getRoute(), deliveryPhotoRepository.getDay(), deliveryPhotoRepository.listToday()])
      .then(([route, day, today]) => {
        if (!active) return;
        if (day.deliveryDateKey !== today.deliveryDateKey || day.deliveryDateKey !== deliveryPhotoDateKey()) throw new Error("Delivery photo date changed.");
        const snapshot = commitDeliveryPhotoRead(key, generation, { route, day, today, refreshedAt: Date.now() });
        setState({ key, snapshot, loading: false, error: "" });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const auth = deliveryPhotoErrorKind(error) === "auth";
        if (auth) clearDeliveryPhotoSnapshot(key);
        setState({ key, snapshot: auth ? null : readDeliveryPhotoSnapshot(key), loading: false, error: auth
          ? "사용 권한을 확인하지 못했습니다. 다시 로그인해주세요."
          : "최신 정보를 불러오지 못했습니다." });
      });
    return () => { active = false; };
  }, [key, attempt]);

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
