import { logger } from "firebase-functions";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { getAdminFirestore } from "../shared/firebase-admin.js";
import { pinLookupSecret, pinPepper } from "./callables.js";
import { changeEmployeePinInputSchema } from "./employee-pin-contract.js";
import { EmployeePinService } from "./employee-pin-service.js";

const emulator = process.env.FUNCTIONS_EMULATOR === "true";

export const changeEmployeePin = onCall({
  enforceAppCheck: !emulator,
  region: "asia-northeast3",
  maxInstances: 10,
  secrets: emulator ? [] : [pinLookupSecret, pinPepper],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const parsed = changeEmployeePinInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "PIN은 숫자 6자리로 입력해주세요.");
  try {
    return await new EmployeePinService({
      db: getAdminFirestore(), lookupSecret: pinLookupSecret.value(), pinPepper: pinPepper.value(),
    }).changePin(parsed.data, request.auth, `${request.app?.appId ?? "no-app-check"}|${request.rawRequest.ip ?? "unknown"}`);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("Employee PIN change failed.", { requestId: parsed.data.requestId });
    throw new HttpsError("internal", "PIN을 변경하지 못했습니다. 연결을 확인하고 다시 시도해주세요.");
  }
});
