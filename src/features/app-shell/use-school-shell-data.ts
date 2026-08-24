"use client";

import { useCallback, useEffect, useState } from "react";

import type { School } from "@/domain/school";
import { subscribeToShellSchools } from "./school-shell-repository";

type SchoolShellState =
  | { status: "loading"; schools: School[] }
  | { status: "ready"; schools: School[] }
  | { status: "error"; schools: School[] };

export function useSchoolShellData(enabled = true) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SchoolShellState>({ status: "loading", schools: [] });

  useEffect(() => {
    if (!enabled) return;
    return subscribeToShellSchools(
      (schools) => setState({ status: "ready", schools }),
      () => setState((current) => ({ status: "error", schools: current.schools })),
    );
  }, [attempt, enabled]);

  const retry = useCallback(() => {
    setState((current) => ({ status: "loading", schools: current.schools }));
    setAttempt((current) => current + 1);
  }, []);
  return { ...state, retry };
}
