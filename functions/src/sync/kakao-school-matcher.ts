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

function isSameSchoolFacility(school: StoredSchool, candidate: ScoredKakaoCandidate) {
  if (candidate.nameExact || !candidate.roadAddressExact) return false;
  const schoolName = normalize(school.name);
  const candidateName = normalize(candidate.name);
  if (!candidateName.startsWith(schoolName)) return false;
  const suffix = candidateName.slice(schoolName.length);
  // A school's office or gate is a separate Kakao POI, not another school.
  // Unknown campus names stay in the ambiguity check for manual review.
  if (!suffix || /분교|캠퍼스|분원/u.test(suffix)) return false;
  const categories = candidate.categoryName.split(">").map((category) => category.trim());
  const separateSchoolName = new RegExp(`^${escapeRegExp(school.name.trim())}\\s+`, "u")
    .test(candidate.name.trim());
  return (categories.includes("학교부속시설") && separateSchoolName)
    || (categories.includes("입출구") && /^(?:정문|후문|동문|서문|남문|북문)$/u.test(suffix))
    || (categories.includes("전기차 충전소") && suffix === "전기차충전소")
    || (categories.includes("유치원") && /^병설유치원(?:휴원|폐원)?$/u.test(suffix));
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
  const exactSchoolFound = first.score >= 90 && first.nameExact && first.roadAddressExact;
  const plausible = valid.filter((candidate) => candidate.score >= 60
    && !(exactSchoolFound && isSameSchoolFacility(input.school, candidate)));
  if (first.score >= 90 && plausible.length === 1) {
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
