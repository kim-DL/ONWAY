"use client";

import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import { SoftCard } from "@/components/ui/soft-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { School, SchoolFieldProfile } from "@/domain/school";

const DISTRICT_LABELS: Record<School["district"], string> = {
  dong: "동구",
  jung: "중구",
  seo: "서구",
  yuseong: "유성구",
  daedeok: "대덕구",
};

const SCHOOL_TYPE_LABELS: Record<School["schoolType"], string> = {
  elementary: "초등학교",
  middle: "중학교",
  high: "고등학교",
  special: "특수학교",
  other: "기타",
};

function schoolStatus(school: School) {
  if (school.operationalStatus !== "active" || school.possibleRelocation) {
    return { label: "운영 정보 확인 필요", tone: "attention" as const };
  }
  if (school.location.matchStatus === "confirmed") {
    return { label: "위치 확인됨", tone: "success" as const };
  }
  return { label: "위치 확인 필요", tone: "info" as const };
}

function schoolCardFacts(profile: SchoolFieldProfile | null) {
  if (!profile) return [];
  const inspection = profile.inspection.startTime && profile.inspection.endTime
    ? `${profile.inspection.startTime}–${profile.inspection.endTime}`
    : profile.inspection.startTime ?? profile.inspection.endTime;
  const location = [profile.cafeteria.building, profile.cafeteria.floor].filter(Boolean).join(" · ");
  return [
    inspection ? { icon: "clock" as const, label: `검수 ${inspection}` } : null,
    profile.equipment.cartRequired !== "unknown"
      ? { icon: "clipboard" as const, label: `대차 ${profile.equipment.cartRequired === "required" ? "필요" : "불필요"}` }
      : null,
    profile.equipment.elevator !== "unknown"
      ? { icon: "building" as const, label: `엘리베이터 ${profile.equipment.elevator === "available" ? "있음" : "없음"}` }
      : null,
    location ? { icon: "location" as const, label: location } : null,
  ].filter((fact): fact is NonNullable<typeof fact> => fact !== null);
}

export function SchoolList({
  schools,
  profileBySchoolId,
  status,
  onRetry,
  onSelect,
  emptyMessage = "표시할 학교가 없습니다.",
}: {
  schools: School[];
  profileBySchoolId: Record<string, SchoolFieldProfile | null>;
  status: "loading" | "ready" | "error";
  onRetry: () => void;
  onSelect: (school: School) => void;
  emptyMessage?: string;
}) {
  if (status === "loading" && schools.length === 0) {
    return <div className="school-grid" aria-label="학교 목록 불러오는 중">{[0, 1, 2].map((item) => <SkeletonCard key={item} />)}</div>;
  }

  if (status === "error" && schools.length === 0) {
    return (
      <SoftCard className="shell-empty-state" role="alert">
        <span className="shell-empty-state__icon"><Icon name="building" /></span>
        <h3>학교 정보를 불러오지 못했어요.</h3>
        <p>연결을 확인한 뒤 다시 시도해주세요.</p>
        <GlassButton compact onClick={onRetry}>다시 불러오기</GlassButton>
      </SoftCard>
    );
  }

  if (schools.length === 0) {
    return (
      <SoftCard className="shell-empty-state">
        <span className="shell-empty-state__icon"><Icon name="building" /></span>
        <h3>표시할 학교가 아직 없어요.</h3>
        <p>{emptyMessage}</p>
      </SoftCard>
    );
  }

  return (
    <div className="school-grid">
      {schools.map((school) => {
        const schoolState = schoolStatus(school);
        const fieldFacts = schoolCardFacts(profileBySchoolId[school.schoolId] ?? null);
        return (
          <button
            className="school-card"
            data-tone={schoolState.tone}
            key={school.schoolId}
            type="button"
            onClick={() => onSelect(school)}
          >
            <span className="school-card__rail" aria-hidden="true" />
            <span className="school-card__topline">
              <span className="school-card__icon"><Icon name="building" size={19} /></span>
              <StatusBadge tone={schoolState.tone}>{schoolState.label}</StatusBadge>
            </span>
            <strong>{school.name}</strong>
            <span className="school-card__address"><Icon name="location" size={15} />{school.address.road ?? "주소 확인 필요"}</span>
            {fieldFacts.length > 0 ? <span className="school-card__field-assets" aria-label="공동 현장정보">{fieldFacts.map((fact) => <span key={fact.label}><Icon name={fact.icon} size={15} />{fact.label}</span>)}</span> : null}
            <span className="school-card__footer">
              <span>{DISTRICT_LABELS[school.district]} · {SCHOOL_TYPE_LABELS[school.schoolType]}</span>
              <Icon name="chevron-right" size={18} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
