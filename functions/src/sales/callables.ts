import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { z } from "zod";

import { requireVerifiedAdmin } from "../admin/admin-authorization.js";
import { LoginRepository } from "../auth/login-repository.js";
import { claimsMatchAuthz } from "../auth/login-service.js";
import {
  changeSalesAssignmentInputSchema,
  claimSalesAssignmentsInputSchema,
  createSalesAssignmentsInputSchema,
  createSalesCycleInputSchema,
  releaseSalesAssignmentsInputSchema,
  updateSalesCycleProductsInputSchema,
} from "./sales-cycle-contract.js";
import {
  SalesAssignmentAlreadyExistsError,
  SalesAssignmentClaimPermissionError,
  SalesAssignmentHasActivityError,
  SalesAssignmentNotFoundError,
  SalesAssignmentReleasePermissionError,
  SalesAssignmentRevisionConflictError,
  SalesCycleAlreadyExistsError,
  SalesActiveCycleRequiredError,
  SalesCycleClosedError,
  SalesCycleNotFoundError,
  SalesCycleService,
  SalesReferenceError,
  SalesRequestCollisionError,
} from "./sales-cycle-service.js";
import { updateSalesProfileInputSchema } from "./sales-profile-contract.js";
import {
  SalesProfileAssignmentNotFoundError,
  SalesProfileAssignmentRevisionConflictError,
  SalesProfileCycleError,
  SalesProfilePermissionError,
  SalesProfileReferenceError,
  SalesProfileRequestCollisionError,
  SalesProfileRevisionConflictError,
  SalesProfileService,
} from "./sales-profile-service.js";
import { KakaoRouteClient } from "./kakao-route-client.js";
import { optimizeSalesRouteInputSchema } from "./sales-route-contract.js";
import {
  SalesRouteCycleError,
  SalesRouteLocationError,
  SalesRoutePermissionError,
  SalesRouteSchoolError,
  SalesRouteService,
} from "./sales-route-service.js";
import { recordSalesVisitInputSchema, updateSalesVisitInputSchema } from "./sales-visit-contract.js";
import {
  SalesVisitAssignmentNotFoundError,
  SalesVisitAssignmentRevisionConflictError,
  SalesVisitChronologyError,
  SalesVisitCycleError,
  SalesVisitPermissionError,
  SalesVisitProfileRevisionConflictError,
  SalesVisitReferenceError,
  SalesVisitRequestCollisionError,
  SalesVisitRevisionConflictError,
  SalesVisitNotLatestError,
  SalesVisitService,
} from "./sales-visit-service.js";

function isFunctionsEmulator() {
  return process.env.FUNCTIONS_EMULATOR === "true";
}

const kakaoRestApiKey = defineSecret("KAKAO_REST_API_KEY");

async function requireSalesActor(request: CallableRequest<unknown>) {
  if (!request.auth) throw new HttpsError("unauthenticated", "인증이 필요합니다.");
  const authz = await new LoginRepository().getAuthz(request.auth.uid);
  if (!authz || !claimsMatchAuthz(request.auth.token, authz)) {
    throw new HttpsError("failed-precondition", "세션이 유효하지 않습니다.");
  }
  if (!authz.roleScopes.some((scope) => scope === "sales" || scope === "admin")) {
    throw new HttpsError("permission-denied", "영업 기능을 사용할 권한이 없습니다.");
  }
  if (authz.roleScopes.includes("admin")) {
    const admin = await requireVerifiedAdmin(request);
    return { ...admin, roleScopes: authz.roleScopes };
  }
  return {
    uid: request.auth.uid,
    employeeId: authz.employeeId,
    roleScopes: authz.roleScopes,
  };
}

