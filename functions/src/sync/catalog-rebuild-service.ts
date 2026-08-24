import { Timestamp, type DocumentData, type Firestore } from "firebase-admin/firestore";

import type { StoredSchool } from "./school-sync-types.js";

const DISTRICTS = ["dong", "jung", "seo", "yuseong", "daedeok"] as const;
const KOREAN_INITIALS = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;
const MAX_DOCUMENT_BYTES = 300 * 1024;

function normalizeDisplay(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function normalizeSearch(value: string) {
  return normalizeDisplay(value)
    .toLocaleLowerCase("ko-KR")
    .replace(/[\p{Separator}\p{Punctuation}\p{Symbol}]+/gu, "");
}

function initials(value: string) {
  return Array.from(normalizeSearch(value), (character) => {
    const point = character.codePointAt(0);
    if (point === undefined || point < 0xac00 || point > 0xd7a3) return character;
    return KOREAN_INITIALS[Math.floor((point - 0xac00) / 588)] ?? character;
  }).join("");
}

function generatedShortName(school: StoredSchool) {
  const suffix = school.schoolType === "elementary"
    ? (["초등학교", "초"] as const)
    : school.schoolType === "middle"
      ? (["중학교", "중"] as const)
      : school.schoolType === "high"
        ? (["고등학교", "고"] as const)
        : null;
  if (!suffix || !school.name.endsWith(suffix[0])) return null;
  const base = school.name.slice(0, -suffix[0].length).replace(/^대전/u, "");
  return base ? `${base}${suffix[1]}` : null;
}

function catalogSearchFields(school: StoredSchool) {
  const name = normalizeDisplay(school.name);
  const normalizedName = normalizeSearch(name);
  const shortName = school.shortName ? normalizeDisplay(school.shortName) : generatedShortName(school);
  const candidates = [
    ...school.aliases,
    generatedShortName(school),
    name.startsWith("대전") ? name.slice(2) : null,
  ];
  const aliases: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate) continue;
    const display = normalizeDisplay(candidate);
    const normalized = normalizeSearch(display);
    if (!normalized || normalized === normalizedName || seen.has(normalized)) continue;
    seen.add(normalized);
    aliases.push(display);
  }
  return { name, shortName, normalizedName, initials: initials(name), aliases: aliases.slice(0, 50) };
}

function bytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function id(version: number, district: string, chunk: number) {
  return `common-v${String(version).padStart(6, "0")}-${district}-${String(chunk).padStart(2, "0")}`;
}

function nonNegative(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function decodeSchool(document: DocumentData): StoredSchool {
  return document as StoredSchool;
}

export class CatalogRebuildService {
  constructor(private readonly db: Firestore) {}

  async publish(generatedAt: Date) {
    const [schoolsSnapshot, profilesSnapshot, photosSnapshot, metaSnapshot] = await Promise.all([
      this.db.collection("schools").get(),
      this.db.collection("schoolFieldProfiles").get(),
      this.db.collectionGroup("photos").get(),
      this.db.doc("catalogMeta/current").get(),
    ]);
    const profileIds = new Set(profilesSnapshot.docs.map((document) => document.id));
    const photoCounts = new Map<string, number>();
    for (const document of photosSnapshot.docs) {
      const photo = document.data();
      if (photo.status !== "active" || typeof photo.schoolId !== "string") continue;
      photoCounts.set(photo.schoolId, Math.min(3, (photoCounts.get(photo.schoolId) ?? 0) + 1));
    }
    const schools = schoolsSnapshot.docs
      .map((document) => decodeSchool(document.data()))
      .filter((school) => school.operationalStatus === "active" || school.operationalStatus === "inactiveCandidate")
      .sort((left, right) => left.name.localeCompare(right.name, "ko-KR") || left.schoolId.localeCompare(right.schoolId));
    if (schools.length === 0) throw new Error("Cannot publish an empty common search catalog.");

    const previousMeta = metaSnapshot.data() ?? {};
    const version = nonNegative(previousMeta.commonCatalogVersion) + 1;
    const generatedAtTimestamp = Timestamp.fromDate(generatedAt);
    const documents: Array<{ catalogId: string; data: DocumentData }> = [];

    for (const district of DISTRICTS) {
      const districtItems = schools
        .filter((school) => school.district === district)
        .map((school) => ({
          schoolId: school.schoolId,
          ...catalogSearchFields(school),
          schoolType: school.schoolType,
          district: school.district,
          addressSummary: school.address.road ?? school.address.jibun,
          operationalStatus: school.operationalStatus,
          photoCount: photoCounts.get(school.schoolId) ?? 0,
          fieldInfoAvailable: profileIds.has(school.schoolId),
        }));
      if (districtItems.length === 0) continue;

      const chunks: typeof districtItems[] = [];
      for (const item of districtItems) {
        const current = chunks.at(-1) ?? [];
        const candidate = [...current, item];
        const probe = { items: candidate, generatedAt: generatedAt.toISOString() };
        if (current.length < 500 && bytes(probe) <= MAX_DOCUMENT_BYTES) {
          if (chunks.length === 0) chunks.push(candidate);
          else chunks[chunks.length - 1] = candidate;
        } else {
          if (current.length === 0) throw new Error(`School ${item.schoolId} exceeds the catalog budget.`);
          chunks.push([item]);
        }
      }
      chunks.forEach((items, chunkIndex) => {
        const catalogId = id(version, district, chunkIndex);
        const data = {
          catalogId,
          kind: "common",
          schemaVersion: 1,
          version,
          district,
          chunkIndex,
          chunkCount: chunks.length,
          itemCount: items.length,
          items,
          generatedAt: generatedAtTimestamp,
        };
        if (bytes({ ...data, generatedAt: generatedAt.toISOString() }) > MAX_DOCUMENT_BYTES) {
          throw new Error(`Catalog ${catalogId} exceeds the catalog budget.`);
        }
        documents.push({
          catalogId,
          data,
        });
      });
    }
    if (documents.length > 50) throw new Error("Common catalog requires more than 50 documents.");

    const batch = this.db.batch();
    for (const document of documents) {
      batch.create(this.db.doc(`searchCatalogs/${document.catalogId}`), document.data);
    }
    batch.set(this.db.doc("catalogMeta/current"), {
      commonCatalogVersion: version,
      fieldCatalogVersion: nonNegative(previousMeta.fieldCatalogVersion),
      salesCatalogVersion: nonNegative(previousMeta.salesCatalogVersion),
      assignmentCatalogVersion: nonNegative(previousMeta.assignmentCatalogVersion),
      commonCatalogIds: documents.map((document) => document.catalogId),
      commonCatalogItemCount: schools.length,
      commonCatalogSchemaVersion: 1,
      updatedAt: generatedAtTimestamp,
    });
    await batch.commit();
    return { version, documentCount: documents.length, itemCount: schools.length };
  }
}
