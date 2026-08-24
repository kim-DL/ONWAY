"use client";

import "client-only";

import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";

import { APP_METADATA } from "@/lib/app-metadata";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import {
  adminAuditSchema,
  adminEmployeeSchema,
  adminWorkspaceSchema,
  neisPreviewSchema,
  pinReservationSchema,
  rotatedPinSchema,
  type AdminRole,
} from "./admin-contract";

function functions() {
  const services = getFirebaseClientServices();
  if (!services) throw new Error("Firebase is not configured.");
  return services.functions;
}

async function call<Input, Output>(name: string, input: Input) {
  return (await httpsCallable<Input, Output>(functions(), name)(input)).data;
}

function mutationFields() {
  return { requestId: crypto.randomUUID(), appVersion: APP_METADATA.buildVersion };
}

export function adminErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    if (error.code === "functions/permission-denied") return error.message || "관리자 권한이 필요합니다.";
    if (error.code === "functions/failed-precondition") return error.message || "최신 상태를 다시 확인해주세요.";
    if (error.code === "functions/not-found") return error.message || "대상을 찾을 수 없습니다.";
    if (error.code === "functions/already-exists") return "이미 처리된 요청입니다. 최신 상태를 불러옵니다.";
    if (error.code === "functions/resource-exhausted") return "처리 범위를 줄이거나 잠시 후 다시 시도해주세요.";
  }
  return "작업을 완료하지 못했습니다. 연결을 확인하고 다시 시도해주세요.";
}

export const adminRepository = {
  async load(cycleId: string | null = null) {
    return adminWorkspaceSchema.parse(await call("getAdminWorkspace", { cycleId }));
  },

  async reservePin() {
    return pinReservationSchema.parse(await call("reserveEmployeePin", { requestId: crypto.randomUUID() }));
  },

  async createEmployee(input: {
    reservationId: string;
    displayName: string;
    roleScopes: AdminRole[];
    exportTeam: boolean;
  }) {
    return adminEmployeeSchema.parse(await call("createEmployee", { ...input, ...mutationFields() }));
  },

  async updateEmployee(input: {
    employeeId: string;
    displayName: string;
    roleScopes: AdminRole[];
    exportTeam: boolean;
    status: "active" | "disabled";
    revokeSessions: boolean;
    reason: string;
  }) {
    return adminEmployeeSchema.parse(await call("updateEmployee", { ...input, ...mutationFields() }));
  },

  async rotatePin(input: { employeeId: string; revokeSessions: boolean; reason: string }) {
    return rotatedPinSchema.parse(await call("rotateEmployeePin", { ...input, ...mutationFields() }));
  },

  async revokeSessions(input: { employeeId: string; reason: string }) {
    return call<{ employeeId: string; reason: string; requestId: string; appVersion: string }, { employeeId: string; sessionVersion: number }>(
      "revokeEmployeeSessions",
      { ...input, ...mutationFields() },
    );
  },

  async createCycle(input: { cycleId: string; copiedFromCycleId: string | null; activate: boolean }) {
    return call("createSalesCycle", { ...input, ...mutationFields() });
  },

  async createAssignment(input: { cycleId: string; schoolId: string; zoneId: string; primaryAssigneeId: string }) {
    return call("createSalesAssignments", {
      cycleId: input.cycleId,
      assignments: [{
        schoolId: input.schoolId,
        zoneId: input.zoneId,
        primaryAssigneeId: input.primaryAssigneeId,
        assigneeIds: [input.primaryAssigneeId],
      }],
      ...mutationFields(),
    });
  },

  async changeAssignment(input: {
    cycleId: string;
    schoolId: string;
    expectedRevision: number;
    zoneId: string;
    primaryAssigneeId: string;
    reason: string;
  }) {
    return call("changeSalesAssignment", {
      ...input,
      assigneeIds: [input.primaryAssigneeId],
      ...mutationFields(),
    });
  },

  async previewNeis() {
    return neisPreviewSchema.parse(await call("previewNeisSchoolSync", { requestId: crypto.randomUUID() }));
  },

  async applyNeis(input: { runId: string; approvedChangeIds: string[]; confirmRiskyChanges: boolean }) {
    return call("applyNeisSchoolSync", { ...input, requestId: crypto.randomUUID() });
  },

  async matchKakao(schoolId: string) {
    return call("matchSchoolWithKakao", { schoolId, requestId: crypto.randomUUID() });
  },

  async confirmKakao(input: {
    schoolId: string;
    expectedSchoolBaseRevision: number;
    candidateId: string | null;
    manualLocation: { latitude: number; longitude: number; name: string; roadAddress: string } | null;
  }) {
    return call("confirmKakaoMatch", { ...input, requestId: crypto.randomUUID() });
  },

  async loadAudit(limit = 100) {
    const result = await call<{ limit: number }, { logs: unknown[] }>("listAdminAuditLogs", { limit });
    return adminAuditSchema.array().parse(result.logs);
  },

  async updateSettings(input: { minimumAppVersion: string | null; maintenanceMode: boolean }) {
    return call("updatePublicAppSettings", { ...input, ...mutationFields() });
  },
};
