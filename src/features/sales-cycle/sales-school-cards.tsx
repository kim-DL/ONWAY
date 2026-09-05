import { useId } from "react";

import { SCHOOL_TYPE_LABELS, SchoolTypeMark } from "@/components/school/school-type-mark";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import type { SalesAssignment } from "@/domain/sales";
import type { School } from "@/domain/school";
import {
  ASSIGNMENT_STATUS_META, DISTRICT_LABELS, assignmentReleaseRestrictionMessage, deliveryStatusLabel,
  formatCardVisitDate, schoolLocationSummary, shouldShowDeliveryStatus,
} from "./sales-school-card-presentation";

export function ActivityRow({ item, onSelect }: {
  item: { assignment: SalesAssignment; school: School };
  onSelect: (school: School) => void;
}) {
  const { assignment, school } = item;
  const status = ASSIGNMENT_STATUS_META[assignment.monthlyStatus];
  return (
    <button className="sales-task-row school-activity-row" type="button" onClick={() => onSelect(school)}>
      <SchoolTypeMark schoolType={school.schoolType} />
      <span className="school-activity-row__body">
        <strong>{school.name}</strong>
        <span className="school-activity-row__meta">
          <small title={school.address.road || school.address.jibun || undefined}>{schoolLocationSummary(school)}</small>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </span>
      </span>
      <Icon name="chevron-right" size={16} />
    </button>
  );
}

export function AssignmentCard({
  assignment, school, primaryName, onSelect, managing = false,
  selected = false, releasable = false, onToggle, routePosition,
}: {
  assignment: SalesAssignment;
  school: School;
  primaryName: string;
  onSelect: (school: School) => void;
  managing?: boolean;
  selected?: boolean;
  releasable?: boolean;
  onToggle?: (schoolId: string, selected: boolean) => void;
  routePosition?: number | undefined;
}) {
  const noteId = useId();
  const status = ASSIGNMENT_STATUS_META[assignment.monthlyStatus];
  const latestVisit = formatCardVisitDate(assignment.latestVisitedAt);
  const brochure = deliveryStatusLabel(assignment.brochureStatus);
  const sample = deliveryStatusLabel(assignment.sampleStatus);
  const showBrochure = shouldShowDeliveryStatus(assignment, assignment.brochureStatus);
  const showSample = shouldShowDeliveryStatus(assignment, assignment.sampleStatus);
  const restriction = managing && !releasable ? assignmentReleaseRestrictionMessage(assignment) : null;
  const content = <>
    <span className="school-assignment-heading">
      <SchoolTypeMark schoolType={school.schoolType} />
      <span className="school-assignment-heading__body">
        <strong>{school.name}</strong>
        <span className="school-assignment-meta">
          {routePosition ? <span className="school-assignment-meta__route">동선 {routePosition}번째</span> : null}
          <span>{DISTRICT_LABELS[school.district]}</span>
          <span>담당 {primaryName}{assignment.assigneeIds.length > 1 ? ` 외 ${assignment.assigneeIds.length - 1}명` : ""}</span>
        </span>
      </span>
      {!managing ? <Icon name="chevron-right" size={16} /> : null}
    </span>
    <span className="school-assignment-state" data-has-delivery={showBrochure || showSample ? "true" : "false"}>
      {showBrochure || showSample ? <span className="school-assignment-delivery">
        {showBrochure ? <span data-state={assignment.brochureStatus}><Icon name="clipboard" size={14} />홍보지 {brochure}</span> : null}
        {showSample ? <span data-state={assignment.sampleStatus}><Icon name="sparkles" size={14} />샘플 {sample}</span> : null}
      </span> : null}
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
    </span>
    {latestVisit || restriction ? <span className="school-assignment-note" id={noteId}>
      {restriction ?? `최근 방문 ${latestVisit}`}
    </span> : null}
  </>;

  if (managing) return (
    <label className="assignment-card school-assignment-card assignment-card--selectable"
      data-status={assignment.monthlyStatus} data-selected={selected ? "true" : "false"}
      data-disabled={!releasable ? "true" : "false"}>
      <input type="checkbox" checked={selected} disabled={!releasable}
        onChange={(event) => onToggle?.(assignment.schoolId, event.target.checked)}
        aria-label={`${school.name} 담당 학교에서 제외 선택`}
        aria-describedby={restriction || latestVisit ? noteId : undefined} />
      <span className="assignment-card__check" aria-hidden="true"><Icon name="check" size={15} /></span>
      {content}
    </label>
  );

  return (
    <button className="assignment-card school-assignment-card" data-status={assignment.monthlyStatus}
      type="button" onClick={() => onSelect(school)}
      aria-label={`${routePosition ? `동선 ${routePosition}번째, ` : ""}${school.name}, ${DISTRICT_LABELS[school.district]}, 담당 ${primaryName}${assignment.assigneeIds.length > 1 ? ` 외 ${assignment.assigneeIds.length - 1}명` : ""}, ${SCHOOL_TYPE_LABELS[school.schoolType]}, ${status.label}${showBrochure ? `, 홍보지 ${brochure}` : ""}${showSample ? `, 샘플 ${sample}` : ""}${latestVisit ? `, 최근 방문 ${latestVisit}` : ""}`}>
      {content}
    </button>
  );
}
