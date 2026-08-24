import { Timestamp, type DocumentData, type Firestore } from "firebase-admin/firestore";

import {
  catalogMetaSchema,
  SEARCH_CATALOG_SCHEMA_VERSION,
} from "../src/domain/catalog";
import {
  schoolFieldProfileSchema,
  schoolPhotoSchema,
  schoolSchema,
} from "../src/domain/school";
import { buildCommonSearchCatalog } from "../src/features/search/common-catalog-builder";

function decodeAdminValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate();
  if (Array.isArray(value)) return value.map(decodeAdminValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, decodeAdminValue(item)]),
    );
  }
  return value;
}

function encodeAdminValue(value: unknown): unknown {
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (Array.isArray(value)) return value.map(encodeAdminValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, encodeAdminValue(item)]),
    );
  }
  return value;
}

function decodeDocument(document: { id: string; data(): DocumentData }) {
  return { id: document.id, data: decodeAdminValue(document.data()) };
}

function nonNegativeVersion(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

export class CommonSearchCatalogPublisher {
  constructor(private readonly firestore: Firestore) {}

  async publish(generatedAt = new Date()) {
    const metaReference = this.firestore.doc("catalogMeta/current");
    return this.firestore.runTransaction(async (transaction) => {
      const [metaSnapshot, schoolSnapshot, fieldSnapshot, photoSnapshot] = await Promise.all([
        transaction.get(metaReference),
        transaction.get(this.firestore.collection("schools")),
        transaction.get(this.firestore.collection("schoolFieldProfiles")),
        transaction.get(this.firestore.collectionGroup("photos")),
      ]);

      const schools = schoolSnapshot.docs.map((document) => {
        const decoded = decodeDocument(document);
        const school = schoolSchema.parse(decoded.data);
        if (school.schoolId !== decoded.id) throw new Error(`School document ID mismatch: ${decoded.id}`);
        return school;
      });
      const fieldProfiles = fieldSnapshot.docs.map((document) => {
        const decoded = decodeDocument(document);
        const profile = schoolFieldProfileSchema.parse(decoded.data);
        if (profile.schoolId !== decoded.id) throw new Error(`Field profile document ID mismatch: ${decoded.id}`);
        return profile;
      });
      const photos = photoSnapshot.docs.map((document) => schoolPhotoSchema.parse(decodeDocument(document).data));
      const previousMeta = metaSnapshot.data() ?? {};
      const nextVersion = nonNegativeVersion(previousMeta.commonCatalogVersion) + 1;
      const build = buildCommonSearchCatalog({
        schools,
        fieldProfiles,
        photos,
        version: nextVersion,
        generatedAt,
      });
      const nextMeta = catalogMetaSchema.parse({
        commonCatalogVersion: nextVersion,
        fieldCatalogVersion: nonNegativeVersion(previousMeta.fieldCatalogVersion),
        salesCatalogVersion: nonNegativeVersion(previousMeta.salesCatalogVersion),
        assignmentCatalogVersion: nonNegativeVersion(previousMeta.assignmentCatalogVersion),
        commonCatalogIds: build.catalogIds,
        commonCatalogItemCount: build.itemCount,
        commonCatalogSchemaVersion: SEARCH_CATALOG_SCHEMA_VERSION,
        updatedAt: generatedAt,
      });

      for (const document of build.documents) {
        transaction.create(
          this.firestore.doc(`searchCatalogs/${document.catalogId}`),
          encodeAdminValue(document) as DocumentData,
        );
      }
      transaction.set(metaReference, encodeAdminValue(nextMeta) as DocumentData);
      return {
        version: nextVersion,
        catalogIds: build.catalogIds,
        itemCount: build.itemCount,
        documentCount: build.documents.length,
      };
    });
  }
}
