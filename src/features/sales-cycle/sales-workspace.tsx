"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { SchoolAssignmentPicker } from "@/components/assignment/school-assignment-picker";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import { SmartChip } from "@/components/ui/smart-chip";
import { SoftCard } from "@/components/ui/soft-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import type { MonthlyStatus, SalesAssignment, SalesCycle } from "@/domain/sales";
import type { School } from "@/domain/school";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { useSchoolSearchCatalog } from "@/features/search/use-school-search-catalog";
import {
  claimSalesAssignments,
  releaseSalesAssignments,
  salesAssignmentErrorMessage,
  salesAssignmentReleaseErrorMessage,
} from "./sales-assignment-repository";
import { useSalesWorkspace } from "./use-sales-workspace";

const SCOPE_OPTIONS = [
  { value: "mine", label: "내 학교" },
  { value: "all", label: "전체 보기" },
] as const;

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

const STATUS_META: Record<MonthlyStatus, {
  label: string;
  tone: "success" | "attention" | "neutral" | "info";
  description: string;
}> = {
  before: { label: "방문 전", tone: "neutral", description: "이번 달 방문 기록 전" },
  completed: { label: "방문 완료", tone: "success", description: "이번 달 방문을 마쳤어요" },
  followUp: { label: "후속 필요", tone: "attention", description: "다음 행동을 확인해주세요" },
  revisit: { label: "재방문 필요", tone: "attention", description: "다시 방문할 일정이 필요해요" },
  onHold: { label: "보류", tone: "info", description: "보류 사유 확인 필요" },
};

function cycleLabel(cycleId: string) {
  const [year, month] = cycleId.split("-");
  return `${year}년 ${Number(month)}월`;
}

function cycleStatusLabel(cycle: SalesCycle) {
  if (cycle.status === "active") return "현재 진행 중";
  if (cycle.status === "draft") return "배정 초안";
  return "종료 · 읽기 전용";
}

function formatVisitDate(value: Date | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(value);
}

function AssignmentCard({
  assignment,
  school,
  primaryName,
  onSelect,
  managing = false,
  selected = false,
  releasable = false,
  onToggle,
}: {
  assignment: SalesAssignment;
  school: School;
  primaryName: string;
  onSelect: (school: School) => void;
  managing?: boolean;
  selected?: boolean;
  releasable?: boolean;
  onToggle?: (schoolId: string, selected: boolean) => void;
}) {
  const status = STATUS_META[assignment.monthlyStatus];
  const latestVisit = formatVisitDate(assignment.latestVisitedAt);
  const content = (
    <>
      <span className="assignment-card__rail" aria-hidden="true" />
      <span className="assignment-card__header">
        <span className="assignment-card__zone"><Icon name="location" size={16} />{DISTRICT_LABELS[school.district]}</span>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </span>
      <span className="assignment-card__school">
        <strong>{school.name}</strong>
        <small>{DISTRICT_LABELS[school.district]} · {SCHOOL_TYPE_LABELS[school.schoolType]}</small>
      </span>
      <span className="assignment-card__owner">
        <span className="assignment-card__avatar" aria-hidden="true">{Array.from(primaryName).slice(0, 2).join("")}</span>
        <span><small>주 담당</small><strong>{primaryName}</strong></span>
        {assignment.assigneeIds.length > 1 ? <em>+{assignment.assigneeIds.length - 1} 공동</em> : null}
      </span>
      <span className="assignment-card__signals">
        <span data-done={assignment.brochureStatus === "delivered"}><Icon name="clipboard" size={15} />홍보지 {assignment.brochureStatus === "delivered" ? "전달" : "미확인"}</span>
        <span data-done={assignment.sampleStatus === "delivered"}><Icon name="sparkles" size={15} />샘플 {assignment.sampleStatus === "delivered" ? "전달" : "미확인"}</span>
      </span>
      <span className="assignment-card__footer">
        <span>{managing && !releasable ? "업무 기록이 있어 담당 변경만 가능" : latestVisit ? `최근 방문 ${latestVisit}` : status.description}</span>
        {managing ? <Icon name={selected ? "check" : "building"} size={18} /> : <Icon name="chevron-right" size={18} />}
      </span>
    </>
  );

  if (managing) {
    return (
      <label
        className="assignment-card assignment-card--selectable"
        data-status={assignment.monthlyStatus}
        data-selected={selected ? "true" : "false"}
        data-disabled={!releasable ? "true" : "false"}
      >
        <input
          type="checkbox"
          checked={selected}
          disabled={!releasable}
          onChange={(event) => onToggle?.(assignment.schoolId, event.target.checked)}
          aria-label={`${school.name} 담당 학교에서 제외 선택`}
        />
        <span className="assignment-card__check" aria-hidden="true"><Icon name="check" size={15} /></span>
        {content}
      </label>
    );
  }

  return (
    <button
      className="assignment-card"
      data-status={assignment.monthlyStatus}
      type="button"
      onClick={() => onSelect(school)}
      aria-label={`${school.name}, ${DISTRICT_LABELS[school.district]}, 담당 ${primaryName}, ${status.label}`}
    >
      {content}
    </button>
  );
}

