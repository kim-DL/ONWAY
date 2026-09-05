import type { KakaoAddressResult, KakaoPlaceCandidate } from "./kakao-local-client.js";
import type { StoredSchool } from "./school-sync-types.js";

export interface ScoredKakaoCandidate extends KakaoPlaceCandidate {
  score: number;
  nameExact: boolean;
  roadAddressExact: boolean;
  districtMatched: boolean;
  distanceMeters: number | null;
  regionValid: boolean;
}

export interface KakaoMatchDecision {
  status: "autoMatched" | "needsReview" | "failed";
  candidate: ScoredKakaoCandidate | null;
  candidates: ScoredKakaoCandidate[];
  reason: string;
}

const DISTRICT_LABELS: Record<StoredSchool["district"], string> = {
  dong: "동구",
  jung: "중구",
  seo: "서구",
  yuseong: "유성구",
  daedeok: "대덕구",
};

function normalize(value: string | null | undefined) {
  return value?.normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\p{Separator}\p{Punctuation}\p{Symbol}]+/gu, "") ?? "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Keep the NEIS source intact, but remove building details Kakao cannot geocode. */
export function schoolAddressQuery(address: string, schoolName: string) {
  const withoutParentheticalDetails = address.replace(/\s*\([^)]*\)\s*/gu, " ");
  const schoolNames = [schoolName.trim()];
  // NEIS sometimes uses the local name (가오초등학교) after the road number.
  if (/^대전.+학교$/u.test(schoolName)) schoolNames.push(schoolName.slice(2));
  return withoutParentheticalDetails
    .replace(new RegExp(`\\s+(?:${schoolNames.map(escapeRegExp).join("|")})\\s*$`, "u"), "")
    .replace(/\s+/gu, " ")
    .trim();
}

function comparableRoadAddress(address: string, schoolName: string) {
  return normalize(
    schoolAddressQuery(address, schoolName)
      .replace(/^대전광역시(?=\s)/u, "대전"),
  );
}

