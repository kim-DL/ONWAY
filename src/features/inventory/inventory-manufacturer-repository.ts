"use client";
import "client-only";

import type { z } from "zod";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import { httpsCallable } from "firebase/functions";
import { inventoryAccessGeneration, inventoryAuthenticationError, reportInventoryAccessFailure } from "./inventory-access-boundary";
import {
  createInventoryManufacturerInputSchema, inventoryManufacturerListSchema, inventoryManufacturerSchema,
  inventoryProductDetailWithManufacturerSchema, inventoryProductSaveResultWithManufacturerSchema,
  getInventoryProductWithManufacturerInputSchema, listInventoryManufacturersInputSchema,
  saveInventoryProductWithManufacturerInputSchema, updateInventoryManufacturerInputSchema,
  type InventoryManufacturer, type UpdateInventoryManufacturerInput,
} from "@/domain/inventory-manufacturer";
import type { SaveInventoryProductInput } from "@/domain/inventory";


async function call<T>(name: string, input: unknown, schema: z.ZodType<T>): Promise<T> {
  const services = getFirebaseClientServices();
  const uid = services?.auth.currentUser?.uid;
  const generation = inventoryAccessGeneration();
  try {
    if (!services || !uid) throw inventoryAuthenticationError();
    const result = await httpsCallable<unknown, unknown>(services.functions, name)(input);
    if (services.auth.currentUser?.uid !== uid || inventoryAccessGeneration() !== generation) throw inventoryAuthenticationError();
    return schema.parse(result.data);
  } catch (cause) {
    // A superseded account/session request cannot clear the next session's UI.
    if (inventoryAccessGeneration() === generation && services?.auth.currentUser?.uid === uid) reportInventoryAccessFailure(cause, uid ?? null);
    throw cause;
  }
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
  saveProduct: (input: SaveInventoryProductInput) => call("saveInventoryProduct", saveInventoryProductWithManufacturerInputSchema.parse({ ...input, includeSummary: true, includeManufacturerReference: true }), inventoryProductSaveResultWithManufacturerSchema),
};
