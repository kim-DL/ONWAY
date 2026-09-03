"use client";

import "client-only";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { z } from "zod";

import { documentIdSchema } from "@/domain/common";
import { schoolSearchItemSchema, type SchoolSearchItem } from "@/domain/catalog";
import { recordCacheAccess } from "@/lib/performance/performance-monitor";

const SEARCH_DATABASE_NAME = "onnuriway-search-v1";
const SEARCH_DATABASE_VERSION = 1;
const MAX_RECENT_SCHOOLS = 8;

const cachedCommonCatalogSchema = z.object({
  cacheKey: z.string().min(1).max(512),
  sessionNamespace: z.string().min(1).max(384),
  catalogNamespace: z.string().min(1).max(512),
  version: z.number().int().positive(),
  catalogIds: z.array(documentIdSchema).min(1).max(50),
  items: z.array(schoolSearchItemSchema).min(1).max(10_000),
  cachedAt: z.number().int().nonnegative(),
}).strict();

const recentSchoolRecordSchema = z.object({
  key: z.string().min(1).max(768),
  sessionNamespace: z.string().min(1).max(384),
  catalogNamespace: z.string().min(1).max(512),
  schoolId: documentIdSchema,
  item: schoolSearchItemSchema,
  viewedAt: z.number().int().nonnegative(),
}).strict();

export type CachedCommonCatalog = z.infer<typeof cachedCommonCatalogSchema>;
type RecentSchoolRecord = z.infer<typeof recentSchoolRecordSchema>;
export type RecentSchoolEntry = {
  item: SchoolSearchItem;
  viewedAt: number;
};

interface SearchCatalogDatabase extends DBSchema {
  catalogs: {
    key: string;
    value: CachedCommonCatalog;
    indexes: { "by-session": string };
  };
  recentSchools: {
    key: string;
    value: RecentSchoolRecord;
    indexes: { "by-session": string; "by-catalog": string };
  };
}

let databasePromise: Promise<IDBPDatabase<SearchCatalogDatabase>> | null = null;

function getDatabase() {
  databasePromise ??= openDB<SearchCatalogDatabase>(SEARCH_DATABASE_NAME, SEARCH_DATABASE_VERSION, {
    upgrade(database) {
      const catalogs = database.createObjectStore("catalogs", { keyPath: "cacheKey" });
      catalogs.createIndex("by-session", "sessionNamespace");
      const recentSchools = database.createObjectStore("recentSchools", { keyPath: "key" });
      recentSchools.createIndex("by-session", "sessionNamespace");
      recentSchools.createIndex("by-catalog", "catalogNamespace");
    },
    blocking(_currentVersion, _blockedVersion, event) {
      const database = event.target;
      if (database instanceof IDBDatabase) database.close();
    },
  });
  return databasePromise;
}

export function createCatalogNamespace(sessionNamespace: string, version: number) {
  return `${sessionNamespace}:${version}`;
}

export async function readLatestCachedCatalog(
  sessionNamespace: string,
): Promise<CachedCommonCatalog | null> {
  const database = await getDatabase();
  const candidates = await database.getAllFromIndex("catalogs", "by-session", sessionNamespace);
  const validCandidates = candidates.flatMap((candidate) => {
    const parsed = cachedCommonCatalogSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
  const latest = validCandidates.sort((left, right) => right.version - left.version)[0] ?? null;
  recordCacheAccess("indexeddb", latest !== null);
  return latest;
}

export async function writeCachedCatalog(value: CachedCommonCatalog) {
  const catalog = cachedCommonCatalogSchema.parse(value);
  const database = await getDatabase();
  const transaction = database.transaction(["catalogs", "recentSchools"], "readwrite");
  const existingCatalogs = await transaction.objectStore("catalogs").index("by-session").getAll(catalog.sessionNamespace);
  const existingRecents = await transaction.objectStore("recentSchools").index("by-session").getAll(catalog.sessionNamespace);
  await Promise.all([
    ...existingCatalogs
      .filter((existing) => existing.cacheKey !== catalog.cacheKey)
      .map((existing) => transaction.objectStore("catalogs").delete(existing.cacheKey)),
    ...existingRecents
      .filter((existing) => existing.catalogNamespace !== catalog.catalogNamespace)
      .map((existing) => transaction.objectStore("recentSchools").delete(existing.key)),
    transaction.objectStore("catalogs").put(catalog),
  ]);
  await transaction.done;
}

export async function readRecentSchoolEntries(
  catalogNamespace: string,
  validItems: readonly SchoolSearchItem[],
): Promise<RecentSchoolEntry[]> {
  const database = await getDatabase();
  const validItemsById = new Map(validItems.map((item) => [item.schoolId, item]));
  const records = await database.getAllFromIndex("recentSchools", "by-catalog", catalogNamespace);
  return records
    .flatMap((record) => {
      const parsed = recentSchoolRecordSchema.safeParse(record);
      if (!parsed.success) return [];
      const currentItem = validItemsById.get(parsed.data.schoolId);
      return currentItem ? [{ item: currentItem, viewedAt: parsed.data.viewedAt }] : [];
    })
    .sort((left, right) => right.viewedAt - left.viewedAt)
    .slice(0, MAX_RECENT_SCHOOLS);
}

export async function readRecentSchools(
  catalogNamespace: string,
  validItems: readonly SchoolSearchItem[],
): Promise<SchoolSearchItem[]> {
  return (await readRecentSchoolEntries(catalogNamespace, validItems)).map(({ item }) => item);
}

export async function recordRecentSchool(input: {
  sessionNamespace: string;
  catalogNamespace: string;
  item: SchoolSearchItem;
  viewedAt?: number;
}) {
  const record = recentSchoolRecordSchema.parse({
    key: `${input.catalogNamespace}:${input.item.schoolId}`,
    sessionNamespace: input.sessionNamespace,
    catalogNamespace: input.catalogNamespace,
    schoolId: input.item.schoolId,
    item: input.item,
    viewedAt: input.viewedAt ?? Date.now(),
  });
  const database = await getDatabase();
  const transaction = database.transaction("recentSchools", "readwrite");
  const existing = await transaction.store.index("by-catalog").getAll(input.catalogNamespace);
  const retainedKeys = new Set(
    [...existing.filter((item) => item.schoolId !== record.schoolId), record]
      .sort((left, right) => right.viewedAt - left.viewedAt)
      .slice(0, MAX_RECENT_SCHOOLS)
      .map((item) => item.key),
  );
  await Promise.all([
    ...existing.filter((item) => !retainedKeys.has(item.key)).map((item) => transaction.store.delete(item.key)),
    transaction.store.put(record),
  ]);
  await transaction.done;
}

export async function clearSearchClientState() {
  if (typeof indexedDB === "undefined") return;
  const database = await getDatabase();
  const transaction = database.transaction(["catalogs", "recentSchools"], "readwrite");
  await Promise.all([
    transaction.objectStore("catalogs").clear(),
    transaction.objectStore("recentSchools").clear(),
  ]);
  await transaction.done;
}
