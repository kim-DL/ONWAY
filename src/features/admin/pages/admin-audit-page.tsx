"use client";

import { useMemo, useState } from "react";

import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { searchInputProps } from "@/components/ui/search-input-props";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";

import type { AdminAudit, AdminEmployee } from "../admin-contract";
import { auditEventLabel, formatDate } from "../admin-display";
import { EmptyState, PageHeading } from "../admin-page-parts";
import { adminErrorMessage, adminRepository } from "../admin-repository";

export function AuditPage({ initialLogs, employees }: { initialLogs: AdminAudit[]; employees: AdminEmployee[] }) {
  const { showToast } = useToast();
  const [logs, setLogs] = useState(initialLogs);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const employeeNames = useMemo(() => new Map(employees.map((employee) => [employee.employeeId, employee.displayName])), [employees]);
  const visible = useMemo(
    () =>
      logs.filter((log) =>
        `${auditEventLabel(log.eventType)} ${log.eventType} ${log.actorEmployeeId ?? ""} ${employeeNames.get(log.actorEmployeeId ?? "") ?? ""} ${log.targetId ?? ""} ${log.changeReason ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [logs, query, employeeNames],
  );
  const loadMore = async () => {
    setLoading(true);
    try {
      setLogs(await adminRepository.loadAudit(200));
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className="admin-page" aria-labelledby="audit-title">
      <PageHeading
        title="감사 기록"
        description="누가, 무엇을, 왜 변경했는지 서버 기록으로 추적합니다."
        action={
          <GlassButton
            variant="quiet"
            compact
            disabled={loading}
            onClick={() => void loadMore()}
          >
            <Icon name="refresh" size={16} />{" "}
            {loading ? "불러오는 중" : "최근 200건"}
          </GlassButton>
        }
      />
      <div className="admin-toolbar">
        <label className="admin-search">
          <Icon name="search" size={17} />
          <input
            {...searchInputProps}
            name="audit-query"
            aria-label="감사 기록 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이벤트, 직원, 대상, 사유 검색"
          />
        </label>
        <StatusBadge>{visible.length}건 표시</StatusBadge>
      </div>
      <div className="audit-timeline">
        {visible.map((log) => (
          <article key={log.logId}>
            <span className="audit-timeline__rail">
              <i />
            </span>
            <div className="audit-timeline__content">
              <header>
                <StatusBadge
                  tone={
                    log.eventType.includes("FAILED") ||
                    log.eventType.includes("REVOKED")
                      ? "attention"
                      : "neutral"
                  }
                >
                  {auditEventLabel(log.eventType)}
                </StatusBadge>
                <time>{formatDate(log.createdAt)}</time>
              </header>
              <strong>
                {log.actorEmployeeId ? employeeNames.get(log.actorEmployeeId) ?? log.actorEmployeeId : "시스템"} → {log.targetType === "inventory" ? "재고" : log.targetType}
                {log.targetId ? ` / ${log.targetId}` : ""}
              </strong>
              <p>
                {log.changedFields.length
                  ? log.changedFields.join(" · ")
                  : "상태 확인 이벤트"}
              </p>
              {log.changeReason ? (
                <blockquote>{log.changeReason}</blockquote>
              ) : null}
              <small>{log.logId}</small>
            </div>
          </article>
        ))}
        {visible.length === 0 ? (
          <EmptyState
            icon="clipboard"
            title="검색 결과가 없습니다."
            description="검색 범위를 줄이거나 최근 기록을 더 불러오세요."
          />
        ) : null}
      </div>
    </section>
  );
}
