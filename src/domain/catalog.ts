import { z } from "zod";

import {
  districtSchema,
  documentIdSchema,
  firestoreDateSchema,
  nonNegativeIntegerSchema,
  nullableDateOnlySchema,
  nullableFirestoreDateSchema,
  nullableShortTextSchema,
  percentageSchema,
  positiveRevisionSchema,
  requiredTextSchema,
} from "@/domain/common";
import { interestScoreSchema, monthlyStatusSchema } from "@/domain/sales";
import {
  requirementStatusSchema,
  schoolOperationalStatusSchema,
  schoolTypeSchema,
} from "@/domain/school";

export const SEARCH_CATALOG_SCHEMA_VERSION = 1 as const;

export const productSchema = z
  .object({
    productId: documentIdSchema,
    name: requiredTextSchema.max(200),
    shortName: nullableShortTextSchema,
    active: z.boolean(),
    displayOrder: nonNegativeIntegerSchema,
    createdAt: firestoreDateSchema,
    updatedAt: firestoreDateSchema,
  })
  .strict();

export const tagDefinitionSchema = z
  .object({
    tagId: documentIdSchema,
    label: requiredTextSchema.max(200),
    active: z.boolean(),
    displayOrder: nonNegativeIntegerSchema,
    createdAt: firestoreDateSchema,
    updatedAt: firestoreDateSchema,
  })
  .strict();

export const schoolSearchItemSchema = z
  .object({
    schoolId: documentIdSchema,
    name: requiredTextSchema.max(200),
    shortName: nullableShortTextSchema,
    normalizedName: requiredTextSchema.max(200),
    initials: z.string().trim().max(100),
    aliases: z.array(z.string().trim().min(1).max(200)).max(50),
    schoolType: schoolTypeSchema,
    district: districtSchema,
    addressSummary: nullableShortTextSchema,
    operationalStatus: schoolOperationalStatusSchema,
    photoCount: z.number().int().min(0).max(3),
    fieldInfoAvailable: z.boolean(),
  })
  .strict();

export const commonSearchCatalogSchema = z
  .object({
    catalogId: documentIdSchema,
    kind: z.literal("common"),
    schemaVersion: z.literal(SEARCH_CATALOG_SCHEMA_VERSION),
    version: positiveRevisionSchema,
    district: districtSchema,
    chunkIndex: nonNegativeIntegerSchema,
    chunkCount: positiveRevisionSchema.max(50),
    itemCount: nonNegativeIntegerSchema.max(500),
    items: z.array(schoolSearchItemSchema).max(500),
    generatedAt: firestoreDateSchema,
  })
  .strict()
  .superRefine((catalog, context) => {
    if (catalog.itemCount !== catalog.items.length) {
      context.addIssue({
        code: "custom",
        message: "Catalog itemCount must equal the number of items.",
        path: ["itemCount"],
      });
    }
    if (catalog.chunkIndex >= catalog.chunkCount) {
      context.addIssue({
        code: "custom",
        message: "Catalog chunkIndex must be lower than chunkCount.",
        path: ["chunkIndex"],
      });
    }
    if (catalog.items.some((item) => item.district !== catalog.district)) {
      context.addIssue({
        code: "custom",
        message: "Every catalog item must belong to the catalog district.",
        path: ["items"],
      });
    }
  });

export const fieldCatalogItemSchema = z
  .object({
    schoolId: documentIdSchema,
    cartRequired: requirementStatusSchema,
    inspectionStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
    inspectionEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
    cafeteriaLocationShort: nullableShortTextSchema,
    photoCount: z.number().int().min(0).max(3),
    completeness: percentageSchema,
  })
  .strict();

export const salesCatalogItemSchema = z
  .object({
    schoolId: documentIdSchema,
    interestScore: interestScoreSchema,
    monthlyVisitStatus: monthlyStatusSchema.nullable(),
    primaryAssigneeId: documentIdSchema.nullable(),
    latestVisitDate: nullableFirestoreDateSchema,
    followUpRequired: z.boolean(),
    followUpDue: nullableDateOnlySchema,
  })
  .strict();

export const catalogMetaSchema = z
  .object({
    commonCatalogVersion: nonNegativeIntegerSchema,
    fieldCatalogVersion: nonNegativeIntegerSchema,
    salesCatalogVersion: nonNegativeIntegerSchema,
    assignmentCatalogVersion: nonNegativeIntegerSchema,
    commonCatalogIds: z.array(documentIdSchema).max(50),
    commonCatalogItemCount: nonNegativeIntegerSchema,
    commonCatalogSchemaVersion: z.literal(SEARCH_CATALOG_SCHEMA_VERSION),
    updatedAt: firestoreDateSchema,
  })
  .strict();

export type Product = z.infer<typeof productSchema>;
export type TagDefinition = z.infer<typeof tagDefinitionSchema>;
export type SchoolSearchItem = z.infer<typeof schoolSearchItemSchema>;
export type CommonSearchCatalog = z.infer<typeof commonSearchCatalogSchema>;
export type FieldCatalogItem = z.infer<typeof fieldCatalogItemSchema>;
export type SalesCatalogItem = z.infer<typeof salesCatalogItemSchema>;
export type CatalogMeta = z.infer<typeof catalogMetaSchema>;
