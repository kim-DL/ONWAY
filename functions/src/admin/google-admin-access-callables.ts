import { logger } from "firebase-functions";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";

import { getAdminAuth, getAdminFirestore } from "../shared/firebase-admin.js";
import { requireGoogleIdentity, requireVerifiedAdmin } from "./admin-authorization.js";
import { disableGoogleAdminAccessInputSchema, listGoogleAdminAccessInputSchema, registerGoogleAdminAccessInputSchema } from "./google-admin-access-contract.js";
import { GoogleAdminAccessError, GoogleAdminAccessService, type GoogleAdminAccessActor } from "./google-admin-access-service.js";

const options = { enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true", maxInstances: 10, region: "asia-northeast3" as const };

function service() {
  return new GoogleAdminAccessService({ db: getAdminFirestore(), auth: getAdminAuth() });
}

async function actor(request: CallableRequest<unknown>): Promise<GoogleAdminAccessActor> {
  const identity = requireGoogleIdentity(request);
  const verified = await requireVerifiedAdmin(request);
  return {
    ...verified, email: identity.email,
    sessionVersion: request.auth!.token.sessionVersion as number,
    permissionsVersion: request.auth!.token.permissionsVersion as number,
  };
}

async function run<T>(name: string, action: () => Promise<T>) {
  try { return await action(); }
  catch (error) {
    if (error instanceof GoogleAdminAccessError) throw new HttpsError(error.code, error.message);
    logger.error(`Google admin operation failed: ${name}`, { code: error && typeof error === "object" && "code" in error ? error.code : "unknown" });
    throw new HttpsError("internal", "운영자 작업을 완료하지 못했습니다. 같은 요청으로 다시 시도해주세요.");
  }
}

export const listGoogleAdminAccess = onCall(options, async (request) => {
  if (!listGoogleAdminAccessInputSchema.safeParse(request.data).success) throw new HttpsError("invalid-argument", "운영자 조회 요청을 확인해주세요.");
  const verified = await actor(request);
  return run("listGoogleAdminAccess", () => service().list(verified));
});

export const registerGoogleAdminAccess = onCall(options, async (request) => {
  const input = registerGoogleAdminAccessInputSchema.safeParse(request.data);
  if (!input.success) throw new HttpsError("invalid-argument", "이름과 Google 이메일을 확인해주세요.");
  const verified = await actor(request);
  return run("registerGoogleAdminAccess", () => service().register(input.data, verified));
});

export const disableGoogleAdminAccess = onCall(options, async (request) => {
  const input = disableGoogleAdminAccessInputSchema.safeParse(request.data);
  if (!input.success) throw new HttpsError("invalid-argument", "운영자 해제 요청을 확인해주세요.");
  const verified = await actor(request);
  return run("disableGoogleAdminAccess", () => service().disable(input.data, verified));
});
