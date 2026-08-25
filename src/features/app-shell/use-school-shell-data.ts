"use client";

import { useCallback, useEffect, useState } from "react";

import type { School, SchoolFieldProfile } from "@/domain/school";
import { subscribeToShellSchools } from "./school-shell-repository";

type SchoolShellState =
  | { status: "loading"; schools: School[]; profileBySchoolId: Record<string, SchoolFieldProfile | null> }
  | { status: "ready"; schools: School[]; profileBySchoolId: Record<string, SchoolFieldProfile | null> }
  | { status: "error"; schools: School[]; profileBySchoolId: Record<string, SchoolFieldProfile | null> };

export function useSchoolShellData(enabled = true) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SchoolShellState>({ status: "loading", schools: [], profileBySchoolId: {} });

  useEffect(() => {
    if (!enabled) return;
    return subscribeToShellSchools(
      (schools, profileBySchoolId) => setState({ status: "ready", schools, profileBySchoolId }),
      () => setState((current) => ({ status: "error", schools: current.schools, profileBySchoolId: current.profileBySchoolId })),
    );
  }, [attempt, enabled]);

  const retry = useCallback(() => {
    setState((current) => ({ status: "loading", schools: current.schools, profileBySchoolId: current.profileBySchoolId }));
    setAttempt((current) => current + 1);
  }, []);
  return { ...state, retry };
}
