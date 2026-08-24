import {
  Timestamp,
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type WithFieldValue,
} from "firebase/firestore";
import type { z } from "zod";

import {
  catalogMetaSchema,
  commonSearchCatalogSchema,
  productSchema,
  tagDefinitionSchema,
} from "@/domain/catalog";
import {
  authCredentialSchema,
  authzSchema,
  employeeDirectorySchema,
  employeeSchema,
  pinIndexSchema,
} from "@/domain/identity";
import {
  employeeCycleStatsSchema,
  salesAssignmentSchema,
  salesCycleSchema,
  salesProfileSchema,
  salesVisitSchema,
  salesZoneSchema,
  teamCycleStatsSchema,
} from "@/domain/sales";
import { schoolFieldProfileSchema, schoolPhotoSchema, schoolSchema } from "@/domain/school";
import {
  auditLogSchema,
  exportJobSchema,
  neisSyncChangeSchema,
  neisSyncRunSchema,
  publicAppSettingsSchema,
} from "@/domain/system";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function encodeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return Timestamp.fromDate(value);
  }

  if (Array.isArray(value)) {
    return value.map(encodeValue);
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)]));
  }

  return value;
}

function decodeValue(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (Array.isArray(value)) {
    return value.map(decodeValue);
  }

  if (isPlainRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeValue(item)]));
  }

  return value;
}

export function encodeFirestoreData<T extends object>(value: T): DocumentData {
  return encodeValue(value) as DocumentData;
}

export function decodeFirestoreData(value: DocumentData): Record<string, unknown> {
  return decodeValue(value) as Record<string, unknown>;
}

export function createFirestoreConverter<T extends object>(
  schema: z.ZodType<T>,
  documentIdField?: keyof T & string,
): FirestoreDataConverter<T> {
  return {
    toFirestore(modelObject: WithFieldValue<T>): WithFieldValue<DocumentData> {
      return encodeValue(modelObject) as WithFieldValue<DocumentData>;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot<DocumentData, DocumentData>): T {
      const data = decodeFirestoreData(snapshot.data());

      if (documentIdField !== undefined && data[documentIdField] !== snapshot.id) {
        throw new Error(
          `Firestore document ID mismatch for ${documentIdField}: expected ${snapshot.id}, received ${String(data[documentIdField])}.`,
        );
      }

      return schema.parse(data);
    },
  };
}

export const schoolConverter = createFirestoreConverter(schoolSchema, "schoolId");
export const schoolFieldProfileConverter = createFirestoreConverter(
  schoolFieldProfileSchema,
  "schoolId",
);
export const schoolPhotoConverter = createFirestoreConverter(schoolPhotoSchema, "slotId");
export const salesProfileConverter = createFirestoreConverter(salesProfileSchema, "schoolId");
export const salesVisitConverter = createFirestoreConverter(salesVisitSchema, "visitId");
export const salesCycleConverter = createFirestoreConverter(salesCycleSchema, "cycleId");
export const salesAssignmentConverter = createFirestoreConverter(salesAssignmentSchema, "schoolId");
export const salesZoneConverter = createFirestoreConverter(salesZoneSchema, "zoneId");
export const employeeCycleStatsConverter = createFirestoreConverter(
  employeeCycleStatsSchema,
  "employeeId",
);
export const teamCycleStatsConverter = createFirestoreConverter(teamCycleStatsSchema);
export const employeeDirectoryConverter = createFirestoreConverter(
  employeeDirectorySchema,
  "employeeId",
);
export const employeeConverter = createFirestoreConverter(employeeSchema, "employeeId");
export const authCredentialConverter = createFirestoreConverter(
  authCredentialSchema,
  "employeeId",
);
export const pinIndexConverter = createFirestoreConverter(pinIndexSchema);
export const authzConverter = createFirestoreConverter(authzSchema);
export const productConverter = createFirestoreConverter(productSchema, "productId");
export const communicationTagConverter = createFirestoreConverter(tagDefinitionSchema, "tagId");
export const activityTagConverter = createFirestoreConverter(tagDefinitionSchema, "tagId");
export const catalogMetaConverter = createFirestoreConverter(catalogMetaSchema);
export const commonSearchCatalogConverter = createFirestoreConverter(
  commonSearchCatalogSchema,
  "catalogId",
);
export const exportJobConverter = createFirestoreConverter(exportJobSchema, "jobId");
export const auditLogConverter = createFirestoreConverter(auditLogSchema, "logId");
export const neisSyncRunConverter = createFirestoreConverter(neisSyncRunSchema, "runId");
export const neisSyncChangeConverter = createFirestoreConverter(neisSyncChangeSchema);
export const publicAppSettingsConverter = createFirestoreConverter(publicAppSettingsSchema);
