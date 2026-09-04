import { randomUUID } from "node:crypto";

import { Timestamp, type DocumentData, type Firestore } from "firebase-admin/firestore";

import type { KakaoLocalClient } from "./kakao-local-client.js";
import {
  decideKakaoSchoolMatch,
  isDaejeonCandidate,
  locationDistanceMeters,
  schoolAddressQuery,
  type KakaoMatchDecision,
  type ScoredKakaoCandidate,
} from "./kakao-school-matcher.js";
import type { ConfirmKakaoMatchInput, MatchSchoolWithKakaoInput } from "./sync-contract.js";
import type { StoredSchool, StoredSchoolLocation } from "./school-sync-types.js";
import type { SyncActor } from "./neis-sync-service.js";

interface KakaoMatchReview {
  schoolId: string;
  schoolBaseRevision: number;
  neisName: string;
  neisRoadAddress: string | null;
  status: "autoMatched" | "needsReview" | "failed" | "confirmed";
  reason: string;
  candidates: ScoredKakaoCandidate[];
  lastRequestId: string;
  generatedAt: Timestamp;
  expiresAt: Timestamp;
  confirmedBy: string | null;
  confirmedAt: Timestamp | null;
  acceptedLocation?: { latitude: number; longitude: number } | null;
}

function asStoredSchool(document: DocumentData, id: string): StoredSchool {
  if (
    document.schoolId !== id
    || typeof document.name !== "string"
    || typeof document.schoolBaseRevision !== "number"
    || !document.location
    || !document.address
  ) {
    throw new Error(`Stored school contract is invalid: ${id}`);
  }
  return document as StoredSchool;
}

function auditDocument(input: {
  logId?: string;
  eventType: string;
  actor: SyncActor;
  schoolId: string;
  changedFields: string[];
  requestId: string;
  createdAt: Timestamp;
}) {
  return {
    logId: input.logId ?? randomUUID(),
    eventType: input.eventType,
    actorUid: input.actor.uid,
    actorEmployeeId: input.actor.employeeId,
    targetType: "school",
    targetId: input.schoolId,
    schoolId: input.schoolId,
    cycleId: null,
    changedFields: input.changedFields,
    requestId: input.requestId,
    appVersion: null,
    createdAt: input.createdAt,
  };
}

function candidateLocation(
  candidate: ScoredKakaoCandidate,
  status: "autoMatched" | "needsReview",
  matchedAt: Timestamp,
): StoredSchoolLocation {
  return {
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    kakaoPlaceId: candidate.placeId,
    matchStatus: status,
    matchMethod: "address+keyword",
    matchConfidence: candidate.score / 100,
    matchedName: candidate.name,
    matchedRoadAddress: candidate.roadAddress || candidate.addressName,
    matchedAt,
    confirmedBy: null,
    confirmedAt: null,
  };
}

function reviewResult(review: KakaoMatchReview, replayed: boolean) {
  return {
    schoolId: review.schoolId,
    schoolBaseRevision: review.schoolBaseRevision,
    status: review.status,
    reason: review.reason,
    candidates: review.candidates,
    acceptedLocation: review.acceptedLocation ?? null,
    replayed,
  };
}

export class KakaoSchoolNotFoundError extends Error {}
export class KakaoMatchConflictError extends Error {}
export class KakaoCandidateNotFoundError extends Error {}
export class KakaoCandidateRegionError extends Error {}

