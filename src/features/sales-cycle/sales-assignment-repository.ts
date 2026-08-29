"use client";

import "client-only";

import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";

import { APP_METADATA } from "@/lib/app-metadata";
import { getFirebaseClientServices } from "@/lib/firebase/client";

export async function claimSalesAssignments(input: {
  cycleId: string;
  zoneId: string;
  schoolIds: string[];
}) {
  const services = getFirebaseClientServices();
  if (!services) throw new Error("Firebase is not configured.");
  return (await httpsCallable<typeof input & { requestId: string; appVersion: string }, {
    createdCount: number;
    zoneId: string;
    replayed: boolean;
  }>(services.functions, "claimSalesAssignments")({
    ...input,
    requestId: crypto.randomUUID(),
    appVersion: APP_METADATA.buildVersion,
  })).data;
}

export function salesAssignmentErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "functions/already-exists") {
      return "선택한 학교 중 일부를 다른 직원이 먼저 가져갔습니다. 최신 목록으로 다시 확인해주세요.";
    }
    if (error.code === "functions/permission-denied") {
      return error.message || "현재 담당 중인 구역에만 학교를 추가할 수 있습니다.";
    }
    if (error.code === "functions/failed-precondition") {
      return error.message || "현재 운영 중인 월과 구역을 다시 확인해주세요.";
    }
    if (error.code === "functions/resource-exhausted") {
      return "처리할 학교 수를 줄이거나 잠시 후 다시 시도해주세요.";
    }
  }
  return "담당 학교를 가져오지 못했습니다. 연결 상태를 확인해주세요.";
}
