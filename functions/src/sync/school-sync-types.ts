import type { ImportedDistrict, ImportedSchool, ImportedSchoolType } from "../neis/school-mapper.js";

export type LocationMatchStatus =
  | "unmatched"
  | "autoMatched"
  | "needsReview"
  | "confirmed"
  | "failed";

export type LocationMatchMethod = "address" | "keyword" | "address+keyword" | "manual";

export interface StoredSchoolLocation {
  latitude: number | null;
  longitude: number | null;
  kakaoPlaceId: string | null;
  matchStatus: LocationMatchStatus;
  matchMethod: LocationMatchMethod | null;
  matchConfidence: number | null;
  matchedName: string | null;
  matchedRoadAddress: string | null;
  matchedAt: unknown | null;
  confirmedBy: string | null;
  confirmedAt: unknown | null;
}

export interface StoredSchool {
  schoolId: string;
  source: {
    provider: "NEIS";
    schoolCode: string;
    educationOfficeCode: string;
    syncedAt: unknown | null;
  };
  name: string;
  shortName: string | null;
  normalizedName: string;
  initials: string;
  aliases: string[];
  schoolType: ImportedSchoolType | "special" | "other";
  district: ImportedDistrict;
  address: { road: string | null; jibun: string | null; postalCode: string | null };
  phone: string | null;
  homepage: string | null;
  location: StoredSchoolLocation;
  operationalStatus: "active" | "inactiveCandidate" | "inactive" | "closed" | "merged";
  possibleRelocation: boolean;
  schoolBaseRevision: number;
  createdAt: unknown;
  updatedAt: unknown;
}

export type SyncSourceSchool = ImportedSchool;

export const TARGET_SYNC_SCHOOL_TYPES = new Set<StoredSchool["schoolType"]>([
  "elementary",
  "middle",
  "high",
]);

export function isTargetSyncSchool(school: StoredSchool, educationOfficeCode: string) {
  return school.source.provider === "NEIS"
    && school.source.educationOfficeCode === educationOfficeCode
    && TARGET_SYNC_SCHOOL_TYPES.has(school.schoolType);
}
