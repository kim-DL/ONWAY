"use client";

import "client-only";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { PhotoSlotId } from "@/domain/school";
import { recordCacheAccess } from "@/lib/performance/performance-monitor";

export type PhotoVariant = "thumbnail" | "preview" | "original";

type CachedPhotoVariant = {
  cacheKey: string;
  sessionNamespace: string;
  schoolId: string;
  slotId: PhotoSlotId;
  versionId: string;
  variant: Exclude<PhotoVariant, "original">;
  blob: Blob;
  byteSize: number;
  cachedAt: number;
};

interface PhotoCacheDatabase extends DBSchema {
  variants: {
    key: string;
    value: CachedPhotoVariant;
    indexes: { "by-cached-at": number; "by-session": string };
  };
}

const PHOTO_CACHE_DATABASE = "onnuriway-photo-cache-v1";
const MAX_PERSISTED_VARIANTS = 24;
const MAX_PERSISTED_BYTES = 36 * 1024 * 1024;
const memoryCache = new Map<string, Blob>();
let databasePromise: Promise<IDBPDatabase<PhotoCacheDatabase>> | null = null;

function database() {
  databasePromise ??= openDB<PhotoCacheDatabase>(PHOTO_CACHE_DATABASE, 1, {
    upgrade(value) {
      const variants = value.createObjectStore("variants", { keyPath: "cacheKey" });
      variants.createIndex("by-cached-at", "cachedAt");
      variants.createIndex("by-session", "sessionNamespace");
    },
    blocking(_currentVersion, _blockedVersion, event) {
      const target = event.target;
      if (target instanceof IDBDatabase) target.close();
    },
  });
  return databasePromise;
}

export function createPhotoVariantCacheKey(input: {
  sessionNamespace: string;
  schoolId: string;
  slotId: PhotoSlotId;
  versionId: string;
  variant: PhotoVariant;
}) {
  return `${input.sessionNamespace}:${input.schoolId}:${input.slotId}:${input.versionId}:${input.variant}`;
}

export async function readPhotoVariantCache(cacheKey: string, variant: PhotoVariant) {
  const memory = memoryCache.get(cacheKey);
  if (memory) {
    recordCacheAccess("memory", true);
    recordCacheAccess("image-cache", true);
    return { blob: memory, source: "memory" as const };
  }
  recordCacheAccess("memory", false);
  if (variant === "original") {
    recordCacheAccess("image-cache", false);
    return null;
  }
  const stored = await (await database()).get("variants", cacheKey);
  const hit = Boolean(stored && stored.blob instanceof Blob);
  recordCacheAccess("indexeddb", hit);
  recordCacheAccess("image-cache", hit);
  if (!stored || !(stored.blob instanceof Blob)) return null;
  memoryCache.set(cacheKey, stored.blob);
  return { blob: stored.blob, source: "indexeddb" as const };
}

async function enforcePhotoCacheBudget() {
  const db = await database();
  const records = await db.getAllFromIndex("variants", "by-cached-at");
  let totalBytes = records.reduce((sum, record) => sum + record.byteSize, 0);
  let excess = Math.max(0, records.length - MAX_PERSISTED_VARIANTS);
  for (const record of records) {
    if (excess <= 0 && totalBytes <= MAX_PERSISTED_BYTES) break;
    await db.delete("variants", record.cacheKey);
    memoryCache.delete(record.cacheKey);
    totalBytes -= record.byteSize;
    excess -= 1;
  }
}

export async function writePhotoVariantCache(
  input: Omit<CachedPhotoVariant, "blob" | "byteSize" | "cachedAt" | "variant"> & {
    variant: PhotoVariant;
  },
  blob: Blob,
) {
  memoryCache.set(input.cacheKey, blob);
  if (input.variant === "original") return;
  await (await database()).put("variants", {
    ...input,
    variant: input.variant,
    blob,
    byteSize: blob.size,
    cachedAt: Date.now(),
  });
  await enforcePhotoCacheBudget();
}

export async function clearSchoolPhotoClientState() {
  memoryCache.clear();
  if (typeof indexedDB === "undefined") return;
  await (await database()).clear("variants");
}
