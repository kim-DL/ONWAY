import { getFirebaseClientServices } from "@/lib/firebase/client";
import { inventoryAccessGeneration, inventoryAuthenticationError } from "../inventory-access-boundary";
import { barcodeMatchSchema, boundBarcodeResult, foodSearchResult, labelReadingSchema, type FoodQuery,
  type ScanBarcodeLink } from "@/domain/inventory-scan";
import { callInventory } from "../inventory-repository";
import { inventoryPhotoBase64 } from "../inventory-photo-picker";

export const scanRepository = {
  analyze: async (file: File, requestId: string, retryFailed: boolean) => {
    const generation = inventoryAccessGeneration();
    const uid = getFirebaseClientServices()?.auth.currentUser?.uid;
    const fileBase64 = await inventoryPhotoBase64(file);
    return callInventory("analyzeInventoryProductLabel", { requestId, contentType: file.type, fileBase64, ...(retryFailed ? { retryFailed: true } : {}) }, labelReadingSchema,
      () => { if (!uid || uid !== getFirebaseClientServices()?.auth.currentUser?.uid || generation !== inventoryAccessGeneration()) throw inventoryAuthenticationError(); });
  },
  barcode: (code: string) => callInventory("lookupInventoryBarcode", { code }, barcodeMatchSchema),
  bind: (productId: string, expectedRevision: number, scanBarcodes: ScanBarcodeLink[], requestId: string) =>
    callInventory("bindInventoryProductBarcode", { productId, expectedRevision, scanBarcodes, requestId }, boundBarcodeResult),
  food: (query: FoodQuery) => callInventory("searchInventoryFoodProducts", query, foodSearchResult),

};