function mapSalesError(error: unknown): HttpsError | null {
  if (error instanceof SalesRequestCollisionError) return new HttpsError("already-exists", "요청 식별자가 이미 사용되었습니다.");
  if (error instanceof SalesCycleAlreadyExistsError) return new HttpsError("already-exists", "이미 존재하는 월입니다.");
  if (error instanceof SalesAssignmentAlreadyExistsError) return new HttpsError("already-exists", "이미 배정된 학교가 포함되어 있습니다.");
  if (error instanceof SalesAssignmentClaimPermissionError) return new HttpsError("permission-denied", "담당 학교를 직접 선택할 권한이 없습니다.");
  if (error instanceof SalesAssignmentReleasePermissionError) return new HttpsError("permission-denied", "자신이 단독 담당하는 학교만 제외할 수 있습니다.");
  if (error instanceof SalesAssignmentHasActivityError) return new HttpsError("failed-precondition", "업무 기록이 있는 학교는 제외할 수 없습니다. 관리자에게 담당 변경을 요청해주세요.");
  if (error instanceof SalesActiveCycleRequiredError) return new HttpsError("failed-precondition", "현재 운영 중인 월에만 학교를 가져올 수 있습니다.");
  if (error instanceof SalesCycleNotFoundError) return new HttpsError("not-found", "월별 영업 Cycle을 찾을 수 없습니다.");
  if (error instanceof SalesAssignmentNotFoundError) return new HttpsError("not-found", "학교 배정을 찾을 수 없습니다.");
  if (error instanceof SalesCycleClosedError) return new HttpsError("failed-precondition", "종료된 월의 배정은 변경할 수 없습니다.");
  if (error instanceof SalesReferenceError) return new HttpsError("failed-precondition", error.message);
  if (error instanceof SalesAssignmentRevisionConflictError) {
    return new HttpsError("aborted", "다른 관리자가 먼저 배정을 변경했습니다.", { actualRevision: error.actualRevision });
  }
  if (error instanceof z.ZodError) return new HttpsError("failed-precondition", "저장된 영업 배정 계약이 올바르지 않습니다.");
  return null;
}

const callableOptions = {
  enforceAppCheck: !isFunctionsEmulator(),
  maxInstances: 10,
  region: "asia-northeast3" as const,
};

const routeCallableOptions = {
  ...callableOptions,
  memory: "512MiB" as const,
  timeoutSeconds: 60,
  secrets: isFunctionsEmulator() ? [] : [kakaoRestApiKey],
};

export const optimizeSalesRoute = onCall(routeCallableOptions, async (request) => {
  const parsed = optimizeSalesRouteInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "방문할 학교와 첫 학교를 확인해주세요.");
  const input = parsed.data;
  const actor = await requireSalesActor(request);
  const restApiKey = isFunctionsEmulator() ? "" : kakaoRestApiKey.value().trim();
  const service = new SalesRouteService(
    undefined,
    restApiKey ? new KakaoRouteClient(restApiKey) : undefined,
  );
  try {
    return await service.optimize(input, actor);
  } catch (error) {
    if (error instanceof SalesRouteCycleError) {
      throw new HttpsError("failed-precondition", "현재 운영 중인 월의 담당 학교만 동선을 만들 수 있습니다.");
    }
    if (error instanceof SalesRoutePermissionError) {
      throw new HttpsError("permission-denied", "자신의 담당 학교만 방문 동선에 포함할 수 있습니다.");
    }
    if (error instanceof SalesRouteSchoolError) {
      throw new HttpsError("not-found", "학교 배정 정보가 변경되었습니다. 목록을 새로 확인해주세요.");
    }
    if (error instanceof SalesRouteLocationError) {
      throw new HttpsError("failed-precondition", "위치가 확정되지 않은 학교가 포함되어 있습니다.", {
        reason: "unverified-location",
        schoolIds: error.schoolIds,
      });
    }
    if (error instanceof z.ZodError) {
      throw new HttpsError("failed-precondition", "저장된 학교 위치 정보가 올바르지 않습니다.");
    }
    logger.error("Sales route optimization failed.", {
      cycleId: input.cycleId,
      schoolCount: input.schoolIds.length,
      actor: actor.employeeId,
      error,
    });
    throw new HttpsError("internal", "방문 동선을 계산하지 못했습니다.");
  }
});

