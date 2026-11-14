import { createHash, randomUUID } from "node:crypto";

import type { Auth } from "firebase-admin/auth";
import { Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";
import { z } from "zod";

import type { VerifiedAdminActor } from "./admin-authorization.js";
import type { DisableGoogleAdminAccessInput, RegisterGoogleAdminAccessInput } from "./google-admin-access-contract.js";

const ACCESS_PATH = "secureSettings/adminAccess";
const MAX_ADMINS = 50;
const documentId = z.string().min(1).max(128).regex(/^[^/]+$/u);
const entrySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  employeeId: documentId,
  active: z.boolean(),
  uid: documentId.optional(),
});
const accessSchema = z.object({
  entries: z.array(entrySchema).max(MAX_ADMINS),
  revision: z.number().int().nonnegative().default(0),
});
const employeeSchema = z.object({
  employeeId: documentId,
  firebaseUid: documentId,
  displayName: z.string().min(1),
  roleScopes: z.array(z.enum(["delivery", "sales", "viewer", "admin"])).min(1),
  status: z.enum(["active", "disabled"]),
  sessionVersion: z.number().int().positive(),
});
const authzSchema = z.object({
  employeeId: documentId,
  active: z.boolean(),
  sessionVersion: z.number().int().positive(),
  permissionsVersion: z.number().int().positive(),
});
const resultSchema = z.object({ employeeId: documentId, revision: z.number().int().positive() });
const lockSchema = z.object({
  actorUid: documentId,
  fingerprint: z.string().length(64),
  result: resultSchema,
  revokeUid: documentId.nullable(),
});

export type AdminAccessRecord = z.infer<typeof accessSchema>;
type Access = AdminAccessRecord;
type Entry = z.infer<typeof entrySchema>;
type Employee = z.infer<typeof employeeSchema>;
type Authorization = z.infer<typeof authzSchema>;
export type GoogleAdminAccessActor = VerifiedAdminActor & {
  email: string;
  sessionVersion: number;
  permissionsVersion: number;
};

