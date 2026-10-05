"use client";

import { useMemo, useState } from "react";

import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { searchInputProps } from "@/components/ui/search-input-props";
import { StatusBadge } from "@/components/ui/status-badge";

import type { AdminWorkspaceData } from "../admin-contract";
import { initials, ROLE_LABELS } from "../admin-display";
import { EmployeeDetail, NewEmployeeDialog } from "../admin-employee-dialogs";
import { useAdminInteraction } from "../admin-interaction";
import { EmptyState, PageHeading } from "../admin-page-parts";

export function EmployeesPage({
  data,
  currentEmployeeId,
  onReload,
}: {
  data: AdminWorkspaceData;
  currentEmployeeId: string;
  onReload: () => Promise<void>;
}) {
  const interaction = useAdminInteraction();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(
    data.employees[0]?.employeeId ?? "",
  );
  const [creating, setCreating] = useState(false);
  const employees = useMemo(
    () =>
      data.employees.filter((employee) =>
        `${employee.displayName} ${employee.employeeId}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [data.employees, query],
  );
  const selected =
    employees.find((employee) => employee.employeeId === selectedId) ??
    employees[0] ??
    null;
  return (
    <section className="admin-page" aria-labelledby="employees-title">
      <PageHeading
        title="직원 관리"
        description="직원 역할, 일회성 PIN, 계정 상태와 세션을 한곳에서 관리합니다."
        action={
          <GlassButton
            variant="primary"
            compact
            onClick={() => { if (interaction.canNavigate()) setCreating(true); }}
          >
            <Icon name="user" size={17} /> 새 직원
          </GlassButton>
        }
      />
      <div className="employee-master-detail">
        <div className="employee-master">
          <div className="admin-toolbar">
            <label className="admin-search">
              <Icon name="search" size={17} />
              <input
                {...searchInputProps}
                name="employee-query"
                aria-label="직원 검색"
                value={query}
                onChange={(event) => { if (interaction.canNavigate()) setQuery(event.target.value); }}
                placeholder="이름 또는 직원 ID"
              />
            </label>
          </div>
          <div className="employee-list" role="group" aria-label="직원 목록">
            {employees.map((employee) => (
              <button
                type="button"
                aria-pressed={selected?.employeeId === employee.employeeId}
                data-active={selected?.employeeId === employee.employeeId}
                key={employee.employeeId}
                onClick={() => { if (interaction.canNavigate()) setSelectedId(employee.employeeId); }}
              >
                <span className="employee-list__avatar">
                  {initials(employee.displayName)}
                </span>
                <span>
                  <strong>{employee.displayName}</strong>
                  <small>
                    {employee.roleScopes
                      .map((role) => ROLE_LABELS[role])
                      .join(" · ")}
                  </small>
                </span>
                <StatusBadge
                  tone={employee.status === "active" ? "success" : "neutral"}
                >
                  {employee.status === "active" ? "활성" : "비활성"}
                </StatusBadge>
                <Icon name="chevron-right" size={17} />
              </button>
            ))}
          </div>
        </div>
        {selected ? (
          <EmployeeDetail
            key={selected.employeeId}
            employee={selected}
            currentEmployeeId={currentEmployeeId}
            onReload={onReload}
          />
        ) : (
          <EmptyState
            icon="user"
            title="직원을 선택해주세요."
            description="목록에서 직원을 선택하면 상세 권한을 확인할 수 있습니다."
          />
        )}
      </div>
      {creating ? (
        <NewEmployeeDialog
          onClose={() => setCreating(false)}
          onCreated={onReload}
        />
      ) : null}
    </section>
  );
}