function distanceMeters(left: { latitude: number; longitude: number }, right: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isDaejeonCandidate(candidate: Pick<KakaoPlaceCandidate, "addressName" | "roadAddress" | "latitude" | "longitude">) {
  const address = `${candidate.roadAddress} ${candidate.addressName}`;
  return address.includes("대전")
    && candidate.latitude >= 36.0
    && candidate.latitude <= 36.7
    && candidate.longitude >= 127.1
    && candidate.longitude <= 127.7;
}

export function scoreKakaoCandidate(
  school: StoredSchool,
  candidate: KakaoPlaceCandidate,
  addressResult: KakaoAddressResult | null,
): ScoredKakaoCandidate {
  const candidateRoad = candidate.roadAddress || candidate.addressName;
  const schoolRoad = school.address.road ?? school.address.jibun ?? "";
  const nameExact = normalize(candidate.name) === normalize(school.name);
  const roadAddressExact = comparableRoadAddress(candidateRoad, school.name)
    === comparableRoadAddress(schoolRoad, school.name);
  const districtMatched = `${candidate.roadAddress} ${candidate.addressName}`.includes(DISTRICT_LABELS[school.district]);
  const distance = addressResult
    ? distanceMeters(addressResult, candidate)
    : null;
  const regionValid = isDaejeonCandidate(candidate);
  const score = (nameExact ? 40 : 0)
    + (roadAddressExact ? 40 : 0)
    + (districtMatched ? 10 : 0)
    + (distance !== null && distance <= 500 ? 10 : 0);
  return {
    ...candidate,
    score,
    nameExact,
    roadAddressExact,
    districtMatched,
    distanceMeters: distance === null ? null : Math.round(distance),
    regionValid,
  };
}

function isSameSchoolFacility(
  school: StoredSchool,
  candidate: ScoredKakaoCandidate,
  primarySchool: ScoredKakaoCandidate,
) {
  if (candidate.nameExact || !candidate.roadAddressExact) return false;
  // Kakao facility names sometimes omit the city prefix used by NEIS. Match a
  // bounded school-name alias, never an arbitrary substring or nearby business.
  const aliases = [school.name.trim()];
  if (/^대전.+학교$/u.test(school.name)) aliases.push(school.name.slice(2).trim());
  const prefix = new RegExp(`^(?:${aliases.map(escapeRegExp).join("|")})(?=\\s|\\()`, "u")
    .exec(candidate.name.trim());
  if (!prefix || distanceMeters(primarySchool, candidate) > 500) return false;
  const rawSuffix = candidate.name.trim().slice(prefix[0].length).trim();
  const suffix = normalize(rawSuffix);
  // A school's office or gate is a separate Kakao POI, not another school.
  // Unknown campus names stay in the ambiguity check for manual review.
  if (!suffix || /분교|캠퍼스|분원/u.test(suffix)) return false;
  const categories = candidate.categoryName.split(">").map((category) => category.trim());
  const separateSchoolName = /^\s/u.test(candidate.name.trim().slice(prefix[0].length));
  // Qualifiers belong to the charging equipment, not a second campus. Unknown
  // qualifiers (e.g. 이전/제2캠퍼스) intentionally remain ambiguous.
  const chargerSuffix = normalize(rawSuffix.replace(/^(?:\((?:대전|급속|완속)\)\s*)+/u, ""));
  return (categories.includes("학교부속시설") && separateSchoolName)
    || (categories.includes("입출구") && /^(?:정문|후문|동문|서문|남문|북문)$/u.test(suffix))
    || (categories.includes("전기차 충전소") && chargerSuffix === "전기차충전소")
    || (categories.includes("슈퍼마켓") && /^(?:교내)?매점$/u.test(suffix))
    || (categories.includes("체육관") && suffix === "체육관")
    || (categories.includes("유치원") && /^병설유치원(?:휴원|폐원)?$/u.test(suffix));
}

const SCHOOL_GRADE_LABELS: Partial<Record<StoredSchool["schoolType"], string>> = {
  elementary: "초등학교", middle: "중학교", high: "고등학교",
};

const HIGH_SCHOOL_SUBTYPES = new Set([
  "특목고등학교", "특수목적고등학교", "자율형사립고등학교", "자율형공립고등학교",
  "마이스터고등학교", "일반고등학교", "일반계고등학교", "특성화고등학교",
]);

function matchesSchoolCategory(school: StoredSchool, candidate: KakaoPlaceCandidate) {
  const grade = SCHOOL_GRADE_LABELS[school.schoolType];
  const categories = candidate.categoryName.split(">").map((category) => category.trim());
  const schoolIndex = categories.lastIndexOf("학교");
  // Name/address alone can also identify an office incorrectly named as the
  // school. Unknown school types remain review-only rather than guessing.
  if (!grade || schoolIndex < 0 || categories[schoolIndex + 1] !== grade) return false;
  const subtype = categories.slice(schoolIndex + 2);
  // Kakao puts foreign-language and autonomous private schools one level
  // below high school. Allow known school types, never facility descendants.
  return subtype.length === 0 || (grade === "고등학교" && subtype.length === 1
    && HIGH_SCHOOL_SUBTYPES.has(subtype[0]!));
}

function isSiblingSchoolFacility(
  school: StoredSchool,
  candidate: ScoredKakaoCandidate,
  primarySchool: ScoredKakaoCandidate,
) {
  const grade = SCHOOL_GRADE_LABELS[school.schoolType];
  if (!grade) return false;
  // Shared addresses do not establish identity. This exception requires an
  // exact primary school's name/address AND its catalog school grade.
  if (!primarySchool.nameExact || !primarySchool.roadAddressExact
    || !matchesSchoolCategory(school, primarySchool)
    || candidate.nameExact || !candidate.roadAddressExact
    || candidate.placeId === primarySchool.placeId || candidate.candidateId === primarySchool.candidateId
    || distanceMeters(primarySchool, candidate) > 500) return false;

  const name = school.name.trim();
  if (!name.endsWith(grade)) return false;
  const stem = name.slice(0, -grade.length);
  if (!stem) return false;
  const stems = [stem];
  if (stem.startsWith("대전") && stem.length > 2) stems.push(stem.slice(2));
  const prefix = new RegExp(`^(?:${stems.map(escapeRegExp).join("|")})(초등학교|중학교|고등학교)(?=\\s)`, "u")
    .exec(candidate.name.trim());
  if (!prefix || prefix[1] === grade) return false;

  const suffix = candidate.name.trim().slice(prefix[0].length).trim();
  const categories = candidate.categoryName.split(">").map((category) => category.trim());
  // A co-located middle/high school's office is not another candidate for the
  // exact primary school. Unknown buildings, campuses and other POIs still
  // require review; retain every candidate in the review evidence.
  return categories.at(-1) === "학교부속시설" && /^(?:행정실|교무실|강당)$/u.test(suffix);
}

export function decideKakaoSchoolMatch(input: {
  school: StoredSchool;
  addressResult: KakaoAddressResult | null;
  candidates: readonly KakaoPlaceCandidate[];
}): KakaoMatchDecision {
  const candidates = input.candidates
    .map((candidate) => scoreKakaoCandidate(input.school, candidate, input.addressResult))
    .sort((left, right) => right.score - left.score || (left.distanceMeters ?? Infinity) - (right.distanceMeters ?? Infinity));
  if (candidates.length === 0) {
    return { status: "failed", candidate: null, candidates: [], reason: "NO_CANDIDATE" };
  }
  const valid = candidates.filter((candidate) => candidate.regionValid);
  if (valid.length === 0) {
    return { status: "needsReview", candidate: null, candidates, reason: "OUT_OF_REGION" };
  }
  const first = valid[0]!;
  const exactSchoolFound = first.score >= 90 && first.nameExact && first.roadAddressExact
    && matchesSchoolCategory(input.school, first);
  const plausible = valid.filter((candidate) => candidate.score >= 60
    && !(exactSchoolFound && (isSameSchoolFacility(input.school, candidate, first)
      || isSiblingSchoolFacility(input.school, candidate, first))));
  if (exactSchoolFound && plausible.length === 1) {
    return { status: "autoMatched", candidate: first, candidates, reason: "HIGH_CONFIDENCE" };
  }
  return {
    status: "needsReview",
    candidate: first,
    candidates,
    reason: plausible.length > 1 ? "MULTIPLE_PLAUSIBLE_CANDIDATES" : "LOW_CONFIDENCE",
  };
}

export function locationDistanceMeters(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
) {
  return Math.round(distanceMeters(left, right));
}
