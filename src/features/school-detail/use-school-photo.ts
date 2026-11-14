"use client";

import { useEffect, useState } from "react";

import type { SchoolPhoto } from "@/domain/school";
import { forgetPrivateBlobUrl, registerPrivateBlobUrl } from "@/features/auth/private-client-state";
import { recordPerformanceMetric } from "@/lib/performance/performance-monitor";
import { schoolPhotoRepository } from "./school-photo-repository";
import type { PhotoVariant } from "./school-photo-cache";

export function useSchoolPhoto(
  photo: SchoolPhoto | null,
  sessionNamespace: string,
  variant: PhotoVariant,
  enabled = true,
) {
  const schoolId = photo?.schoolId;
  const slotId = photo?.slotId;
  const versionId = photo?.currentVersionId;
  const requestKey = photo ? `${sessionNamespace}:${schoolId}:${slotId}:${versionId}:${variant}` : null;
  const [state, setState] = useState<
    | { key: string; status: "ready"; url: string }
    | { key: string; status: "error"; url: null }
    | null
  >(null);

  useEffect(() => {
    if (!enabled || !schoolId || !slotId || !versionId || !requestKey) return;
    let active = true;
    let objectUrl: string | null = null;
    const startedAt = performance.now();
    void schoolPhotoRepository.getVariant({
      sessionNamespace,
      schoolId,
      slotId,
      versionId,
      variant,
    }).then(({ blob, source }) => {
      if (!active) return;
      objectUrl = registerPrivateBlobUrl(URL.createObjectURL(blob));
      setState({ key: requestKey, status: "ready", url: objectUrl });
      if (variant === "preview") {
        recordPerformanceMetric("imagePreviewDuration", startedAt, source);
      }
    }).catch(() => {
      if (active) setState({ key: requestKey, status: "error", url: null });
    });
    return () => {
      active = false;
      if (objectUrl) forgetPrivateBlobUrl(objectUrl);
      setState((current) => current?.key === requestKey ? null : current);
    };
  }, [enabled, schoolId, slotId, versionId, requestKey, sessionNamespace, variant]);
  if (!enabled || !photo || !requestKey) return { status: "idle" as const, url: null };
  if (!state || state.key !== requestKey) return { status: "loading" as const, url: null };
  return state;
}
