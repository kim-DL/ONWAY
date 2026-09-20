import { logger } from "firebase-functions";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { z } from "zod";
import { InvalidPhotoError } from "../photo/photo-processor.js";
import { requireInventoryActor, inventoryActorCanWrite, type InventoryAccess, type InventoryActor } from "./inventory-authorization.js";
import {
  deleteInventoryProductInputSchema, getInventoryPhotoInputSchema, getInventoryProductInputSchema,
  inventoryContextSchema, inventoryCountInputSchema, inventoryHistoryInputSchema, inventoryHistoryPageSchema,
  inventoryListInputSchema, inventoryListPageSchema, inventoryMovementInputSchema, inventoryMutationResultSchema,
  inventoryPhotoDownloadSchema, inventoryPhotoUploadResultSchema, inventoryProductDetailSchema,
  inventoryProductSchema, inventorySettingsSchema, saveInventoryProductInputSchema,
  setInventoryProductStatusInputSchema, updateInventoryLotInputSchema, updateInventorySettingsInputSchema,
  uploadInventoryPhotoInputSchema,
} from "./inventory-contract.js";
import { InventoryPhotoDependencyError, InventoryPhotoService, inventoryPhotoErrorDiagnostic } from "./inventory-photo-service.js";
import { InventoryService } from "./inventory-service.js";
import { inventorySummaryResponse } from "./inventory-stock-summary.js";

const options = { enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true", region: "asia-northeast3" as const, maxInstances: 6 };
function privateResponse(request: CallableRequest<unknown>) {
  request.rawRequest.res?.setHeader("Cache-Control", "private, no-store, max-age=0");
  request.rawRequest.res?.setHeader("Pragma", "no-cache");
}
function safeInventoryError(error: unknown): HttpsError {
  if (error instanceof HttpsError) return error;
  if (error instanceof InvalidPhotoError) return new HttpsError("invalid-argument", error.message);
  if (error instanceof InventoryPhotoDependencyError) {
    logger.error("Inventory photo operation failed.", inventoryPhotoErrorDiagnostic(error));
    return new HttpsError("unavailable", "사진을 처리하지 못했습니다. 연결을 확인하고 다시 시도해주세요.");
  }
  // Never log request bodies, photos, private notes or dependency errors.
  logger.error("Inventory operation failed.", { category: error instanceof z.ZodError ? "contract" : "internal" });
  return new HttpsError("internal", "재고 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.");
}
function handler<T, R>(inputSchema: z.ZodType<T>, resultSchema: z.ZodType<R>, access: InventoryAccess,
  action: (input: T, actor: InventoryActor) => Promise<R>) {
  return async (request: CallableRequest<unknown>): Promise<R> => {
    privateResponse(request);
    try {
      const actor = await requireInventoryActor(request, access);
      const input = inputSchema.safeParse(request.data);
      if (!input.success) throw new HttpsError("invalid-argument", "입력한 재고 정보를 확인해주세요.");
      const result = await action(input.data, actor);
      // A session revoked during I/O must not receive private data. Mutations
      // are additionally revalidated inside their committing transaction.
      await requireInventoryActor(request, access);
      const includeSummary = input.data !== null && typeof input.data === "object" && "includeSummary" in input.data && input.data.includeSummary === true;
      return resultSchema.parse(inventorySummaryResponse(result, includeSummary));
    } catch (error) { throw safeInventoryError(error); }
  };
}
const empty = z.object({}).strict();
export const getInventoryContext = onCall(options, handler(empty, inventoryContextSchema, "read", async (_input, actor) => ({
  ...await new InventoryService().context(), canWrite: inventoryActorCanWrite(actor), canAdmin: actor.isAdmin,
})));
export const listInventoryProducts = onCall(options, handler(inventoryListInputSchema, inventoryListPageSchema, "read", (input) => new InventoryService().list(input.afterId)));
export const getInventoryProduct = onCall(options, handler(getInventoryProductInputSchema, inventoryProductDetailSchema, "read", (input, actor) => new InventoryService().detail(input.productId, actor)));
export const saveInventoryProduct = onCall(options, handler(saveInventoryProductInputSchema, inventoryProductSchema, "write", (input, actor) => new InventoryService().save(input, actor)));
export const recordInventoryMovement = onCall(options, handler(inventoryMovementInputSchema, inventoryMutationResultSchema, "write", (input, actor) => new InventoryService().move(input, actor)));
export const recordInventoryCount = onCall(options, handler(inventoryCountInputSchema, inventoryMutationResultSchema, "write", (input, actor) => new InventoryService().count(input, actor)));
export const updateInventoryLot = onCall(options, handler(updateInventoryLotInputSchema, inventoryMutationResultSchema, "write", (input, actor) => new InventoryService().updateLot(input, actor)));
export const setInventoryProductStatus = onCall(options, handler(setInventoryProductStatusInputSchema, inventoryProductSchema, "write", (input, actor) => new InventoryService().status(input, actor)));
export const deleteInventoryProduct = onCall(options, handler(deleteInventoryProductInputSchema, inventoryProductSchema, "write", (input, actor) => new InventoryService().status(input, actor, true)));
export const updateInventorySettings = onCall(options, handler(updateInventorySettingsInputSchema, inventorySettingsSchema, "admin", (input, actor) => new InventoryService().updateSettings(input, actor)));
export const listInventoryHistory = onCall(options, handler(inventoryHistoryInputSchema, inventoryHistoryPageSchema, "read", (input) => new InventoryService().history(input.productId, input.afterId)));
// Sharp decodes bounded but potentially large photos. Keep one decode per
// instance instead of sharing its 1 GiB memory across concurrent uploads.
export const uploadInventoryPhoto = onCall({ ...options, maxInstances: 4, concurrency: 1, memory: "1GiB", timeoutSeconds: 120 },
  handler(uploadInventoryPhotoInputSchema, inventoryPhotoUploadResultSchema, "write", (input, actor) => new InventoryPhotoService().upload(input, actor)));
export const getInventoryPhoto = onCall(options, handler(getInventoryPhotoInputSchema, inventoryPhotoDownloadSchema, "read", (input, actor) => new InventoryPhotoService().get(input, actor)));
export const expireInventoryPhotos = onSchedule({ schedule: "every 24 hours", region: "asia-northeast3", maxInstances: 1, timeoutSeconds: 120 }, async () => {
  const removed = await new InventoryPhotoService().expire();
  if (removed) logger.info("Expired inventory photos removed.", { count: removed });
});
