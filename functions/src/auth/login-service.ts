import type { DecodedIdToken } from "firebase-admin/auth";

import {
  consumePinHashCost,
  createOpaqueKey,
  createPinLookupKey,
  isSixDigitPin,
  verifyPin,
} from "./pin-crypto.js";
import type {
  AuditEventInput,
  LoginIdentity,
  LoginRepository,
} from "./login-repository.js";

const GENERIC_LOGIN_MESSAGE = "PIN을 확인해주세요.";
const GENERIC_LOCK_MESSAGE = "잠시 후 다시 시도해주세요.";

export type LoginServiceDependencies = {
  repository: Pick<
    LoginRepository,
    | "audit"
    | "consumeSourceAttempt"
    | "findLoginIdentity"
    | "getLookupLock"
    | "recordFailure"
    | "recordSuccess"
  >;
  lookupSecret: string;
  pinPepper: string;
  issueCustomToken: (
    uid: string,
    claims: Record<string, unknown>,
  ) => Promise<string>;
  now?: () => Date;
};

export type EmployeeLoginInput = {
  pin: string;
  sourceFingerprint: string;
  requestId: string;
};

export type EmployeeLoginResult = {
  customToken: string;
};

export class LoginRejectedError extends Error {
  constructor(
    readonly kind: "invalid" | "rate-limited",
    message = kind === "rate-limited" ? GENERIC_LOCK_MESSAGE : GENERIC_LOGIN_MESSAGE,
  ) {
    super(message);
    this.name = "LoginRejectedError";
  }
}

function isIdentityEligible(identity: LoginIdentity) {
  const { employee, credential, authz } = identity;
  return (
    employee.status === "active" &&
    authz.active &&
    !employee.roleScopes.includes("admin") &&
    employee.employeeId === credential.employeeId &&
    employee.employeeId === authz.employeeId &&
    employee.firebaseUid === authz.uid &&
    employee.sessionVersion === credential.sessionVersion &&
    employee.sessionVersion === authz.sessionVersion &&
    employee.roleScopes.length === authz.roleScopes.length &&
    employee.roleScopes.every((scope) => authz.roleScopes.includes(scope))
  );
}

export class EmployeeLoginService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: LoginServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  private async audit(event: AuditEventInput, now: Date) {
    await this.dependencies.repository.audit(event, now);
  }

  private async rejectFailure(
    lookupKey: string,
    employeeId: string | undefined,
    requestId: string,
    now: Date,
  ): Promise<never> {
    const result = await this.dependencies.repository.recordFailure(
      lookupKey,
      employeeId,
      now,
    );

    if (result.lockedNow) {
      await this.audit(
        {
          type: "LOGIN_LOCKED",
          ...(employeeId ? { employeeId } : {}),
          requestId,
          reason: "lookup-failure-limit",
        },
        now,
      );
      throw new LoginRejectedError("rate-limited");
    }

    await this.audit(
      {
        type: "LOGIN_FAILURE",
        ...(employeeId ? { employeeId } : {}),
        requestId,
        reason: "pin-rejected",
      },
      now,
    );

    throw new LoginRejectedError("invalid");
  }

  async login(input: EmployeeLoginInput): Promise<EmployeeLoginResult> {
    const now = this.now();
    const sourceKey = createOpaqueKey(
      input.sourceFingerprint,
      this.dependencies.lookupSecret,
      "onnuriway-login-source-v1",
    );
    const sourceAttempt = await this.dependencies.repository.consumeSourceAttempt(
      sourceKey,
      now,
    );

    if (!sourceAttempt.allowed) {
      if (sourceAttempt.lockedNow) {
        await this.audit(
          {
            type: "LOGIN_LOCKED",
            requestId: input.requestId,
            reason: "source-rate-limit",
          },
          now,
        );
      }
      throw new LoginRejectedError("rate-limited");
    }

    if (!isSixDigitPin(input.pin)) {
      await consumePinHashCost(input.pin, this.dependencies.pinPepper);
      await this.audit(
        {
          type: "LOGIN_FAILURE",
          requestId: input.requestId,
          reason: "invalid-format",
        },
        now,
      );
      throw new LoginRejectedError("invalid");
    }

    const lookupKey = createPinLookupKey(input.pin, this.dependencies.lookupSecret);
    const lookupLock = await this.dependencies.repository.getLookupLock(lookupKey, now);
    if (!lookupLock.allowed) {
      throw new LoginRejectedError("rate-limited");
    }

    const identity = await this.dependencies.repository.findLoginIdentity(lookupKey);
    if (!identity) {
      await consumePinHashCost(input.pin, this.dependencies.pinPepper);
      return this.rejectFailure(lookupKey, undefined, input.requestId, now);
    }

    if (
      identity.credential.lockedUntil &&
      identity.credential.lockedUntil.toMillis() > now.getTime()
    ) {
      throw new LoginRejectedError("rate-limited");
    }

    const pinMatches = await verifyPin(
      input.pin,
      identity.credential.pinHash,
      this.dependencies.pinPepper,
    );
    if (!pinMatches) {
      return this.rejectFailure(
        lookupKey,
        identity.employee.employeeId,
        input.requestId,
        now,
      );
    }

    if (!isIdentityEligible(identity)) {
      await this.audit(
        {
          type: "SESSION_REJECTED",
          employeeId: identity.employee.employeeId,
          requestId: input.requestId,
          reason: "identity-ineligible",
        },
        now,
      );
      throw new LoginRejectedError("invalid");
    }

    const claims = {
      employeeId: identity.employee.employeeId,
      sessionVersion: identity.authz.sessionVersion,
      permissionsVersion: identity.authz.permissionsVersion,
      roleScopes: identity.authz.roleScopes,
    };
    const customToken = await this.dependencies.issueCustomToken(
      identity.employee.firebaseUid,
      claims,
    );

    await this.dependencies.repository.recordSuccess(
      lookupKey,
      identity.employee.employeeId,
      now,
    );
    await this.audit(
      {
        type: "LOGIN_SUCCESS",
        actorUid: identity.employee.firebaseUid,
        employeeId: identity.employee.employeeId,
        requestId: input.requestId,
      },
      now,
    );

    return { customToken };
  }
}

export function claimsMatchAuthz(
  token: DecodedIdToken,
  authz: Awaited<ReturnType<LoginRepository["getAuthz"]>>,
) {
  if (!authz) {
    return false;
  }

  const roleScopes = Array.isArray(token.roleScopes) ? token.roleScopes : [];
  return (
    authz.active &&
    token.uid === authz.uid &&
    token.employeeId === authz.employeeId &&
    token.sessionVersion === authz.sessionVersion &&
    token.permissionsVersion === authz.permissionsVersion &&
    authz.roleScopes.length === roleScopes.length &&
    authz.roleScopes.every((scope) => roleScopes.includes(scope))
  );
}
