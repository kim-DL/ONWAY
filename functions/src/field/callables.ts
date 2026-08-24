import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { LoginRepository } from "../auth/login-repository.js";
import { claimsMatchAuthz } from "../auth/login-service.js";
import { updateFieldProfileInputSchema } from "./profile-contract.js";
import {
  FieldProfileService,
  RequestCollisionError,
  RevisionConflictError,
  SchoolNotFoundError,
} from "./profile-service.js";

function isFunctionsEmulator() {
  return process.env.FUNCTIONS_EMULATOR === "true";
}

export const updateSchoolFieldProfile = onCall(
  {
    enforceAppCheck: !isFunctionsEmulator(),
    maxInstances: 10,
    region: "asia-northeast3",
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "인증이 필요합니다.");
    const parsed = updateFieldProfileInputSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "현장정보 입력을 확인해주세요.");

    const repository = new LoginRepository();
    const authz = await repository.getAuthz(request.auth.uid);
    if (!authz || !claimsMatchAuthz(request.auth.token, authz)) {
      throw new HttpsError("failed-precondition", "세션이 유효하지 않습니다.");
    }
    if (!authz.roleScopes.some((scope) => ["delivery", "sales", "admin"].includes(scope))) {
      throw new HttpsError("permission-denied", "현장정보를 수정할 권한이 없습니다.");
    }

    try {
      return await new FieldProfileService().update(parsed.data, {
        uid: request.auth.uid,
        employeeId: authz.employeeId,
      });
    } catch (error) {
      if (error instanceof RevisionConflictError) {
        throw new HttpsError("aborted", "다른 직원이 먼저 수정했습니다. 최신 정보를 확인해주세요.", {
          actualRevision: error.actualRevision,
        });
      }
      if (error instanceof SchoolNotFoundError) {
        throw new HttpsError("not-found", "학교를 찾을 수 없습니다.");
      }
      if (error instanceof RequestCollisionError) {
        throw new HttpsError("already-exists", "요청 식별자가 이미 사용되었습니다.");
      }
      if (error instanceof z.ZodError) {
        throw new HttpsError("failed-precondition", "저장된 현장정보 계약이 올바르지 않습니다.");
      }
      logger.error("School field profile update failed.", {
        schoolId: parsed.data.schoolId,
        requestId: parsed.data.requestId,
        error,
      });
      throw new HttpsError("internal", "현장정보를 저장하지 못했습니다.");
    }
  },
);