export const createSalesCycle = onCall(callableOptions, async (request) => {
  const parsed = createSalesCycleInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "월 생성 입력을 확인해주세요.");
  const input = parsed.data;
  const actor = await requireVerifiedAdmin(request);
  try {
    return await new SalesCycleService().createCycle(input, actor);
  } catch (error) {
    const mapped = mapSalesError(error);
    if (mapped) throw mapped;
    logger.error("Sales cycle creation failed.", { cycleId: input.cycleId, requestId: input.requestId, error });
    throw new HttpsError("internal", "월별 영업 Cycle을 만들지 못했습니다.");
  }
});

export const createSalesAssignments = onCall(callableOptions, async (request) => {
  const parsed = createSalesAssignmentsInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "학교 배정 입력을 확인해주세요.");
  const input = parsed.data;
  const actor = await requireVerifiedAdmin(request);
  try {
    return await new SalesCycleService().createAssignments(input, actor);
  } catch (error) {
    const mapped = mapSalesError(error);
    if (mapped) throw mapped;
    logger.error("Sales assignment creation failed.", { cycleId: input.cycleId, requestId: input.requestId, error });
    throw new HttpsError("internal", "학교 배정을 만들지 못했습니다.");
  }
});

export const updateSalesCyclePromotedProducts = onCall(callableOptions, async (request) => {
  const parsed = updateSalesCycleProductsInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "홍보 제품 목록을 확인해주세요.");
  const input = parsed.data;
  const actor = await requireVerifiedAdmin(request);
  try {
    return await new SalesCycleService().updatePromotedProducts(input, actor);
  } catch (error) {
    const mapped = mapSalesError(error);
    if (mapped) throw mapped;
    logger.error("Sales cycle product update failed.", { cycleId: input.cycleId, requestId: input.requestId, error });
    throw new HttpsError("internal", "홍보 제품 목록을 저장하지 못했습니다.");
  }
});

export const claimSalesAssignments = onCall(callableOptions, async (request) => {
  const parsed = claimSalesAssignmentsInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "학교 선택 내용을 확인해주세요.");
  const input = parsed.data;
  const actor = await requireSalesActor(request);
  try {
    return await new SalesCycleService().claimAssignments(input, actor);
  } catch (error) {
    const mapped = mapSalesError(error);
    if (mapped) throw mapped;
    logger.error("Sales assignment claim failed.", {
      cycleId: input.cycleId,
      requestId: input.requestId,
      error,
    });
    throw new HttpsError("internal", "담당 학교를 가져오지 못했습니다.");
  }
});

export const releaseSalesAssignments = onCall(callableOptions, async (request) => {
  const parsed = releaseSalesAssignmentsInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "제외할 학교를 확인해주세요.");
  const input = parsed.data;
  const actor = await requireSalesActor(request);
  try {
    return await new SalesCycleService().releaseAssignments(input, actor);
  } catch (error) {
    const mapped = mapSalesError(error);
    if (mapped) throw mapped;
    logger.error("Sales assignment release failed.", {
      cycleId: input.cycleId,
      requestId: input.requestId,
      error,
    });
    throw new HttpsError("internal", "담당 학교에서 제외하지 못했습니다.");
  }
});

export const changeSalesAssignment = onCall(callableOptions, async (request) => {
  const parsed = changeSalesAssignmentInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "담당 변경 입력을 확인해주세요.");
  const input = parsed.data;
  const actor = await requireVerifiedAdmin(request);
  try {
    return await new SalesCycleService().changeAssignment(input, actor);
  } catch (error) {
    const mapped = mapSalesError(error);
    if (mapped) throw mapped;
    logger.error("Sales assignment change failed.", { cycleId: input.cycleId, schoolId: input.schoolId, requestId: input.requestId, error });
    throw new HttpsError("internal", "학교 담당을 변경하지 못했습니다.");
  }
});

