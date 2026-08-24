"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { School } from "@/domain/school";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { recordPerformanceMetric } from "@/lib/performance/performance-monitor";
import { peekCachedSchoolDetail, type CachedSchoolDetail } from "./school-detail-cache";
import {
  createSchoolDetailSessionNamespace,
  schoolDetailRepository,
  type DetailRoleScope,
} from "./school-detail-repository";

export type SchoolDetailState =
  | { status: "loading"; detail: null; refreshing: true; stale: false; source: null }
  | { status: "error"; detail: null; refreshing: false; stale: false; source: null }
  | {
      status: "ready";
      detail: CachedSchoolDetail;
      refreshing: boolean;
      stale: boolean;
      source: "memory" | "indexeddb" | "network";
    };

export function useSchoolDetail(
  initialSchool: School,
  session: AuthenticatedSession,
  roleScope: DetailRoleScope,
) {
  const sessionNamespace = useMemo(
    () => createSchoolDetailSessionNamespace(session, roleScope),
    [roleScope, session],
  );
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SchoolDetailState>(() => {
    const memoryDetail = peekCachedSchoolDetail(sessionNamespace, initialSchool.schoolId);
    return memoryDetail
      ? { status: "ready", detail: memoryDetail, refreshing: true, stale: false, source: "memory" }
      : { status: "loading", detail: null, refreshing: true, stale: false, source: null };
  });

  useEffect(() => {
    let active = true;
    let cachedDetail: CachedSchoolDetail | null = null;
    let perceivedLoadRecorded = false;
    const startedAt = performance.now();
    void Promise.resolve().then(() => {
      if (active) setState((current) => current.status === "ready"
        ? { ...current, refreshing: true, stale: false }
        : { status: "loading", detail: null, refreshing: true, stale: false, source: null });
    });

    void schoolDetailRepository.readCached(sessionNamespace, initialSchool.schoolId)
      .then((cached) => {
        cachedDetail = cached?.detail ?? null;
        if (cached && active) {
          setState({
            status: "ready",
            detail: cached.detail,
            refreshing: true,
            stale: false,
            source: cached.source,
          });
          recordPerformanceMetric("schoolDetailDuration", startedAt, cached.source);
          perceivedLoadRecorded = true;
        }
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          if (cached && active) {
            setState({
              status: "ready",
              detail: cached.detail,
              refreshing: false,
              stale: true,
              source: cached.source,
            });
          }
          if (!cached) throw new Error("School detail is not cached for offline use.");
          return null;
        }
        return schoolDetailRepository.refresh(sessionNamespace, initialSchool.schoolId, roleScope);
      })
      .then((detail) => {
        if (detail && active) {
          setState({ status: "ready", detail, refreshing: false, stale: false, source: "network" });
          if (!perceivedLoadRecorded) {
            recordPerformanceMetric("schoolDetailDuration", startedAt, "firestore");
            perceivedLoadRecorded = true;
          }
        }
      })
      .catch(() => {
        if (!active) return;
        if (cachedDetail) {
          setState((current) => current.status === "ready"
            ? { ...current, refreshing: false, stale: true }
            : { status: "ready", detail: cachedDetail!, refreshing: false, stale: true, source: "indexeddb" });
        } else {
          setState({ status: "error", detail: null, refreshing: false, stale: false, source: null });
        }
      });

    return () => {
      active = false;
    };
  }, [attempt, initialSchool.schoolId, roleScope, sessionNamespace]);

  const refresh = useCallback(() => setAttempt((current) => current + 1), []);
  useEffect(() => {
    window.addEventListener("online", refresh);
    return () => window.removeEventListener("online", refresh);
  }, [refresh]);
  return { ...state, refresh, initialSchool, sessionNamespace };
}
