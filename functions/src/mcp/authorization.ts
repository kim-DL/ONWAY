import { z } from "zod";
import { EmployeePinService, LoginRejectedError } from "../auth/login-service.js";
import { LoginRepository } from "../auth/login-repository.js";
import { verifyCustomerTransactionActor, type CustomerActor } from "../customer/customer-authorization.js";
import { getAdminAuth, getAdminFirestore } from "../shared/firebase-admin.js";
import { observeRead } from "../shared/read-observation.js";

export const principalSchema = z.object({
  uid: z.string().min(1).max(128).refine((v) => !v.includes("/")),
  employeeId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  sessionVersion: z.number().int().positive(), permissionsVersion: z.number().int().positive(),
  roleScopes: z.array(z.enum(["delivery", "sales", "viewer"])).min(1).max(3), isAdmin: z.literal(false),
}).strict();
export type McpPrincipal = z.infer<typeof principalSchema>;
export interface McpIdentity {
  login(pin: string, source: string, requestId: string): Promise<McpPrincipal>;
  verify(principal: McpPrincipal): Promise<void>;
}
export function firebaseMcpIdentity(lookupSecret: string, pinPepper: string, allowedEmployeeIds: readonly string[]): McpIdentity {
  const verify = async (principal: McpPrincipal) => {
    principalSchema.parse(principal);
    if (!allowedEmployeeIds.includes(principal.employeeId)) throw new LoginRejectedError("invalid");
    const db = getAdminFirestore();
    const [, user] = await Promise.all([db.runTransaction(async (tx) => {
      const employee = await verifyCustomerTransactionActor(db, tx, principal as CustomerActor);
      if (employee.sessionVersion !== principal.sessionVersion) throw new LoginRejectedError("invalid");
    }), observeRead("firebaseAuth", () => getAdminAuth().getUser(principal.uid))]);
    if (user.disabled) throw new LoginRejectedError("invalid");
  };
  return {
    verify,
    login: (pin, sourceFingerprint, requestId) => new EmployeePinService({
      repository: new LoginRepository(), lookupSecret, pinPepper,
    }).authenticate({ pin, sourceFingerprint, requestId }, async (uid, claims) => {
      const principal = principalSchema.parse({ uid, ...claims, isAdmin: false });
      await verify(principal);
      return principal;
    }),
  };
}
