import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { requireVerifiedAdmin } from "../admin/admin-authorization.js";
import { NeisClient } from "../neis/neis-client.js";
import { getAdminFirestore } from "../shared/firebase-admin.js";
import { KakaoLocalClient } from "./kakao-local-client.js";
import {
  KakaoCandidateNotFoundError,
  KakaoCandidateRegionError,
  KakaoMatchConflictError,
  KakaoMatchService,
  KakaoSchoolNotFoundError,
} from "./kakao-match-service.js";
import {
  NeisSyncConflictError,
  NeisSyncRevisionConflictError,
  NeisSyncRiskAcknowledgementError,
  NeisSyncService,
  NeisSyncSuspiciousResultError,
} from "./neis-sync-service.js";
import {
  applyNeisSchoolSyncInputSchema,
  confirmKakaoMatchInputSchema,
  matchSchoolWithKakaoInputSchema,
  previewNeisSchoolSyncInputSchema,
} from "./sync-contract.js";

const neisApiKey = defineSecret("NEIS_API_KEY");
const kakaoRestApiKey = defineSecret("KAKAO_REST_API_KEY");

function isFunctionsEmulator() {
  return process.env.FUNCTIONS_EMULATOR === "true";
}

function neisConfiguration() {
  if (process.env.ALLOW_LIVE_NEIS_SYNC !== "true") {
    throw new HttpsError("failed-precondition", "실제 NEIS 동기화가 승인되지 않았습니다.");
  }
  const targetEducationOfficeCode = process.env.TARGET_EDUCATION_OFFICE_CODE?.trim();
  if (!targetEducationOfficeCode) throw new HttpsError("failed-precondition", "대상 교육청 설정이 없습니다.");
  return targetEducationOfficeCode;
}

function neisPreviewService() {
  const targetEducationOfficeCode = neisConfiguration();
  return new NeisSyncService({
    db: getAdminFirestore(),
    client: new NeisClient({
      apiKey: neisApiKey.value(),
      targetEducationOfficeCode,
    }),
    targetEducationOfficeCode,
  });
}

function neisApplyService() {
  const targetEducationOfficeCode = neisConfiguration();
  return new NeisSyncService({
    db: getAdminFirestore(),
    client: { fetchAllSchools: async () => { throw new Error("Apply never fetches NEIS."); } },
    targetEducationOfficeCode,
  });
}

function kakaoService() {
  if (process.env.ALLOW_LIVE_KAKAO_MATCH !== "true") {
    throw new HttpsError("failed-precondition", "실제 Kakao 위치 매칭이 승인되지 않았습니다.");
  }
  return new KakaoMatchService({
    db: getAdminFirestore(),
    client: new KakaoLocalClient({ restApiKey: kakaoRestApiKey.value() }),
  });
}

function mapSyncError(error: unknown): HttpsError | null {
  if (error instanceof NeisSyncSuspiciousResultError) return new HttpsError("failed-precondition", "비정상 누락이 감지되어 적용을 차단했습니다.");
  if (error instanceof NeisSyncRiskAcknowledgementError) return new HttpsError("failed-precondition", "위험 변경을 검토하고 명시적으로 승인해주세요.");
  if (error instanceof NeisSyncRevisionConflictError || error instanceof KakaoMatchConflictError) return new HttpsError("aborted", error.message);
  if (error instanceof NeisSyncConflictError) return new HttpsError("failed-precondition", error.message);
  if (error instanceof KakaoSchoolNotFoundError) return new HttpsError("not-found", "학교를 찾을 수 없습니다.");
  if (error instanceof KakaoCandidateNotFoundError) return new HttpsError("not-found", "검토 후보를 찾을 수 없습니다.");
  if (error instanceof KakaoCandidateRegionError) return new HttpsError("failed-precondition", "대전 지역 후보만 확정할 수 있습니다.");
  if (error instanceof z.ZodError) return new HttpsError("failed-precondition", "저장된 동기화 데이터 계약이 올바르지 않습니다.");
  return null;
}

const previewOptions = {
  enforceAppCheck: !isFunctionsEmulator(),
  maxInstances: 1,
  timeoutSeconds: 180,
  memory: "512MiB" as const,
  region: "asia-northeast3" as const,
  secrets: [neisApiKey],
};
const adminOptions = {
  enforceAppCheck: !isFunctionsEmulator(),
  maxInstances: 3,
  timeoutSeconds: 180,
  memory: "512MiB" as const,
  region: "asia-northeast3" as const,
};

export const previewNeisSchoolSync = onCall(previewOptions, async (request) => {
  const parsed = previewNeisSchoolSyncInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "NEIS 미리보기 요청을 확인해주세요.");
  const actor = await requireVerifiedAdmin(request);
  try {
    return await neisPreviewService().preview(parsed.data, actor);
  } catch (error) {
    const mapped = mapSyncError(error);
    if (mapped) throw mapped;
    logger.error("NEIS preview failed.", { requestId: parsed.data.requestId, actor: actor.employeeId, error });
    throw new HttpsError("internal", "NEIS 변경 내용을 불러오지 못했습니다.");
  }
});

export const applyNeisSchoolSync = onCall(adminOptions, async (request) => {
  const parsed = applyNeisSchoolSyncInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "NEIS 적용 요청을 확인해주세요.");
  const actor = await requireVerifiedAdmin(request);
  try {
    return await neisApplyService().apply(parsed.data, actor);
  } catch (error) {
    const mapped = mapSyncError(error);
    if (mapped) throw mapped;
    logger.error("NEIS apply failed.", { runId: parsed.data.runId, requestId: parsed.data.requestId, actor: actor.employeeId, error });
    throw new HttpsError("internal", "NEIS 변경 내용을 적용하지 못했습니다.");
  }
});

export const matchSchoolWithKakao = onCall({ ...adminOptions, secrets: [kakaoRestApiKey] }, async (request) => {
  const parsed = matchSchoolWithKakaoInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Kakao 위치 요청을 확인해주세요.");
  const actor = await requireVerifiedAdmin(request);
  try {
    return await kakaoService().match(parsed.data, actor);
  } catch (error) {
    const mapped = mapSyncError(error);
    if (mapped) throw mapped;
    logger.error("Kakao school match failed.", { schoolId: parsed.data.schoolId, requestId: parsed.data.requestId, actor: actor.employeeId, error });
    throw new HttpsError("internal", "Kakao 위치 후보를 확인하지 못했습니다.");
  }
});

export const confirmKakaoMatch = onCall(adminOptions, async (request) => {
  const parsed = confirmKakaoMatchInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Kakao 위치 확정 요청을 확인해주세요.");
  const actor = await requireVerifiedAdmin(request);
  try {
    return await new KakaoMatchService({
      db: getAdminFirestore(),
      client: {
        searchAddress: async () => null,
        searchKeyword: async () => [],
      },
    }).confirm(parsed.data, actor);
  } catch (error) {
    const mapped = mapSyncError(error);
    if (mapped) throw mapped;
    logger.error("Kakao match confirmation failed.", { schoolId: parsed.data.schoolId, requestId: parsed.data.requestId, actor: actor.employeeId, error });
    throw new HttpsError("internal", "Kakao 위치를 확정하지 못했습니다.");
  }
});
