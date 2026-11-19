"use client";

import { useEffect, useState } from "react";
import type { DeliveryPhotoGalleryCursor, DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { deliveryPhotoHistoryErrorMessage } from "../delivery-photo-history-repository";
import { deliveryPhotoDateKey } from "../delivery-photo-memory";
import { deliveryPhotoErrorKind } from "../delivery-photo-repository";
import { readGalleryPage } from "./gallery-repository";

export type GalleryDay = { photos: readonly DeliveryPhotoMetadata[]; loading: boolean; error: string };
const emptyDay: GalleryDay = { photos: [], loading: true, error: "" };

// The caller keys the gallery by the authenticated session and the Seoul date.
export function useGalleryDay(session: AuthenticatedSession, today: string, date: string, enabled: boolean,
  revision: number, onDenied: () => void, customerId?: string) {
  const [day, setDay] = useState<GalleryDay>(emptyDay);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && deliveryPhotoDateKey() === today;
    const load = async () => {
      const found = new Map<string, DeliveryPhotoMetadata>();
      let cursor: DeliveryPhotoGalleryCursor | null = null;
      if (current()) setDay((previous) => ({ ...previous, loading: true, error: "" }));
      try {
        do {
          const result = await readGalleryPage(session, date, customerId, cursor, controller.signal);
          if (!current()) return;
          for (const photo of result.photos) found.set(photo.photoId, photo);
          const next = result.nextCursor;
          if (cursor && next && cursor.photoId === next.photoId) throw new Error("Gallery cursor did not advance");
          cursor = next;
          const photos = [...found.values()];
          // Keep later pages and their selected card visible until a refresh finishes.
          const ids = next ? new Set(found.keys()) : null;
          setDay((previous) => ({ photos: ids ? [...photos, ...previous.photos.filter((photo) => !ids.has(photo.photoId))] : photos,
            loading: Boolean(next), error: "" }));
        } while (cursor && current());
      } catch (error) {
        if (!current()) return;
        if (deliveryPhotoErrorKind(error) === "auth") { onDenied(); return; }
        setDay((previous) => ({ ...previous, loading: false, error: deliveryPhotoHistoryErrorMessage(error) }));
      }
    };
    void load();
    return () => controller.abort();
  }, [customerId, date, enabled, onDenied, revision, session, today]);
  return day;
}
