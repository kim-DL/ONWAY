"use client";

import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";

import type { AdminWorkspaceData } from "../admin-contract";
import {
  auditEventLabel,
  CYCLE_STATUS_LABELS,
  cycleDisplayLabel,
  formatDate,
  MONTHLY_STATUS_LABELS,
  schoolNeedsReview,
  SYNC_STATUS_LABELS,
} from "../admin-display";
import type { AdminView } from "../admin-navigation";
import { EmptyState } from "../admin-page-parts";

export function OverviewPage({
  data,
  onNavigate,
}: {
  data: AdminWorkspaceData;
  onNavigate: (view: AdminView) => void;
}) {
  const activeEmployees = data.employees.filter((employee) => employee.status === "active").length;
  const locationReview = data.schools.filter(schoolNeedsReview).length;
  const selectedCycle = data.cycles.find((cycle) => cycle.cycleId === data.selectedCycleId);
  const completed = data.assignments.filter((assignment) => assignment.monthlyStatus === "completed").length;
  const completionRate = data.assignments.length ? Math.round(completed / data.assignments.length * 100) : 0;
  const latestSync = data.syncRuns[0];
  const employeeNames = new Map(data.employees.map((employee) => [employee.employeeId, employee.displayName]));

  return (
    <section className="admin-page" aria-labelledby="overview-title">
      <header className="admin-page-heading">
        <div>
          <h1 id="overview-title">운영 개요</h1>
          <span>학교와 직원, 거래처 운영의 현재 상태를 확인하세요.</span>
        </div>
        <StatusBadge tone={data.settings.maintenanceMode ? "attention" : "neutral"}>
          {data.settings.maintenanceMode ? "앱 점검 모드" : "현장 앱 운영 중"}
        </StatusBadge>
      </header>

      <section className="admin-overview-hero" aria-labelledby="overview-cycle-title">
        <div>
          <span className="admin-overview-eyebrow"><Icon name="calendar" size={18} />학교 배정 현황</span>
          <h2 id="overview-cycle-title">{data.selectedCycleId ? cycleDisplayLabel(data.selectedCycleId) : "새로운 월을 준비해요."}</h2>
          <p>{selectedCycle ? `${CYCLE_STATUS_LABELS[selectedCycle.status] ?? selectedCycle.status} · 배정된 ${data.assignments.length}개 학교 기준` : "월을 시작하면 직원별 담당 학교를 배정할 수 있어요."}</p>
          <button type="button" onClick={() => onNavigate("cycles")}>
            {selectedCycle ? "배정 관리" : "학교 배정 시작"}<Icon name="chevron-right" size={17} />
          </button>
        </div>
        <div className="admin-overview-progress">
          <div><span>방문 완료</span><strong>{completed}<small> / {data.assignments.length}곳</small></strong></div>
          <div className="admin-progress" role="progressbar" aria-label="선택한 월 방문 완료율" aria-valuenow={completionRate} aria-valuemin={0} aria-valuemax={100}>
            <span><i style={{ width: `${completionRate}%` }} /></span><strong>{completionRate}%</strong>
          </div>
          <dl>
            {(["before", "followUp", "revisit", "onHold"] as const).map((status) => (
              <div key={status}><dt>{MONTHLY_STATUS_LABELS[status]}</dt><dd>{data.assignments.filter((assignment) => assignment.monthlyStatus === status).length}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <div className="admin-metric-grid">
        <button type="button" onClick={() => onNavigate("employees")}>
          <span><Icon name="user" size={20} /></span><small>활성 직원</small>
          <strong>{activeEmployees}<em>명</em></strong><p>전체 직원 {data.employees.length}명</p>
        </button>
        <button type="button" onClick={() => onNavigate("schools")}>
          <span><Icon name="building" size={20} /></span><small>등록 학교</small>
          <strong>{data.schools.length}<em>곳</em></strong><p>기준정보·주소 확인</p>
        </button>
        <button type="button" data-alert={locationReview > 0} onClick={() => onNavigate("sync")}>
          <span><Icon name="location" size={20} /></span><small>위치 검토</small>
          <strong>{locationReview}<em>곳</em></strong><p>{locationReview ? "주소와 위치 확인 필요" : "모든 학교 위치 확인됨"}</p>
        </button>
        <button type="button" onClick={() => onNavigate("sync")}>
          <span><Icon name="refresh" size={20} /></span><small>학교 정보 동기화</small>
          <strong className="admin-metric-grid__status">{latestSync ? (SYNC_STATUS_LABELS[latestSync.status] ?? latestSync.status) : "실행 전"}</strong>
          <p>{latestSync ? formatDate(latestSync.startedAt, false) : "NEIS 기준정보 비교"}</p>
        </button>
      </div>

      <div className="admin-overview-grid">
        <section className="admin-panel admin-quick-actions" aria-labelledby="admin-quick-title">
          <header><h2 id="admin-quick-title">자주 쓰는 업무</h2></header>
          {([
            ["customers", "location", "거래처 관리", "거래처·납품 위치·연락처"],
            ["employees", "user", "직원 관리", "직원 등록·업무 권한·PIN"],
            ["cycles", "calendar", "월별 학교 배정", "담당 학교·이번 달 홍보 제품"],
          ] as const).map(([view, icon, title, description]) => (
            <button type="button" key={view} onClick={() => onNavigate(view)}>
              <span><Icon name={icon} size={20} /></span>
              <span><strong>{title}</strong><small>{description}</small></span>
              <Icon name="chevron-right" size={18} />
            </button>
          ))}
        </section>
        <section className="admin-panel admin-audit-snapshot" aria-labelledby="admin-recent-title">
          <header><h2 id="admin-recent-title">최근 변경</h2><button type="button" onClick={() => onNavigate("audit")}>전체 보기<Icon name="chevron-right" size={15} /></button></header>
          {data.audits.length ? (
            <ul>{data.audits.slice(0, 4).map((log) => (
              <li key={log.logId}>
                <span><Icon name="clipboard" size={16} /></span>
                <div><strong>{auditEventLabel(log.eventType)}</strong><small>{log.actorEmployeeId ? (employeeNames.get(log.actorEmployeeId) ?? log.actorEmployeeId) : "시스템"} · {formatDate(log.createdAt)}</small></div>
              </li>
            ))}</ul>
          ) : <EmptyState icon="clipboard" title="아직 변경 기록이 없어요." description="등록·수정한 내역이 이곳에 표시됩니다." />}
        </section>
      </div>
    </section>
  );
}