function WorkspaceSkeleton() {
  return (
    <section className="shell-page sales-cycle-page" aria-label="월별 배정 불러오는 중">
      <div className="sales-cycle-skeleton__hero" />
      <div className="assignment-grid">{[0, 1, 2].map((item) => <SkeletonCard key={item} />)}</div>
    </section>
  );
}

function SalesClaimPicker({
  session,
  assignedSchoolIds,
  busy,
  onSubmit,
}: {
  session: AuthenticatedSession;
  assignedSchoolIds: Set<string>;
  busy: boolean;
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
    return <div className="sales-claim-loading" role="status"><Icon name="refresh" /><span>전체 학교 목록을 준비하고 있어요.</span></div>;
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
      <div className="sales-claim-policy">
        <span><Icon name="check" size={18} /></span>
        <p><strong>미배정 학교만 안전하게 가져옵니다.</strong><small>다른 직원이 먼저 선택한 학교는 서버에서 중복 배정을 막고 목록을 갱신합니다.</small></p>
      </div>
      <SchoolAssignmentPicker
        candidates={candidates}
        busy={busy}
        actionLabel={(count) => `${count}곳 내 담당으로 가져오기`}
        emptyTitle="현재 선택할 수 있는 미배정 학교가 없습니다."
        onSubmit={onSubmit}
      />
    </div>
  );
}

