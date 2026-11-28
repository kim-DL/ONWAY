import { z } from "zod";
import { inventoryDateSchema, inventoryIdSchema } from "./inventory-contract.js";
import { canonicalGtin, gtinSchema, scanBarcodesSchema } from "./inventory-barcode-contract.js";

const short = z.string().trim().min(1).max(200);
const quote = z.string().trim().min(1).max(240);
const printed = z.object({ value: short, quote }).strict().nullable();
const count = z.number().int().min(1).max(1_000_000);
export const labelReadingSchema = z.object({
  kind: z.enum(["single", "multiple", "unsupported"]),
  name: printed, manufacturer: printed, origin: printed, netContent: printed, innerContents: printed,
  casePack: z.object({ count, unit: z.string().trim().min(1).max(20), quote }).strict().nullable(),
  expiry: z.object({ value: inventoryDateSchema, quote }).strict().nullable(),
}).strict();
export type LabelReading = z.infer<typeof labelReadingSchema>;
export const scanImageInput = z.object({ requestId: z.uuid(), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  fileBase64: z.string().min(4).max(8 * 1024 * 1024), retryFailed: z.literal(true).optional() }).strict();
export const barcodeQuery = z.object({ code: gtinSchema }).strict();
export const barcodeMatchSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("missing") }).strict(), z.object({ status: z.literal("inactive") }).strict(),
  z.object({ status: z.literal("matched"), productId: inventoryIdSchema, name: short, level: z.enum(["unit", "case"]) }).strict(),
]);
export const bindBarcodeInput = z.object({ requestId: z.uuid(), productId: inventoryIdSchema,
  expectedRevision: z.number().int().positive(), scanBarcodes: scanBarcodesSchema }).strict();
export const boundBarcodeResult = z.object({ productId: inventoryIdSchema }).strict();
export const foodQuerySchema = z.discriminatedUnion("by", [
  z.object({ by: z.literal("code"), value: z.string().max(14).refine((value) => !!canonicalGtin(value)) }).strict(),
  z.object({ by: z.literal("name"), value: z.string().trim().min(2).max(100) }).strict(),
]);
export const foodItemSchema = z.object({ reportNo: short, name: short, manufacturer: z.string().max(200), category: z.string().max(200) }).strict();
export const foodSearchResult = z.object({ status: z.enum(["ok", "unconfigured", "unavailable"]),
  items: z.array(foodItemSchema).max(6), more: z.boolean() }).strict();
export type FoodCandidate = z.infer<typeof foodItemSchema>;
export type FoodQuery = z.infer<typeof foodQuerySchema>;
export type BarcodeMatch = z.infer<typeof barcodeMatchSchema>;
export const scanFieldSchema = z.enum(["name", "manufacturer", "origin", "specification", "boxPackSize", "expiry"]);
export type ScanField = z.infer<typeof scanFieldSchema>;
const seconds = z.number().int().min(0).max(86400);
export const registrationOutcomeSchema = z.object({
  requestId: z.uuid(), mode: z.enum(["manual", "scan"]), outcome: z.enum(["registered", "received", "closed"]),
  seconds, analysisSeconds: seconds, reviewSeconds: seconds, photos: z.number().int().min(0).max(100),
  suggested: z.array(scanFieldSchema).max(6), corrected: z.array(scanFieldSchema).max(6),
}).strict();
export type RegistrationOutcome = z.infer<typeof registrationOutcomeSchema>;