export const recordSalesVisit = onCall(callableOptions, async (request) => {
  const parsed = recordSalesVisitInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "방문 기록 입력을 확인해주세요.");
  const input = parsed.data;
  const actor = await requireSalesActor(request);
  try {
    return await new SalesVisitService().record(input, actor);
  } catch (error) {
    if (error instanceof SalesVisitRequestCollisionError) {
      throw new HttpsError("already-exists", "요청 식별자가 이미 사용되었습니다.");
    }
    if (error instanceof SalesVisitCycleError) {
      throw new HttpsError("failed-precondition", "현재 진행 중인 월에만 방문을 기록할 수 있습니다.");
    }
    if (error instanceof SalesVisitAssignmentNotFoundError) {
      throw new HttpsError("not-found", "이번 달 학교 배정을 찾을 수 없습니다.");
    }
    if (error instanceof SalesVisitPermissionError) {
      throw new HttpsError("permission-denied", "자신의 담당 학교에만 방문을 기록할 수 있습니다.");
    }
    if (error instanceof SalesVisitReferenceError) {
      throw new HttpsError("failed-precondition", error.message);
    }
    if (error instanceof SalesVisitChronologyError) {
      const message = {
        future: "방문일은 오늘 이후로 선택할 수 없습니다.",
        "cycle-window": "방문일은 배정 월 시작 7일 전부터 해당 월 말일까지 선택할 수 있습니다.",
        "follow-up": "후속 방문일은 방문일과 같거나 이후여야 합니다.",
        "before-latest": "기존 최신 방문일보다 앞선 날짜는 추가할 수 없습니다.",
      }[error.reason];
      throw new HttpsError("failed-precondition", message);
    }
    if (error instanceof SalesVisitAssignmentRevisionConflictError) {
      throw new HttpsError("aborted", "배정 정보가 변경되었습니다. 최신 정보를 확인해주세요.", {
        actualRevision: error.actualRevision,
      });
    }
    if (error instanceof z.ZodError) {
      throw new HttpsError("failed-precondition", "저장된 영업 방문 계약이 올바르지 않습니다.");
    }
    logger.error("Sales visit recording failed.", {
      cycleId: input.cycleId,
      schoolId: input.schoolId,
      requestId: input.requestId,
      error,
    });
    throw new HttpsError("internal", "방문 기록을 저장하지 못했습니다.");
  }
});

