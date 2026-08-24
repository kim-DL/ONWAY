"use client";

import "client-only";

import { doc, getDoc } from "firebase/firestore";

import {
  SEARCH_CATALOG_SCHEMA_VERSION,
  type CatalogMeta,
  type CommonSearchCatalog,
} from "@/domain/catalog";
import type { School } from "@/domain/school";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { getFirebaseClientServices } from "@/lib/firebase/client";
import { recordFirestoreReads } from "@/lib/performance/performance-monitor";
import {
  catalogMetaConverter,
  commonSearchCatalogConverter,
  schoolConverter,
} from "@/lib/firebase/firestore-converters";
import {
  createCatalogNamespace,
  readLatestCachedCatalog,
  writeCachedCatalog,
  type CachedCommonCatalog,
} from "./search-catalog-cache";

export type SearchRoleScope = "delivery" | "sales";

export function createSearchSessionNamespace(
  session: AuthenticatedSession,
  roleScope: SearchRoleScope,
) {
  return `onnuriway:${session.claims.employeeId}:${roleScope}:${session.claims.sessionVersion}`;
}

function sameIds(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

async function fetchCatalogMeta(): Promise<CatalogMeta> {
  const services = getFirebaseClientServices();
  if (!services) throw new Error("Firebase is not configured.");
  const snapshot = await getDoc(
    doc(services.firestore, "catalogMeta", "current").withConverter(catalogMetaConverter),
  );
  recordFirestoreReads("search", 1);
  if (!snapshot.exists()) throw new Error("Search catalog metadata does not exist.");
  return snapshot.data();
}

async function fetchCatalogDocument(catalogId: string): Promise<CommonSearchCatalog> {
  const services = getFirebaseClientServices();
  if (!services) throw new Error("Firebase is not configured.");
  const snapshot = await getDoc(
    doc(services.firestore, "searchCatalogs", catalogId).withConverter(commonSearchCatalogConverter),
  );
  recordFirestoreReads("search", 1);
  if (!snapshot.exists()) throw new Error(`Search catalog ${catalogId} does not exist.`);
  return snapshot.data();
}

export class SearchCatalogRepository {
  async readCached(sessionNamespace: string) {
    return readLatestCachedCatalog(sessionNamespace);
  }

  async refresh(
    sessionNamespace: string,
    cached: CachedCommonCatalog | null,
  ): Promise<CachedCommonCatalog> {
    const meta = await fetchCatalogMeta();
    if (
      meta.commonCatalogVersion < 1 ||
      meta.commonCatalogIds.length === 0 ||
      meta.commonCatalogSchemaVersion !== SEARCH_CATALOG_SCHEMA_VERSION
    ) {
      throw new Error("A compatible common search catalog has not been published.");
    }

    if (
      cached?.version === meta.commonCatalogVersion &&
      sameIds(cached.catalogIds, meta.commonCatalogIds)
    ) {
      return cached;
    }

    const documents = await Promise.all(meta.commonCatalogIds.map(fetchCatalogDocument));
    const items = documents.flatMap((document, index) => {
      if (
        document.catalogId !== meta.commonCatalogIds[index] ||
        document.version !== meta.commonCatalogVersion ||
        document.schemaVersion !== meta.commonCatalogSchemaVersion
      ) {
        throw new Error("Search catalog metadata and documents are inconsistent.");
      }
      return document.items;
    });
    if (items.length !== meta.commonCatalogItemCount) {
      throw new Error("Search catalog item count does not match its metadata.");
    }
    if (new Set(items.map((item) => item.schoolId)).size !== items.length) {
      throw new Error("Search catalog contains duplicate school IDs.");
    }

    const catalogNamespace = createCatalogNamespace(sessionNamespace, meta.commonCatalogVersion);
    const nextCatalog: CachedCommonCatalog = {
      cacheKey: catalogNamespace,
      sessionNamespace,
      catalogNamespace,
      version: meta.commonCatalogVersion,
      catalogIds: [...meta.commonCatalogIds],
      items: items.sort((left, right) =>
        left.normalizedName.localeCompare(right.normalizedName, "ko-KR") ||
        left.schoolId.localeCompare(right.schoolId),
      ),
      cachedAt: Date.now(),
    };
    await writeCachedCatalog(nextCatalog);
    return nextCatalog;
  }

  async getSchool(schoolId: string): Promise<School> {
    const services = getFirebaseClientServices();
    if (!services) throw new Error("Firebase is not configured.");
    const snapshot = await getDoc(
      doc(services.firestore, "schools", schoolId).withConverter(schoolConverter),
    );
    recordFirestoreReads("search", 1);
    if (!snapshot.exists()) throw new Error("School does not exist.");
    return snapshot.data();
  }
}

export const searchCatalogRepository = new SearchCatalogRepository();
