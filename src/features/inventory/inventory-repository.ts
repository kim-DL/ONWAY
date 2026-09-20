"use client";
import "client-only";
import { httpsCallable } from "firebase/functions";
import { z } from "zod";
import * as contract from "@/domain/inventory";
import { getFirebaseClientServices } from "@/lib/firebase/client";

export function inventoryErrorMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code.endsWith("aborted")) return "다른 직원이 재고를 변경했어요. 이 창을 닫고 품목을 다시 열어 최신 수량을 확인해주세요.";
  if (code.endsWith("permission-denied") || code.endsWith("unauthenticated")) return "사용 권한을 확인하지 못했어요. 다시 로그인하거나 관리자에게 문의해주세요.";
  if (code.endsWith("failed-precondition")) return "현재 재고 상태나 실사 기간을 다시 확인해야 해요. 이 창을 닫고 품목을 다시 열어주세요.";
  if (code.endsWith("not-found")) return "품목이 삭제되었거나 정보가 바뀌었어요. 재고 모드를 다시 열어 목록을 확인해주세요.";
  if (code.endsWith("invalid-argument") || error instanceof z.ZodError) return error instanceof z.ZodError ? (error.issues[0]?.message ?? "입력값을 확인해주세요.") : "수량과 필수 입력 정보를 확인해주세요.";
  if (typeof navigator !== "undefined" && !navigator.onLine) return "인터넷 연결 후 다시 시도해주세요. 재고는 기기에 저장하지 않아요.";
  return "재고 정보를 처리하지 못했어요. 잠시 후 다시 시도해주세요.";
}
async function call<T>(name: string, input: unknown, schema: z.ZodType<T>): Promise<T> {
  const services = getFirebaseClientServices();
  const uid = services?.auth.currentUser?.uid;
  if (!services || !uid) throw Object.assign(new Error("Inventory authentication required"), { code: "unauthenticated" });
  const result = await httpsCallable<unknown, unknown>(services.functions, name)(input);
  if (services.auth.currentUser?.uid !== uid) throw Object.assign(new Error("Inventory session changed"), { code: "unauthenticated" });
  return schema.parse(result.data);
}
async function list(): Promise<contract.InventoryProduct[]> {
  const initialUid = getFirebaseClientServices()?.auth.currentUser?.uid;
  if (!initialUid) throw Object.assign(new Error("Inventory authentication required"), { code: "unauthenticated" });
  const products = new Map<string, contract.InventoryProduct>();
  const cursors = new Set<string>();
  let afterId: string | null = null;
  do {
    const page: z.infer<typeof contract.inventoryListPageSchema> = await call("listInventoryProducts", { afterId, includeSummary: true }, contract.inventoryListPageSchema);
    if (getFirebaseClientServices()?.auth.currentUser?.uid !== initialUid) throw Object.assign(new Error("Inventory session changed"), { code: "unauthenticated" });
    page.products.forEach((product) => products.set(product.productId, product));
    afterId = page.nextCursor;
    if (afterId && (cursors.has(afterId) || products.size >= 5_000)) throw new Error("Inventory pagination limit");
    if (afterId) cursors.add(afterId);
  } while (afterId);
  return Array.from(products.values());
}
export const inventoryRepository = {
  list,
  context: () => call("getInventoryContext", {}, contract.inventoryContextSchema),
  detail: (productId: string) => call("getInventoryProduct", contract.getInventoryProductInputSchema.parse({ productId, includeSummary: true }), contract.inventoryProductDetailSchema),
  save: (input: contract.SaveInventoryProductInput) => call("saveInventoryProduct", contract.saveInventoryProductInputSchema.parse({ ...input, includeSummary: true }), contract.inventoryProductSchema),
  movement: (input: contract.InventoryMovementInput) => call("recordInventoryMovement", contract.inventoryMovementInputSchema.parse({ ...input, includeSummary: true }), contract.inventoryMutationResultSchema),
  count: (input: contract.InventoryCountInput) => call("recordInventoryCount", contract.inventoryCountInputSchema.parse({ ...input, includeSummary: true }), contract.inventoryMutationResultSchema),
  updateLot: (input: contract.UpdateInventoryLotInput) => call("updateInventoryLot", contract.updateInventoryLotInputSchema.parse({ ...input, includeSummary: true }), contract.inventoryMutationResultSchema),
  status: (input: contract.SetInventoryProductStatusInput) => call("setInventoryProductStatus", contract.setInventoryProductStatusInputSchema.parse({ ...input, includeSummary: true }), contract.inventoryProductSchema),
  remove: (input: contract.DeleteInventoryProductInput) => call("deleteInventoryProduct", contract.deleteInventoryProductInputSchema.parse({ ...input, includeSummary: true }), contract.inventoryProductSchema),
  settings: (input: contract.UpdateInventorySettingsInput) => call("updateInventorySettings", contract.updateInventorySettingsInputSchema.parse(input), contract.inventorySettingsSchema),
  history: (productId: string, afterId: string | null = null) => call("listInventoryHistory", contract.inventoryHistoryInputSchema.parse({ productId, afterId }), contract.inventoryHistoryPageSchema),
  uploadPhoto: (input: z.infer<typeof contract.uploadInventoryPhotoInputSchema>) => call("uploadInventoryPhoto", contract.uploadInventoryPhotoInputSchema.parse(input), contract.inventoryPhotoUploadResultSchema),
  photo: (productId: string, photoId: string, variant: "thumbnail" | "preview" = "preview") => call("getInventoryPhoto", contract.getInventoryPhotoInputSchema.parse({ productId, photoId, variant }), contract.inventoryPhotoDownloadSchema),
};
