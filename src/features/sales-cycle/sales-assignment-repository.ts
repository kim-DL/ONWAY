"use client";

import "client-only";

import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";

import { APP_METADATA } from "@/lib/app-metadata";
import { getFirebaseClientServices } from "@/lib/firebase/client";

export async function claimSalesAssignments(input: {
  cycleId: string;
  schoolIds: string[];
}) {
  const services = getFirebaseClientServices();
  if (!services) throw new Error("Firebase is not configured.");
  return (await httpsCallable<typeof input & { requestId: string; appVersion: string }, {
    createdCount: number;
    zoneId: string | null;
    replayed: boolean;
  }>(services.functions, "claimSalesAssignments")({
    ...input,
    requestId: crypto.randomUUID(),
    appVersion: APP_METADATA.buildVersion,
  })).data;
}

export async function releaseSalesAssignments(input: {
  cycleId: string;
  schoolIds: string[];
  reason: string;
}) {
  const services = getFirebaseClientServices();
  if (!services) throw new Error("Firebase is not configured.");
  return (await httpsCallable<typeof input & { requestId: string; appVersion: string }, {
    removedCount: number;
    replayed: boolean;
  }>(services.functions, "releaseSalesAssignments")({
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
      return error.message || "담당 학교를 변경할 권한이 없습니다.";
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

export function salesAssignmentReleaseErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "functions/permission-denied") {
      return error.message || "자신이 단독 담당하는 학교만 제외할 수 있습니다.";
    }
    if (error.code === "functions/failed-precondition") {
      return error.message || "업무 기록이 있는 학교는 관리자에게 담당 변경을 요청해주세요.";
    }
    if (error.code === "functions/not-found") {
      return "이미 제외되었거나 담당 정보가 변경되었습니다.";
    }
  }
  return "담당 학교에서 제외하지 못했습니다. 연결 상태를 확인해주세요.";
}
