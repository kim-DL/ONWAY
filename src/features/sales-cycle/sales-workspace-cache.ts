"use client";

import "client-only";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { z } from "zod";

import { employeeDirectorySchema } from "@/domain/identity";
import { salesAssignmentSchema, salesCycleSchema, salesZoneSchema } from "@/domain/sales";
import { schoolSchema } from "@/domain/school";

const DATABASE_NAME = "onnuriway-sales-workspace-v1";
const DATABASE_VERSION = 1;
const MAX_CYCLES_PER_SESSION = 18;

export const cachedSalesWorkspaceSchema = z.object({
  cacheKey: z.string().min(1).max(768),
  sessionNamespace: z.string().min(1).max(384),
  currentCycleId: z.string(),
  selectedCycleId: z.string(),
  cycles: z.array(salesCycleSchema).max(MAX_CYCLES_PER_SESSION),
  cycle: salesCycleSchema,
  assignments: z.array(salesAssignmentSchema).max(5_000),
  schools: z.array(schoolSchema).max(5_000),
  zones: z.array(salesZoneSchema).max(100),
  employees: z.array(employeeDirectorySchema).max(1_000),
  cachedAt: z.number().int().nonnegative(),
}).strict();

export type CachedSalesWorkspace = z.infer<typeof cachedSalesWorkspaceSchema>;

interface SalesWorkspaceDatabase extends DBSchema {
  workspaces: {
    key: string;
    value: CachedSalesWorkspace;
    indexes: { "by-session": string };
  };
}

const memoryCache = new Map<string, CachedSalesWorkspace>();
let databasePromise: Promise<IDBPDatabase<SalesWorkspaceDatabase>> | null = null;

function getDatabase() {
  databasePromise ??= openDB<SalesWorkspaceDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      const workspaces = database.createObjectStore("workspaces", { keyPath: "cacheKey" });
      workspaces.createIndex("by-session", "sessionNamespace");
    },
    blocking(_currentVersion, _blockedVersion, event) {
      const database = event.target;
      if (database instanceof IDBDatabase) database.close();
    },
  });
  return databasePromise;
}

export function createSalesWorkspaceCacheKey(sessionNamespace: string, cycleId: string) {
  return `${sessionNamespace}:${cycleId}`;
}

export function peekCachedSalesWorkspace(sessionNamespace: string, cycleId?: string | null) {
  if (cycleId) {
    const key = createSalesWorkspaceCacheKey(sessionNamespace, cycleId);
    return memoryCache.get(key) ?? null;
  }

  const memoryCandidates = [...memoryCache.values()].filter((item) => item.sessionNamespace === sessionNamespace);
  return memoryCandidates.sort((left, right) => right.cachedAt - left.cachedAt)[0] ?? null;
}

export async function readCachedSalesWorkspace(sessionNamespace: string, cycleId?: string | null) {
  return peekCachedSalesWorkspace(sessionNamespace, cycleId);
}

export async function writeCachedSalesWorkspace(value: CachedSalesWorkspace) {
  const workspace = cachedSalesWorkspaceSchema.parse(value);
  memoryCache.set(workspace.cacheKey, workspace);
  const retainedKeys = new Set(
    [...memoryCache.values()]
      .filter((item) => item.sessionNamespace === workspace.sessionNamespace)
      .sort((left, right) => right.cachedAt - left.cachedAt)
      .slice(0, MAX_CYCLES_PER_SESSION)
      .map((item) => item.cacheKey),
  );
  for (const [cacheKey, item] of memoryCache) {
    if (item.sessionNamespace === workspace.sessionNamespace && !retainedKeys.has(cacheKey)) {
      memoryCache.delete(cacheKey);
    }
  }

  // Phase 9 builds may have persisted a workspace. Remove that legacy data;
  // Phase 14 deliberately guarantees sales data for the active tab only.
  if (typeof indexedDB !== "undefined") await (await getDatabase()).clear("workspaces");
}

export async function invalidateCachedSalesWorkspace(sessionNamespace: string, cycleId: string) {
  const cacheKey = createSalesWorkspaceCacheKey(sessionNamespace, cycleId);
  memoryCache.delete(cacheKey);
  if (typeof indexedDB === "undefined") return;
  await (await getDatabase()).delete("workspaces", cacheKey);
}

export async function clearSalesWorkspaceClientState() {
  memoryCache.clear();
  if (typeof indexedDB === "undefined") return;
  const database = await getDatabase();
  await database.clear("workspaces");
}
