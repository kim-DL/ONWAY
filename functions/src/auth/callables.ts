import { randomUUID } from "node:crypto";

import { defineSecret } from "firebase-functions/params";
import {
  HttpsError,
  onCall,
  type CallableRequest,
} from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { z } from "zod";

import { LoginRepository } from "./login-repository.js";
import {
  claimsMatchAuthz,
  EmployeeLoginService,
  LoginRejectedError,
} from "./login-service.js";
import { getAdminAuth } from "../shared/firebase-admin.js";

export const pinLookupSecret = defineSecret("PIN_LOOKUP_SECRET");
export const pinPepper = defineSecret("PIN_PEPPER");

const loginInputSchema = z.object({
  pin: z.string().max(32),
  appVersion: z.string().max(50).optional(),
});

function isFunctionsEmulator() {
  return process.env.FUNCTIONS_EMULATOR === "true";
}

function encodeUnsignedCustomToken(uid: string, claims: Record<string, unknown>) {
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

  return [
    encode({ alg: "none", typ: "JWT" }),
    encode({
      iss: "owner",
      sub: "owner",
      aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
      iat: nowSeconds,
      exp: nowSeconds + 3_600,
      uid,
      claims,
    }),
    "",
  ].join(".");
}

async function issueCustomToken(uid: string, claims: Record<string, unknown>) {
  const auth = getAdminAuth();
  const user = await auth.getUser(uid);
  if (user.disabled) {
    throw new LoginRejectedError("invalid");
  }

  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return encodeUnsignedCustomToken(uid, claims);
  }

  return auth.createCustomToken(uid, claims);
}

function callableSource(request: CallableRequest<unknown>) {
  return `${request.app?.appId ?? "no-app-check"}|${request.rawRequest.ip ?? "unknown"}`;
}

export const employeeLogin = onCall(
  {
    enforceAppCheck: !isFunctionsEmulator(),
    maxInstances: 10,
    region: "asia-northeast3",
    secrets: isFunctionsEmulator() ? [] : [pinLookupSecret, pinPepper],
  },
  async (request) => {
    const requestId = randomUUID();
    const parsed = loginInputSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("unauthenticated", "PIN을 확인해주세요.");
    }

    try {
      const service = new EmployeeLoginService({
        repository: new LoginRepository(),
        lookupSecret: pinLookupSecret.value(),
        pinPepper: pinPepper.value(),
        issueCustomToken,
      });

      return await service.login({
        pin: parsed.data.pin,
        sourceFingerprint: callableSource(request),
        requestId,
      });
    } catch (error) {
      if (error instanceof LoginRejectedError) {
        const code = error.kind === "rate-limited" ? "resource-exhausted" : "unauthenticated";
        throw new HttpsError(code, error.message);
      }

      logger.error("Employee login failed unexpectedly.", { requestId, error });
      throw new HttpsError("internal", "로그인 요청을 처리하지 못했습니다.");
    }
  },
);

export const employeeLogout = onCall(
  {
    enforceAppCheck: !isFunctionsEmulator(),
    maxInstances: 10,
    region: "asia-northeast3",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "인증이 필요합니다.");
    }

    const requestId = randomUUID();
    const repository = new LoginRepository();
    const authz = await repository.getAuthz(request.auth.uid);
    if (!authz || !claimsMatchAuthz(request.auth.token, authz)) {
      throw new HttpsError("failed-precondition", "세션이 유효하지 않습니다.");
    }

    await repository.audit(
      {
        type: "LOGOUT",
        actorUid: request.auth.uid,
        employeeId: authz.employeeId,
        requestId,
      },
      new Date(),
    );

    return { ok: true };
  },
);
