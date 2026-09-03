"use client";

import "client-only";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { z } from "zod";

import { documentIdSchema } from "@/domain/common";
import { productSchema, tagDefinitionSchema } from "@/domain/catalog";
import { employeeDirectorySchema } from "@/domain/identity";
import { salesAssignmentSchema, salesProfileSchema } from "@/domain/sales";
import { schoolFieldProfileSchema, schoolPhotoSchema, schoolSchema } from "@/domain/school";
import { recordCacheAccess } from "@/lib/performance/performance-monitor";

const DETAIL_DATABASE_NAME = "onnuriway-school-detail-v1";
const DETAIL_DATABASE_VERSION = 1;

export const cachedSchoolDetailSchema = z.object({
  cacheKey: z.string().min(1).max(768),
  sessionNamespace: z.string().min(1).max(384),
  schoolId: documentIdSchema,
  school: schoolSchema,
  fieldProfile: schoolFieldProfileSchema.nullable(),
  photos: z.array(schoolPhotoSchema).max(3),
  salesData: z.object({
    activeCycleId: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    promotedProductNames: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
    assignment: salesAssignmentSchema.nullable(),
    profile: salesProfileSchema.nullable(),
    products: z.array(productSchema).max(100),
    communicationTags: z.array(tagDefinitionSchema).max(100),
    activityTags: z.array(tagDefinitionSchema).max(100),
    employees: z.array(employeeDirectorySchema).max(1_000),
    employeeDirectory: z.array(employeeDirectorySchema).max(1_000),
  }).strict().nullable(),
  cachedAt: z.number().int().nonnegative(),
}).strict();

export type CachedSchoolDetail = z.infer<typeof cachedSchoolDetailSchema>;

interface SchoolDetailDatabase extends DBSchema {
  details: {
    key: string;
    value: CachedSchoolDetail;
    indexes: { "by-session": string };
  };
}

const memoryCache = new Map<string, CachedSchoolDetail>();
let databasePromise: Promise<IDBPDatabase<SchoolDetailDatabase>> | null = null;

function getDatabase() {
  databasePromise ??= openDB<SchoolDetailDatabase>(DETAIL_DATABASE_NAME, DETAIL_DATABASE_VERSION, {
    upgrade(database) {
      const details = database.createObjectStore("details", { keyPath: "cacheKey" });
      details.createIndex("by-session", "sessionNamespace");
    },
    blocking(_currentVersion, _blockedVersion, event) {
      const database = event.target;
      if (database instanceof IDBDatabase) database.close();
    },
  });
  return databasePromise;
}

export function createSchoolDetailCacheKey(sessionNamespace: string, schoolId: string) {
  return `${sessionNamespace}:${documentIdSchema.parse(schoolId)}`;
}

export function peekCachedSchoolDetail(sessionNamespace: string, schoolId: string) {
  return memoryCache.get(createSchoolDetailCacheKey(sessionNamespace, schoolId)) ?? null;
}

export async function readCachedSchoolDetail(
  sessionNamespace: string,
  schoolId: string,
): Promise<{ detail: CachedSchoolDetail; source: "memory" | "indexeddb" } | null> {
  const cacheKey = createSchoolDetailCacheKey(sessionNamespace, schoolId);
  const memory = memoryCache.get(cacheKey);
  if (memory) {
    recordCacheAccess("memory", true);
    return { detail: memory, source: "memory" };
  }
  recordCacheAccess("memory", false);

  const database = await getDatabase();
  const stored = await database.get("details", cacheKey);
  const parsed = cachedSchoolDetailSchema.safeParse(stored);
  recordCacheAccess("indexeddb", parsed.success);
  if (!parsed.success) return null;
  memoryCache.set(cacheKey, parsed.data);
  return { detail: parsed.data, source: "indexeddb" };
}

export async function writeCachedSchoolDetail(value: CachedSchoolDetail) {
  const detail = cachedSchoolDetailSchema.parse(value);
  const database = await getDatabase();
  await database.put("details", {
    ...detail,
    // Sales data remains memory-only. Persist only shared school/field data so
    // an offline relaunch cannot expose a previous sales workspace.
    salesData: null,
  });
  memoryCache.set(detail.cacheKey, detail);
}

export async function clearSchoolDetailClientState() {
  memoryCache.clear();
  if (typeof indexedDB === "undefined") return;
  const database = await getDatabase();
  await database.clear("details");
}
