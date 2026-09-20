import type { Firestore, Transaction } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { z } from "zod";
import { claimsMatchAuthz } from "../auth/login-service.js";
import { customerEmployeeIsActive, verifyCustomerTransactionActor, type CustomerActor } from "../customer/customer-authorization.js";
import { getAdminFirestore } from "../shared/firebase-admin.js";

export type InventoryActor = CustomerActor;
export type InventoryAccess = "read" | "write" | "admin";

const employeeIdSchema = z.string().min(1).max(128).refine((value) => !value.includes("/"));
const authorizationSchema = z.object({ employeeId: employeeIdSchema, active: z.boolean(),
  sessionVersion: z.number().int().positive(), permissionsVersion: z.number().int().positive() });
const employeeSchema = z.object({ employeeId: employeeIdSchema, firebaseUid: z.string().min(1),
  status: z.enum(["active", "disabled"]), sessionVersion: z.number().int().positive(),
  roleScopes: z.array(z.enum(["delivery", "sales", "viewer", "admin"])).min(1).max(4) });

export function inventoryActorCanWrite(actor: InventoryActor): boolean {
  return actor.isAdmin || actor.roleScopes.some((role) => role === "delivery" || role === "sales");
}
export function assertInventoryAccess(actor: InventoryActor, access: InventoryAccess) {
  if ((access === "admin" && !actor.isAdmin) || (access === "write" && !inventoryActorCanWrite(actor))) {
    throw new HttpsError("permission-denied", access === "admin" ? "관리자만 처리할 수 있습니다." : "재고 변경 권한이 없습니다.");
  }
}
export async function requireInventoryActor(request: CallableRequest<unknown>, access: InventoryAccess = "read"): Promise<InventoryActor> {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  // The claim supplies only a lookup key, never authority. Fetch canonical
  // membership together, then compare all session, role and identity bindings.
  // Do not cache this: callables repeat it after I/O and mutations additionally
  // revalidate inside their commit transaction.
  const employeeId = employeeIdSchema.safeParse(request.auth.token.employeeId);
  if (!employeeId.success) throw new HttpsError("failed-precondition", "현재 세션을 확인할 수 없습니다.");
  const db = getAdminFirestore();
  const [authorizationSnapshot, employeeSnapshot] = await db.getAll(
    db.doc(`authz/${request.auth.uid}`), db.doc(`employees/${employeeId.data}`),
  );
  const authorization = authorizationSchema.safeParse(authorizationSnapshot?.data());
  const employee = employeeSchema.safeParse(employeeSnapshot?.data());
  if (!authorization.success || !employee.success) throw new HttpsError("permission-denied", "활성 직원 계정을 확인할 수 없습니다.");
  const authz = { ...authorization.data, uid: request.auth.uid, roleScopes: employee.data.roleScopes };
  if (!claimsMatchAuthz(request.auth.token, authz)) throw new HttpsError("failed-precondition", "현재 세션을 확인할 수 없습니다.");
  const actor: InventoryActor = { uid: request.auth.uid, employeeId: authz.employeeId,
    sessionVersion: authz.sessionVersion, permissionsVersion: authz.permissionsVersion,
    roleScopes: [...authz.roleScopes], isAdmin: authz.roleScopes.includes("admin") };
  if (!customerEmployeeIsActive(employee.data, actor)) throw new HttpsError("permission-denied", "활성 직원 계정을 확인할 수 없습니다.");
  // Same approved-Google requirement as requireVerifiedAdmin; only its repeated
  // canonical reads are shared above, not any of the administrator checks.
  const provider = (request.auth.token.firebase as { sign_in_provider?: unknown } | undefined)?.sign_in_provider;
  if (actor.isAdmin && (request.auth.token.adminApproved !== true || provider !== "google.com")) {
    throw new HttpsError("permission-denied", "승인된 Google 관리자 계정이 필요합니다.");
  }
  assertInventoryAccess(actor, access);
  return actor;
}
export async function verifyInventoryTransactionActor(db: Firestore, transaction: Transaction, actor: InventoryActor, access: InventoryAccess = "write") {
  await verifyCustomerTransactionActor(db, transaction, actor);
  assertInventoryAccess(actor, access);
}
