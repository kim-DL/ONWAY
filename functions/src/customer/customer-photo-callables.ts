import { logger } from "firebase-functions";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { InvalidPhotoError } from "../photo/photo-processor.js";
import { requireCustomerActor } from "./customer-authorization.js";
import { getCustomerPhotoInputSchema, uploadCustomerPhotoInputSchema } from "./customer-contract.js";
import { CustomerPhotoService } from "./customer-photo-service.js";
import { customerPhotoErrorDiagnostic } from "./customer-photo-errors.js";

const options = { enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true", region: "asia-northeast3" as const, maxInstances: 10 };
function privateResponse(request: CallableRequest<unknown>) {
  request.rawRequest.res?.setHeader("Cache-Control", "private, no-store, max-age=0");
  request.rawRequest.res?.setHeader("Pragma", "no-cache");
}
function safePhotoError(error: unknown, operation: "upload" | "download"): HttpsError {
  if (error instanceof HttpsError) return error;
  if (error instanceof InvalidPhotoError) {
    logger.warn("Customer photo validation failed.", customerPhotoErrorDiagnostic(error, operation));
    return new HttpsError("invalid-argument", error.message);
  }
  // Never log raw payloads, image bytes, filenames, addresses or Storage URLs.
  logger.error("Customer photo operation failed.", customerPhotoErrorDiagnostic(error, operation));
  return new HttpsError("unavailable", "거래처 사진을 처리하지 못했어요. 잠시 후 다시 시도해주세요.");
}
export const uploadCustomerPhoto = onCall({ ...options, maxInstances: 4, memory: "1GiB", timeoutSeconds: 120 }, async (request) => {
  privateResponse(request);
  try {
    const actor = await requireCustomerActor(request);
    const input = uploadCustomerPhotoInputSchema.safeParse(request.data);
    if (!input.success) throw new HttpsError("invalid-argument", "사진 파일과 크기를 확인해주세요.");
    const result = await new CustomerPhotoService().upload(input.data, actor);
    await requireCustomerActor(request);
    return result;
  } catch (error) { throw safePhotoError(error, "upload"); }
});
export const getCustomerPhoto = onCall(options, async (request) => {
  privateResponse(request);
  try {
    const actor = await requireCustomerActor(request);
    const input = getCustomerPhotoInputSchema.safeParse(request.data);
    if (!input.success) throw new HttpsError("invalid-argument", "거래처 사진 요청을 확인해주세요.");
    const result = await new CustomerPhotoService().get(input.data, actor);
    await requireCustomerActor(request);
    return result;
  } catch (error) { throw safePhotoError(error, "download"); }
});
export const expireCustomerPhotos = onSchedule({ schedule: "every 60 minutes", region: "asia-northeast3", maxInstances: 1, timeoutSeconds: 120 }, async () => {
  const removed = await new CustomerPhotoService().expire();
  if (removed) logger.info("Expired private customer photos removed.", { count: removed });
});
