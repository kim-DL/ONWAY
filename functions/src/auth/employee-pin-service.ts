import type { DecodedIdToken } from "firebase-admin/auth";
import { Timestamp, type DocumentSnapshot, type Firestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";

import type { ChangeEmployeePinInput, ChangeEmployeePinResult } from "./employee-pin-contract.js";
import { LoginRepository } from "./login-repository.js";
import { claimsMatchAuthz } from "./login-service.js";
import { createOpaqueKey, createPinLookupKey, hashPin, isForbiddenPin, verifyPin } from "./pin-crypto.js";
import { hasActivePinReservation } from "./pin-reservations.js";

const employeeIdSchema = z.string().min(1).max(128).regex(/^[^/]+$/u);
const employeeSchema = z.object({
  employeeId: employeeIdSchema,
  firebaseUid: z.string().min(1),
  status: z.enum(["active", "disabled"]),
  roleScopes: z.array(z.enum(["delivery", "sales", "viewer", "admin"])).min(1).max(4),
  sessionVersion: z.number().int().positive(),
});
const authzSchema = z.object({
  employeeId: employeeIdSchema,
  active: z.boolean(),
  sessionVersion: z.number().int().positive(),
  permissionsVersion: z.number().int().positive(),
});
const credentialSchema = z.object({
  employeeId: employeeIdSchema,
  lookupKey: z.string().min(1).regex(/^[^/]+$/u),
  pinHash: z.string().min(1),
  pinVersion: z.number().int().positive(),
  sessionVersion: z.number().int().positive(),
});

export type EmployeePinActor = { uid: string; token: DecodedIdToken };

export class EmployeePinService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: {
    db: Firestore;
    lookupSecret: string;
    pinPepper: string;
    now?: () => Date;
  }) {
    this.now = dependencies.now ?? (() => new Date());
  }

  private async identity(actor: EmployeePinActor, transaction?: Transaction) {
    const parsedId = employeeIdSchema.safeParse(actor.token.employeeId);
    if (!parsedId.success || actor.uid !== actor.token.uid) {
      throw new HttpsError("failed-precondition", "현재 로그인 정보를 확인할 수 없습니다.");
    }
    const refs = [
      this.dependencies.db.doc(`employees/${parsedId.data}`),
      this.dependencies.db.doc(`authz/${actor.uid}`),
      this.dependencies.db.doc(`authCredentials/${parsedId.data}`),
    ];
    const snapshots = transaction
      ? await transaction.getAll(...refs)
      : await this.dependencies.db.getAll(...refs);
    const employee = employeeSchema.safeParse(snapshots[0]?.data());
    const authz = authzSchema.safeParse(snapshots[1]?.data());
    const credential = credentialSchema.safeParse(snapshots[2]?.data());
    if (!employee.success || !authz.success || !credential.success) {
      throw new HttpsError("failed-precondition", "직원 PIN 정보를 확인할 수 없습니다. 운영자에게 문의해주세요.");
    }
    const canonicalAuthz = { ...authz.data, uid: actor.uid, roleScopes: employee.data.roleScopes };
    if (
      !claimsMatchAuthz(actor.token, canonicalAuthz)
      || employee.data.status !== "active"
      || employee.data.firebaseUid !== actor.uid
      || employee.data.employeeId !== parsedId.data
      || credential.data.employeeId !== parsedId.data
      || employee.data.sessionVersion !== authz.data.sessionVersion
      || credential.data.sessionVersion !== authz.data.sessionVersion
    ) {
      throw new HttpsError("permission-denied", "현재 로그인으로 PIN을 변경할 수 없습니다.");
    }
    if (employee.data.roleScopes.includes("admin")) {
      throw new HttpsError("permission-denied", "운영자는 PIN 대신 Google 로그인을 사용합니다.");
    }
    return { employee: employee.data, credential: credential.data };
  }

  private replay(snapshot: DocumentSnapshot, actor: EmployeePinActor, fingerprint: string): ChangeEmployeePinResult | null {
    if (!snapshot.exists) return null;
    const receipt = snapshot.data()!;
    if (receipt.actorUid !== actor.uid || receipt.fingerprint !== fingerprint || receipt.operation !== "changeEmployeePin") {
      throw new HttpsError("already-exists", "같은 요청에 다른 PIN이 입력되었습니다. 새로 시도해주세요.", { reason: "pin-request-collision" });
    }
    return { changed: true, pinVersion: receipt.pinVersion as number };
  }

  async changePin(input: ChangeEmployeePinInput, actor: EmployeePinActor, sourceFingerprint: string): Promise<ChangeEmployeePinResult> {
    const identity = await this.identity(actor);
    const fingerprint = createOpaqueKey(
      JSON.stringify([actor.uid, input.currentPin, input.newPin, input.appVersion]),
      this.dependencies.lookupSecret,
      "onnuriway-pin-change-request-v1",
    );
    const receiptRef = this.dependencies.db.doc(`pinChangeRequests/${input.requestId}`);
    const prior = this.replay(await receiptRef.get(), actor, fingerprint);
    if (prior) {
      return this.dependencies.db.runTransaction(async (transaction) => {
        await this.identity(actor, transaction);
        return this.replay(await transaction.get(receiptRef), actor, fingerprint)!;
      });
    }

    const nowDate = this.now();
    const repository = new LoginRepository(this.dependencies.db);
    const personalKey = createOpaqueKey(actor.uid, this.dependencies.lookupSecret, "onnuriway-pin-change-person-v1");
    const sourceKey = createOpaqueKey(sourceFingerprint, this.dependencies.lookupSecret, "onnuriway-pin-change-source-v1");
    const [personalAttempt, sourceAttempt, lock] = await Promise.all([
      repository.consumeSourceAttempt(personalKey, nowDate),
      repository.consumeSourceAttempt(sourceKey, nowDate),
      repository.getLookupLock(personalKey, nowDate),
    ]);
    if (!personalAttempt.allowed || !sourceAttempt.allowed || !lock.allowed) {
      throw new HttpsError("resource-exhausted", "PIN 변경 시도가 많습니다. 잠시 후 다시 시도해주세요.");
    }
    if (isForbiddenPin(input.newPin)) {
      throw new HttpsError("invalid-argument", "연속되거나 같은 숫자가 반복되는 PIN은 사용할 수 없습니다.", { reason: "weak-pin" });
    }
    if (input.currentPin === input.newPin) {
      throw new HttpsError("invalid-argument", "현재 PIN과 다른 번호를 입력해주세요.", { reason: "unchanged-pin" });
    }
    if (!(await verifyPin(input.currentPin, identity.credential.pinHash, this.dependencies.pinPepper))) {
      const failure = await repository.recordFailure(personalKey, undefined, nowDate);
      if (failure.lockedNow) {
        throw new HttpsError("resource-exhausted", "PIN 확인에 여러 번 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
      throw new HttpsError("failed-precondition", "현재 PIN이 맞지 않습니다. 다시 확인해주세요.", { reason: "current-pin-mismatch" });
    }
    const lookupKey = createPinLookupKey(input.newPin, this.dependencies.lookupSecret);
    const pinHash = await hashPin(input.newPin, this.dependencies.pinPepper);
    const now = Timestamp.fromDate(nowDate);
    return this.dependencies.db.runTransaction(async (transaction) => {
      const current = await this.identity(actor, transaction);
      const replay = this.replay(await transaction.get(receiptRef), actor, fingerprint);
      if (replay) return replay;
      if (current.credential.pinVersion !== identity.credential.pinVersion || current.credential.pinHash !== identity.credential.pinHash) {
        throw new HttpsError("aborted", "PIN이 이미 변경되었습니다. 현재 PIN을 다시 입력해주세요.", { reason: "pin-changed" });
      }
      const oldIndexRef = this.dependencies.db.doc(`pinIndexes/${current.credential.lookupKey}`);
      const newIndexRef = this.dependencies.db.doc(`pinIndexes/${lookupKey}`);
      const [oldIndex, duplicate] = await transaction.getAll(oldIndexRef, newIndexRef);
      const reserved = await hasActivePinReservation(this.dependencies.db, transaction, lookupKey, now);
      if (oldIndex?.get("employeeId") !== current.employee.employeeId) {
        throw new HttpsError("failed-precondition", "기존 PIN을 확인할 수 없습니다. 운영자에게 문의해주세요.");
      }
      if (duplicate?.exists || reserved) {
        throw new HttpsError("already-exists", "이미 사용 중인 PIN입니다. 다른 번호를 입력해주세요.", { reason: "pin-in-use" });
      }
      const pinVersion = current.credential.pinVersion + 1;
      transaction.delete(oldIndexRef);
      transaction.create(newIndexRef, { employeeId: current.employee.employeeId, createdAt: now, updatedAt: now });
      transaction.update(this.dependencies.db.doc(`authCredentials/${current.employee.employeeId}`), {
        lookupKey, pinHash, pinVersion, failedAttemptCount: 0, lockedUntil: null, updatedAt: now,
      });
      transaction.delete(this.dependencies.db.doc(`loginRateLimits/lookup-${personalKey}`));
      transaction.create(receiptRef, { operation: "changeEmployeePin", actorUid: actor.uid, fingerprint, pinVersion, createdAt: now });
      const logId = `pin-change-${input.requestId}`;
      transaction.create(this.dependencies.db.doc(`auditLogs/${logId}`), {
        logId, eventType: "EMPLOYEE_PIN_CHANGED", actorUid: actor.uid, actorEmployeeId: current.employee.employeeId,
        targetType: "employee", targetId: current.employee.employeeId, schoolId: null, cycleId: null,
        changedFields: ["pin"], changeReason: null, requestId: input.requestId, appVersion: input.appVersion, createdAt: now,
      });
      return { changed: true, pinVersion };
    });
  }
}
