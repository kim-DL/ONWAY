"use client";

import { useMemo } from "react";

import { SchoolAssignmentPicker } from "@/components/assignment/school-assignment-picker";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { LoadingStatus } from "@/components/ui/loading-status";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { useSchoolSearchCatalog } from "@/features/search/use-school-search-catalog";

export function SalesClaimPicker({
  session,
  assignedSchoolIds,
  busy,
  submitErrorMessage,
  onSubmit,
}: {
  session: AuthenticatedSession;
  assignedSchoolIds: Set<string>;
  busy: boolean;
  submitErrorMessage: string | null;
  onSubmit: (schoolIds: string[]) => Promise<boolean>;
}) {
  const catalog = useSchoolSearchCatalog(session, "sales");
  const catalogItems = catalog.status === "ready" ? catalog.catalog.items : null;
  const candidates = useMemo(() => catalogItems
    ? catalogItems
      .filter((school) => school.operationalStatus === "active" && !assignedSchoolIds.has(school.schoolId))
      .map((school) => ({
        schoolId: school.schoolId,
        name: school.name,
        district: school.district,
        schoolType: school.schoolType,
        address: school.addressSummary,
      }))
    : [], [assignedSchoolIds, catalogItems]);

  if (catalog.status === "loading") {
    return <LoadingStatus className="sales-claim-loading" label="학교 목록 불러오는 중" detail="영업 대상으로 선택할 학교 목록을 확인하고 있습니다." />;
  }
  if (catalog.status === "error") {
    return (
      <div className="sales-claim-empty" role="alert">
        <span><Icon name="wifi-off" size={24} /></span>
        <h3>학교 목록을 불러오지 못했어요.</h3>
        <p>네트워크 연결을 확인한 뒤 다시 시도해주세요.</p>
        <GlassButton compact onClick={catalog.retry}>다시 불러오기</GlassButton>
      </div>
    );
  }

  return (
    <div className="sales-claim-composer">
      <SchoolAssignmentPicker
        candidates={candidates}
        busy={busy}
        actionLabel={(count) => `${count}곳 내 담당으로 가져오기`}
        emptyTitle="현재 선택할 수 있는 미배정 학교가 없습니다."
        submitErrorMessage={submitErrorMessage}
        onSubmit={onSubmit}
      />
    </div>
  );
}