export class KakaoMatchService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: {
    db: Firestore;
    client: Pick<KakaoLocalClient, "searchAddress" | "searchKeyword">;
    now?: () => Date;
  }) {
    this.now = dependencies.now ?? (() => new Date());
  }

  private async persistDecision(input: {
    requestId: string;
    school: StoredSchool;
    decision: KakaoMatchDecision;
    actor: SyncActor;
  }) {
    const matchedAt = Timestamp.fromDate(this.now());
    const reviewRef = this.dependencies.db.doc(`kakaoMatchReviews/${input.school.schoolId}`);
    const schoolRef = this.dependencies.db.doc(`schools/${input.school.schoolId}`);

    return this.dependencies.db.runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(schoolRef);
      if (!currentSnapshot.exists) throw new KakaoSchoolNotFoundError();
      const current = asStoredSchool(currentSnapshot.data()!, currentSnapshot.id);
      if (current.schoolBaseRevision !== input.school.schoolBaseRevision) {
        throw new KakaoMatchConflictError("School changed while Kakao matching was in progress.");
      }

      let status: KakaoMatchReview["status"] = input.decision.status;
      let reason = input.decision.reason;
      let nextLocation = current.location;
      let possibleRelocation = current.possibleRelocation;
      const candidate = input.decision.candidate;
      const administratorConfirmed = current.location.matchStatus === "confirmed";

      if (input.decision.status === "autoMatched" && candidate) {
        if (administratorConfirmed) {
          const samePlace = current.location.kakaoPlaceId === candidate.placeId;
          const close = current.location.latitude !== null && current.location.longitude !== null
            ? locationDistanceMeters(
              { latitude: current.location.latitude, longitude: current.location.longitude },
              candidate,
            ) <= 100
            : false;
          if (samePlace || close) {
            status = "confirmed";
            reason = samePlace ? "CONFIRMED_PLACE_UNCHANGED" : "CONFIRMED_LOCATION_NEARBY";
            possibleRelocation = false;
          } else {
            status = "needsReview";
            reason = "CONFIRMED_LOCATION_CHANGED";
            possibleRelocation = true;
          }
        } else {
          nextLocation = candidateLocation(candidate, "autoMatched", matchedAt);
          possibleRelocation = false;
        }
      } else if (input.decision.status === "needsReview") {
        if (candidate && !administratorConfirmed) {
          nextLocation = candidateLocation(candidate, "needsReview", matchedAt);
        }
      } else if (input.decision.status === "failed" && !administratorConfirmed) {
        nextLocation = {
          ...current.location,
          matchStatus: "failed",
          matchMethod: "keyword",
          matchedAt,
          confirmedBy: null,
          confirmedAt: null,
        };
      }

      const locationChanged = JSON.stringify(nextLocation) !== JSON.stringify(current.location)
        || possibleRelocation !== current.possibleRelocation;
      const schoolBaseRevision = current.schoolBaseRevision + (locationChanged ? 1 : 0);
      if (locationChanged) {
        transaction.update(schoolRef, {
          location: nextLocation,
          possibleRelocation,
          schoolBaseRevision,
          updatedAt: matchedAt,
        });
      }
      const review: KakaoMatchReview = {
        schoolId: current.schoolId,
        schoolBaseRevision,
        neisName: current.name,
        neisRoadAddress: current.address.road,
        status,
        reason,
        candidates: input.decision.candidates,
        lastRequestId: input.requestId,
        generatedAt: matchedAt,
        expiresAt: Timestamp.fromMillis(matchedAt.toMillis() + 7 * 24 * 60 * 60 * 1_000),
        confirmedBy: status === "confirmed" ? current.location.confirmedBy : null,
        confirmedAt: status === "confirmed" ? current.location.confirmedAt as Timestamp | null : null,
        acceptedLocation: (status === "autoMatched" || status === "confirmed")
          && nextLocation.latitude !== null && nextLocation.longitude !== null
          ? { latitude: nextLocation.latitude, longitude: nextLocation.longitude }
          : null,
      };
      transaction.set(reviewRef, review);
      const eventType = status === "autoMatched"
        ? "KAKAO_AUTO_MATCHED"
        : status === "failed"
          ? "KAKAO_MATCH_FAILED"
          : status === "confirmed"
            ? "KAKAO_MATCH_UNCHANGED"
            : "KAKAO_MATCH_REVIEW_REQUIRED";
      const audit = auditDocument({
        eventType,
        actor: input.actor,
        schoolId: current.schoolId,
        changedFields: locationChanged ? ["location", "possibleRelocation"] : ["kakaoMatchReview"],
        requestId: input.requestId,
        createdAt: matchedAt,
      });
      transaction.create(this.dependencies.db.doc(`auditLogs/${audit.logId}`), audit);
      return reviewResult(review, false);
    });
  }

  async match(input: MatchSchoolWithKakaoInput, actor: SyncActor) {
    const [schoolSnapshot, existingReviewSnapshot] = await Promise.all([
      this.dependencies.db.doc(`schools/${input.schoolId}`).get(),
      this.dependencies.db.doc(`kakaoMatchReviews/${input.schoolId}`).get(),
    ]);
    if (!schoolSnapshot.exists) throw new KakaoSchoolNotFoundError();
    if (existingReviewSnapshot.exists) {
      const existingReview = existingReviewSnapshot.data() as KakaoMatchReview;
      if (existingReview.lastRequestId === input.requestId) return reviewResult(existingReview, true);
    }
    const school = asStoredSchool(schoolSnapshot.data()!, schoolSnapshot.id);
    const officialAddress = school.address.road ?? school.address.jibun;
    if (!officialAddress) {
      return this.persistDecision({
        requestId: input.requestId,
        school,
        decision: { status: "failed", candidate: null, candidates: [], reason: "SCHOOL_ADDRESS_MISSING" },
        actor,
      });
    }

    try {
      const addressResult = await this.dependencies.client.searchAddress(
        schoolAddressQuery(officialAddress, school.name),
      );
      const candidates = await this.dependencies.client.searchKeyword({
        query: `${school.name} 대전`,
        origin: addressResult,
      });
      return this.persistDecision({
        requestId: input.requestId,
        school,
        decision: decideKakaoSchoolMatch({ school, addressResult, candidates }),
        actor,
      });
    } catch {
      return this.persistDecision({
        requestId: input.requestId,
        school,
        decision: { status: "failed", candidate: null, candidates: [], reason: "KAKAO_API_FAILURE" },
        actor,
      });
    }
  }

  async confirm(input: ConfirmKakaoMatchInput, actor: SyncActor) {
    const schoolRef = this.dependencies.db.doc(`schools/${input.schoolId}`);
    const reviewRef = this.dependencies.db.doc(`kakaoMatchReviews/${input.schoolId}`);
    const auditRef = this.dependencies.db.doc(`auditLogs/kakao-confirmed-${input.requestId}`);
    const confirmedAt = Timestamp.fromDate(this.now());

    return this.dependencies.db.runTransaction(async (transaction) => {
      const [schoolSnapshot, reviewSnapshot, existingAudit] = await Promise.all([
        transaction.get(schoolRef),
        transaction.get(reviewRef),
        transaction.get(auditRef),
      ]);
      if (!schoolSnapshot.exists) throw new KakaoSchoolNotFoundError();
      const school = asStoredSchool(schoolSnapshot.data()!, schoolSnapshot.id);
      if (existingAudit.exists) {
        return { schoolId: school.schoolId, schoolBaseRevision: school.schoolBaseRevision, status: "confirmed" as const, replayed: true };
      }
      if (school.schoolBaseRevision !== input.expectedSchoolBaseRevision) {
        throw new KakaoMatchConflictError("School changed after the candidate review was opened.");
      }

      const review = reviewSnapshot.exists ? reviewSnapshot.data() as KakaoMatchReview : null;
      let location: StoredSchoolLocation;
      if (input.candidateId !== null) {
        const candidate = review?.candidates.find((item) => item.candidateId === input.candidateId);
        if (!candidate) throw new KakaoCandidateNotFoundError();
        if (!candidate.regionValid || !isDaejeonCandidate(candidate)) throw new KakaoCandidateRegionError();
        location = {
          ...candidateLocation(candidate, "autoMatched", confirmedAt),
          matchStatus: "confirmed",
          confirmedBy: actor.employeeId,
          confirmedAt,
        };
      } else {
        const manual = input.manualLocation;
        if (!manual) throw new KakaoCandidateNotFoundError();
        if (!manual.roadAddress.includes("대전") || !isDaejeonCandidate({
          addressName: manual.roadAddress,
          roadAddress: manual.roadAddress,
          latitude: manual.latitude,
          longitude: manual.longitude,
        })) {
          throw new KakaoCandidateRegionError();
        }
        location = {
          latitude: manual.latitude,
          longitude: manual.longitude,
          kakaoPlaceId: null,
          matchStatus: "confirmed",
          matchMethod: "manual",
          matchConfidence: 1,
          matchedName: manual.name,
          matchedRoadAddress: manual.roadAddress,
          matchedAt: confirmedAt,
          confirmedBy: actor.employeeId,
          confirmedAt,
        };
      }
      const schoolBaseRevision = school.schoolBaseRevision + 1;
      transaction.update(schoolRef, {
        location,
        possibleRelocation: false,
        schoolBaseRevision,
        updatedAt: confirmedAt,
      });
      transaction.set(reviewRef, {
        ...(review ?? {
          schoolId: school.schoolId,
          neisName: school.name,
          neisRoadAddress: school.address.road,
          candidates: [],
          lastRequestId: input.requestId,
          generatedAt: confirmedAt,
          expiresAt: Timestamp.fromMillis(confirmedAt.toMillis() + 7 * 24 * 60 * 60 * 1_000),
        }),
        schoolBaseRevision,
        status: "confirmed",
        reason: input.candidateId ? "ADMIN_CANDIDATE_CONFIRMED" : "ADMIN_MANUAL_CONFIRMED",
        confirmedBy: actor.employeeId,
        confirmedAt,
        acceptedLocation: { latitude: location.latitude, longitude: location.longitude },
      });
      const audit = auditDocument({
        logId: auditRef.id,
        eventType: school.location.matchStatus === "confirmed" ? "KAKAO_MATCH_CHANGED" : "KAKAO_MATCH_CONFIRMED",
        actor,
        schoolId: school.schoolId,
        changedFields: ["location", "possibleRelocation", "schoolBaseRevision"],
        requestId: input.requestId,
        createdAt: confirmedAt,
      });
      transaction.create(auditRef, audit);
      return { schoolId: school.schoolId, schoolBaseRevision, status: "confirmed" as const, replayed: false };
    });
  }
}
