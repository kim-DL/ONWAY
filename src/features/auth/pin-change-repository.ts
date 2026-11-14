"use client";

import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { APP_METADATA } from "@/lib/app-metadata";
import { ensureFirebaseAppCheckReady, getFirebaseClientServices } from "@/lib/firebase/client";

export async function changeEmployeePin(input: { currentPin: string; newPin: string; requestId: string }) {
  const services = getFirebaseClientServices();
  if (!services) throw new Error("Firebase is not configured.");
  await ensureFirebaseAppCheckReady();
  const result = await httpsCallable<typeof input & { appVersion: string }, { changed: true; pinVersion: number }>(
    services.functions, "changeEmployeePin",
  )({ ...input, appVersion: APP_METADATA.buildVersion });
  if (result.data.changed !== true || !Number.isSafeInteger(result.data.pinVersion)) {
    throw new Error("PIN change was not confirmed.");
  }
}

export function pinChangeErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "functions/already-exists") {
      if ((error as FirebaseError & { details?: { reason?: string } }).details?.reason === "pin-request-collision") return "요청 내용이 달라졌습니다. PIN을 다시 입력해주세요.";
      return "이미 사용 중인 PIN입니다. 다른 번호를 입력해주세요.";
    }
    if (error.code === "functions/resource-exhausted") return "변경 시도가 많습니다. 잠시 후 다시 시도해주세요.";
    if (["functions/invalid-argument", "functions/failed-precondition", "functions/permission-denied", "functions/aborted"].includes(error.code)) {
      return error.message;
    }
    if (error.code === "functions/unauthenticated") return "로그인 상태를 확인할 수 없습니다. 연결을 확인한 뒤 다시 시도해주세요.";
  }
  return "변경 결과를 확인하지 못했습니다. 입력한 내용을 유지한 채 다시 시도해주세요.";
}
