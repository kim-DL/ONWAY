"use client";
import "client-only";

import { httpsCallable } from "firebase/functions";
import type { z } from "zod";
import {
  createInventoryManufacturerInputSchema, inventoryManufacturerListSchema, inventoryManufacturerSchema,
  inventoryProductDetailWithManufacturerSchema, inventoryProductWithManufacturerSchema,
  getInventoryProductWithManufacturerInputSchema, listInventoryManufacturersInputSchema,
  saveInventoryProductWithManufacturerInputSchema, updateInventoryManufacturerInputSchema,
  type InventoryManufacturer, type UpdateInventoryManufacturerInput,
} from "@/domain/inventory-manufacturer";
import type { SaveInventoryProductInput } from "@/domain/inventory";
import { getFirebaseClientServices } from "@/lib/firebase/client";

async function call<T>(name: string, input: unknown, schema: z.ZodType<T>): Promise<T> {
  const services = getFirebaseClientServices();
  const uid = services?.auth.currentUser?.uid;
  if (!services || !uid) throw Object.assign(new Error("Inventory authentication required"), { code: "unauthenticated" });
  const result = await httpsCallable<unknown, unknown>(services.functions, name)(input);
  if (services.auth.currentUser?.uid !== uid) throw Object.assign(new Error("Inventory session changed"), { code: "unauthenticated" });
  return schema.parse(result.data);
}

let activeManufacturerListRequest: Promise<InventoryManufacturer[]> | null = null;

export const inventoryManufacturerRepository = {
  list: () => {
    if (activeManufacturerListRequest) return activeManufacturerListRequest;
    activeManufacturerListRequest = call("listInventoryManufacturers", listInventoryManufacturersInputSchema.parse({}), inventoryManufacturerListSchema)
      .finally(() => { activeManufacturerListRequest = null; });
    return activeManufacturerListRequest;
  },
  create: (input: { requestId: string; name: string }) => call("createInventoryManufacturer", createInventoryManufacturerInputSchema.parse(input), inventoryManufacturerSchema),
  update: (input: UpdateInventoryManufacturerInput) => call("updateInventoryManufacturer", updateInventoryManufacturerInputSchema.parse(input), inventoryManufacturerSchema),
  reference: (productId: string) => call("getInventoryProduct", getInventoryProductWithManufacturerInputSchema.parse({ productId, includeManufacturerReference: true }), inventoryProductDetailWithManufacturerSchema),
  saveProduct: (input: SaveInventoryProductInput) => call("saveInventoryProduct", saveInventoryProductWithManufacturerInputSchema.parse({ ...input, includeSummary: true, includeManufacturerReference: true }), inventoryProductWithManufacturerSchema),
};
