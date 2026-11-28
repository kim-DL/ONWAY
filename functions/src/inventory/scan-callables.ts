import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { getAdminFirestore } from "../shared/firebase-admin.js";
import { inventoryHandler } from "./callables.js";
import { InventoryService } from "./inventory-service.js";
import { analyzeLabel } from "./inventory-label-provider.js";
import { findFoodProducts } from "./inventory-food-provider.js";
import { analyzeInventoryImage, recordRegistrationOutcome } from "./inventory-scan-service.js";
import { barcodeQuery, barcodeMatchSchema, bindBarcodeInput, boundBarcodeResult, foodQuerySchema,
  foodSearchResult, labelReadingSchema, registrationOutcomeSchema, scanImageInput } from "./inventory-scan-contract.js";

const emulator = process.env.FUNCTIONS_EMULATOR === "true";
const options = { region: "asia-northeast3" as const, enforceAppCheck: !emulator, maxInstances: 4 };
const openai = defineSecret("OPENAI_API_KEY");
// Declaring a Secret also registers a deployment parameter, even without a binding.
const foodKey = !emulator && process.env.INVENTORY_FOOD_LOOKUP_ENABLED === "true" ? defineSecret("FOODSAFETY_API_KEY") : undefined;
export const analyzeInventoryProductLabel = onCall({ ...options, memory: "1GiB", concurrency: 1, timeoutSeconds: 100, secrets: emulator ? [] : [openai] },
  inventoryHandler(scanImageInput, labelReadingSchema, "write", (input, actor) => {
    const key = emulator ? process.env.OPENAI_API_KEY : openai.value();
    if (!key) throw new HttpsError("failed-precondition", "사진 판독 서비스 설정을 확인해주세요.");
    return analyzeInventoryImage(getAdminFirestore(), input, actor,
      image => analyzeLabel(image, key, process.env.INVENTORY_SCAN_OPENAI_MODEL || "gpt-6-luna"));
  }, false));
export const lookupInventoryBarcode = onCall(options, inventoryHandler(barcodeQuery, barcodeMatchSchema, "write",
  (input, actor) => new InventoryService().lookupBarcode(input.code, actor), false));
export const bindInventoryProductBarcode = onCall(options, inventoryHandler(bindBarcodeInput, boundBarcodeResult, "write",
  (input, actor) => new InventoryService().bindBarcode(input, actor), false));
export const searchInventoryFoodProducts = onCall({ ...options, secrets: foodKey ? [foodKey] : [] },
  inventoryHandler(foodQuerySchema, foodSearchResult, "write", input => findFoodProducts(input,
    emulator ? process.env.FOODSAFETY_API_KEY ?? "" : foodKey?.value() ?? ""), false));
export const recordInventoryRegistrationOutcome = onCall(options, inventoryHandler(registrationOutcomeSchema, z.object({ recorded: z.boolean() }),
  "write", (input, actor) => recordRegistrationOutcome(getAdminFirestore(), input, actor), false));
