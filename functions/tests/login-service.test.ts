import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import { createPinLookupKey, hashPin } from "../src/auth/pin-crypto.js";
import {
  EmployeeLoginService,
  LoginRejectedError,
  type LoginServiceDependencies,
} from "../src/auth/login-service.js";

const lookupSecret = "unit-test-lookup-secret-at-least-thirty-two-characters";
const pepper = "unit-test-pin-pepper-at-least-thirty-two-characters";
const now = new Date("2026-08-23T03:00:00.000Z");

async function eligibleIdentity(roleScopes: ("delivery" | "admin")[] = ["delivery"]) {
  return {
    employee: {
      employeeId: "EMP-DELIVERY",
      firebaseUid: "uid-delivery",
      roleScopes,
      status: "active" as const,
      sessionVersion: 1,
    },
    credential: {
      employeeId: "EMP-DELIVERY",
      pinHash: await hashPin("482915", pepper, {
        salt: Buffer.from("0123456789abcdef"),
      }),
      failedAttemptCount: 0,
      lockedUntil: null,
      sessionVersion: 1,
    },
    authz: {
      uid: "uid-delivery",
      employeeId: "EMP-DELIVERY",
      active: true,
      sessionVersion: 1,
      permissionsVersion: 2,
      roleScopes,
    },
  };
}

function repository(identity: Awaited<ReturnType<typeof eligibleIdentity>> | null) {
  return {
    audit: vi.fn().mockResolvedValue(undefined),
    consumeSourceAttempt: vi.fn().mockResolvedValue({
      allowed: true,
      lockedNow: false,
      lockedUntil: null,
    }),
    findLoginIdentity: vi.fn().mockResolvedValue(identity),
    getLookupLock: vi.fn().mockResolvedValue({
      allowed: true,
      lockedNow: false,
      lockedUntil: null,
    }),
    recordFailure: vi.fn().mockResolvedValue({
      allowed: true,
      lockedNow: false,
      lockedUntil: null,
    }),
    recordSuccess: vi.fn().mockResolvedValue(undefined),
  } satisfies LoginServiceDependencies["repository"];
}

describe("EmployeeLoginService", () => {
  it("issues the minimum session claims and resets failures after a valid PIN", async () => {
    const identity = await eligibleIdentity();
    const authRepository = repository(identity);
    const issueCustomToken = vi.fn().mockResolvedValue("custom-token");
    const service = new EmployeeLoginService({
      repository: authRepository,
      lookupSecret,
      pinPepper: pepper,
      issueCustomToken,
      now: () => now,
    });

    await expect(
      service.login({ pin: "482915", sourceFingerprint: "app|network", requestId: "req-1" }),
    ).resolves.toEqual({ customToken: "custom-token" });
    expect(issueCustomToken).toHaveBeenCalledWith("uid-delivery", {
      employeeId: "EMP-DELIVERY",
      sessionVersion: 1,
      permissionsVersion: 2,
      roleScopes: ["delivery"],
    });
    expect(authRepository.recordSuccess).toHaveBeenCalledWith(
      createPinLookupKey("482915", lookupSecret),
      "EMP-DELIVERY",
      now,
    );
    expect(authRepository.audit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "LOGIN_SUCCESS", requestId: "req-1" }),
      now,
    );
  });

  it("does not allow an admin identity through the PIN flow", async () => {
    const identity = await eligibleIdentity(["admin"]);
    const authRepository = repository(identity);
    const issueCustomToken = vi.fn();
    const service = new EmployeeLoginService({
      repository: authRepository,
      lookupSecret,
      pinPepper: pepper,
      issueCustomToken,
      now: () => now,
    });

    await expect(
      service.login({ pin: "482915", sourceFingerprint: "app|network", requestId: "req-2" }),
    ).rejects.toEqual(expect.objectContaining<LoginRejectedError>({ kind: "invalid" }));
    expect(issueCustomToken).not.toHaveBeenCalled();
  });

  it("records a non-sensitive audit event for an unknown PIN", async () => {
    const authRepository = repository(null);
    const service = new EmployeeLoginService({
      repository: authRepository,
      lookupSecret,
      pinPepper: pepper,
      issueCustomToken: vi.fn(),
      now: () => now,
    });

    await expect(
      service.login({ pin: "913527", sourceFingerprint: "app|network", requestId: "req-unknown" }),
    ).rejects.toEqual(expect.objectContaining<LoginRejectedError>({ kind: "invalid" }));
    expect(authRepository.audit).toHaveBeenCalledWith(
      {
        type: "LOGIN_FAILURE",
        requestId: "req-unknown",
        reason: "pin-rejected",
      },
      now,
    );
    expect(JSON.stringify(authRepository.audit.mock.calls)).not.toContain("913527");
  });

  it("rejects an active credential lock before token issuance", async () => {
    const identity = await eligibleIdentity();
    identity.credential.lockedUntil = Timestamp.fromMillis(now.getTime() + 60_000);
    const authRepository = repository(identity);
    const issueCustomToken = vi.fn();
    const service = new EmployeeLoginService({
      repository: authRepository,
      lookupSecret,
      pinPepper: pepper,
      issueCustomToken,
      now: () => now,
    });

    await expect(
      service.login({ pin: "482915", sourceFingerprint: "app|network", requestId: "req-3" }),
    ).rejects.toEqual(expect.objectContaining<LoginRejectedError>({ kind: "rate-limited" }));
    expect(issueCustomToken).not.toHaveBeenCalled();
  });
});
