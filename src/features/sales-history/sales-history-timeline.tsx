"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import type { Product, TagDefinition } from "@/domain/catalog";
import type { EmployeeDirectory } from "@/domain/identity";
import type { SalesVisit } from "@/domain/sales";
import { INTEREST_META, interestHearts } from "@/features/sales-visit/heart-interest-selector";
import { useSalesHistory } from "./use-sales-history";

const DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

function VisitTimelineItem({
  visit,
  employeeNames,
  activityLabels,
  productNames,
  teamReadOnly,
  editable,
  onEdit,
}: {
  visit: SalesVisit;
  employeeNames: Map<string, string>;
  activityLabels: Map<string, string>;
  productNames: Map<string, string>;
  teamReadOnly: boolean;
  editable: boolean;
  onEdit: () => void;
}) {
  const visitor = employeeNames.get(visit.visitedBy) ?? visit.visitedBy;
  const recorder = employeeNames.get(visit.recordedBy) ?? visit.recordedBy;
  const assigneeId = visit.assignmentSnapshot.primaryAssigneeId;
  const assignee = assigneeId ? employeeNames.get(assigneeId) ?? assigneeId : "담당 미지정";
  return (
    <article className="visit-timeline-item">
      <div className="visit-timeline-item__rail" aria-hidden="true"><i /></div>
      <div className="visit-timeline-item__content">
        <header>
          <div>
            <time dateTime={visit.visitedAt.toISOString()}>{DATE_FORMATTER.format(visit.visitedAt)}</time>
            <span>{visit.cycleId.replace("-", "년 ")}월</span>
          </div>
          <div className="visit-timeline-item__actions">
            <small>{teamReadOnly ? "팀 기록 · 읽기 전용" : editable ? "최신 기록" : "원본 기록"}</small>
            {editable ? <button type="button" onClick={onEdit}><Icon name="clipboard" size={14} />수정</button> : null}
          </div>
        </header>
        <div className="visit-timeline-item__people">
          <span><Icon name="user" size={15} />담당 <strong>{assignee}</strong></span>
          <span>방문 <strong>{visitor}</strong></span>
          {visit.recordedBy !== visit.visitedBy ? <span>기록 <strong>{recorder}</strong></span> : null}
        </div>
        <div className="visit-timeline-item__signal-row">
          <span className="visit-timeline-item__hearts" aria-label={`제품 관심도 ${INTEREST_META[visit.interest.score].label}`}>
            <b aria-hidden="true">{interestHearts(visit.interest.score)}</b>{INTEREST_META[visit.interest.score].label}
          </span>
          <span data-positive={visit.brochure.status === "delivered"}>홍보지 {visit.brochure.status === "delivered" ? "전달" : "미전달"}</span>
          <span data-positive={visit.sample.status === "delivered"}>샘플 {visit.sample.status === "delivered" ? "전달" : "미전달"}</span>
        </div>
        {visit.sample.items.length > 0 ? (
          <ul className="visit-timeline-item__samples" aria-label="전달 샘플">
            {visit.sample.items.map((item, index) => (
              "productName" in item
                ? <li key={`${item.productName}-${index}`}>{item.productName}</li>
                : <li key={item.productId}>{productNames.get(item.productId) ?? "제품"} <strong>{item.quantity}개</strong></li>
            ))}
          </ul>
        ) : null}
        {visit.activityTagIds.length > 0 ? (
          <div className="visit-timeline-item__tags" aria-label="활동 태그">
            {visit.activityTagIds.map((tagId) => <span key={tagId}>{activityLabels.get(tagId) ?? "활동 기록"}</span>)}
          </div>
        ) : null}
        <p>{visit.summary}</p>
        {visit.followUp.required ? (
          <div className="visit-timeline-item__follow-up">
            <Icon name="calendar" size={16} />
            <span><small>당시 후속 일정 · {visit.followUp.dueDate}</small><strong>{visit.followUp.summary}</strong></span>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function SalesHistoryTimeline({
  schoolId,
  employees,
  activityTags,
  products,
  refreshKey,
  teamReadOnly,
  latestVisitId,
  onEditVisit,
}: {
  schoolId: string;
  employees: EmployeeDirectory[];
  activityTags: TagDefinition[];
  products: Product[];
  refreshKey: string | null;
  teamReadOnly: boolean;
  latestVisitId: string | null;
  onEditVisit: (visit: SalesVisit) => void;
}) {
  const history = useSalesHistory(schoolId, refreshKey);
  const [expanded, setExpanded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const employeeNames = useMemo(() => new Map(employees.map((employee) => [employee.employeeId, employee.displayName])), [employees]);
  const activityLabels = useMemo(() => new Map(activityTags.map((tag) => [tag.tagId, tag.label])), [activityTags]);
  const productNames = useMemo(() => new Map(products.map((product) => [product.productId, product.shortName ?? product.name])), [products]);

  const expandHistory = async () => {
    setExpanded(true);
    setLoadError(null);
    if (!history.hasMore) return;
    try {
      await history.loadMore();
    } catch {
      setLoadError("이전 기록을 더 불러오지 못했습니다. 연결을 확인해주세요.");
    }
  };

  const loadMore = async () => {
    setLoadError(null);
    try {
      await history.loadMore();
    } catch {
      setLoadError("이전 기록을 더 불러오지 못했습니다. 연결을 확인해주세요.");
    }
  };

  return (
    <section className="sales-history" aria-labelledby="sales-history-title">
      <div className="sales-history__heading">
        <div><h2 id="sales-history-title">이전 대화가, 다음 방문의 맥락이 됩니다.</h2></div>
        <span><Icon name="clock" size={16} />최근 기록부터</span>
      </div>
      {history.status === "loading" ? <div className="sales-history__loading" aria-label="방문 기록 불러오는 중"><SkeletonCard /><SkeletonCard /></div> : null}
      {history.status === "error" ? (
        <div className="sales-history__empty" role="alert"><Icon name="clock" /><strong>방문 기록을 불러오지 못했어요.</strong><p>연결을 확인한 뒤 다시 시도해주세요.</p><button type="button" onClick={history.refresh}>다시 불러오기</button></div>
      ) : null}
      {history.status === "ready" && history.visits.length === 0 ? (
        <div className="sales-history__empty"><Icon name="clipboard" /><strong>아직 남겨진 방문 기록이 없습니다.</strong></div>
      ) : null}
      {history.status === "ready" && history.visits.length > 0 ? (
        <>
          <div className="visit-timeline" data-expanded={expanded}>
            {history.visits.map((visit) => (
              <VisitTimelineItem
                key={visit.visitId}
                visit={visit}
                employeeNames={employeeNames}
                activityLabels={activityLabels}
                productNames={productNames}
                teamReadOnly={teamReadOnly}
                editable={!teamReadOnly && visit.visitId === latestVisitId}
                onEdit={() => onEditVisit(visit)}
              />
            ))}
          </div>
          <div className="sales-history__footer">
            {!expanded && history.hasMore ? <button type="button" onClick={() => void expandHistory()}>전체 기록 보기<Icon name="chevron-right" size={16} /></button> : null}
            {expanded && history.hasMore ? <button type="button" disabled={history.loadingMore} onClick={() => void loadMore()}>{history.loadingMore ? "이전 기록 불러오는 중…" : "이전 기록 더 보기"}</button> : null}
            {expanded && !history.hasMore ? <small>마지막 기록까지 모두 확인했습니다.</small> : null}
          </div>
          {loadError ? <p className="sales-history__load-error" role="alert">{loadError}</p> : null}
        </>
      ) : null}
    </section>
  );
}
