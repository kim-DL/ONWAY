"use client";
import "client-only";
import { httpsCallable } from "firebase/functions";
import { z } from "zod";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import { deliveryPhotoDayResultSchema } from "@/domain/delivery-photo";
import { applyRecommendationSchema, planningContextSchema,
  planningSettingsSchema, recommendRouteSchema, routeRecommendationSchema, savePlanningSettingsSchema,
  analyzePhotoBatchSchema, confirmPhotoBatchSchema, photoBatchResultSchema, photoAliasesSchema, photoAliasSchema, updatePhotoAliasSchema } from "@/domain/delivery-planning";

async function call<I, O>(name: string, input: I, output: z.ZodType<O>): Promise<O> {
  const services = getFirebaseClientServices(); const user = services?.auth.currentUser;
  if (!services || !user) throw Object.assign(new Error("로그인이 필요합니다."), { code: "unauthenticated" });
  if (!navigator.onLine) throw new Error("인터넷 연결 후 다시 시도해주세요. 등록용 사진은 오프라인으로 보관하지 않습니다.");
  const before = (await user.getIdTokenResult()).claims;
  const result = await httpsCallable<I, unknown>(services.functions, name, { timeout: 120_000 })(input);
  const current = services.auth.currentUser;
  const after = current ? (await current.getIdTokenResult()).claims : null;
  if (current !== user || !after || before.sessionVersion !== after.sessionVersion || before.permissionsVersion !== after.permissionsVersion) {
    throw Object.assign(new Error("로그인 상태가 바뀌었습니다. 다시 열어주세요."), { code: "unauthenticated" });
  }
  return output.parse(result.data);
}
export function planningError(error: unknown) {
  if (error instanceof Error && !error.message.includes("INTERNAL") && error.message.length < 230) return error.message.replace(/^FirebaseError:\s*/u, "");
  return "요청을 완료하지 못했어요. 목록을 새로 확인한 뒤 다시 시도해주세요.";
}
export const planningRepository = {
  context: () => call("getDeliveryPlanningContext", {}, planningContextSchema),
  saveSettings: (input: z.infer<typeof savePlanningSettingsSchema>) => call("saveDeliveryPlanningSettings", savePlanningSettingsSchema.parse(input), planningSettingsSchema),
  analyzeBatch: (input: z.infer<typeof analyzePhotoBatchSchema>) => call("analyzeDeliveryPhotoBatch", analyzePhotoBatchSchema.parse(input), photoBatchResultSchema),
  confirmBatch: (input: z.infer<typeof confirmPhotoBatchSchema>) => call("confirmDeliveryPhotoBatch", confirmPhotoBatchSchema.parse(input), photoBatchResultSchema),
  aliases: () => call("getDeliveryPhotoAliases", {}, photoAliasesSchema),
  updateAlias: (input: z.infer<typeof updatePhotoAliasSchema>) => call("updateDeliveryPhotoAlias", updatePhotoAliasSchema.parse(input), photoAliasSchema),
  recommend: (input: z.infer<typeof recommendRouteSchema>) => call("recommendDeliveryRoute", recommendRouteSchema.parse(input), routeRecommendationSchema),
  apply: (input: z.infer<typeof applyRecommendationSchema>) => call("applyDeliveryRoute", applyRecommendationSchema.parse(input), deliveryPhotoDayResultSchema),
};
export type PlanningRepository = typeof planningRepository;
