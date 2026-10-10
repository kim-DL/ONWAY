import { z } from "zod";
import { inventoryEventSchema, inventoryIdSchema } from "./inventory-contract.js";

/** Original fields from the append-only event committed by the quantity-match action. */
export const inventoryQuantityMatchSchema = inventoryEventSchema.pick({ eventId: true, productId: true,
  kind: true, locationId: true, createdAt: true, cycleId: true, stockRevision: true })
  .extend({ kind: z.literal("count_match"), actorEmployeeId: inventoryIdSchema.nullish().default(null) });
export type InventoryQuantityMatch = z.infer<typeof inventoryQuantityMatchSchema>;
