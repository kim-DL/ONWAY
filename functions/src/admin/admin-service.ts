import { randomUUID } from "node:crypto";

import type { Auth } from "firebase-admin/auth";
import {
  Timestamp,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";

import { createPinLookupKey, generateRandomPin, hashPin } from "../auth/pin-crypto.js";
import type { VerifiedAdminActor } from "./admin-authorization.js";
import type {
  CreateEmployeeInput,
  RevokeEmployeeSessionsInput,
  RotateEmployeePinInput,
  UpdateActivityTagsInput,
  UpdateEmployeeInput,
  UpdatePublicAppSettingsInput,
} from "./admin-contract.js";

const ADMIN_ACCESS_PATH = "secureSettings/adminAccess";
const PIN_RESERVATION_TTL_MS = 10 * 60 * 1_000;
const MAX_PIN_GENERATION_ATTEMPTS = 30;
const ROLE_SCOPES = new Set(["delivery", "sales", "viewer", "admin"]);

type RoleScope = "delivery" | "sales" | "viewer" | "admin";

type AdminAccessEntry = {
  email: string;
  employeeId: string;
  active: boolean;
};

type EmployeeRecord = {
  employeeId: string;
  firebaseUid: string;
  displayName: string;
  roleScopes: RoleScope[];
  permissions: { exportTeam: boolean };
  status: "active" | "disabled";
  sessionVersion: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

function dateValue(value: unknown) {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function roles(value: unknown): RoleScope[] {
  if (!Array.isArray(value)) return [];
  return value.filter((role): role is RoleScope =>
    typeof role === "string" && ROLE_SCOPES.has(role));
}

function employeeRecord(data: DocumentData | undefined, id: string): EmployeeRecord {
  const parsedRoles = roles(data?.roleScopes);
  if (
    !data
    || data.employeeId !== id
    || typeof data.firebaseUid !== "string"
    || typeof data.displayName !== "string"
    || parsedRoles.length === 0
    || (data.status !== "active" && data.status !== "disabled")
    || typeof data.sessionVersion !== "number"
  ) {
    throw new Error(`Employee contract is invalid: ${id}`);
  }
  return {
    employeeId: id,
    firebaseUid: data.firebaseUid,
    displayName: data.displayName,
    roleScopes: parsedRoles,
    permissions: { exportTeam: data.permissions?.exportTeam === true },
    status: data.status,
    sessionVersion: data.sessionVersion,
    createdAt: data.createdAt as Timestamp,
    updatedAt: data.updatedAt as Timestamp,
  };
}

function audit(input: {
  eventType: string;
  actor: VerifiedAdminActor;
  targetType: string;
  targetId: string | null;
  changedFields: string[];
  requestId: string;
  appVersion: string | null;
  reason?: string;
  createdAt: Timestamp;
}) {
  const logId = randomUUID();
  return {
    path: `auditLogs/${logId}`,
    data: {
      logId,
      eventType: input.eventType,
      actorUid: input.actor.uid,
      actorEmployeeId: input.actor.employeeId,
      targetType: input.targetType,
      targetId: input.targetId,
      schoolId: null,
      cycleId: null,
      changedFields: input.changedFields,
      changeReason: input.reason ?? null,
      requestId: input.requestId,
      appVersion: input.appVersion,
      createdAt: input.createdAt,
    },
  };
}

function employeeDto(employee: EmployeeRecord, permissionsVersion: number) {
  return {
    employeeId: employee.employeeId,
    displayName: employee.displayName,
    roleScopes: employee.roleScopes,
    exportTeam: employee.permissions.exportTeam,
    status: employee.status,
    sessionVersion: employee.sessionVersion,
    permissionsVersion,
    createdAt: dateValue(employee.createdAt),
    updatedAt: dateValue(employee.updatedAt),
  };
}

function safeCandidate(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.candidateId !== "string"
    || typeof candidate.name !== "string"
    || typeof candidate.latitude !== "number"
    || typeof candidate.longitude !== "number"
  ) return null;
  return {
    candidateId: candidate.candidateId,
    name: candidate.name,
    roadAddress: typeof candidate.roadAddress === "string" ? candidate.roadAddress : "",
    addressName: typeof candidate.addressName === "string" ? candidate.addressName : "",
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    score: typeof candidate.score === "number" ? candidate.score : 0,
    placeUrl: typeof candidate.placeUrl === "string" ? candidate.placeUrl : "",
  };
}

export class AdminNotFoundError extends Error {}
export class AdminConflictError extends Error {}
export class AdminPermissionError extends Error {}
export class AdminPinReservationError extends Error {}

export class AdminService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: {
    db: Firestore;
    auth: Auth;
    lookupSecret: string;
    pinPepper: string;
    now?: () => Date;
  }) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async activateGoogleAdmin(input: {
    uid: string;
    email: string;
    appVersion: string;
  }) {
    const accessSnapshot = await this.dependencies.db.doc(ADMIN_ACCESS_PATH).get();
    const entries = Array.isArray(accessSnapshot.data()?.entries)
      ? accessSnapshot.data()!.entries as AdminAccessEntry[]
      : [];
    const entry = entries.find((candidate) =>
      candidate?.active === true
      && typeof candidate.email === "string"
      && candidate.email.trim().toLowerCase() === input.email);
    if (!entry || typeof entry.employeeId !== "string") {
      throw new AdminPermissionError("관리자 허용목록에 등록되지 않은 계정입니다.");
    }

    const employeeRef = this.dependencies.db.doc(`employees/${entry.employeeId}`);
    const oldEmployeeSnapshot = await employeeRef.get();
    if (!oldEmployeeSnapshot.exists) throw new AdminPermissionError("관리자 직원 정보를 찾을 수 없습니다.");
    const employee = employeeRecord(oldEmployeeSnapshot.data(), oldEmployeeSnapshot.id);
    if (employee.status !== "active" || !employee.roleScopes.includes("admin")) {
      throw new AdminPermissionError("활성 admin 역할이 필요합니다.");
    }

    const previousAuthzSnapshot = await this.dependencies.db.doc(`authz/${employee.firebaseUid}`).get();
    const permissionsVersion = typeof previousAuthzSnapshot.data()?.permissionsVersion === "number"
      ? previousAuthzSnapshot.data()!.permissionsVersion as number
      : 1;
    const activatedAt = Timestamp.fromDate(this.now());
    const actor: VerifiedAdminActor = {
      uid: input.uid,
      employeeId: employee.employeeId,
      email: input.email,
    };
    const activationAudit = audit({
      eventType: "ADMIN_SESSION_ACTIVATED",
      actor,
      targetType: "employee",
      targetId: employee.employeeId,
      changedFields: ["firebaseUid", "adminApproved", "authz"],
      requestId: randomUUID(),
      appVersion: input.appVersion,
      createdAt: activatedAt,
    });

    await this.dependencies.db.runTransaction(async (transaction) => {
      const freshEmployeeSnapshot = await transaction.get(employeeRef);
      if (!freshEmployeeSnapshot.exists) throw new AdminPermissionError("관리자 직원 정보를 찾을 수 없습니다.");
      const freshEmployee = employeeRecord(freshEmployeeSnapshot.data(), freshEmployeeSnapshot.id);
      if (freshEmployee.status !== "active" || !freshEmployee.roleScopes.includes("admin")) {
        throw new AdminPermissionError("관리자 권한이 변경되었습니다.");
      }

      transaction.update(employeeRef, { firebaseUid: input.uid, updatedAt: activatedAt });
      transaction.set(this.dependencies.db.doc(`authz/${input.uid}`), {
        employeeId: freshEmployee.employeeId,
        active: true,
        sessionVersion: freshEmployee.sessionVersion,
        permissionsVersion,
        updatedAt: activatedAt,
      });
      if (freshEmployee.firebaseUid !== input.uid) {
        transaction.delete(this.dependencies.db.doc(`authz/${freshEmployee.firebaseUid}`));
      }
      transaction.create(this.dependencies.db.doc(activationAudit.path), activationAudit.data);
    });

    await this.dependencies.auth.setCustomUserClaims(input.uid, {
      employeeId: employee.employeeId,
      roleScopes: employee.roleScopes,
      sessionVersion: employee.sessionVersion,
      permissionsVersion,
      adminApproved: true,
    });
    await this.dependencies.auth.updateUser(input.uid, { displayName: employee.displayName });
    if (employee.firebaseUid !== input.uid) {
      await this.dependencies.auth.revokeRefreshTokens(employee.firebaseUid).catch(() => undefined);
    }

    return {
      ok: true,
      employeeId: employee.employeeId,
      displayName: employee.displayName,
    };
  }

  async reservePin(requestId: string, actor: VerifiedAdminActor) {
    const now = Timestamp.fromDate(this.now());
    for (let attempt = 0; attempt < MAX_PIN_GENERATION_ATTEMPTS; attempt += 1) {
      const pin = generateRandomPin();
      const lookupKey = createPinLookupKey(pin, this.dependencies.lookupSecret);
      const [indexSnapshot, reservationSnapshot] = await Promise.all([
        this.dependencies.db.doc(`pinIndexes/${lookupKey}`).get(),
        this.dependencies.db.collection("pinReservations")
          .where("lookupKey", "==", lookupKey)
          .limit(1)
          .get(),
      ]);
      if (indexSnapshot.exists || !reservationSnapshot.empty) continue;

      const reservationId = randomUUID();
      const expiresAt = Timestamp.fromMillis(now.toMillis() + PIN_RESERVATION_TTL_MS);
      await this.dependencies.db.doc(`pinReservations/${reservationId}`).create({
        reservationId,
        lookupKey,
        pinHash: await hashPin(pin, this.dependencies.pinPepper),
        requestedBy: actor.employeeId,
        requestId,
        createdAt: now,
        expiresAt,
      });
      return { reservationId, pin, expiresAt: expiresAt.toDate().toISOString() };
    }
    throw new AdminConflictError("고유 PIN을 만들지 못했습니다. 다시 시도해주세요.");
  }

  async createEmployee(input: CreateEmployeeInput, actor: VerifiedAdminActor) {
    if (input.roleScopes.includes("admin")) {
      throw new AdminPermissionError("관리자 계정은 Google 허용목록 절차로만 등록할 수 있습니다.");
    }

    const employeeId = `EMP-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const uid = `staff-${randomUUID()}`;
    const now = Timestamp.fromDate(this.now());
    const directorySnapshot = await this.dependencies.db.collection("employeeDirectory")
      .orderBy("displayOrder", "desc")
      .limit(1)
      .get();
    const previousDisplayOrder = Number(directorySnapshot.docs[0]?.get("displayOrder") ?? 0);
    const displayOrder = (Number.isSafeInteger(previousDisplayOrder) && previousDisplayOrder >= 0
      ? previousDisplayOrder
      : 0) + 1;

    await this.dependencies.auth.createUser({
      uid,
      displayName: input.displayName,
      disabled: false,
    });

    try {
      const result = await this.dependencies.db.runTransaction(async (transaction) => {
        const reservationRef = this.dependencies.db.doc(`pinReservations/${input.reservationId}`);
        const reservationSnapshot = await transaction.get(reservationRef);
        if (!reservationSnapshot.exists) throw new AdminPinReservationError("PIN을 다시 생성해주세요.");
        const reservation = reservationSnapshot.data()!;
        if (
          reservation.requestedBy !== actor.employeeId
          || !(reservation.expiresAt instanceof Timestamp)
          || reservation.expiresAt.toMillis() <= now.toMillis()
          || typeof reservation.lookupKey !== "string"
          || typeof reservation.pinHash !== "string"
        ) {
          throw new AdminPinReservationError("PIN 생성 시간이 지났습니다. 새 PIN을 만들어주세요.");
        }
        const indexRef = this.dependencies.db.doc(`pinIndexes/${reservation.lookupKey}`);
        const existingIndex = await transaction.get(indexRef);
        if (existingIndex.exists) throw new AdminPinReservationError("PIN이 중복되었습니다. 새 PIN을 만들어주세요.");

        const employee = {
          employeeId,
          firebaseUid: uid,
          displayName: input.displayName,
          roleScopes: input.roleScopes,
          permissions: { exportTeam: input.exportTeam },
          status: "active",
          sessionVersion: 1,
          createdAt: now,
          updatedAt: now,
        };
        const createdAudit = audit({
          eventType: "EMPLOYEE_CREATED",
          actor,
          targetType: "employee",
          targetId: employeeId,
          changedFields: ["displayName", "roleScopes", "permissions", "pin"],
          requestId: input.requestId,
          appVersion: input.appVersion,
          createdAt: now,
        });

        transaction.create(this.dependencies.db.doc(`employees/${employeeId}`), employee);
        transaction.create(this.dependencies.db.doc(`employeeDirectory/${employeeId}`), {
          employeeId,
          displayName: input.displayName,
          active: true,
          displayOrder,
        });
        transaction.create(this.dependencies.db.doc(`authCredentials/${employeeId}`), {
          employeeId,
          lookupKey: reservation.lookupKey,
          pinHash: reservation.pinHash,
          pinVersion: 1,
          failedAttemptCount: 0,
          lockedUntil: null,
          sessionVersion: 1,
          updatedAt: now,
        });
        transaction.create(indexRef, {
          employeeId,
          createdAt: now,
          updatedAt: now,
        });
        transaction.create(this.dependencies.db.doc(`authz/${uid}`), {
          employeeId,
          active: true,
          sessionVersion: 1,
          permissionsVersion: 1,
          updatedAt: now,
        });
        transaction.create(this.dependencies.db.doc(createdAudit.path), createdAudit.data);
        transaction.delete(reservationRef);
        return employee;
      });

      await this.dependencies.auth.setCustomUserClaims(uid, {
        employeeId,
        roleScopes: input.roleScopes,
        sessionVersion: 1,
        permissionsVersion: 1,
      });
      return employeeDto(result as EmployeeRecord, 1);
    } catch (error) {
      await this.dependencies.auth.deleteUser(uid).catch(() => undefined);
      throw error;
    }
  }

  private async ensureAdminContinuity(employee: EmployeeRecord, nextRoles: RoleScope[], nextStatus: "active" | "disabled") {
    if (!employee.roleScopes.includes("admin") || (nextRoles.includes("admin") && nextStatus === "active")) return;
    const activeAdmins = await this.dependencies.db.collection("employees")
      .where("status", "==", "active")
      .where("roleScopes", "array-contains", "admin")
      .limit(2)
      .get();
    if (activeAdmins.docs.filter((document) => document.id !== employee.employeeId).length === 0) {
      throw new AdminConflictError("마지막 활성 관리자는 비활성화하거나 admin 역할을 제거할 수 없습니다.");
    }
  }

  async updateEmployee(input: UpdateEmployeeInput, actor: VerifiedAdminActor) {
    const employeeRef = this.dependencies.db.doc(`employees/${input.employeeId}`);
    const snapshot = await employeeRef.get();
    if (!snapshot.exists) throw new AdminNotFoundError("직원을 찾을 수 없습니다.");
    const employee = employeeRecord(snapshot.data(), snapshot.id);
    if (!employee.roleScopes.includes("admin") && input.roleScopes.includes("admin")) {
      throw new AdminPermissionError("admin 역할은 Google 허용목록 절차로만 부여할 수 있습니다.");
    }
    await this.ensureAdminContinuity(employee, input.roleScopes, input.status);

    const now = Timestamp.fromDate(this.now());
    const authzRef = this.dependencies.db.doc(`authz/${employee.firebaseUid}`);
    const authzSnapshot = await authzRef.get();
    if (!authzSnapshot.exists) throw new AdminConflictError("직원 권한 문서를 찾을 수 없습니다.");
    const currentPermissionsVersion = authzSnapshot.get("permissionsVersion") as number;
    const rolesChanged = JSON.stringify([...employee.roleScopes].sort()) !== JSON.stringify([...input.roleScopes].sort());
    const permissionChanged = rolesChanged || employee.permissions.exportTeam !== input.exportTeam;
    const shouldRevoke = input.revokeSessions || input.status === "disabled";
    const nextSessionVersion = employee.sessionVersion + (shouldRevoke ? 1 : 0);
    const nextPermissionsVersion = currentPermissionsVersion + (permissionChanged ? 1 : 0);
    const changedFields = [
      ...(employee.displayName !== input.displayName ? ["displayName"] : []),
      ...(rolesChanged ? ["roleScopes"] : []),
      ...(employee.permissions.exportTeam !== input.exportTeam ? ["permissions"] : []),
      ...(employee.status !== input.status ? ["status"] : []),
      ...(shouldRevoke ? ["sessionVersion"] : []),
    ];
    const updatedAudit = audit({
      eventType: "EMPLOYEE_UPDATED",
      actor,
      targetType: "employee",
      targetId: employee.employeeId,
      changedFields,
      requestId: input.requestId,
      appVersion: input.appVersion,
      reason: input.reason,
      createdAt: now,
    });

    await this.dependencies.db.runTransaction(async (transaction) => {
      const credentialRef = this.dependencies.db.doc(`authCredentials/${employee.employeeId}`);
      const directoryRef = this.dependencies.db.doc(`employeeDirectory/${employee.employeeId}`);
      const [credential, directory] = await Promise.all([
        transaction.get(credentialRef),
        transaction.get(directoryRef),
      ]);
      const currentDisplayOrder = Number(directory.get("displayOrder") ?? 0);
      transaction.update(employeeRef, {
        displayName: input.displayName,
        roleScopes: input.roleScopes,
        permissions: { exportTeam: input.exportTeam },
        status: input.status,
        sessionVersion: nextSessionVersion,
        updatedAt: now,
      });
      transaction.set(directoryRef, {
        employeeId: employee.employeeId,
        displayName: input.displayName,
        active: input.status === "active",
        displayOrder: Number.isSafeInteger(currentDisplayOrder) && currentDisplayOrder >= 0
          ? currentDisplayOrder
          : 0,
      }, { merge: true });
      transaction.update(authzRef, {
        active: input.status === "active",
        sessionVersion: nextSessionVersion,
        permissionsVersion: nextPermissionsVersion,
        updatedAt: now,
      });
      if (credential.exists && shouldRevoke) {
        transaction.update(credentialRef, { sessionVersion: nextSessionVersion, updatedAt: now });
      }
      transaction.create(this.dependencies.db.doc(updatedAudit.path), updatedAudit.data);
    });

    const existingUser = await this.dependencies.auth.getUser(employee.firebaseUid);
    await this.dependencies.auth.setCustomUserClaims(employee.firebaseUid, {
      employeeId: employee.employeeId,
      roleScopes: input.roleScopes,
      sessionVersion: nextSessionVersion,
      permissionsVersion: nextPermissionsVersion,
      ...(input.roleScopes.includes("admin") && existingUser.customClaims?.adminApproved === true
        ? { adminApproved: true }
        : {}),
    });
    await this.dependencies.auth.updateUser(employee.firebaseUid, {
      displayName: input.displayName,
      disabled: input.status === "disabled",
    });
    if (shouldRevoke) await this.dependencies.auth.revokeRefreshTokens(employee.firebaseUid);

    return employeeDto({
      ...employee,
      displayName: input.displayName,
      roleScopes: input.roleScopes,
      permissions: { exportTeam: input.exportTeam },
      status: input.status,
      sessionVersion: nextSessionVersion,
      updatedAt: now,
    }, nextPermissionsVersion);
  }

  private async uniquePin() {
    for (let attempt = 0; attempt < MAX_PIN_GENERATION_ATTEMPTS; attempt += 1) {
      const pin = generateRandomPin();
      const lookupKey = createPinLookupKey(pin, this.dependencies.lookupSecret);
      if (!(await this.dependencies.db.doc(`pinIndexes/${lookupKey}`).get()).exists) {
        return { pin, lookupKey, pinHash: await hashPin(pin, this.dependencies.pinPepper) };
      }
    }
    throw new AdminConflictError("고유 PIN을 만들지 못했습니다. 다시 시도해주세요.");
  }

  async rotatePin(input: RotateEmployeePinInput, actor: VerifiedAdminActor) {
    const employeeSnapshot = await this.dependencies.db.doc(`employees/${input.employeeId}`).get();
    if (!employeeSnapshot.exists) throw new AdminNotFoundError("직원을 찾을 수 없습니다.");
    const employee = employeeRecord(employeeSnapshot.data(), employeeSnapshot.id);
    if (employee.roleScopes.includes("admin")) {
      throw new AdminPermissionError("관리자 계정은 PIN 대신 Google 로그인을 사용합니다.");
    }
    const credentialRef = this.dependencies.db.doc(`authCredentials/${employee.employeeId}`);
    const credentialSnapshot = await credentialRef.get();
    if (!credentialSnapshot.exists) throw new AdminNotFoundError("직원 PIN 정보를 찾을 수 없습니다.");
    const oldLookupKey = credentialSnapshot.get("lookupKey") as string | undefined;
    if (!oldLookupKey) throw new AdminConflictError("기존 PIN을 먼저 마이그레이션해야 합니다.");
    const generated = await this.uniquePin();
    const now = Timestamp.fromDate(this.now());
    const nextSessionVersion = employee.sessionVersion + (input.revokeSessions ? 1 : 0);
    const pinVersion = (credentialSnapshot.get("pinVersion") as number | undefined ?? 0) + 1;
    const rotatedAudit = audit({
      eventType: "EMPLOYEE_PIN_ROTATED",
      actor,
      targetType: "employee",
      targetId: employee.employeeId,
      changedFields: ["pin", ...(input.revokeSessions ? ["sessionVersion"] : [])],
      requestId: input.requestId,
      appVersion: input.appVersion,
      reason: input.reason,
      createdAt: now,
    });

    await this.dependencies.db.runTransaction(async (transaction) => {
      const duplicate = await transaction.get(this.dependencies.db.doc(`pinIndexes/${generated.lookupKey}`));
      if (duplicate.exists) throw new AdminConflictError("PIN이 중복되었습니다. 다시 시도해주세요.");
      transaction.delete(this.dependencies.db.doc(`pinIndexes/${oldLookupKey}`));
      transaction.create(this.dependencies.db.doc(`pinIndexes/${generated.lookupKey}`), {
        employeeId: employee.employeeId,
        createdAt: now,
        updatedAt: now,
      });
      transaction.update(credentialRef, {
        lookupKey: generated.lookupKey,
        pinHash: generated.pinHash,
        pinVersion,
        failedAttemptCount: 0,
        lockedUntil: null,
        sessionVersion: nextSessionVersion,
        updatedAt: now,
      });
      if (input.revokeSessions) {
        transaction.update(this.dependencies.db.doc(`employees/${employee.employeeId}`), {
          sessionVersion: nextSessionVersion,
          updatedAt: now,
        });
        transaction.update(this.dependencies.db.doc(`authz/${employee.firebaseUid}`), {
          sessionVersion: nextSessionVersion,
          updatedAt: now,
        });
      }
      transaction.create(this.dependencies.db.doc(rotatedAudit.path), rotatedAudit.data);
    });
    if (input.revokeSessions) await this.dependencies.auth.revokeRefreshTokens(employee.firebaseUid);
    return { employeeId: employee.employeeId, pin: generated.pin, sessionRevoked: input.revokeSessions };
  }

  async revokeSessions(input: RevokeEmployeeSessionsInput, actor: VerifiedAdminActor) {
    const employeeSnapshot = await this.dependencies.db.doc(`employees/${input.employeeId}`).get();
    if (!employeeSnapshot.exists) throw new AdminNotFoundError("직원을 찾을 수 없습니다.");
    const employee = employeeRecord(employeeSnapshot.data(), employeeSnapshot.id);
    if (employee.employeeId === actor.employeeId) {
      throw new AdminConflictError("현재 관리자 자신의 세션은 로그아웃으로 종료해주세요.");
    }
    const nextSessionVersion = employee.sessionVersion + 1;
    const now = Timestamp.fromDate(this.now());
    const revokedAudit = audit({
      eventType: "EMPLOYEE_SESSIONS_REVOKED",
      actor,
      targetType: "employee",
      targetId: employee.employeeId,
      changedFields: ["sessionVersion"],
      requestId: input.requestId,
      appVersion: input.appVersion,
      reason: input.reason,
      createdAt: now,
    });
    await this.dependencies.db.runTransaction(async (transaction) => {
      const credentialRef = this.dependencies.db.doc(`authCredentials/${employee.employeeId}`);
      const credential = await transaction.get(credentialRef);
      transaction.update(this.dependencies.db.doc(`employees/${employee.employeeId}`), {
        sessionVersion: nextSessionVersion,
        updatedAt: now,
      });
      transaction.update(this.dependencies.db.doc(`authz/${employee.firebaseUid}`), {
        sessionVersion: nextSessionVersion,
        updatedAt: now,
      });
      if (credential.exists) transaction.update(credentialRef, { sessionVersion: nextSessionVersion, updatedAt: now });
      transaction.create(this.dependencies.db.doc(revokedAudit.path), revokedAudit.data);
    });
    await this.dependencies.auth.revokeRefreshTokens(employee.firebaseUid);
    return { employeeId: employee.employeeId, sessionVersion: nextSessionVersion };
  }

  async workspace(cycleId: string | null) {
    const [employeesSnapshot, schoolsSnapshot, cyclesSnapshot, zonesSnapshot, activityTagsSnapshot, settingsSnapshot, syncSnapshot, reviewsSnapshot, auditsSnapshot] = await Promise.all([
      this.dependencies.db.collection("employees").limit(500).get(),
      this.dependencies.db.collection("schools").limit(1_000).get(),
      this.dependencies.db.collection("salesCycles").orderBy("cycleId", "desc").limit(36).get(),
      this.dependencies.db.collection("zones").orderBy("displayOrder").limit(100).get(),
      this.dependencies.db.collection("activityTags").orderBy("displayOrder").limit(100).get(),
      this.dependencies.db.doc("appSettings/public").get(),
      this.dependencies.db.collection("neisSyncRuns").orderBy("startedAt", "desc").limit(12).get(),
      this.dependencies.db.collection("kakaoMatchReviews").limit(500).get(),
      this.dependencies.db.collection("auditLogs").orderBy("createdAt", "desc").limit(40).get(),
    ]);
    const selectedCycleId = cycleId
      ?? (settingsSnapshot.get("currentSalesCycleId") as string | undefined)
      ?? cyclesSnapshot.docs[0]?.id
      ?? null;
    const assignmentsSnapshot = selectedCycleId
      ? await this.dependencies.db.collection(`salesCycles/${selectedCycleId}/assignments`).limit(1_000).get()
      : null;
    const authzByUid = new Map<string, DocumentData>();
    const authzSnapshots = await Promise.all(employeesSnapshot.docs.map((employee) =>
      this.dependencies.db.doc(`authz/${String(employee.get("firebaseUid"))}`).get()));
    for (const snapshot of authzSnapshots) if (snapshot.exists) authzByUid.set(snapshot.id, snapshot.data()!);

    return {
      generatedAt: this.now().toISOString(),
      selectedCycleId,
      employees: employeesSnapshot.docs.map((document) => {
        const employee = employeeRecord(document.data(), document.id);
        const authz = authzByUid.get(employee.firebaseUid);
        return employeeDto(employee, typeof authz?.permissionsVersion === "number" ? authz.permissionsVersion : 0);
      }).sort((left, right) => left.displayName.localeCompare(right.displayName, "ko")),
      schools: schoolsSnapshot.docs.map((document) => ({
        schoolId: document.id,
        name: String(document.get("name") ?? document.id),
        district: String(document.get("district") ?? ""),
        schoolType: String(document.get("schoolType") ?? ""),
        roadAddress: typeof document.get("address.road") === "string" ? document.get("address.road") as string : null,
        locationStatus: String(document.get("location.matchStatus") ?? "unmatched"),
        possibleRelocation: document.get("possibleRelocation") === true,
        schoolBaseRevision: Number(document.get("schoolBaseRevision") ?? 0),
      })).sort((left, right) => left.name.localeCompare(right.name, "ko")),
      cycles: cyclesSnapshot.docs.map((document) => ({
        cycleId: document.id,
        status: String(document.get("status")),
        promotedProductNames: Array.isArray(document.get("promotedProductNames"))
          ? (document.get("promotedProductNames") as unknown[]).filter((value): value is string => typeof value === "string").slice(0, 12)
          : [],
        copiedFromCycleId: document.get("copiedFromCycleId") as string | null,
        createdAt: dateValue(document.get("createdAt")),
      })),
      zones: zonesSnapshot.docs.map((document) => ({
        zoneId: document.id,
        name: String(document.get("name")),
        active: document.get("active") === true,
      })),
      activityTags: activityTagsSnapshot.docs.map((document) => ({
        tagId: document.id,
        label: String(document.get("label") ?? document.id),
        active: document.get("active") === true,
        displayOrder: Number(document.get("displayOrder") ?? 0),
        updatedAt: dateValue(document.get("updatedAt")),
      })),
      assignments: assignmentsSnapshot?.docs.map((document) => ({
        schoolId: document.id,
        zoneId: typeof document.get("zoneId") === "string"
          ? document.get("zoneId") as string
          : null,
        primaryAssigneeId: String(document.get("primaryAssigneeId")),
        assigneeIds: Array.isArray(document.get("assigneeIds")) ? document.get("assigneeIds") as string[] : [],
        monthlyStatus: String(document.get("monthlyStatus")),
        revision: Number(document.get("revision") ?? 0),
      })) ?? [],
      settings: {
        minimumAppVersion: settingsSnapshot.get("minimumAppVersion") as string | null ?? null,
        currentSalesCycleId: settingsSnapshot.get("currentSalesCycleId") as string | null ?? null,
        commonCatalogVersion: Number(settingsSnapshot.get("commonCatalogVersion") ?? 0),
        maintenanceMode: settingsSnapshot.get("maintenanceMode") === true,
        updatedAt: dateValue(settingsSnapshot.get("updatedAt")),
      },
      syncRuns: syncSnapshot.docs.map((document) => ({
        runId: document.id,
        status: String(document.get("status")),
        sourceCount: Number(document.get("sourceCount") ?? 0),
        newCount: Number(document.get("newCount") ?? 0),
        changedCount: Number(document.get("changedCount") ?? 0),
        missingCount: Number(document.get("missingCount") ?? 0),
        appliedCount: Number(document.get("appliedCount") ?? 0),
        startedAt: dateValue(document.get("startedAt")),
        completedAt: dateValue(document.get("completedAt")),
      })),
      kakaoReviews: reviewsSnapshot.docs.map((document) => ({
        schoolId: document.id,
        schoolBaseRevision: Number(document.get("schoolBaseRevision") ?? 0),
        neisName: String(document.get("neisName") ?? document.id),
        neisRoadAddress: document.get("neisRoadAddress") as string | null ?? null,
        status: String(document.get("status")),
        reason: String(document.get("reason") ?? ""),
        candidates: (Array.isArray(document.get("candidates")) ? document.get("candidates") as unknown[] : [])
          .map(safeCandidate)
          .filter((candidate) => candidate !== null),
        generatedAt: dateValue(document.get("generatedAt")),
      })).sort((left, right) => left.neisName.localeCompare(right.neisName, "ko")),
      audits: auditsSnapshot.docs.map((document) => this.auditDto(document.id, document.data())),
    };
  }

  private auditDto(id: string, data: DocumentData) {
    return {
      logId: typeof data.logId === "string" ? data.logId : id,
      eventType: String(data.eventType ?? data.type ?? "UNKNOWN"),
      actorEmployeeId: typeof data.actorEmployeeId === "string"
        ? data.actorEmployeeId
        : typeof data.employeeId === "string" ? data.employeeId : null,
      targetType: typeof data.targetType === "string" ? data.targetType : "session",
      targetId: typeof data.targetId === "string" ? data.targetId : null,
      changedFields: Array.isArray(data.changedFields) ? data.changedFields.filter((value): value is string => typeof value === "string") : [],
      changeReason: typeof data.changeReason === "string" ? data.changeReason : typeof data.reason === "string" ? data.reason : null,
      createdAt: dateValue(data.createdAt ?? data.occurredAt),
    };
  }

  async listAuditLogs(limit: number) {
    const snapshot = await this.dependencies.db.collection("auditLogs")
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    return { logs: snapshot.docs.map((document) => this.auditDto(document.id, document.data())) };
  }

  async updateSettings(input: UpdatePublicAppSettingsInput, actor: VerifiedAdminActor) {
    const settingsRef = this.dependencies.db.doc("appSettings/public");
    const now = Timestamp.fromDate(this.now());
    const settingsAudit = audit({
      eventType: "APP_SETTINGS_UPDATED",
      actor,
      targetType: "appSettings",
      targetId: "public",
      changedFields: ["minimumAppVersion", "maintenanceMode"],
      requestId: input.requestId,
      appVersion: input.appVersion,
      createdAt: now,
    });
    await this.dependencies.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(settingsRef);
      if (!snapshot.exists) throw new AdminNotFoundError("공개 앱 설정을 찾을 수 없습니다.");
      transaction.update(settingsRef, {
        minimumAppVersion: input.minimumAppVersion,
        maintenanceMode: input.maintenanceMode,
        updatedAt: now,
      });
      transaction.create(this.dependencies.db.doc(settingsAudit.path), settingsAudit.data);
    });
    return {
      minimumAppVersion: input.minimumAppVersion,
      maintenanceMode: input.maintenanceMode,
      updatedAt: now.toDate().toISOString(),
    };
  }

  async updateActivityTags(input: UpdateActivityTagsInput, actor: VerifiedAdminActor) {
    const now = Timestamp.fromDate(this.now());
    const resolvedTags = input.tags.map((tag, index) => ({
      ...tag,
      tagId: tag.tagId ?? `ACT-${randomUUID()}`,
      displayOrder: index + 1,
    }));
    const tagsAudit = audit({
      eventType: "ACTIVITY_TAGS_UPDATED",
      actor,
      targetType: "activityTags",
      targetId: null,
      changedFields: resolvedTags.map((tag) => tag.tagId),
      requestId: input.requestId,
      appVersion: input.appVersion,
      reason: `영업 활동 태그 ${resolvedTags.length}개 구성`,
      createdAt: now,
    });
    await this.dependencies.db.runTransaction(async (transaction) => {
      const existingSnapshot = await transaction.get(
        this.dependencies.db.collection("activityTags").limit(100),
      );
      const existing = new Map(existingSnapshot.docs.map((document) => [document.id, document]));
      for (const tag of resolvedTags) {
        if (tag.tagId && input.tags.some((candidate) => candidate.tagId === tag.tagId) && !existing.has(tag.tagId)) {
          throw new AdminNotFoundError("수정할 활동 태그를 찾을 수 없습니다. 최신 상태를 다시 불러와주세요.");
        }
        const previous = existing.get(tag.tagId);
        transaction.set(this.dependencies.db.doc(`activityTags/${tag.tagId}`), {
          tagId: tag.tagId,
          label: tag.label,
          active: tag.active,
          displayOrder: tag.displayOrder,
          createdAt: previous?.get("createdAt") instanceof Timestamp ? previous.get("createdAt") : now,
          updatedAt: now,
        });
      }
      transaction.create(this.dependencies.db.doc(tagsAudit.path), tagsAudit.data);
    });
    return {
      tags: resolvedTags.map((tag) => ({
        tagId: tag.tagId,
        label: tag.label,
        active: tag.active,
        displayOrder: tag.displayOrder,
        updatedAt: now.toDate().toISOString(),
      })),
    };
  }
}
