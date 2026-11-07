import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall, type CallableRequest } from "firebase-functions/v2/https";
import { z } from "zod";
import { requireCustomerActor } from "../customer/customer-authorization.js";
import { deliveryPhotoServiceAccountOption } from "../delivery-photo/delivery-photo-runtime-identity.js";
import { setPrivateCallableResponse } from "../shared/private-callable-response.js";
import { analyzeInvoiceSchema, applyRecommendationSchema, confirmInvoiceSchema, recommendRouteSchema, savePlanningSettingsSchema } from "./planning-contract.js";
import { createPlanningProviders } from "./planning-providers.js";
import { PlanningService } from "./planning-service.js";

const emulator = process.env.FUNCTIONS_EMULATOR === "true";
const openai = defineSecret("OPENAI_API_KEY"); const tmap = defineSecret("TMAP_APP_KEY"); const kakao = defineSecret("KAKAO_REST_API_KEY");
const options = { ...deliveryPhotoServiceAccountOption(), region: "asia-northeast3" as const, enforceAppCheck: !emulator, maxInstances: 4, concurrency: 1 };
let providers: ReturnType<typeof createPlanningProviders> | undefined;
const service = () => new PlanningService(providers ??= createPlanningProviders({
  openai: () => emulator ? process.env.OPENAI_API_KEY ?? "" : openai.value(),
  tmap: () => emulator ? process.env.TMAP_APP_KEY ?? "" : tmap.value(),
  kakao: () => emulator ? process.env.KAKAO_REST_API_KEY ?? "" : kakao.value(),
  model: process.env.INVOICE_OPENAI_MODEL || "gpt-6-luna",
}));
async function run<T, R>(request: CallableRequest<unknown>, schema: z.ZodType<T>, action: (input: T, actor: Awaited<ReturnType<typeof requireCustomerActor>>, service: PlanningService) => Promise<R>) {
  setPrivateCallableResponse(request);
  try {
    const actor = await requireCustomerActor(request);
    const parsed = schema.safeParse(request.data);
    if (!parsed.success) throw new HttpsError("invalid-argument", "납품 준비 입력을 확인해주세요.");
    return await action(parsed.data, actor, service());
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("Delivery planning failed.", { category: error instanceof z.ZodError ? "contract" : "internal" });
    throw new HttpsError("unavailable", "납품 준비 요청을 완료하지 못했습니다. 목록을 새로 확인해주세요.");
  }
}
export const getDeliveryPlanningContext = onCall(options, (r) => run(r, z.object({}).strict(), (_, actor, s) => s.context(actor)));
export const saveDeliveryPlanningSettings = onCall(options, (r) => run(r, savePlanningSettingsSchema, (input, actor, s) => s.saveSettings(input, actor)));
export const analyzeDeliveryInvoice = onCall({ ...options, memory: "1GiB", timeoutSeconds: 120, secrets: emulator ? [] : [openai] },
  (r) => run(r, analyzeInvoiceSchema, (input, actor, s) => s.analyze(input, actor)));
export const confirmDeliveryInvoice = onCall(options, (r) => run(r, confirmInvoiceSchema, (input, actor, s) => s.confirm(input, actor)));
export const recommendDeliveryRoute = onCall({ ...options, timeoutSeconds: 120, secrets: emulator ? [] : [tmap, kakao] },
  (r) => run(r, recommendRouteSchema, (input, actor, s) => s.recommend(input, actor)));
export const applyDeliveryRoute = onCall(options, (r) => run(r, applyRecommendationSchema, (input, actor, s) => s.apply(input, actor)));
