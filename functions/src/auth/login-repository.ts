import {
  FieldValue,
  Timestamp,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";

import {
  LOOKUP_FAILURE_LIMIT,
  SOURCE_ATTEMPT_LIMIT,
  SOURCE_LOCK_MS,
  SOURCE_WINDOW_MS,
  lookupLockDuration,
} from "./policy.js";
import { getAdminFirestore } from "../shared/firebase-admin.js";

const timestampSchema = z.custom<Timestamp>(
  (value) => value instanceof Timestamp,
  "Expected a Firestore Timestamp.",
);

const pinIndexSchema = z.object({
  employeeId: z.string().min(1),
});

const credentialSchema = z.object({
  employeeId: z.string().min(1),
  pinHash: z.string().min(1),
  failedAttemptCount: z.number().int().nonnegative(),
  lockedUntil: timestampSchema.nullable(),
  sessionVersion: z.number().int().positive(),
});

const employeeSchema = z.object({
  employeeId: z.string().min(1),
  firebaseUid: z.string().min(1),
  roleScopes: z.array(z.enum(["delivery", "sales", "viewer", "admin"])).min(1),
  status: z.enum(["active", "disabled"]),
  sessionVersion: z.number().int().positive(),
});

const authzSchema = z.object({
  employeeId: z.string().min(1),
  active: z.boolean(),
  sessionVersion: z.number().int().positive(),
  permissionsVersion: z.number().int().positive(),
});

const roleScopesSchema = z.array(
  z.enum(["delivery", "sales", "viewer", "admin"]),
).min(1);

const rateLimitSchema = z.object({
  attemptCount: z.number().int().nonnegative(),
  windowStartedAt: timestampSchema,
  lockedUntil: timestampSchema.nullable(),
  lockCount: z.number().int().nonnegative(),
});

export type LoginIdentity = {
  employee: z.infer<typeof employeeSchema>;
  credential: z.infer<typeof credentialSchema>;
  authz: z.infer<typeof authzSchema> & {
    uid: string;
    roleScopes: z.infer<typeof roleScopesSchema>;
  };
};

export type AttemptResult = {
  allowed: boolean;
  lockedNow: boolean;
  lockedUntil: Date | null;
};

export type AuditEventInput = {
  type:
    | "LOGIN_SUCCESS"
    | "LOGIN_FAILURE"
    | "LOGIN_LOCKED"
    | "LOGOUT"
    | "SESSION_REJECTED";
  actorUid?: string;
  employeeId?: string;
  requestId: string;
  reason?: string;
};

type RateLimitRecord = z.infer<typeof rateLimitSchema>;

function parseRateLimit(data: unknown, now: Date): RateLimitRecord {
  const parsed = rateLimitSchema.safeParse(data);
  if (parsed.success) {
    return parsed.data;
  }

  return {
    attemptCount: 0,
    windowStartedAt: Timestamp.fromDate(now),
    lockedUntil: null,
    lockCount: 0,
  };
}

function activeLock(record: RateLimitRecord, now: Date) {
  return record.lockedUntil !== null && record.lockedUntil.toMillis() > now.getTime();
}

export class LoginRepository {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async consumeSourceAttempt(sourceKey: string, now: Date): Promise<AttemptResult> {
    const ref = this.db.doc(`loginRateLimits/source-${sourceKey}`);

    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const record = parseRateLimit(snapshot.data(), now);

      if (activeLock(record, now)) {
        return {
          allowed: false,
          lockedNow: false,
          lockedUntil: record.lockedUntil?.toDate() ?? null,
        };
      }

      const windowExpired = now.getTime() - record.windowStartedAt.toMillis() >= SOURCE_WINDOW_MS;
      const attemptCount = windowExpired ? 1 : record.attemptCount + 1;

      if (attemptCount > SOURCE_ATTEMPT_LIMIT) {
        const lockedUntil = new Date(now.getTime() + SOURCE_LOCK_MS);
        transaction.set(ref, {
          attemptCount,
          windowStartedAt: windowExpired ? Timestamp.fromDate(now) : record.windowStartedAt,
          lockedUntil: Timestamp.fromDate(lockedUntil),
          lockCount: record.lockCount + 1,
          updatedAt: Timestamp.fromDate(now),
        });
        return { allowed: false, lockedNow: true, lockedUntil };
      }

      transaction.set(ref, {
        attemptCount,
        windowStartedAt: windowExpired ? Timestamp.fromDate(now) : record.windowStartedAt,
        lockedUntil: null,
        lockCount: record.lockCount,
        updatedAt: Timestamp.fromDate(now),
      });

      return { allowed: true, lockedNow: false, lockedUntil: null };
    });
  }

  async getLookupLock(lookupKey: string, now: Date): Promise<AttemptResult> {
    const snapshot = await this.db.doc(`loginRateLimits/lookup-${lookupKey}`).get();
    const record = parseRateLimit(snapshot.data(), now);
    const locked = activeLock(record, now);
    return {
      allowed: !locked,
      lockedNow: false,
      lockedUntil: locked ? record.lockedUntil?.toDate() ?? null : null,
    };
  }

  async findLoginIdentity(lookupKey: string): Promise<LoginIdentity | null> {
    const indexSnapshot = await this.db.doc(`pinIndexes/${lookupKey}`).get();
    if (!indexSnapshot.exists) {
      return null;
    }

    const index = pinIndexSchema.parse(indexSnapshot.data());
    const credentialRef = this.db.doc(`authCredentials/${index.employeeId}`);
    const employeeRef = this.db.doc(`employees/${index.employeeId}`);
    const [credentialSnapshot, employeeSnapshot] = await this.db.getAll(
      credentialRef,
      employeeRef,
    );

    if (!credentialSnapshot?.exists || !employeeSnapshot?.exists) {
      return null;
    }

    const credential = credentialSchema.parse(credentialSnapshot.data());
    const employee = employeeSchema.parse(employeeSnapshot.data());
    const authzSnapshot = await this.db.doc(`authz/${employee.firebaseUid}`).get();
    if (!authzSnapshot.exists) {
      return null;
    }

    return {
      credential,
      employee,
      authz: {
        ...authzSchema.parse(authzSnapshot.data()),
        uid: employee.firebaseUid,
        roleScopes: employee.roleScopes,
      },
    };
  }

  async recordFailure(lookupKey: string, employeeId: string | undefined, now: Date) {
    const lookupRef = this.db.doc(`loginRateLimits/lookup-${lookupKey}`);
    const credentialRef = employeeId
      ? this.db.doc(`authCredentials/${employeeId}`)
      : null;

    return this.db.runTransaction(async (transaction) => {
      const lookupSnapshot = await transaction.get(lookupRef);
      const credentialSnapshot = credentialRef
        ? await transaction.get(credentialRef)
        : null;
      const record = parseRateLimit(lookupSnapshot.data(), now);
      const windowExpired =
        now.getTime() - record.windowStartedAt.toMillis() >= SOURCE_WINDOW_MS;
      const attemptCount = windowExpired ? 1 : record.attemptCount + 1;
      const shouldLock = attemptCount >= LOOKUP_FAILURE_LIMIT;
      const lockCount = shouldLock ? record.lockCount + 1 : record.lockCount;
      const lockedUntil = shouldLock
        ? new Date(now.getTime() + lookupLockDuration(lockCount))
        : null;

      transaction.set(lookupRef, {
        attemptCount: shouldLock ? 0 : attemptCount,
        windowStartedAt: windowExpired ? Timestamp.fromDate(now) : record.windowStartedAt,
        lockedUntil: lockedUntil ? Timestamp.fromDate(lockedUntil) : null,
        lockCount,
        updatedAt: Timestamp.fromDate(now),
      });

      if (credentialRef && credentialSnapshot) {
        if (credentialSnapshot.exists) {
          const credential = credentialSchema.parse(credentialSnapshot.data());
          transaction.update(credentialRef, {
            failedAttemptCount: credential.failedAttemptCount + 1,
            lockedUntil: lockedUntil ? Timestamp.fromDate(lockedUntil) : null,
            updatedAt: Timestamp.fromDate(now),
          });
        }
      }

      return {
        allowed: !shouldLock,
        lockedNow: shouldLock,
        lockedUntil,
      } satisfies AttemptResult;
    });
  }

  async recordSuccess(lookupKey: string, employeeId: string, now: Date) {
    const lookupRef = this.db.doc(`loginRateLimits/lookup-${lookupKey}`);
    const credentialRef = this.db.doc(`authCredentials/${employeeId}`);

    await this.db.runTransaction(async (transaction: Transaction) => {
      transaction.delete(lookupRef);
      transaction.update(credentialRef, {
        failedAttemptCount: 0,
        lockedUntil: null,
        lastLoginAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
      });
    });
  }

  async getAuthz(uid: string) {
    const snapshot = await this.db.doc(`authz/${uid}`).get();
    if (!snapshot.exists) {
      return null;
    }

    const authz = authzSchema.parse(snapshot.data());
    const employeeSnapshot = await this.db.doc(`employees/${authz.employeeId}`).get();
    if (!employeeSnapshot.exists) {
      return null;
    }
    const employee = employeeSchema.parse(employeeSnapshot.data());

    return {
      ...authz,
      uid,
      roleScopes: roleScopesSchema.parse(employee.roleScopes),
    };
  }

  async audit(event: AuditEventInput, now: Date) {
    await this.db.collection("auditLogs").add({
      ...event,
      occurredAt: Timestamp.fromDate(now),
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}
