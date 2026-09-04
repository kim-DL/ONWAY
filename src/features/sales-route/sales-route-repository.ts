"use client";

import "client-only";

import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";

import { getFirebaseClientServices } from "@/lib/firebase/client";
import { salesRouteResultSchema, type SalesRouteResult } from "./sales-route-contract";

export async function optimizeSalesRoute(input: {
  cycleId: string;
  schoolIds: string[];
  startSchoolId: string;
}): Promise<SalesRouteResult> {
  const services = getFirebaseClientServices();
  if (!services) throw new Error("Firebase is not configured.");
  const response = await httpsCallable<typeof input, unknown>(services.functions, "optimizeSalesRoute")(input);
  return salesRouteResultSchema.parse(response.data);
}

export function salesRouteErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "functions/permission-denied") {
      return "내 담당 학교만 방문 동선에 포함할 수 있어요.";
    }
    if (error.code === "functions/failed-precondition") {
      return error.message || "현재 월과 학교 위치를 다시 확인해주세요.";
    }
    if (error.code === "functions/not-found") {
      return "담당 학교 정보가 변경됐어요. 목록을 새로 확인해주세요.";
    }
    if (error.code === "functions/resource-exhausted") {
      return "요청이 많아 잠시 쉬고 있어요. 잠시 후 다시 계산해주세요.";
    }
  }
  return "동선을 계산하지 못했어요. 연결을 확인한 뒤 다시 시도해주세요.";
}

