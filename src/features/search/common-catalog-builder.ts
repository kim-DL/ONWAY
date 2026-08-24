import {
  commonSearchCatalogSchema,
  schoolSearchItemSchema,
  SEARCH_CATALOG_SCHEMA_VERSION,
  type CommonSearchCatalog,
  type SchoolSearchItem,
} from "@/domain/catalog";
import { DISTRICTS, type District } from "@/domain/common";
import type { School, SchoolFieldProfile, SchoolPhoto } from "@/domain/school";
import { deriveCatalogSearchFields } from "./search-normalizer";

export const MAX_COMMON_CATALOG_DOCUMENT_BYTES = 300 * 1024;

export type CommonCatalogBuild = {
  version: number;
  documents: CommonSearchCatalog[];
  catalogIds: string[];
  itemCount: number;
};

function catalogId(version: number, district: District, chunkIndex: number) {
  return `common-v${String(version).padStart(6, "0")}-${district}-${String(chunkIndex).padStart(2, "0")}`;
}

export function estimateCatalogDocumentBytes(value: unknown): number {
  return new TextEncoder().encode(
    JSON.stringify(value, (_key, item) => item instanceof Date ? item.toISOString() : item),
  ).byteLength;
}

function createDocument(input: {
  version: number;
  district: District;
  chunkIndex: number;
  chunkCount: number;
  items: SchoolSearchItem[];
  generatedAt: Date;
}) {
  return commonSearchCatalogSchema.parse({
    catalogId: catalogId(input.version, input.district, input.chunkIndex),
    kind: "common",
    schemaVersion: SEARCH_CATALOG_SCHEMA_VERSION,
    version: input.version,
    district: input.district,
    chunkIndex: input.chunkIndex,
    chunkCount: input.chunkCount,
    itemCount: input.items.length,
    items: input.items,
    generatedAt: input.generatedAt,
  });
}

function chunkDistrictItems(input: {
  version: number;
  district: District;
  items: SchoolSearchItem[];
  generatedAt: Date;
  maximumDocumentBytes: number;
}) {
  const chunks: SchoolSearchItem[][] = [];
  for (const item of input.items) {
    const current = chunks.at(-1) ?? [];
    const candidate = [...current, item];
    const candidateDocument = createDocument({
      ...input,
      chunkIndex: Math.max(0, chunks.length - 1),
      chunkCount: 50,
      items: candidate,
    });
    if (estimateCatalogDocumentBytes(candidateDocument) <= input.maximumDocumentBytes) {
      if (chunks.length === 0) chunks.push(candidate);
      else chunks[chunks.length - 1] = candidate;
      continue;
    }
    if (current.length === 0) {
      throw new Error(`School ${item.schoolId} exceeds the common catalog document budget.`);
    }
    chunks.push([item]);
  }

  return chunks.map((items, chunkIndex) => {
    const document = createDocument({
      ...input,
      chunkIndex,
      chunkCount: chunks.length,
      items,
    });
    if (estimateCatalogDocumentBytes(document) > input.maximumDocumentBytes) {
      throw new Error(`Catalog ${document.catalogId} exceeds the common catalog document budget.`);
    }
    return document;
  });
}

export function buildCommonSearchCatalog(input: {
  schools: readonly School[];
  fieldProfiles: readonly SchoolFieldProfile[];
  photos: readonly SchoolPhoto[];
  version: number;
  generatedAt: Date;
  maximumDocumentBytes?: number;
}): CommonCatalogBuild {
  if (!Number.isSafeInteger(input.version) || input.version < 1) {
    throw new Error("Common catalog version must be a positive safe integer.");
  }
  const maximumDocumentBytes = input.maximumDocumentBytes ?? MAX_COMMON_CATALOG_DOCUMENT_BYTES;
  if (!Number.isSafeInteger(maximumDocumentBytes) || maximumDocumentBytes < 1_024) {
    throw new Error("Common catalog document budget must be at least 1024 bytes.");
  }

  const schoolIds = new Set<string>();
  const fieldSchoolIds = new Set(input.fieldProfiles.map((profile) => profile.schoolId));
  const photoCounts = new Map<string, number>();
  for (const photo of input.photos) {
    if (photo.status === "active") {
      photoCounts.set(photo.schoolId, Math.min(3, (photoCounts.get(photo.schoolId) ?? 0) + 1));
    }
  }

  const items = input.schools
    .filter((school) => school.operationalStatus === "active" || school.operationalStatus === "inactiveCandidate")
    .map((school) => {
      if (schoolIds.has(school.schoolId)) throw new Error(`Duplicate schoolId: ${school.schoolId}`);
      schoolIds.add(school.schoolId);
      return schoolSearchItemSchema.parse({
        schoolId: school.schoolId,
        ...deriveCatalogSearchFields(school),
        schoolType: school.schoolType,
        district: school.district,
        addressSummary: school.address.road ?? school.address.jibun,
        operationalStatus: school.operationalStatus,
        photoCount: photoCounts.get(school.schoolId) ?? 0,
        fieldInfoAvailable: fieldSchoolIds.has(school.schoolId),
      });
    })
    .sort((left, right) =>
      left.normalizedName.localeCompare(right.normalizedName, "ko-KR") ||
      left.schoolId.localeCompare(right.schoolId),
    );

  if (items.length === 0) throw new Error("A common search catalog cannot be empty.");

  const documents = DISTRICTS.flatMap((district) => {
    const districtItems = items.filter((item) => item.district === district);
    return districtItems.length === 0
      ? []
      : chunkDistrictItems({
          version: input.version,
          district,
          items: districtItems,
          generatedAt: input.generatedAt,
          maximumDocumentBytes,
        });
  });
  if (documents.length > 50) throw new Error("Common catalog requires more than 50 documents.");

  return {
    version: input.version,
    documents,
    catalogIds: documents.map((document) => document.catalogId),
    itemCount: items.length,
  };
}
