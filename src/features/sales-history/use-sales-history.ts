"use client";

import { useCallback, useEffect, useState } from "react";

import type { SalesVisit } from "@/domain/sales";
import type { SalesHistoryCursor } from "./sales-history-contract";
import { mergeVisitPages } from "./sales-history-pages";
import { salesHistoryRepository } from "./sales-history-repository";

type SalesHistoryState =
  | { status: "loading"; visits: SalesVisit[]; cursor: null; hasMore: false; loadingMore: false }
  | { status: "error"; visits: SalesVisit[]; cursor: null; hasMore: false; loadingMore: false }
  | { status: "ready"; visits: SalesVisit[]; cursor: SalesHistoryCursor | null; hasMore: boolean; loadingMore: boolean };

const INITIAL_STATE: SalesHistoryState = {
  status: "loading",
  visits: [],
  cursor: null,
  hasMore: false,
  loadingMore: false,
};

export function useSalesHistory(schoolId: string, refreshKey: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SalesHistoryState>(INITIAL_STATE);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) setState(INITIAL_STATE);
    });
    void salesHistoryRepository.loadPage(schoolId)
      .then((page) => {
        if (!active) return;
        setState({ status: "ready", ...page, loadingMore: false });
      })
      .catch(() => {
        if (active) setState({ status: "error", visits: [], cursor: null, hasMore: false, loadingMore: false });
      });
    return () => {
      active = false;
    };
  }, [attempt, refreshKey, schoolId]);

  const refresh = useCallback(() => setAttempt((current) => current + 1), []);
  const loadMore = useCallback(async () => {
    if (state.status !== "ready" || !state.hasMore || state.loadingMore || !state.cursor) return;
    setState((current) => current.status === "ready" ? { ...current, loadingMore: true } : current);
    try {
      const page = await salesHistoryRepository.loadPage(schoolId, state.cursor);
      setState((current) => current.status === "ready" ? {
        status: "ready",
        visits: mergeVisitPages(current.visits, page.visits),
        cursor: page.cursor,
        hasMore: page.hasMore,
        loadingMore: false,
      } : current);
    } catch {
      setState((current) => current.status === "ready" ? { ...current, loadingMore: false } : current);
      throw new Error("방문 이력을 더 불러오지 못했습니다.");
    }
  }, [schoolId, state]);

  return { ...state, refresh, loadMore };
}
