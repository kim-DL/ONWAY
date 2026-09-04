"use client";

import { useMemo, useState } from "react";

import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import { SoftCard } from "@/components/ui/soft-card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { SalesAssignment } from "@/domain/sales";
import type { School } from "@/domain/school";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { useTimeGreeting } from "@/features/app-shell/time-greeting";
import { useSalesWorkspace } from "./use-sales-workspace";

const QUEUES = [
  { value: "next", label: "방문 전" },
  { value: "followup", label: "후속 관리" },
  { value: "completed", label: "완료" },
] as const;

const DISTRICT_LABELS: Record<School["district"], string> = {
  dong: "동구",
  jung: "중구",
  seo: "서구",
  yuseong: "유성구",
  daedeok: "대덕구",
};

type Queue = (typeof QUEUES)[number]["value"];
type ActivityItem = { assignment: SalesAssignment; school: School };

function belongsToQueue(assignment: SalesAssignment, queue: Queue) {
  if (queue === "next") return assignment.monthlyStatus === "before";
  if (queue === "followup") return assignment.monthlyStatus === "followUp"
    || assignment.monthlyStatus === "revisit"
    || assignment.monthlyStatus === "onHold";
  return assignment.monthlyStatus === "completed";
}

function queueLabel(assignment: SalesAssignment) {
  if (assignment.monthlyStatus === "followUp") return "후속 필요";
  if (assignment.monthlyStatus === "revisit") return "재방문";
  if (assignment.monthlyStatus === "completed") return "완료";
  if (assignment.monthlyStatus === "onHold") return "보류";
  return "방문 전";
}

function ActivityRow({ item, onSelect }: { item: ActivityItem; onSelect: (school: School) => void }) {
  const { assignment, school } = item;
  const attention = assignment.monthlyStatus === "followUp" || assignment.monthlyStatus === "revisit";
  return (
    <button className="sales-task-row" type="button" onClick={() => onSelect(school)}>
      <span className="sales-task-row__icon"><Icon name={attention ? "clock" : assignment.monthlyStatus === "completed" ? "check" : "building"} size={19} /></span>
      <span className="sales-task-row__school">
        <strong>{school.name}</strong>
        <small>{DISTRICT_LABELS[school.district]} · {school.address.road ?? "주소 확인 필요"}</small>
      </span>
      <StatusBadge tone={attention ? "attention" : assignment.monthlyStatus === "completed" ? "success" : "neutral"}>{queueLabel(assignment)}</StatusBadge>
      <Icon name="chevron-right" size={18} />
    </button>
  );
}

