"use client";

import { useEffect, useState } from "react";

import { forgetPrivateBlobUrl, registerPrivateBlobUrl } from "@/features/auth/private-client-state";

type PhotoState = { key: string; status: "ready"; url: string } | { key: string; status: "error"; url: null } | null;

/** Private bytes live only for the current authenticated, visible consumer. */
export function useCustomerPhoto(customerId: string, photoId: string, sessionKey: string | null, variant: "thumbnail" | "preview", enabled: boolean) {
  const [state, setState] = useState<PhotoState>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${sessionKey}:${customerId}:${photoId}:${variant}:${attempt}`;
  useEffect(() => {
    if (!enabled || !sessionKey) return;
    let active = true;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    void import("./customer-photo-repository").then(({ customerPhotoRepository }) => customerPhotoRepository.load(customerId, photoId, { variant, signal: controller.signal }))
      .then((blob) => {
        if (!active || controller.signal.aborted) return;
        objectUrl = registerPrivateBlobUrl(URL.createObjectURL(blob));
        setState({ key, status: "ready", url: objectUrl });
      }).catch(() => {
        if (active && !controller.signal.aborted) setState({ key, status: "error", url: null });
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) forgetPrivateBlobUrl(objectUrl);
      // The same consumer can resume after going offline. Its previous URL has
      // been revoked, so it must remain a placeholder until new bytes arrive.
      setState((current) => current?.key === key ? null : current);
    };
  }, [customerId, photoId, sessionKey, variant, enabled, key]);

  const current = !enabled || !sessionKey ? { status: "idle" as const, url: null }
    : !state || state.key !== key ? { status: "loading" as const, url: null } : state;
  return { ...current, retry: () => setAttempt((value) => value + 1) };
}
