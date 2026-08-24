"use client";

import { useCallback, useMemo, useState } from "react";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import { SmartChip } from "@/components/ui/smart-chip";
import { SoftCard } from "@/components/ui/soft-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { MonthlyStatus, SalesAssignment, SalesCycle, SalesZone } from "@/domain/sales";
import type { School } from "@/domain/school";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { useSalesWorkspace } from "./use-sales-workspace";

const SCOPE_OPTIONS = [
  { value: "mine", label: "내 구역" },
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
  zoneName,
  primaryName,
  onSelect,
}: {
  assignment: SalesAssignment;
  school: School;
  zoneName: string;
  primaryName: string;
  onSelect: (school: School) => void;
}) {
  const status = STATUS_META[assignment.monthlyStatus];
  const latestVisit = formatVisitDate(assignment.latestVisitedAt);
  return (
    <button
      className="assignment-card"
      data-status={assignment.monthlyStatus}
      type="button"
      onClick={() => onSelect(school)}
      aria-label={`${school.name}, ${zoneName}, 담당 ${primaryName}, ${status.label}`}
    >
      <span className="assignment-card__rail" aria-hidden="true" />
      <span className="assignment-card__header">
        <span className="assignment-card__zone"><Icon name="route" size={16} />{zoneName}</span>
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
        <span>{latestVisit ? `최근 방문 ${latestVisit}` : status.description}</span>
        <Icon name="chevron-right" size={18} />
      </span>
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

export function SalesWorkspace({
  session,
  onSelectSchool,
  onOpenSearch,
}: {
  session: AuthenticatedSession;
  onSelectSchool: (school: School) => void;
  onOpenSearch: () => void;
}) {
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [zoneId, setZoneId] = useState<string>("all");
  const [cycleSheetOpen, setCycleSheetOpen] = useState(false);
  const data = useSalesWorkspace(session, selectedCycleId);
  const workspace = data.workspace;
  const closeCycleSheet = useCallback(() => setCycleSheetOpen(false), []);

  const model = useMemo(() => {
    if (!workspace) return null;
    const schools = new Map(workspace.schools.map((school) => [school.schoolId, school]));
    const employees = new Map(workspace.employees.map((employee) => [employee.employeeId, employee.displayName]));
    const zones = new Map(workspace.zones.map((zone) => [zone.zoneId, zone.name]));
    const scopeAssignments = workspace.assignments.filter((assignment) =>
      scope === "all" || assignment.assigneeIds.includes(session.claims.employeeId)
    );
    const visibleAssignments = scopeAssignments
      .filter((assignment) => zoneId === "all" || assignment.zoneId === zoneId)
      .flatMap((assignment) => {
        const school = schools.get(assignment.schoolId);
        return school ? [{ assignment, school }] : [];
      })
      .sort((left, right) => {
        const zoneDifference = left.assignment.zoneId.localeCompare(right.assignment.zoneId, "ko");
        if (zoneDifference !== 0) return zoneDifference;
        const employeeDifference = left.assignment.primaryAssigneeId.localeCompare(right.assignment.primaryAssigneeId, "ko");
        return employeeDifference || left.school.name.localeCompare(right.school.name, "ko");
      });
    const completed = scopeAssignments.filter((assignment) => assignment.monthlyStatus === "completed").length;
    const before = scopeAssignments.filter((assignment) => assignment.monthlyStatus === "before").length;
    const followUp = scopeAssignments.filter((assignment) => ["followUp", "revisit"].includes(assignment.monthlyStatus)).length;
    const sample = scopeAssignments.filter((assignment) => assignment.sampleStatus === "delivered").length;
    const progress = scopeAssignments.length === 0 ? 0 : Math.round((completed / scopeAssignments.length) * 100);
    const availableZoneIds = new Set(scopeAssignments.map((assignment) => assignment.zoneId));
    const visibleZones = workspace.zones.filter((zone) => availableZoneIds.has(zone.zoneId));
    return { visibleAssignments, employees, zones, totals: { assigned: scopeAssignments.length, completed, before, followUp, sample, progress }, visibleZones };
  }, [scope, session.claims.employeeId, workspace, zoneId]);

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
  const scopeName = scope === "mine" ? "내 구역" : "팀 전체";

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
          <GlassButton compact onClick={onOpenSearch}><Icon name="search" />학교 찾기</GlassButton>
          <SegmentedControl
            className="sales-scope-control"
            label="학교 범위"
            options={SCOPE_OPTIONS}
            value={scope}
            onChange={(value) => { setScope(value); setZoneId("all"); }}
          />
        </div>
      </div>

      {model.visibleZones.length > 1 ? (
        <div className="sales-zone-chips" aria-label="구역 필터">
          <SmartChip selected={zoneId === "all"} onClick={() => setZoneId("all")}>전체 구역</SmartChip>
          {model.visibleZones.map((zone: SalesZone) => (
            <SmartChip key={zone.zoneId} selected={zoneId === zone.zoneId} onClick={() => setZoneId(zone.zoneId)}>{zone.name}</SmartChip>
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
              zoneName={model.zones.get(assignment.zoneId) ?? assignment.zoneId}
              primaryName={model.employees.get(assignment.primaryAssigneeId) ?? assignment.primaryAssigneeId}
              onSelect={onSelectSchool}
            />
          ))}
        </div>
      ) : (
        <SoftCard className="sales-cycle-empty">
          <span><Icon name="route" /></span>
          <h3>{zoneId === "all" ? "이 달에 연결된 담당 학교가 없어요." : "선택한 구역에 학교가 없어요."}</h3>
          <p>{scope === "mine" ? "관리자에게 이번 달 배정을 확인해주세요." : "다른 구역을 선택해보세요."}</p>
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
                setZoneId("all");
                setCycleSheetOpen(false);
              }}
            >
              <span><strong>{cycleLabel(cycle.cycleId)}</strong><small>{cycleStatusLabel(cycle)}</small></span>
              {cycle.cycleId === workspace.selectedCycleId ? <Icon name="check" /> : <Icon name="chevron-right" />}
            </button>
          ))}
        </div>
      </BottomSheet>
    </section>
  );
}
