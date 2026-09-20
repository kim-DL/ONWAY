import type { Firestore, Transaction } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

import { requireVerifiedAdmin } from "../admin/admin-authorization.js";
import { LoginRepository } from "../auth/login-repository.js";
import { claimsMatchAuthz } from "../auth/login-service.js";
import { getAdminFirestore } from "../shared/firebase-admin.js";

export interface CustomerActor {
  uid: string;
  employeeId: string;
  sessionVersion: number;
  permissionsVersion: number;
  isAdmin: boolean;
  roleScopes: string[];
}

export function customerEmployeeIsActive(data: Record<string, unknown> | undefined, actor: CustomerActor) {
  return data?.status === "active"
    && data.firebaseUid === actor.uid
    && data.employeeId === actor.employeeId
    && Array.isArray(data.roleScopes)
    && actor.roleScopes.length > 0 && actor.roleScopes.length <= 4
    && actor.isAdmin === actor.roleScopes.includes("admin")
    && data.roleScopes.length === actor.roleScopes.length
    && data.roleScopes.every((scope) => ["delivery", "sales", "viewer", "admin"].includes(scope) && actor.roleScopes.includes(scope));
}

export async function requireCustomerActor(request: CallableRequest<unknown>): Promise<CustomerActor> {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const authz = await new LoginRepository().getAuthz(request.auth.uid);
  if (!authz || !claimsMatchAuthz(request.auth.token, authz)) throw new HttpsError("failed-precondition", "현재 세션을 확인할 수 없습니다.");
  const hasAdminRole = authz.roleScopes.includes("admin");
  // All active employees may maintain shared customer information. This is a
  // customer-only capability; privileged admin identities still require the
  // existing verified Google sign-in and never gain a weaker login path.
  if (hasAdminRole) await requireVerifiedAdmin(request);
  if (!authz.roleScopes.some((scope) => ["delivery", "sales", "viewer", "admin"].includes(scope))) {
    throw new HttpsError("permission-denied", "거래처 이용 권한이 없습니다.");
  }
  const actor: CustomerActor = {
    uid: request.auth.uid, employeeId: authz.employeeId,
    sessionVersion: authz.sessionVersion, permissionsVersion: authz.permissionsVersion,
    isAdmin: hasAdminRole,
    roleScopes: [...authz.roleScopes],
  };
  const employee = await getAdminFirestore().doc(`employees/${actor.employeeId}`).get();
  if (!customerEmployeeIsActive(employee.data(), actor)) throw new HttpsError("permission-denied", "활성 직원 계정을 확인할 수 없습니다.");
  return actor;
}

export async function verifyCustomerTransactionActor(db: Firestore, transaction: Transaction, actor: CustomerActor) {
  const [authz, employee] = await transaction.getAll(db.doc(`authz/${actor.uid}`), db.doc(`employees/${actor.employeeId}`));
  const authorization = authz?.data();
  // Roles live on employees, not authz (see LoginRepository.getAuthz). Compare
  // that canonical role snapshot even if a faulty admin update missed a version
  // increment; authz supplies the active/session/permissions revocation state.
  if (!customerEmployeeIsActive(employee?.data(), actor)
    || authorization?.active !== true || authorization.employeeId !== actor.employeeId
    || authorization.sessionVersion !== actor.sessionVersion || authorization.permissionsVersion !== actor.permissionsVersion) {
    throw new HttpsError("permission-denied", "변경 권한이 만료되었습니다. 다시 로그인해주세요.");
  }
}
