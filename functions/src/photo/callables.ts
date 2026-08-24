import { logger } from "firebase-functions";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { z } from "zod";

import { LoginRepository } from "../auth/login-repository.js";
import { claimsMatchAuthz } from "../auth/login-service.js";
import {
  finalizePhotoUploadInputSchema,
  getSchoolPhotoInputSchema,
  mutateSchoolPhotoInputSchema,
  preparePhotoUploadInputSchema,
} from "./photo-contract.js";
import { InvalidPhotoError } from "./photo-processor.js";
import {
  PhotoNotFoundError,
  PhotoRequestCollisionError,
  PhotoRevisionConflictError,
  PhotoService,
  PhotoUploadSessionError,
  PhotoUploadRateLimitError,
  type PhotoActor,
} from "./photo-service.js";

function isFunctionsEmulator() {
  return process.env.FUNCTIONS_EMULATOR === "true";
}

type AuthzResult = Awaited<ReturnType<LoginRepository["getAuthz"]>>;

async function authorize(
  request: CallableRequest<unknown>,
  access: "read" | "write",
): Promise<{ actor: PhotoActor; authz: NonNullable<AuthzResult> }> {
  if (!request.auth) throw new HttpsError("unauthenticated", "인증이 필요합니다.");
  const authz = await new LoginRepository().getAuthz(request.auth.uid);
  if (!authz || !claimsMatchAuthz(request.auth.token, authz)) {
    throw new HttpsError("failed-precondition", "세션이 유효하지 않습니다.");
  }
  const allowed = access === "read"
    ? authz.roleScopes.some((scope) => ["delivery", "sales", "viewer", "admin"].includes(scope))
    : authz.roleScopes.some((scope) => ["delivery", "sales", "admin"].includes(scope));
  if (!allowed) throw new HttpsError("permission-denied", "사진 작업 권한이 없습니다.");
  return { actor: { uid: request.auth.uid, employeeId: authz.employeeId }, authz };
}

function mapPhotoError(error: unknown): never {
  if (error instanceof PhotoRevisionConflictError) {
    throw new HttpsError("aborted", "다른 직원이 먼저 사진을 변경했습니다.", {
      actualRevision: error.actualRevision,
    });
  }
  if (error instanceof PhotoNotFoundError) throw new HttpsError("not-found", "사진을 찾을 수 없습니다.");
  if (error instanceof PhotoUploadSessionError) throw new HttpsError("failed-precondition", "업로드 준비가 만료되었거나 올바르지 않습니다.");
  if (error instanceof PhotoRequestCollisionError) throw new HttpsError("already-exists", "요청 식별자가 이미 사용되었습니다.");
  if (error instanceof PhotoUploadRateLimitError) throw new HttpsError("resource-exhausted", "사진 업로드 횟수가 많습니다. 잠시 후 다시 시도해주세요.");
  if (error instanceof InvalidPhotoError) throw new HttpsError("invalid-argument", error.message);
  if (error instanceof z.ZodError) throw new HttpsError("failed-precondition", "저장된 사진 계약이 올바르지 않습니다.");
  throw error;
}

export const preparePhotoUpload = onCall(
  {
    enforceAppCheck: !isFunctionsEmulator(),
    maxInstances: 10,
    region: "asia-northeast3",
  },
  async (request) => {
    const { actor } = await authorize(request, "write");
    const parsed = preparePhotoUploadInputSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "사진 업로드 정보를 확인해주세요.");
    try {
      return await new PhotoService().prepare(parsed.data, actor);
    } catch (error) {
      try { mapPhotoError(error); } catch (mapped) { throw mapped; }
    }
  },
);

export const finalizePhotoUpload = onCall(
  {
    enforceAppCheck: !isFunctionsEmulator(),
    maxInstances: 4,
    memory: "1GiB",
    region: "asia-northeast3",
    timeoutSeconds: 120,
  },
  async (request) => {
    const { actor } = await authorize(request, "write");
    const parsed = finalizePhotoUploadInputSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "사진 파일을 확인해주세요.");
    try {
      return await new PhotoService().finalize(parsed.data.uploadId, parsed.data.fileBase64, actor);
    } catch (error) {
      try { mapPhotoError(error); } catch (mapped) {
        if (mapped instanceof HttpsError) throw mapped;
        logger.error("Photo finalize failed.", { uploadId: parsed.data.uploadId, error: mapped });
        throw new HttpsError("internal", "사진을 처리하지 못했습니다.");
      }
    }
  },
);

export const getSchoolPhoto = onCall(
  {
    enforceAppCheck: !isFunctionsEmulator(),
    maxInstances: 20,
    region: "asia-northeast3",
  },
  async (request) => {
    await authorize(request, "read");
    const parsed = getSchoolPhotoInputSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "사진 요청을 확인해주세요.");
    try {
      return await new PhotoService().get(parsed.data);
    } catch (error) {
      try { mapPhotoError(error); } catch (mapped) {
        if (mapped instanceof HttpsError) throw mapped;
        logger.error("Photo download failed.", {
          schoolId: parsed.data.schoolId,
          slotId: parsed.data.slotId,
          variant: parsed.data.variant,
          error: mapped,
        });
        throw new HttpsError("internal", "사진을 불러오지 못했습니다.");
      }
    }
  },
);

async function mutatePhoto(
  request: CallableRequest<unknown>,
  operation: "delete" | "restore",
) {
  const { actor } = await authorize(request, "write");
  const parsed = mutateSchoolPhotoInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "사진 변경 요청을 확인해주세요.");
  try {
    const service = new PhotoService();
    return operation === "delete"
      ? await service.delete(parsed.data, actor)
      : await service.restore(parsed.data, actor);
  } catch (error) {
    try { mapPhotoError(error); } catch (mapped) { throw mapped; }
  }
}

export const deleteSchoolPhoto = onCall(
  { enforceAppCheck: !isFunctionsEmulator(), maxInstances: 10, region: "asia-northeast3" },
  (request) => mutatePhoto(request, "delete"),
);

export const restoreSchoolPhoto = onCall(
  { enforceAppCheck: !isFunctionsEmulator(), maxInstances: 10, region: "asia-northeast3" },
  (request) => mutatePhoto(request, "restore"),
);
