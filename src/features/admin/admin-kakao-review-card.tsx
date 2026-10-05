"use client";

import { useState } from "react";

import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";

import type { KakaoReview } from "./admin-contract";
import { KAKAO_STATUS_LABELS } from "./admin-display";
import { useAdminInteraction } from "./admin-interaction";
import { adminErrorMessage, adminRepository } from "./admin-repository";

export function KakaoReviewCard({
  review,
  onReload,
}: {
  review: KakaoReview;
  onReload: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const interaction = useAdminInteraction();
  const [candidateId, setCandidateId] = useState(
    review.candidates[0]?.candidateId ?? "",
  );
  const [manual, setManual] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [roadAddress, setRoadAddress] = useState(review.neisRoadAddress ?? "");
  const [working, setWorking] = useState(false);
  const confirm = async () => {
    const release = interaction.begin();
    if (!release) return;
    setWorking(true);
    try {
      await adminRepository.confirmKakao({
        schoolId: review.schoolId,
        expectedSchoolBaseRevision: review.schoolBaseRevision,
        candidateId: manual ? null : candidateId,
        manualLocation: manual
          ? {
              latitude: Number(latitude),
              longitude: Number(longitude),
              name: review.neisName,
              roadAddress,
            }
          : null,
      });
      await onReload();
      showToast(`${review.neisName} 위치를 관리자 확정했습니다.`);
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      release();
      setWorking(false);
    }
  };
  return (
    <article className="kakao-review-card">
      <header>
        <div>
          <StatusBadge tone={review.status === "failed" ? "attention" : "info"}>
            {KAKAO_STATUS_LABELS[review.status] ?? review.status}
          </StatusBadge>
          <h2>{review.neisName}</h2>
          <p>{review.neisRoadAddress ?? "NEIS 주소 없음"}</p>
        </div>
        <small>r{review.schoolBaseRevision}</small>
      </header>
      <fieldset className="admin-controls" disabled={working} aria-label="위치 확인 정보">
      {review.candidates.length > 0 ? (
        <div className="kakao-candidates">
          {review.candidates.map((candidate, index) => (
            <label
              key={candidate.candidateId}
              data-selected={!manual && candidateId === candidate.candidateId}
            >
              <input
                type="radio"
                name={`candidate-${review.schoolId}`}
                checked={!manual && candidateId === candidate.candidateId}
                onChange={() => {
                  setManual(false);
                  setCandidateId(candidate.candidateId);
                }}
              />
              <span>
                <strong>
                  후보 {index + 1} · {candidate.name}
                </strong>
                <small>{candidate.roadAddress || candidate.addressName}</small>
                <em>신뢰 점수 {candidate.score}</em>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="kakao-no-candidate">
          저장된 후보가 없습니다. 직접 위치를 입력하거나 후보를 다시 조회하세요.
        </p>
      )}
      <button
        className="kakao-manual-toggle"
        type="button"
        data-active={manual}
        onClick={() => setManual((current) => !current)}
      >
        <Icon name="location" size={16} />
        직접 위치 입력
      </button>
      {manual ? (
        <div className="kakao-manual-fields">
          <label>
            <span>위도</span>
            <input
              inputMode="decimal"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              placeholder="36.35"
            />
          </label>
          <label>
            <span>경도</span>
            <input
              inputMode="decimal"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              placeholder="127.38"
            />
          </label>
          <label>
            <span>도로명 주소</span>
            <input
              value={roadAddress}
              onChange={(event) => setRoadAddress(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      </fieldset>
      <footer>
        <GlassButton
          variant="primary"
          compact
          disabled={
            working ||
            (manual ? !latitude || !longitude || !roadAddress : !candidateId)
          }
          onClick={() => void confirm()}
        >
          {working ? "확정 중…" : "이 위치로 확정"}
        </GlassButton>
      </footer>
    </article>
  );
}
