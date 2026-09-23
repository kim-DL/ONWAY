import { logger } from "firebase-functions";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { requireCustomerActor } from "../customer/customer-authorization.js";
import { InvalidPhotoError } from "../photo/photo-processor.js";
import { DeliveryPhotoBucketConfigurationError } from "../shared/firebase-admin.js";
import {
  createDeliveryPhotoInputSchema,
  deleteDeliveryPhotoInputSchema,
  getDeliveryPhotoDayInputSchema,
  getDeliveryPhotoInputSchema,
  getDeliveryPhotoRouteInputSchema,
  listDeliveryPhotosInputSchema,
  saveDeliveryPhotoDayInputSchema,
  saveDeliveryPhotoRouteInputSchema,
} from "./delivery-photo-contract.js";
import {
  DeliveryPhotoRequestCollision,
  DeliveryPhotoRevisionConflict,
  DeliveryPhotoService,
} from "./delivery-photo-service.js";

const emulator = process.env.FUNCTIONS_EMULATOR === "true";
export function deliveryPhotoCallableOptions(isEmulator: boolean) {
  return { enforceAppCheck: !isEmulator, region: "asia-northeast3" as const, maxInstances: 10 };
}
export function deliveryPhotoCreateCallableOptions(isEmulator: boolean) {
  return { ...deliveryPhotoCallableOptions(isEmulator), maxInstances: 4, concurrency: 1, memory: "1GiB" as const, timeoutSeconds: 120 };
}
const options = deliveryPhotoCallableOptions(emulator);

function privateResponse(request: CallableRequest<unknown>) {
  request.rawRequest.res?.setHeader("Cache-Control", "private, no-store, max-age=0");
  request.rawRequest.res?.setHeader("Pragma", "no-cache");
}

function safeError(error: unknown, operation: string): HttpsError {
  if (error instanceof HttpsError) return error;
  if (error instanceof DeliveryPhotoRevisionConflict) return new HttpsError("aborted", "다른 변경이 먼저 저장되었습니다. 최신 정보를 확인해주세요.");
  if (error instanceof DeliveryPhotoRequestCollision) return new HttpsError("already-exists", "요청 식별자가 이미 사용되었습니다.");
  if (error instanceof InvalidPhotoError) return new HttpsError("invalid-argument", error.message);
  if (error instanceof DeliveryPhotoBucketConfigurationError) {
    logger.error("Delivery photo bucket is not configured.", { operation, category: "configuration" });
    return new HttpsError("failed-precondition", "납품 사진 저장소 설정이 필요합니다.");
  }
  // Never log image bytes, customer data, object paths, signed URLs or raw SDK errors.
  logger.error("Delivery photo operation failed.", { operation, category: "internal" });
  return new HttpsError("unavailable", "납품 사진 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.");
}

async function run<T>(request: CallableRequest<unknown>, operation: string, action: (service: DeliveryPhotoService, actor: Awaited<ReturnType<typeof requireCustomerActor>>) => Promise<T>) {
  privateResponse(request);
  try {
    const actor = await requireCustomerActor(request);
    return await action(new DeliveryPhotoService(), actor);
  } catch (error) { throw safeError(error, operation); }
}

export const getDeliveryPhotoRoute = onCall(options, (request) => run(request, "get-route", async (service, actor) => {
  if (!getDeliveryPhotoRouteInputSchema.safeParse(request.data).success) throw new HttpsError("invalid-argument", "납품 경로 요청을 확인해주세요.");
  return service.getRoute(actor);
}));

export const saveDeliveryPhotoRoute = onCall(options, (request) => run(request, "save-route", async (service, actor) => {
  const parsed = saveDeliveryPhotoRouteInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "납품 경로 입력을 확인해주세요.");
  return service.saveRoute(parsed.data, actor);
}));

export const getDeliveryPhotoDay = onCall(options, (request) => run(request, "get-day", async (service, actor) => {
  if (!getDeliveryPhotoDayInputSchema.safeParse(request.data).success) throw new HttpsError("invalid-argument", "오늘 납품처 요청을 확인해주세요.");
  return service.getDay(actor);
}));

export const saveDeliveryPhotoDay = onCall(options, (request) => run(request, "save-day", async (service, actor) => {
  const parsed = saveDeliveryPhotoDayInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "오늘 납품처 입력을 확인해주세요.");
  return service.saveDay(parsed.data, actor);
}));

export const createDeliveryPhoto = onCall(deliveryPhotoCreateCallableOptions(emulator), (request) =>
  run(request, "create", async (service, actor) => {
    const parsed = createDeliveryPhotoInputSchema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "납품 사진 파일과 입력을 확인해주세요.");
    return service.create(parsed.data, actor);
  }));

export const listDeliveryPhotos = onCall(options, (request) => run(request, "list", async (service, actor) => {
  const parsed = listDeliveryPhotosInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "납품 사진 목록 요청을 확인해주세요.");
  return service.list(parsed.data, actor);
}));

export const getDeliveryPhoto = onCall(options, (request) => run(request, "get", async (service, actor) => {
  const parsed = getDeliveryPhotoInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "납품 사진 요청을 확인해주세요.");
  return service.get(parsed.data, actor);
}));

export const deleteDeliveryPhoto = onCall(options, (request) => run(request, "delete", async (service, actor) => {
  const parsed = deleteDeliveryPhotoInputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "납품 사진 삭제 요청을 확인해주세요.");
  return service.delete(parsed.data, actor);
}));

export const expireDeliveryPhotos = onSchedule({
  schedule: "every 60 minutes", timeZone: "Asia/Seoul", region: "asia-northeast3", maxInstances: 1, timeoutSeconds: 120,
}, async () => {
  const result = await new DeliveryPhotoService().expire();
  if (result.removed) logger.info("Expired delivery photos removed.", { count: result.removed });
  if (result.failures) logger.warn("Delivery photo cleanup left retryable failures.", { count: result.failures });
});
