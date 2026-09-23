"use client";

import { useEffect, useState } from "react";

import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { forgetPrivateBlobUrl, registerPrivateBlobUrl } from "@/features/auth/private-client-state";

import {
  deliveryPhotoHistoryErrorMessage,
  deliveryPhotoHistoryRepository,
  type DeliveryPhotoDownloadVariant,
} from "./delivery-photo-history-repository";

type ImageState = { key: string; status: "ready"; url: string } | { key: string; status: "error"; url: null; message: string } | null;

export function useDeliveryPhotoImage(photoId: string, variant: DeliveryPhotoDownloadVariant, session: AuthenticatedSession, enabled = true) {
  const [state, setState] = useState<ImageState>(null);
  const [attempt, setAttempt] = useState(0);
  const sessionKey = `${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}`;
  const key = `${sessionKey}:${photoId}:${variant}:${attempt}`;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let ownedUrl: string | null = null;
    const controller = new AbortController();
    void deliveryPhotoHistoryRepository.load(photoId, variant, session, controller.signal).then((blob) => {
      if (!active || controller.signal.aborted) return;
      const url = registerPrivateBlobUrl(URL.createObjectURL(blob));
      if (!active || controller.signal.aborted) { forgetPrivateBlobUrl(url); return; }
      ownedUrl = url;
      setState({ key, status: "ready", url });
    }).catch((error: unknown) => {
      if (active && !controller.signal.aborted) setState({ key, status: "error", url: null, message: deliveryPhotoHistoryErrorMessage(error) });
    });
    return () => {
      active = false;
      controller.abort();
      if (ownedUrl) forgetPrivateBlobUrl(ownedUrl);
    };
  }, [enabled, key, photoId, session, variant]);

  const current = !enabled ? { status: "idle" as const, url: null }
    : !state || state.key !== key ? { status: "loading" as const, url: null } : state;
  return {
    ...current,
    retry: () => setAttempt((value) => value + 1),
    fail: () => setState((value) => {
      if (!value || value.key !== key || value.status !== "ready") return value;
      forgetPrivateBlobUrl(value.url);
      return { key, status: "error", url: null, message: "사진을 표시하지 못했어요. 다시 불러와주세요." };
    }),
  };
}
