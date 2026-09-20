import { z } from "zod";
import {
  deleteInventoryProductInputSchema, getInventoryProductInputSchema, inventoryCountInputSchema,
  inventoryIdSchema, inventoryListInputSchema, inventoryListPageSchema, inventoryMovementInputSchema,
  inventoryMutationResultSchema, inventoryProductDetailSchema, inventoryProductDraftSchema,
  inventoryProductSchema, saveInventoryProductInputSchema, setInventoryProductStatusInputSchema,
  updateInventoryLotInputSchema,
} from "./inventory-contract.js";

export const INVENTORY_MANUFACTURER_PATH = "companies/onnuri/inventoryManufacturers";
export const INVENTORY_MANUFACTURER_NAME_PATH = "companies/onnuri/inventoryManufacturerNames";
export const INVENTORY_MAX_MANUFACTURERS = 500;

export function canonicalInventoryManufacturerName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}
export function normalizeInventoryManufacturerName(value: string): string {
  return canonicalInventoryManufacturerName(value).toLocaleLowerCase("ko-KR").replace(/[\p{P}\p{S}\s]/gu, "");
}

const manufacturerName = z.string().max(200).transform(canonicalInventoryManufacturerName)
  .refine((value) => value.length > 0 && normalizeInventoryManufacturerName(value).length > 0, "제조사명을 확인해주세요.");
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const inventoryManufacturerSchema = z.object({
  manufacturerId: inventoryIdSchema, name: z.string().min(1).max(200), normalizedName: z.string().min(1).max(200),
  active: z.boolean(), revision, createdAt: z.iso.datetime(), createdBy: inventoryIdSchema, updatedAt: z.iso.datetime(),
}).strict();
export const listInventoryManufacturersInputSchema = z.object({}).strict();
export const inventoryManufacturerListSchema = z.array(inventoryManufacturerSchema).max(INVENTORY_MAX_MANUFACTURERS);
export const createInventoryManufacturerInputSchema = z.object({ requestId: z.uuid(), name: manufacturerName }).strict();
export const updateInventoryManufacturerInputSchema = z.object({
  requestId: z.uuid(), manufacturerId: inventoryIdSchema, expectedRevision: revision,
  name: manufacturerName.optional(), active: z.literal(false).optional(),
}).strict().refine((value) => value.name !== undefined || value.active === false, "변경할 제조사 정보를 확인해주세요.");

// Server-only expanded product contracts. Existing clients continue using the
// strict legacy schemas and receive this field only when they opt in.
export const inventoryProductWithManufacturerSchema = inventoryProductSchema.safeExtend({ manufacturerId: inventoryIdSchema.optional() });
export const inventoryProductDraftWithManufacturerSchema = inventoryProductDraftSchema.safeExtend({ manufacturerId: inventoryIdSchema.optional() });
const includeManufacturerReference = z.boolean().optional();
export const inventoryListWithManufacturerInputSchema = inventoryListInputSchema.extend({ includeManufacturerReference });
export const getInventoryProductWithManufacturerInputSchema = getInventoryProductInputSchema.extend({ includeManufacturerReference });
export const saveInventoryProductWithManufacturerInputSchema = saveInventoryProductInputSchema.safeExtend({
  includeManufacturerReference, draft: inventoryProductDraftWithManufacturerSchema,
});
export const inventoryMovementWithManufacturerInputSchema = inventoryMovementInputSchema.extend({ includeManufacturerReference });
export const inventoryCountWithManufacturerInputSchema = inventoryCountInputSchema.extend({ includeManufacturerReference });
export const updateInventoryLotWithManufacturerInputSchema = updateInventoryLotInputSchema.extend({ includeManufacturerReference });
export const setInventoryProductStatusWithManufacturerInputSchema = setInventoryProductStatusInputSchema.extend({ includeManufacturerReference });
export const deleteInventoryProductWithManufacturerInputSchema = deleteInventoryProductInputSchema.extend({ includeManufacturerReference });
export const inventoryListPageWithManufacturerSchema = inventoryListPageSchema.extend({
  products: z.array(inventoryProductWithManufacturerSchema).max(100),
});
export const inventoryProductDetailWithManufacturerSchema = inventoryProductDetailSchema.extend({ product: inventoryProductWithManufacturerSchema });
export const inventoryMutationResultWithManufacturerSchema = inventoryMutationResultSchema.extend({
  product: inventoryProductWithManufacturerSchema, detail: inventoryProductDetailWithManufacturerSchema.optional(),
});

export type InventoryManufacturer = z.infer<typeof inventoryManufacturerSchema>;
export type CreateInventoryManufacturerInput = z.infer<typeof createInventoryManufacturerInputSchema>;
export type UpdateInventoryManufacturerInput = z.infer<typeof updateInventoryManufacturerInputSchema>;
export type SaveInventoryProductWithManufacturerInput = z.infer<typeof saveInventoryProductWithManufacturerInputSchema>;
