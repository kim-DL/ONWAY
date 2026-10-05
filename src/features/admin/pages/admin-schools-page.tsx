"use client";

import { useMemo, useState } from "react";

import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { searchInputProps } from "@/components/ui/search-input-props";
import { StatusBadge } from "@/components/ui/status-badge";

import type { AdminWorkspaceData } from "../admin-contract";
import {
  DISTRICT_LABELS,
  KAKAO_STATUS_LABELS,
  SCHOOL_TYPE_LABELS,
  schoolNeedsReview,
} from "../admin-display";
import { EmptyState, PageHeading } from "../admin-page-parts";

export function SchoolsPage({
  data,
  onOpenSync,
}: {
  data: AdminWorkspaceData;
  onOpenSync: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "review" | "confirmed">("all");
  const schools = useMemo(
    () =>
      data.schools.filter((school) => {
        const matchesQuery = `${school.name} ${school.roadAddress ?? ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase());
        const needsReview = schoolNeedsReview(school);
        return (
          matchesQuery &&
          (filter === "all" ||
            (filter === "review"
              ? needsReview
              : !needsReview))
        );
      }),
    [data.schools, filter, query],
  );

  return (
    <section className="admin-page" aria-labelledby="schools-title">
      <PageHeading
        title="학교 관리"
        description="NEIS 기준정보와 Kakao 위치 확인 상태를 함께 봅니다."
        action={
          <GlassButton variant="primary" compact onClick={onOpenSync}>
            <Icon name="refresh" size={17} /> 동기화 센터
          </GlassButton>
        }
      />
      <div className="admin-toolbar">
        <label className="admin-search">
          <Icon name="search" size={17} />
          <input
            {...searchInputProps}
            name="admin-school-query"
            aria-label="학교 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="학교명 또는 주소 검색"
          />
        </label>
        <div className="admin-filter-tabs" role="group" aria-label="학교 상태">
          <button
            type="button"
            data-active={filter === "all"}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            전체 {data.schools.length}
          </button>
          <button
            type="button"
            data-active={filter === "review"}
            aria-pressed={filter === "review"}
            onClick={() => setFilter("review")}
          >
            검토 필요 {data.schools.filter(schoolNeedsReview).length}
          </button>
          <button
            type="button"
            data-active={filter === "confirmed"}
            aria-pressed={filter === "confirmed"}
            onClick={() => setFilter("confirmed")}
          >
            확인 완료
          </button>
        </div>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table admin-school-table">
          <thead>
            <tr>
              <th>학교</th>
              <th>행정구·학교급</th>
              <th>NEIS 주소</th>
              <th>위치 상태</th>
              <th>정보 버전</th>
            </tr>
          </thead>
          <tbody>
            {schools.map((school) => {
              const review = schoolNeedsReview(school);
              return (
                <tr key={school.schoolId}>
                  <td>
                    <strong>{school.name}</strong>
                    <small>{school.schoolId}</small>
                  </td>
                  <td>
                    {DISTRICT_LABELS[school.district] ?? school.district} ·{" "}
                    {SCHOOL_TYPE_LABELS[school.schoolType] ?? school.schoolType}
                  </td>
                  <td>{school.roadAddress ?? "주소 확인 필요"}</td>
                  <td>
                    <StatusBadge
                      tone={
                        review
                          ? "attention"
                          : school.locationStatus === "confirmed"
                            ? "success"
                            : "info"
                      }
                    >
                      {school.possibleRelocation ? "이전 검토 필요" : (KAKAO_STATUS_LABELS[school.locationStatus] ?? "위치 확인 필요")}
                    </StatusBadge>
                  </td>
                  <td>r{school.schoolBaseRevision}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {schools.length === 0 ? (
          <EmptyState
            icon="building"
            title="조건에 맞는 학교가 없습니다."
            description="검색어나 상태 필터를 바꿔보세요."
          />
        ) : null}
      </div>
    </section>
  );
}