export function SalesWorkspace({
  session,
  onSelectSchool,
  onOpenSearch,
}: {
  session: AuthenticatedSession;
  onSelectSchool: (school: School) => void;
  onOpenSearch: () => void;
}) {
  const { showToast } = useToast();
  const scopeStorageKey = `onnuriway:private:v1:sales-scope:${session.uid}`;
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [scope, setScope] = useState<"mine" | "all">(() => {
    try {
      return sessionStorage.getItem(scopeStorageKey) === "all" ? "all" : "mine";
    } catch {
      return "mine";
    }
  });
  const [district, setDistrict] = useState<School["district"] | "all">("all");
  const [cycleSheetOpen, setCycleSheetOpen] = useState(false);
  const [claimSheetOpen, setClaimSheetOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [managing, setManaging] = useState(false);
  const [selectedReleaseIds, setSelectedReleaseIds] = useState<Set<string>>(() => new Set());
  const [releaseConfirmOpen, setReleaseConfirmOpen] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const data = useSalesWorkspace(session, selectedCycleId);
  const workspace = data.workspace;
  const closeCycleSheet = useCallback(() => setCycleSheetOpen(false), []);

  useEffect(() => {
    try {
      sessionStorage.setItem(scopeStorageKey, scope);
    } catch {
      // The current view remains usable when private storage is unavailable.
    }
  }, [scope, scopeStorageKey]);

  const model = useMemo(() => {
    if (!workspace) return null;
    const schools = new Map(workspace.schools.map((school) => [school.schoolId, school]));
    const employees = new Map(workspace.employees.map((employee) => [employee.employeeId, employee.displayName]));
    const scopeAssignments = workspace.assignments.filter((assignment) =>
      scope === "all" || assignment.assigneeIds.includes(session.claims.employeeId)
    );
    const visibleAssignments = scopeAssignments
      .flatMap((assignment) => {
        const school = schools.get(assignment.schoolId);
        return school ? [{ assignment, school }] : [];
      })
      .filter(({ school }) => district === "all" || school.district === district)
      .sort((left, right) => {
        const districtDifference = left.school.district.localeCompare(right.school.district, "ko");
        if (districtDifference !== 0) return districtDifference;
        const employeeDifference = left.assignment.primaryAssigneeId.localeCompare(right.assignment.primaryAssigneeId, "ko");
        return employeeDifference || left.school.name.localeCompare(right.school.name, "ko");
      });
    const completed = scopeAssignments.filter((assignment) => assignment.monthlyStatus === "completed").length;
    const before = scopeAssignments.filter((assignment) => assignment.monthlyStatus === "before").length;
    const followUp = scopeAssignments.filter((assignment) => ["followUp", "revisit"].includes(assignment.monthlyStatus)).length;
    const sample = scopeAssignments.filter((assignment) => assignment.sampleStatus === "delivered").length;
    const progress = scopeAssignments.length === 0 ? 0 : Math.round((completed / scopeAssignments.length) * 100);
    const availableDistricts = [...new Set(scopeAssignments.flatMap((assignment) => {
      const school = schools.get(assignment.schoolId);
      return school ? [school.district] : [];
    }))];
    const assignedSchoolIds = new Set(workspace.assignments.map((assignment) => assignment.schoolId));
    return {
      visibleAssignments,
      employees,
      totals: { assigned: scopeAssignments.length, completed, before, followUp, sample, progress },
      availableDistricts,
      assignedSchoolIds,
    };
  }, [district, scope, session.claims.employeeId, workspace]);

  if (data.status === "loading" && !workspace) return <WorkspaceSkeleton />;
  if (data.status === "error" || !workspace || !model) {
    return (
      <section className="shell-page sales-cycle-page">
        <SoftCard className="sales-cycle-error" role="alert">
          <span><Icon name="calendar" /></span>
          <h1>이번 달 배정을 불러오지 못했어요.</h1>
          <p>연결 상태를 확인한 뒤 다시 시도해주세요.</p>
          <GlassButton compact onClick={data.retry}>다시 불러오기</GlassButton>
        </SoftCard>
      </section>
    );
  }

  const selectedCycleIsCurrent = workspace.selectedCycleId === workspace.currentCycleId;
  const scopeName = scope === "mine" ? "내 담당" : "팀 전체";
  const claimAssignments = async (schoolIds: string[]) => {
    setClaiming(true);
    try {
      const result = await claimSalesAssignments({
        cycleId: workspace.selectedCycleId,
        schoolIds,
      });
      showToast(`${result.createdCount}개 학교를 내 담당으로 가져왔습니다.`, "success");
      setClaimSheetOpen(false);
      data.retry();
      return true;
    } catch (error) {
      showToast(salesAssignmentErrorMessage(error));
      data.retry();
      return false;
    } finally {
      setClaiming(false);
    }
  };

  const toggleRelease = (schoolId: string, selected: boolean) => {
    setSelectedReleaseIds((current) => {
      const next = new Set(current);
      if (selected) next.add(schoolId);
      else next.delete(schoolId);
      return next;
    });
  };

  const leaveManageMode = () => {
    setManaging(false);
    setSelectedReleaseIds(new Set());
    setReleaseConfirmOpen(false);
  };

  const releaseAssignments = async () => {
    const schoolIds = [...selectedReleaseIds];
    if (schoolIds.length === 0) return;
    setReleasing(true);
    try {
      const result = await releaseSalesAssignments({
        cycleId: workspace.selectedCycleId,
        schoolIds,
        reason: `${session.displayName} 담당 학교 직접 정리`,
      });
      showToast(`${result.removedCount}개 학교를 내 담당에서 제외했습니다.`, "success");
      leaveManageMode();
      data.retry();
    } catch (error) {
      showToast(salesAssignmentReleaseErrorMessage(error));
      setReleaseConfirmOpen(false);
      data.retry();
    } finally {
      setReleasing(false);
    }
  };

  return (
    <section className="shell-page sales-cycle-page" aria-labelledby="sales-cycle-title">
      <div className="sales-cycle-hero">
        <div className="sales-cycle-hero__copy">
          <p className="shell-kicker">SALES · MONTHLY ROUTE</p>
          <p className="sales-cycle-hero__greeting">{session.displayName}님의 {scopeName}</p>
          <h1 id="sales-cycle-title">{scope === "mine" ? <>오늘 움직일<br /><em>학교의 흐름.</em></> : <>함께 이어가는<br /><em>팀의 흐름.</em></>}</h1>
          <button className="cycle-selector" type="button" onClick={() => setCycleSheetOpen(true)}>
            <Icon name="calendar" size={18} />
            <span><strong>{cycleLabel(workspace.selectedCycleId)}</strong><small>{cycleStatusLabel(workspace.cycle)}</small></span>
            <Icon name="chevron-right" size={17} />
          </button>
        </div>

        <div className="sales-cycle-overview" aria-label={`${scopeName} 진행률 ${model.totals.progress}%`}>
          <div className="sales-cycle-progress">
            <span><strong>{model.totals.progress}</strong><small>%</small></span>
            <div role="progressbar" aria-label={`${scopeName} 방문 완료율`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={model.totals.progress}>
              <i style={{ width: `${model.totals.progress}%` }} />
            </div>
            <p>{model.totals.completed}곳 완료 · {model.totals.before}곳 방문 전</p>
          </div>
          <div className="sales-cycle-metrics">
            <div><span>담당 학교</span><strong>{model.totals.assigned}</strong><small>이번 달</small></div>
            <div><span>후속·재방문</span><strong>{model.totals.followUp}</strong><small>확인 필요</small></div>
            <div><span>샘플 전달</span><strong>{model.totals.sample}</strong><small>학교 기준</small></div>
          </div>
        </div>
      </div>

      {data.stale ? (
        <div className="sales-cycle-cache-note" role="status">
          <Icon name="clock" size={17} />
          <span>저장된 월간 배정을 표시하고 있어요.</span>
          <button type="button" onClick={data.retry}>새로 확인</button>
        </div>
      ) : null}

      <div className="sales-cycle-toolbar">
        <div>
          <p className="shell-kicker">ASSIGNED SCHOOLS</p>
          <h2>{scopeName} 학교</h2>
          <span>{selectedCycleIsCurrent ? "현재 월 배정" : "과거 월 · 읽기 전용"} · {model.totals.assigned}곳</span>
        </div>
        <div className="sales-cycle-toolbar__actions">
          {selectedCycleIsCurrent ? (
            <>
              {scope === "mine" ? (
                <GlassButton
                  compact
                  variant={managing ? "primary" : "quiet"}
                  onClick={() => managing ? leaveManageMode() : setManaging(true)}
                >
                  <Icon name={managing ? "check" : "settings"} />{managing ? "정리 마침" : "내 학교 정리"}
                </GlassButton>
              ) : null}
              <GlassButton variant="primary" compact onClick={() => setClaimSheetOpen(true)}>
                <Icon name="building" />학교 추가
              </GlassButton>
            </>
          ) : null}
          <GlassButton compact onClick={onOpenSearch}><Icon name="search" />학교 찾기</GlassButton>
          <SegmentedControl
            className="sales-scope-control"
            label="학교 범위"
            options={SCOPE_OPTIONS}
            value={scope}
            onChange={(value) => { setScope(value); setDistrict("all"); leaveManageMode(); }}
          />
        </div>
      </div>

      {model.availableDistricts.length > 1 ? (
        <div className="sales-zone-chips" aria-label="행정구 필터">
          <SmartChip selected={district === "all"} onClick={() => setDistrict("all")}>전체 지역</SmartChip>
          {model.availableDistricts.map((districtId) => (
            <SmartChip key={districtId} selected={district === districtId} onClick={() => setDistrict(districtId)}>{DISTRICT_LABELS[districtId]}</SmartChip>
          ))}
        </div>
      ) : null}

      {model.visibleAssignments.length > 0 ? (
        <div className="assignment-grid">
          {model.visibleAssignments.map(({ assignment, school }) => (
            <AssignmentCard
              key={assignment.schoolId}
              assignment={assignment}
              school={school}
              primaryName={model.employees.get(assignment.primaryAssigneeId) ?? assignment.primaryAssigneeId}
              onSelect={onSelectSchool}
              managing={managing && scope === "mine"}
              selected={selectedReleaseIds.has(assignment.schoolId)}
              releasable={
                assignment.primaryAssigneeId === session.claims.employeeId
                && assignment.assigneeIds.length === 1
                && assignment.monthlyStatus === "before"
                && assignment.latestVisitId === null
                && assignment.brochureStatus === "unknown"
                && assignment.sampleStatus === "unknown"
              }
              onToggle={toggleRelease}
            />
          ))}
        </div>
      ) : (
        <SoftCard className="sales-cycle-empty">
          <span><Icon name="route" /></span>
          <h3>{district === "all" ? "이 달에 연결된 담당 학교가 없어요." : "선택한 지역에 학교가 없어요."}</h3>
          <p>{scope === "mine" ? "학교 추가에서 미배정 학교를 직접 선택할 수 있습니다." : "다른 지역을 선택해보세요."}</p>
        </SoftCard>
      )}

      <BottomSheet
        open={cycleSheetOpen}
        title="조회할 월 선택"
        description="과거 월의 배정과 상태는 읽기 전용으로 확인합니다."
        onClose={closeCycleSheet}
      >
        <div className="cycle-option-list">
          {workspace.cycles.map((cycle) => (
            <button
              key={cycle.cycleId}
              type="button"
              data-selected={cycle.cycleId === workspace.selectedCycleId}
              onClick={() => {
                setSelectedCycleId(cycle.cycleId);
                setDistrict("all");
                leaveManageMode();
                setCycleSheetOpen(false);
              }}
            >
              <span><strong>{cycleLabel(cycle.cycleId)}</strong><small>{cycleStatusLabel(cycle)}</small></span>
              {cycle.cycleId === workspace.selectedCycleId ? <Icon name="check" /> : <Icon name="chevron-right" />}
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet
        open={claimSheetOpen}
        title="담당 학교 가져오기"
        description="이번 달 미배정 학교를 여러 곳 선택해 내 담당으로 연결합니다. 검색과 필터를 바꿔도 선택은 유지됩니다."
        onClose={() => { if (!claiming) setClaimSheetOpen(false); }}
      >
        {claimSheetOpen ? (
          <SalesClaimPicker
            session={session}
            assignedSchoolIds={model.assignedSchoolIds}
            busy={claiming}
            onSubmit={claimAssignments}
          />
        ) : null}
      </BottomSheet>

      {managing && selectedReleaseIds.size > 0 ? (
        <div className="sales-assignment-batch" role="region" aria-label="선택한 담당 학교 작업">
          <span><strong>{selectedReleaseIds.size}</strong>곳 선택</span>
          <button type="button" onClick={() => setSelectedReleaseIds(new Set())}>선택 해제</button>
          <button type="button" onClick={() => setReleaseConfirmOpen(true)}>내 담당에서 제외</button>
        </div>
      ) : null}

      <BottomSheet
        open={releaseConfirmOpen}
        title={`${selectedReleaseIds.size}개 학교를 제외할까요?`}
        description="아직 업무 기록이 없는 학교만 제외됩니다. 제외된 학교는 다른 담당자가 바로 선택할 수 있습니다."
        onClose={() => { if (!releasing) setReleaseConfirmOpen(false); }}
      >
        <div className="assignment-release-confirm">
          <div><Icon name="clipboard" size={22} /><p><strong>방문 기록은 보호됩니다.</strong><small>기록이 시작된 학교는 이 작업으로 제외할 수 없습니다.</small></p></div>
          <div className="logout-actions">
            <GlassButton variant="quiet" disabled={releasing} onClick={() => setReleaseConfirmOpen(false)}>계속 담당하기</GlassButton>
            <GlassButton variant="danger" disabled={releasing} onClick={() => void releaseAssignments()}>{releasing ? "확인 중…" : "담당에서 제외"}</GlassButton>
          </div>
        </div>
      </BottomSheet>
    </section>
  );
}
