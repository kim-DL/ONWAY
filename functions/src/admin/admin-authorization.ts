import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

import { LoginRepository } from "../auth/login-repository.js";
import { claimsMatchAuthz } from "../auth/login-service.js";
import { getAdminFirestore } from "../shared/firebase-admin.js";

export interface VerifiedAdminActor {
  uid: string;
  employeeId: string;
  email: string | null;
}

function signInProvider(request: CallableRequest<unknown>) {
  const firebaseClaim = request.auth?.token.firebase as
    | { sign_in_provider?: unknown }
    | undefined;
  return firebaseClaim?.sign_in_provider;
}

export function requireGoogleIdentity(request: CallableRequest<unknown>) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Google 로그인이 필요합니다.");
  }
  if (signInProvider(request) !== "google.com") {
    throw new HttpsError("permission-denied", "Google로 로그인한 계정만 사용할 수 있습니다.");
  }
  const email = typeof request.auth.token.email === "string"
    ? request.auth.token.email.trim().toLowerCase()
    : "";
  if (!email || request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "확인된 Google 이메일이 필요합니다.");
  }
  return { uid: request.auth.uid, email };
}

export async function requireVerifiedAdmin(
  request: CallableRequest<unknown>,
): Promise<VerifiedAdminActor> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "인증이 필요합니다.");
  }

  const repository = new LoginRepository();
  const authz = await repository.getAuthz(request.auth.uid);
  if (!authz || !claimsMatchAuthz(request.auth.token, authz)) {
    throw new HttpsError("failed-precondition", "관리자 세션이 유효하지 않습니다.");
  }
  if (
    !authz.roleScopes.includes("admin")
    || request.auth.token.adminApproved !== true
    || signInProvider(request) !== "google.com"
  ) {
    throw new HttpsError("permission-denied", "승인된 Google 관리자 계정이 필요합니다.");
  }

  const employee = await getAdminFirestore().doc(`employees/${authz.employeeId}`).get();
  if (
    !employee.exists
    || employee.data()?.status !== "active"
    || employee.data()?.firebaseUid !== request.auth.uid
    || !Array.isArray(employee.data()?.roleScopes)
    || !employee.data()?.roleScopes.includes("admin")
  ) {
    throw new HttpsError("permission-denied", "활성 관리자 계정을 확인할 수 없습니다.");
  }

  return {
    uid: request.auth.uid,
    employeeId: authz.employeeId,
    email: typeof request.auth.token.email === "string"
      ? request.auth.token.email.trim().toLowerCase()
      : null,
  };
}
