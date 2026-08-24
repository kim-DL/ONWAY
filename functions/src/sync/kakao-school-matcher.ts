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
  const roadAddressExact = normalize(candidateRoad) === normalize(schoolRoad);
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
  const plausible = valid.filter((candidate) => candidate.score >= 60);
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