export class GoogleAdminAccessError extends Error {
  constructor(readonly code: "permission-denied" | "failed-precondition" | "already-exists" | "not-found" | "resource-exhausted", message: string) {
    super(message);
    this.name = "GoogleAdminAccessError";
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new GoogleAdminAccessError("failed-precondition", "운영자 정보를 확인할 수 없습니다.");
  return result.data;
}

function accessRecord(value: unknown): Access {
  const access = parse(accessSchema, value);
  if (new Set(access.entries.map((entry) => entry.email)).size !== access.entries.length
    || new Set(access.entries.map((entry) => entry.employeeId)).size !== access.entries.length) {
    throw new GoogleAdminAccessError("failed-precondition", "운영자 연결 정보가 중복되어 있습니다.");
  }
  return access;
}

function isPending(employee: Employee) {
  return employee.firebaseUid.startsWith("pending-google-");
}

function isActive(entry: Entry, employee: Employee, authorization: Authorization | null) {
  return entry.active && employee.status === "active" && employee.roleScopes.includes("admin")
    && employee.employeeId === entry.employeeId && !isPending(employee)
    && (!entry.uid || entry.uid === employee.firebaseUid)
    && authorization?.active === true && authorization.employeeId === employee.employeeId
    && authorization.sessionVersion === employee.sessionVersion;
}

function requestFingerprint(operation: string, input: unknown, actor: GoogleAdminAccessActor) {
  return createHash("sha256").update(JSON.stringify({ operation, input, uid: actor.uid, employeeId: actor.employeeId })).digest("hex");
}

export async function requireActiveAdminTransaction(transaction: Transaction, db: Firestore, actor: VerifiedAdminActor) {
  const [accessSnapshot, employeeSnapshot, authorizationSnapshot] = await transaction.getAll(
    db.doc(ACCESS_PATH), db.doc(`employees/${actor.employeeId}`), db.doc(`authz/${actor.uid}`),
  );
  const access = accessRecord(accessSnapshot!.data());
  const employee = parse(employeeSchema, employeeSnapshot!.data());
  const authorization = parse(authzSchema, authorizationSnapshot!.data());
  const entry = access.entries.find((item) => item.employeeId === actor.employeeId && item.email === actor.email);
  if (!entry || employee.firebaseUid !== actor.uid || !isActive(entry, employee, authorization)
    || authorization.sessionVersion !== actor.sessionVersion || authorization.permissionsVersion !== actor.permissionsVersion) {
    throw new GoogleAdminAccessError("permission-denied", "현재 운영자 권한을 확인할 수 없습니다.");
  }
  return access;
}

export class GoogleAdminAccessService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: { db: Firestore; auth: Auth; now?: () => Date }) {
    this.now = dependencies.now ?? (() => new Date());
  }

  private async authorizedState(transaction: Transaction, actor: GoogleAdminAccessActor) {
    return requireActiveAdminTransaction(transaction, this.dependencies.db, actor);
  }

  private async members(transaction: Transaction, access: Access) {
    if (!access.entries.length) return [];
    const db = this.dependencies.db;
    const employees = await transaction.getAll(...access.entries.map((entry) => db.doc(`employees/${entry.employeeId}`)));
    const records = employees.map((snapshot) => parse(employeeSchema, snapshot.data()));
    const authorizations = await transaction.getAll(...records.map((employee) => db.doc(`authz/${employee.firebaseUid}`)));
    return access.entries.map((entry, index) => ({
      entry,
      employee: records[index]!,
      authorization: authorizations[index]!.exists ? parse(authzSchema, authorizations[index]!.data()) : null,
    }));
  }

  async list(actor: GoogleAdminAccessActor) {
    return this.dependencies.db.runTransaction(async (transaction) => {
      const access = await this.authorizedState(transaction, actor);
      const members = await this.members(transaction, access);
      return {
        revision: access.revision,
        entries: members.map(({ entry, employee, authorization }) => ({
          employeeId: entry.employeeId,
          displayName: employee.displayName,
          email: entry.email,
          status: !entry.active || employee.status !== "active" ? "disabled" as const
            : isActive(entry, employee, authorization) ? "active" as const : "pending" as const,
        })),
      };
    });
  }

  private audit(transaction: Transaction, operation: string, employeeId: string, actor: VerifiedAdminActor,
    input: { requestId: string; appVersion: string; reason?: string }, now: Timestamp) {
    const logId = randomUUID();
    transaction.create(this.dependencies.db.doc(`auditLogs/${logId}`), {
      logId, eventType: operation, actorUid: actor.uid, actorEmployeeId: actor.employeeId,
      targetType: "employee", targetId: employeeId, schoolId: null, cycleId: null,
      changedFields: ["adminAccess", "status"], changeReason: input.reason ?? null,
      requestId: input.requestId, appVersion: input.appVersion, createdAt: now,
    });
  }

  private replay(value: unknown, fingerprint: string, actor: GoogleAdminAccessActor) {
    const lock = parse(lockSchema, value);
    if (lock.actorUid !== actor.uid || lock.fingerprint !== fingerprint) {
      throw new GoogleAdminAccessError("failed-precondition", "요청 내용이 변경되었습니다. 목록을 새로고침해주세요.");
    }
    return lock;
  }

  async register(input: RegisterGoogleAdminAccessInput, actor: GoogleAdminAccessActor) {
    const db = this.dependencies.db;
    const fingerprint = requestFingerprint("register", input, actor);
    const lockRef = db.doc(`requestLocks/google-admin-${input.requestId}`);
    const employeeId = `EMP-GOOGLE-${randomUUID()}`;
    const now = Timestamp.fromDate(this.now());
    return db.runTransaction(async (transaction) => {
      const access = await this.authorizedState(transaction, actor);
      const lock = await transaction.get(lockRef);
      if (lock.exists) return this.replay(lock.data(), fingerprint, actor).result;
      if (access.revision !== input.expectedRevision) throw new GoogleAdminAccessError("failed-precondition", "운영자 목록이 변경되었습니다. 새로고침 후 다시 시도해주세요.");
      if (access.entries.some((entry) => entry.email === input.email)) throw new GoogleAdminAccessError("already-exists", "이미 등록된 Google 계정입니다.");
      if (access.entries.length >= MAX_ADMINS) throw new GoogleAdminAccessError("resource-exhausted", "운영자 등록 한도에 도달했습니다.");
      const result = { employeeId, revision: access.revision + 1 };
      transaction.create(db.doc(`employees/${employeeId}`), {
        employeeId, firebaseUid: `pending-google-${randomUUID()}`, displayName: input.displayName,
        roleScopes: ["admin"], permissions: { exportTeam: true }, status: "active", sessionVersion: 1,
        createdAt: now, updatedAt: now,
      });
      transaction.set(db.doc(ACCESS_PATH), {
        entries: [...access.entries, { email: input.email, employeeId, active: true }],
        revision: result.revision, updatedAt: now,
      }, { merge: true });
      transaction.create(lockRef, { actorUid: actor.uid, fingerprint, result, revokeUid: null, createdAt: now });
      this.audit(transaction, "GOOGLE_ADMIN_REGISTERED", employeeId, actor, input, now);
      return result;
    });
  }

  async disable(input: DisableGoogleAdminAccessInput, actor: GoogleAdminAccessActor) {
    const db = this.dependencies.db;
    const fingerprint = requestFingerprint("disable", input, actor);
    const lockRef = db.doc(`requestLocks/google-admin-${input.requestId}`);
    const now = Timestamp.fromDate(this.now());
    const operation = await db.runTransaction(async (transaction) => {
      const access = await this.authorizedState(transaction, actor);
      const lock = await transaction.get(lockRef);
      if (lock.exists) return this.replay(lock.data(), fingerprint, actor);
      if (input.employeeId === actor.employeeId) throw new GoogleAdminAccessError("failed-precondition", "현재 로그인한 운영자 계정은 해제할 수 없습니다.");
      if (access.revision !== input.expectedRevision) throw new GoogleAdminAccessError("failed-precondition", "운영자 목록이 변경되었습니다. 새로고침 후 다시 시도해주세요.");
      const members = await this.members(transaction, access);
      const target = members.find(({ entry }) => entry.employeeId === input.employeeId);
      if (!target) throw new GoogleAdminAccessError("not-found", "운영자를 찾을 수 없습니다.");
      if (!target.entry.active) throw new GoogleAdminAccessError("failed-precondition", "이미 해제된 운영자입니다.");
      if (!members.some(({ entry, employee, authorization }) => entry.employeeId !== input.employeeId && isActive(entry, employee, authorization))) {
        throw new GoogleAdminAccessError("failed-precondition", "접속 가능한 운영자를 한 명 이상 유지해야 합니다.");
      }
      const result = { employeeId: input.employeeId, revision: access.revision + 1 };
      const revokeUid = isPending(target.employee) ? null : target.employee.firebaseUid;
      const sessionVersion = target.employee.sessionVersion + 1;
      transaction.set(db.doc(ACCESS_PATH), {
        entries: access.entries.map((entry) => entry.employeeId === input.employeeId ? { ...entry, active: false } : entry),
        revision: result.revision, updatedAt: now,
      }, { merge: true });
      transaction.update(db.doc(`employees/${input.employeeId}`), { status: "disabled", sessionVersion, updatedAt: now });
      if (target.authorization) transaction.update(db.doc(`authz/${target.employee.firebaseUid}`), { active: false, sessionVersion, updatedAt: now });
      const saved = { actorUid: actor.uid, fingerprint, result, revokeUid, createdAt: now };
      transaction.create(lockRef, saved);
      this.audit(transaction, "GOOGLE_ADMIN_DISABLED", input.employeeId, actor, input, now);
      return saved;
    });
    if (operation.revokeUid) {
      try { await this.dependencies.auth.revokeRefreshTokens(operation.revokeUid); }
      catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "auth/user-not-found")) throw error;
      }
    }
    return operation.result;
  }

  async activate(input: { uid: string; email: string; appVersion: string }) {
    const db = this.dependencies.db;
    const now = Timestamp.fromDate(this.now());
    const activated = await db.runTransaction(async (transaction) => {
      const access = accessRecord((await transaction.get(db.doc(ACCESS_PATH))).data());
      const entry = access.entries.find((candidate) => candidate.email === input.email && candidate.active);
      if (!entry) throw new GoogleAdminAccessError("permission-denied", "운영자 허용목록에 등록되지 않은 계정입니다.");
      const employeeRef = db.doc(`employees/${entry.employeeId}`);
      const employee = parse(employeeSchema, (await transaction.get(employeeRef)).data());
      if (employee.employeeId !== entry.employeeId || employee.status !== "active" || !employee.roleScopes.includes("admin")) {
        throw new GoogleAdminAccessError("permission-denied", "활성 운영자 계정을 확인할 수 없습니다.");
      }
      if ((entry.uid && entry.uid !== input.uid) || (!isPending(employee) && employee.firebaseUid !== input.uid)) {
        throw new GoogleAdminAccessError("permission-denied", "이미 다른 Google 계정에 연결된 운영자입니다.");
      }
      const [currentAuthz, oldAuthz] = await transaction.getAll(db.doc(`authz/${input.uid}`), db.doc(`authz/${employee.firebaseUid}`));
      const current = currentAuthz!.exists ? parse(authzSchema, currentAuthz!.data()) : null;
      const previous = oldAuthz!.exists ? parse(authzSchema, oldAuthz!.data()) : null;
      const bindings = await transaction.get(db.collection("employees").where("firebaseUid", "==", input.uid).limit(2));
      if ((current && current.employeeId !== employee.employeeId) || (previous && previous.employeeId !== employee.employeeId)
        || bindings.docs.some((document) => document.id !== employee.employeeId)) {
        throw new GoogleAdminAccessError("permission-denied", "다른 직원에 연결된 계정은 운영자로 등록할 수 없습니다.");
      }
      const permissionsVersion = current?.permissionsVersion ?? previous?.permissionsVersion ?? 1;
      transaction.update(employeeRef, { firebaseUid: input.uid, updatedAt: now });
      transaction.set(db.doc(`authz/${input.uid}`), {
        employeeId: employee.employeeId, active: true, sessionVersion: employee.sessionVersion,
        permissionsVersion, updatedAt: now,
      });
      if (employee.firebaseUid !== input.uid && oldAuthz!.exists) transaction.delete(db.doc(`authz/${employee.firebaseUid}`));
      if (!entry.uid) transaction.set(db.doc(ACCESS_PATH), {
        entries: access.entries.map((candidate) => candidate.employeeId === entry.employeeId ? { ...candidate, uid: input.uid } : candidate),
        revision: access.revision + 1, updatedAt: now,
      }, { merge: true });
      this.audit(transaction, "ADMIN_SESSION_ACTIVATED", employee.employeeId,
        { uid: input.uid, employeeId: employee.employeeId, email: input.email },
        { requestId: randomUUID(), appVersion: input.appVersion }, now);
      return { employee, permissionsVersion };
    });
    await this.dependencies.auth.setCustomUserClaims(input.uid, {
      employeeId: activated.employee.employeeId, roleScopes: activated.employee.roleScopes,
      sessionVersion: activated.employee.sessionVersion, permissionsVersion: activated.permissionsVersion, adminApproved: true,
    });
    await this.dependencies.auth.updateUser(input.uid, { displayName: activated.employee.displayName });
    return { ok: true, employeeId: activated.employee.employeeId, displayName: activated.employee.displayName };
  }
}
