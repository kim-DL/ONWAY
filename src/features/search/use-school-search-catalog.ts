"use client";

import { useCallback, useEffect, useState } from "react";

import type { SchoolSearchItem } from "@/domain/catalog";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { recordPerformanceMetric } from "@/lib/performance/performance-monitor";
import {
  readRecentSchools,
  recordRecentSchool,
  type CachedCommonCatalog,
} from "./search-catalog-cache";
import {
  createSearchSessionNamespace,
  searchCatalogRepository,
  type SearchRoleScope,
} from "./search-catalog-repository";

export type SchoolSearchCatalogState =
  | { status: "loading"; catalog: null; recentSchools: SchoolSearchItem[]; refreshing: true; stale: false }
  | { status: "error"; catalog: null; recentSchools: SchoolSearchItem[]; refreshing: false; stale: false }
  | { status: "ready"; catalog: CachedCommonCatalog; recentSchools: SchoolSearchItem[]; refreshing: boolean; stale: boolean };

export function useSchoolSearchCatalog(
  session: AuthenticatedSession,
  roleScope: SearchRoleScope,
) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SchoolSearchCatalogState>({
    status: "loading",
    catalog: null,
    recentSchools: [],
    refreshing: true,
    stale: false,
  });
  const sessionNamespace = createSearchSessionNamespace(session, roleScope);

  useEffect(() => {
    let active = true;
    let cachedCatalog: CachedCommonCatalog | null = null;
    let perceivedLoadRecorded = false;
    const startedAt = performance.now();
    void Promise.resolve().then(() => {
      if (active) {
        setState({ status: "loading", catalog: null, recentSchools: [], refreshing: true, stale: false });
      }
    });

    void searchCatalogRepository.readCached(sessionNamespace)
      .then(async (cached) => {
        cachedCatalog = cached;
        if (cached && active) {
          const recentSchools = await readRecentSchools(cached.catalogNamespace, cached.items);
          if (active) {
            setState({ status: "ready", catalog: cached, recentSchools, refreshing: true, stale: false });
            recordPerformanceMetric("catalogLoadDuration", startedAt, "indexeddb");
            perceivedLoadRecorded = true;
          }
        }
        return searchCatalogRepository.refresh(sessionNamespace, cached);
      })
      .then(async (catalog) => {
        const recentSchools = await readRecentSchools(catalog.catalogNamespace, catalog.items);
        if (active) {
          setState({ status: "ready", catalog, recentSchools, refreshing: false, stale: false });
          if (!perceivedLoadRecorded) {
            recordPerformanceMetric("catalogLoadDuration", startedAt, "firestore");
            perceivedLoadRecorded = true;
          }
        }
      })
      .catch(() => {
        if (!active) return;
        if (cachedCatalog) {
          setState((current) => current.status === "ready"
            ? { ...current, refreshing: false, stale: true }
            : { status: "ready", catalog: cachedCatalog!, recentSchools: [], refreshing: false, stale: true });
        } else {
          setState({ status: "error", catalog: null, recentSchools: [], refreshing: false, stale: false });
        }
      });

    return () => {
      active = false;
    };
  }, [attempt, sessionNamespace]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  const addRecentSchool = useCallback(async (item: SchoolSearchItem) => {
    if (state.status !== "ready") return;
    await recordRecentSchool({
      sessionNamespace,
      catalogNamespace: state.catalog.catalogNamespace,
      item,
    });
    const recentSchools = await readRecentSchools(state.catalog.catalogNamespace, state.catalog.items);
    setState((current) => current.status === "ready" ? { ...current, recentSchools } : current);
  }, [sessionNamespace, state]);

  return { ...state, retry, addRecentSchool };
}