export function SalesActivityWorkspace({
  session,
  onSelectSchool,
  onOpenSearch,
  onOpenSchools,
}: {
  session: AuthenticatedSession;
  onSelectSchool: (school: School) => void;
  onOpenSearch: () => void;
  onOpenSchools: () => void;
}) {
  const greeting = useTimeGreeting();
  const [queue, setQueue] = useState<Queue>("next");
  const data = useSalesWorkspace(session);
  const model = useMemo(() => {
    if (!data.workspace) return null;
    const schools = new Map(data.workspace.schools.map((school) => [school.schoolId, school]));
    const mine = data.workspace.assignments.filter((assignment) => assignment.assigneeIds.includes(session.claims.employeeId));
    const items = mine.flatMap((assignment) => {
      const school = schools.get(assignment.schoolId);
      return school ? [{ assignment, school }] : [];
    });
    const counts = {
      next: items.filter(({ assignment }) => belongsToQueue(assignment, "next")).length,
      followup: items.filter(({ assignment }) => belongsToQueue(assignment, "followup")).length,
      completed: items.filter(({ assignment }) => belongsToQueue(assignment, "completed")).length,
    };
    const visible = items
      .filter(({ assignment }) => belongsToQueue(assignment, queue))
      .sort((left, right) => left.school.name.localeCompare(right.school.name, "ko"));
    return { cycleId: data.workspace.selectedCycleId, counts, visible, total: items.length };
  }, [data.workspace, queue, session.claims.employeeId]);

  if (data.status === "loading" && !model) {
    return <section className="shell-page sales-activity-page" aria-label="업무 목록 불러오는 중"><div className="sales-activity-loading"><SkeletonCard /><SkeletonCard /></div></section>;
  }
  if (!model) {
    const setupRequired = data.issue === "setup-required";
    return (
      <section className="shell-page sales-activity-page">
        <SoftCard className="sales-activity-error" role="alert">
          <span><Icon name={setupRequired ? "calendar" : "wifi-off"} size={26} /></span>
          <h1>{setupRequired ? "이번 달 업무를 준비하고 있어요." : "업무 목록만 잠시 확인하지 못했어요."}</h1>
          <p>{setupRequired
            ? "관리자가 이번 달 배정을 시작하면 방문 전·후속·완료 업무가 자동으로 만들어집니다. 학교 공동 자산은 지금 바로 확인할 수 있습니다."
            : "학교 공동 자산은 계속 사용할 수 있습니다. 연결을 확인한 뒤 이 목록만 다시 불러오세요."}</p>
          <div className="sales-activity-error__actions">
            <GlassButton compact variant="primary" onClick={onOpenSchools}>학교 화면 열기</GlassButton>
            <GlassButton compact onClick={data.retry}>{setupRequired ? "배정 상태 확인" : "업무 목록 다시 불러오기"}</GlassButton>
          </div>
        </SoftCard>
      </section>
    );
  }

  const queueCopy = queue === "next"
    ? { title: "다음 방문을 준비하세요.", empty: "방문 전 학교가 없습니다." }
    : queue === "followup"
      ? { title: "약속한 다음 행동을 이어가세요.", empty: "후속·재방문·보류 학교가 없습니다." }
      : { title: "이번 달 완료한 학교입니다.", empty: "아직 완료한 학교가 없습니다." };

  return (
    <section className="shell-page sales-activity-page" aria-labelledby="sales-activity-title">
      <header className="sales-activity-hero">
        <div>
          <p className="shell-kicker">SALES · ACTION DESK</p>
          <p className="shell-greeting">{session.displayName}님, {greeting}.</p>
          <h1 id="sales-activity-title">좋은 대화가<br /><em>기다리고 있어요.</em></h1>
          <span className="sales-activity-hero__cycle">{model.cycleId} · 내 담당 학교 {model.total}곳</span>
        </div>
        <div className="sales-activity-score" aria-label={`전체 ${model.total}곳 중 완료 ${model.counts.completed}곳`}>
          <span>이번 달 완료</span>
          <strong>{model.counts.completed}<small> / {model.total}</small></strong>
          <div><i style={{ width: `${model.total === 0 ? 0 : Math.round((model.counts.completed / model.total) * 100)}%` }} /></div>
        </div>
      </header>

      {data.stale ? <div className="sales-cycle-cache-note" role="status"><Icon name="clock" size={17} /><span>저장된 업무 목록입니다.</span><button type="button" onClick={data.retry}>최신 확인</button></div> : null}

      <div className="sales-activity-actions">
        <SegmentedControl className="sales-activity-tabs" label="업무 상태" options={QUEUES} value={queue} onChange={setQueue} />
        <GlassButton compact onClick={onOpenSearch}><Icon name="search" size={18} />전체 학교 찾기</GlassButton>
      </div>

      <div className="sales-activity-heading">
        <div><h2>{queueCopy.title}</h2></div>
        <span>{model.visible.length}곳</span>
      </div>

      {model.visible.length > 0 ? (
        <div className="sales-task-list">{model.visible.map((item) => <ActivityRow key={item.assignment.schoolId} item={item} onSelect={onSelectSchool} />)}</div>
      ) : (
        <SoftCard className="sales-activity-empty">
          <span><Icon name="check" size={24} /></span>
          <h3>{queueCopy.empty}</h3>
          <p>{queue === "next" ? "학교 화면에서 미배정 학교를 추가하거나 팀 전체 현황을 확인해보세요." : "다른 업무 상태를 선택해보세요."}</p>
          {queue === "next" ? <GlassButton compact variant="primary" onClick={onOpenSchools}>담당 학교 추가</GlassButton> : null}
        </SoftCard>
      )}
    </section>
  );
}
