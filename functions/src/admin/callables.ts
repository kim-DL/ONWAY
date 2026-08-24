import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { pinLookupSecret, pinPepper } from "../auth/callables.js";
import { getAdminAuth, getAdminFirestore } from "../shared/firebase-admin.js";
import { requireGoogleIdentity, requireVerifiedAdmin } from "./admin-authorization.js";
import {
  activateAdminSessionInputSchema,
  createEmployeeInputSchema,
  getAdminWorkspaceInputSchema,
  listAdminAuditLogsInputSchema,
  reserveEmployeePinInputSchema,
  revokeEmployeeSessionsInputSchema,
  rotateEmployeePinInputSchema,
  updateEmployeeInputSchema,
  updatePublicAppSettingsInputSchema,
} from "./admin-contract.js";
import {
  AdminConflictError,
  AdminNotFoundError,
  AdminPermissionError,
  AdminPinReservationError,
  AdminService,
} from "./admin-service.js";

function isFunctionsEmulator() {
  return process.env.FUNCTIONS_EMULATOR === "true";
}

function service() {
  return new AdminService({
    db: getAdminFirestore(),
    auth: getAdminAuth(),
    lookupSecret: pinLookupSecret.value(),
    pinPepper: pinPepper.value(),
  });
}

function mapError(error: unknown) {
  if (error instanceof AdminPermissionError) return new HttpsError("permission-denied", error.message);
  if (error instanceof AdminNotFoundError) return new HttpsError("not-found", error.message);
  if (error instanceof AdminConflictError) return new HttpsError("failed-precondition", error.message);
  if (error instanceof AdminPinReservationError) return new HttpsError("failed-precondition", error.message);
  if (error instanceof z.ZodError) return new HttpsError("failed-precondition", "저장된 관리자 데이터 계약이 올바르지 않습니다.");
  return null;
}

const options = {
  enforceAppCheck: !isFunctionsEmulator(),
  maxInstances: 10,
  region: "asia-northeast3" as const,
  secrets: isFunctionsEmulator() ? [] : [pinLookupSecret, pinPepper],
};

async function run<T>(name: string, action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    const mapped = mapError(error);
    if (mapped) throw mapped;
    logger.error(`Admin operation failed: ${name}`, { error });
    throw new HttpsError("internal", "관리자 작업을 완료하지 못했습니다.");
  }
}

export const activateAdminSession = onCall(options, async (request) => {
  const parsed = activateAdminSessionInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "앱 정보를 확인해주세요.");
  const identity = requireGoogleIdentity(request);
  return run("activateAdminSession", () => service().activateGoogleAdmin({
    ...identity,
    appVersion: parsed.data.appVersion,
  }));
});

export const getAdminWorkspace = onCall(options, async (request) => {
  const parsed = getAdminWorkspaceInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "관리자 조회 조건을 확인해주세요.");
  await requireVerifiedAdmin(request);
  return run("getAdminWorkspace", () => service().workspace(parsed.data.cycleId));
});

export const reserveEmployeePin = onCall(options, async (request) => {
  const parsed = reserveEmployeePinInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "PIN 생성 요청을 확인해주세요.");
  const actor = await requireVerifiedAdmin(request);
  return run("reserveEmployeePin", () => service().reservePin(parsed.data.requestId, actor));
});

export const createEmployee = onCall(options, async (request) => {
  const parsed = createEmployeeInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "직원 등록 정보를 확인해주세요.");
  const actor = await requireVerifiedAdmin(request);
  return run("createEmployee", () => service().createEmployee(parsed.data, actor));
});

export const updateEmployee = onCall(options, async (request) => {
  const parsed = updateEmployeeInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "직원 수정 정보를 확인해주세요.");
  const actor = await requireVerifiedAdmin(request);
  return run("updateEmployee", () => service().updateEmployee(parsed.data, actor));
});

export const rotateEmployeePin = onCall(options, async (request) => {
  const parsed = rotateEmployeePinInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "PIN 변경 정보를 확인해주세요.");
  const actor = await requireVerifiedAdmin(request);
  return run("rotateEmployeePin", () => service().rotatePin(parsed.data, actor));
});

export const revokeEmployeeSessions = onCall(options, async (request) => {
  const parsed = revokeEmployeeSessionsInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "세션 종료 정보를 확인해주세요.");
  const actor = await requireVerifiedAdmin(request);
  return run("revokeEmployeeSessions", () => service().revokeSessions(parsed.data, actor));
});

export const listAdminAuditLogs = onCall(options, async (request) => {
  const parsed = listAdminAuditLogsInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "감사 기록 조회 범위를 확인해주세요.");
  await requireVerifiedAdmin(request);
  return run("listAdminAuditLogs", () => service().listAuditLogs(parsed.data.limit));
});

export const updatePublicAppSettings = onCall(options, async (request) => {
  const parsed = updatePublicAppSettingsInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "앱 설정을 확인해주세요.");
  const actor = await requireVerifiedAdmin(request);
  return run("updatePublicAppSettings", () => service().updateSettings(parsed.data, actor));
});
