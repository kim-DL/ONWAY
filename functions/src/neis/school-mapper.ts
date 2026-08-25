import type { NeisSchoolRow } from "./contract.js";

export type ImportedSchoolType = "elementary" | "middle" | "high";
export type ImportedDistrict = "dong" | "jung" | "seo" | "yuseong" | "daedeok";

export interface ImportedSchool {
  schoolId: string;
  source: {
    provider: "NEIS";
    schoolCode: string;
    educationOfficeCode: string;
    syncedAt: Date;
  };
  name: string;
  shortName: null;
  normalizedName: string;
  initials: string;
  aliases: string[];
  schoolType: ImportedSchoolType;
  district: ImportedDistrict;
  address: { road: string; jibun: null; postalCode: string | null };
  phone: string | null;
  homepage: string | null;
  location: {
    latitude: null;
    longitude: null;
    kakaoPlaceId: null;
    matchStatus: "unmatched";
    matchMethod: null;
    matchConfidence: null;
    matchedName: null;
    matchedRoadAddress: null;
    matchedAt: null;
    confirmedBy: null;
    confirmedAt: null;
  };
  operationalStatus: "active";
  possibleRelocation: false;
  schoolBaseRevision: 1;
  createdAt: Date;
  updatedAt: Date;
}

const SCHOOL_TYPE_BY_NEIS_LABEL: Readonly<Record<string, ImportedSchoolType>> = {
  초등학교: "elementary",
  중학교: "middle",
  고등학교: "high",
};

const DISTRICT_PATTERNS: ReadonlyArray<readonly [ImportedDistrict, RegExp]> = [
  ["yuseong", /대전광역시\s*유성구/],
  ["daedeok", /대전광역시\s*대덕구/],
  ["dong", /대전광역시\s*동구/],
  ["jung", /대전광역시\s*중구/],
  ["seo", /대전광역시\s*서구/],
];

export class NeisSchoolMappingError extends Error {
  constructor(readonly schoolCode: string, message: string) {
    super(message);
    this.name = "NeisSchoolMappingError";
  }
}

function normalizeWhitespace(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function normalizeSchoolName(value: string) {
  return normalizeWhitespace(value).replace(/\s/g, "").toLocaleLowerCase("ko-KR");
}

export function mapNeisSchoolType(label: string): ImportedSchoolType | null {
  return SCHOOL_TYPE_BY_NEIS_LABEL[normalizeWhitespace(label)] ?? null;
}

function combineRoadAddress(base: string, detail: string) {
  const normalizedBase = normalizeWhitespace(base);
  const normalizedDetail = normalizeWhitespace(detail).replace(/^,\s*/u, "");
  if (!normalizedBase) return "";
  if (!normalizedDetail || normalizedBase.includes(normalizedDetail)) return normalizedBase;
  return `${normalizedBase} ${normalizedDetail}`;
}

function canonicalizeDaejeonRoadAddress(address: string, locationName: string) {
  if (normalizeWhitespace(locationName) !== "대전광역시") return address;
  return address.replace(
    /^대전(?=\s+(?:동구|중구|서구|유성구|대덕구)(?:\s|$))/u,
    "대전광역시",
  );
}

function districtFromAddress(address: string): ImportedDistrict | null {
  return DISTRICT_PATTERNS.find(([, pattern]) => pattern.test(address))?.[0] ?? null;
}

function normalizeHomepage(value: string, schoolCode: string) {
  const raw = value.trim();
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    return parsed.toString();
  } catch {
    throw new NeisSchoolMappingError(schoolCode, "School homepage is invalid.");
  }
}

export function mapNeisSchool(
  row: NeisSchoolRow,
  options: { targetEducationOfficeCode: string; syncedAt: Date },
): ImportedSchool {
  const schoolCode = row.SD_SCHUL_CODE.trim().toUpperCase();
  if (!/^[A-Z0-9]{5,30}$/.test(schoolCode)) {
    throw new NeisSchoolMappingError(schoolCode || "unknown", "School code format is invalid.");
  }
  if (row.ATPT_OFCDC_SC_CODE !== options.targetEducationOfficeCode) {
    throw new NeisSchoolMappingError(schoolCode, "School belongs to another education office.");
  }

  const schoolType = mapNeisSchoolType(row.SCHUL_KND_SC_NM);
  if (!schoolType) {
    throw new NeisSchoolMappingError(schoolCode, "School type is outside the MVP target.");
  }

  const name = normalizeWhitespace(row.SCHUL_NM);
  if (!name) throw new NeisSchoolMappingError(schoolCode, "School name is missing.");
  const road = canonicalizeDaejeonRoadAddress(
    combineRoadAddress(row.ORG_RDNMA, row.ORG_RDNDA),
    row.LCTN_SC_NM,
  );
  const district = districtFromAddress(road);
  if (!road.startsWith("대전광역시") || !district) {
    throw new NeisSchoolMappingError(schoolCode, "School address is outside the Daejeon target.");
  }

  return {
    schoolId: `SCH-NEIS-${schoolCode}`,
    source: {
      provider: "NEIS",
      schoolCode,
      educationOfficeCode: row.ATPT_OFCDC_SC_CODE,
      syncedAt: options.syncedAt,
    },
    name,
    shortName: null,
    normalizedName: normalizeSchoolName(name),
    initials: "",
    aliases: [],
    schoolType,
    district,
    address: {
      road,
      jibun: null,
      postalCode: row.ORG_RDNZC || null,
    },
    phone: row.ORG_TELNO || null,
    homepage: normalizeHomepage(row.HMPG_ADRES, schoolCode),
    location: {
      latitude: null,
      longitude: null,
      kakaoPlaceId: null,
      matchStatus: "unmatched",
      matchMethod: null,
      matchConfidence: null,
      matchedName: null,
      matchedRoadAddress: null,
      matchedAt: null,
      confirmedBy: null,
      confirmedAt: null,
    },
    operationalStatus: "active",
    possibleRelocation: false,
    schoolBaseRevision: 1,
    createdAt: options.syncedAt,
    updatedAt: options.syncedAt,
  };
}