export const updateSalesVisit = onCall(callableOptions, async (request) => {
  const parsed = updateSalesVisitInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "수정할 방문 기록 입력을 확인해주세요.");
  const input = parsed.data;
  const actor = await requireSalesActor(request);
  try {
    return await new SalesVisitService().update(input, actor);
  } catch (error) {
    if (error instanceof SalesVisitRequestCollisionError) {
      throw new HttpsError("already-exists", "요청 식별자가 이미 사용되었습니다.");
    }
    if (error instanceof SalesVisitCycleError) {
      throw new HttpsError("failed-precondition", "현재 진행 중인 월의 최신 방문 기록만 수정할 수 있습니다.");
    }
    if (error instanceof SalesVisitAssignmentNotFoundError) {
      throw new HttpsError("not-found", "이번 달 학교 배정을 찾을 수 없습니다.");
    }
    if (error instanceof SalesVisitPermissionError) {
      throw new HttpsError("permission-denied", "자신의 담당 학교 방문 기록만 수정할 수 있습니다.");
    }
    if (error instanceof SalesVisitNotLatestError) {
      throw new HttpsError("failed-precondition", "가장 최근 방문 기록만 수정할 수 있습니다.");
    }
    if (error instanceof SalesVisitReferenceError) {
      throw new HttpsError("failed-precondition", error.message);
    }
    if (error instanceof SalesVisitChronologyError) {
      const message = {
        future: "방문일은 오늘 이후로 선택할 수 없습니다.",
        "cycle-window": "방문일은 배정 월 시작 7일 전부터 해당 월 말일까지 선택할 수 있습니다.",
        "follow-up": "후속 방문일은 방문일과 같거나 이후여야 합니다.",
        "before-latest": "이전 방문 기록보다 앞선 날짜로 수정할 수 없습니다.",
      }[error.reason];
      throw new HttpsError("failed-precondition", message);
    }
    if (error instanceof SalesVisitAssignmentRevisionConflictError) {
      throw new HttpsError("aborted", "학교 담당 정보가 변경되었습니다. 최신 정보를 확인해주세요.", {
        conflictType: "assignment",
        actualRevision: error.actualRevision,
      });
    }
    if (error instanceof SalesVisitProfileRevisionConflictError) {
      throw new HttpsError("aborted", "영업 협업 정보가 변경되었습니다. 최신 정보를 확인해주세요.", {
        conflictType: "salesProfile",
        actualRevision: error.actualRevision,
      });
    }
    if (error instanceof SalesVisitRevisionConflictError) {
      throw new HttpsError("aborted", "다른 직원이 방문 기록을 먼저 수정했습니다.", {
        conflictType: "salesVisit",
        actualRevision: error.actualRevision,
      });
    }
    if (error instanceof z.ZodError) {
      throw new HttpsError("failed-precondition", "저장된 영업 방문 계약이 올바르지 않습니다.");
    }
    logger.error("Sales visit update failed.", {
      visitId: input.visitId,
      schoolId: input.schoolId,
      requestId: input.requestId,
      error,
    });
    throw new HttpsError("internal", "방문 기록을 수정하지 못했습니다.");
  }
});

export const updateSalesProfile = onCall(callableOptions, async (request) => {
  const parsed = updateSalesProfileInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "영업 협업 정보 입력을 확인해주세요.");
  const input = parsed.data;
  const actor = await requireSalesActor(request);
  try {
    return await new SalesProfileService().update(input, actor);
  } catch (error) {
    if (error instanceof SalesProfileRequestCollisionError) {
      throw new HttpsError("already-exists", "요청 식별자가 이미 사용되었습니다.");
    }
    if (error instanceof SalesProfileCycleError) {
      throw new HttpsError("failed-precondition", "현재 진행 중인 월의 협업 정보만 수정할 수 있습니다.");
    }
    if (error instanceof SalesProfileAssignmentNotFoundError) {
      throw new HttpsError("not-found", "이번 달 학교 배정을 찾을 수 없습니다.");
    }
    if (error instanceof SalesProfilePermissionError) {
      throw new HttpsError("permission-denied", "자신의 담당 학교 협업 정보만 수정할 수 있습니다.");
    }
    if (error instanceof SalesProfileReferenceError) {
      throw new HttpsError("failed-precondition", error.message);
    }
    if (error instanceof SalesProfileRevisionConflictError) {
      throw new HttpsError("aborted", "다른 직원이 먼저 협업 정보를 수정했습니다.", {
        conflictType: "salesProfile",
        actualRevision: error.actualRevision,
      });
    }
    if (error instanceof SalesProfileAssignmentRevisionConflictError) {
      throw new HttpsError("aborted", "학교 담당 정보가 변경되었습니다.", {
        conflictType: "assignment",
        actualRevision: error.actualRevision,
      });
    }
    if (error instanceof z.ZodError) {
      throw new HttpsError("failed-precondition", "저장된 영업 협업 정보 계약이 올바르지 않습니다.");
    }
    logger.error("Sales profile update failed.", {
      cycleId: input.cycleId,
      schoolId: input.schoolId,
      requestId: input.requestId,
      error,
    });
    throw new HttpsError("internal", "영업 협업 정보를 저장하지 못했습니다.");
  }
});
