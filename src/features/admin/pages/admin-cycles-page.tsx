"use client";

import { useState } from "react";

import { SchoolAssignmentPicker } from "@/components/assignment/school-assignment-picker";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";

import type { AdminAssignment, AdminEmployee, AdminSchool, AdminWorkspaceData } from "../admin-contract";
import {
  CYCLE_STATUS_LABELS,
  cycleDisplayLabel,
  DISTRICT_LABELS,
  MONTHLY_STATUS_LABELS,
  suggestedCycleId,
} from "../admin-display";
import { useAdminInteraction } from "../admin-interaction";
import { EmptyState, PageHeading } from "../admin-page-parts";
import { adminErrorMessage, adminRepository } from "../admin-repository";

function AssignmentRow({
  assignment,
  school,
  employees,
  cycleId,
  onReload,
  selected,
  onSelect,
}: {
  assignment: AdminAssignment;
  school: AdminSchool | undefined;
  employees: AdminEmployee[];
  cycleId: string;
  onReload: () => Promise<void>;
  selected: boolean;
  onSelect: (schoolId: string, selected: boolean) => void;
}) {
  const { showToast } = useToast();
  const interaction = useAdminInteraction();
  const [assigneeId, setAssigneeId] = useState(assignment.primaryAssigneeId);
  const [saving, setSaving] = useState(false);
  const dirty = assigneeId !== assignment.primaryAssigneeId;
  const save = async () => {
    const release = interaction.begin();
    if (!release) return;
    setSaving(true);
    try {
      await adminRepository.changeAssignment({
        cycleId,
        schoolId: assignment.schoolId,
        expectedRevision: assignment.revision,
        zoneId: assignment.zoneId,
        primaryAssigneeId: assigneeId,
        reason: "관리자 월별 학교 담당 변경",
      });
      await onReload();
      showToast(`${school?.name ?? assignment.schoolId} 배정을 변경했습니다.`);
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      release();
      setSaving(false);
    }
  };
  return (
    <tr>
      <td>
        <label className="assignment-table__school-select">
          <input
            type="checkbox"
            checked={selected}
            disabled={saving || assignment.monthlyStatus !== "before"}
            onChange={(event) => onSelect(assignment.schoolId, event.target.checked)}
            aria-label={`${school?.name ?? assignment.schoolId} 배정 제외 선택`}
          />
          <span aria-hidden="true"><Icon name="check" size={13} /></span>
          <span>
            <strong>{school?.name ?? assignment.schoolId}</strong>
            <small>{DISTRICT_LABELS[school?.district ?? ""] ?? school?.district}</small>
          </span>
        </label>
      </td>
      <td>
        <select
          aria-label={`${school?.name ?? assignment.schoolId} 담당자`}
          value={assigneeId}
          disabled={saving}
          onChange={(event) => setAssigneeId(event.target.value)}
        >
          {employees
            .filter(
              (employee) =>
                employee.status === "active" &&
                employee.roleScopes.includes("sales"),
            )
            .map((employee) => (
              <option key={employee.employeeId} value={employee.employeeId}>
                {employee.displayName}
              </option>
            ))}
        </select>
      </td>
      <td>
        <StatusBadge
          tone={
            assignment.monthlyStatus === "completed"
              ? "success"
              : assignment.monthlyStatus === "followUp"
                ? "attention"
                : "neutral"
          }
        >
          {MONTHLY_STATUS_LABELS[assignment.monthlyStatus] ??
            assignment.monthlyStatus}
        </StatusBadge>
      </td>
      <td>
        <button
          className="admin-inline-save"
          type="button"
          disabled={!dirty || saving}
          aria-label={
            !dirty ? `최신 상태, Revision ${assignment.revision}` : undefined
          }
          onClick={() => void save()}
        >
          {saving
            ? "저장 중"
            : dirty
              ? "변경 저장"
              : `최신 · r${assignment.revision}`}
        </button>
      </td>
    </tr>
  );
}

export function CyclesPage({
  data,
  onLoadCycle,
}: {
  data: AdminWorkspaceData;
  onLoadCycle: (cycleId: string | null) => Promise<void>;
}) {
  const { showToast } = useToast();
  const interaction = useAdminInteraction();
  const [cycleId, setCycleId] = useState(() => suggestedCycleId(data.cycles));
  const [copyFrom, setCopyFrom] = useState(data.selectedCycleId ?? "");
  const [activate, setActivate] = useState(true);
  const [creating, setCreating] = useState(false);
  const selectedCycle = data.cycles.find((cycle) => cycle.cycleId === data.selectedCycleId) ?? null;
  const [promotedProductNames, setPromotedProductNames] = useState<string[]>(selectedCycle?.promotedProductNames ?? []);
  const [newProductName, setNewProductName] = useState("");
  const [savingProducts, setSavingProducts] = useState(false);
  const [selectedAssignments, setSelectedAssignments] = useState<Set<string>>(() => new Set());
  const salesEmployees = data.employees.filter(
    (employee) =>
      employee.status === "active" && employee.roleScopes.includes("sales"),
  );
  const [assigneeId, setAssigneeId] = useState(
    salesEmployees[0]?.employeeId ?? "",
  );
  const assignedIds = new Set(
    data.assignments.map((assignment) => assignment.schoolId),
  );
  const availableSchools = data.schools.filter(
    (school) => !assignedIds.has(school.schoolId),
  );
  const schools = new Map(
    data.schools.map((school) => [school.schoolId, school]),
  );

  const addPromotedProduct = () => {
    const name = newProductName.trim();
    if (!name) return;
    if (promotedProductNames.length >= 12) {
      showToast("홍보 제품은 월별 최대 12개까지 등록할 수 있습니다.");
      return;
    }
    if (promotedProductNames.some((candidate) => candidate.localeCompare(name, "ko", { sensitivity: "accent" }) === 0)) {
      showToast("이미 등록된 제품명입니다.");
      return;
    }
    setPromotedProductNames((current) => [...current, name]);
    setNewProductName("");
  };

  const savePromotedProducts = async () => {
    if (!data.selectedCycleId) return;
    const normalizedProductNames = promotedProductNames.map((name) => name.trim());
    const uniqueNames = new Set(normalizedProductNames.map((name) => name.toLocaleLowerCase("ko-KR")));
    if (uniqueNames.size !== normalizedProductNames.length) {
      showToast("같은 제품명이 두 번 들어가 있습니다. 중복 항목을 정리해주세요.");
      return;
    }
    const release = interaction.begin();
    if (!release) return;
    setSavingProducts(true);
    try {
      await adminRepository.updateCycleProducts({
        cycleId: data.selectedCycleId,
        productNames: normalizedProductNames,
      });
      setPromotedProductNames(normalizedProductNames);
      await onLoadCycle(data.selectedCycleId);
      showToast(`${normalizedProductNames.length}개 홍보 제품을 이번 달 목록으로 저장했습니다.`, "success");
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      release();
      setSavingProducts(false);
    }
  };

  const createCycle = async () => {
    const release = interaction.begin();
    if (!release) return;
    setCreating(true);
    try {
      await adminRepository.createCycle({
        cycleId,
        copiedFromCycleId: copyFrom || null,
        activate,
      });
      await onLoadCycle(cycleId);
      showToast(`${cycleId} Cycle을 만들었습니다.`);
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      release();
      setCreating(false);
    }
  };
  const addAssignments = async (schoolIds: string[]) => {
    if (!data.selectedCycleId) {
      showToast("먼저 이번 달 배정을 시작해주세요.");
      return false;
    }
    if (!assigneeId) {
      showToast("배정할 영업 직원을 먼저 등록하거나 활성화해주세요.");
      return false;
    }
    if (schoolIds.length === 0) {
      showToast("배정할 학교를 한 곳 이상 선택해주세요.");
      return false;
    }
    const release = interaction.begin();
    if (!release) return false;
    setCreating(true);
    try {
      await adminRepository.createAssignments({
        cycleId: data.selectedCycleId,
        schoolIds,
        primaryAssigneeId: assigneeId,
      });
      await onLoadCycle(data.selectedCycleId);
      showToast(`${schoolIds.length}개 학교를 한 번에 배정했습니다.`, "success");
      return true;
    } catch (error) {
      showToast(adminErrorMessage(error));
      await onLoadCycle(data.selectedCycleId);
      return false;
    } finally {
      release();
      setCreating(false);
    }
  };
  const removeAssignments = async () => {
    if (!data.selectedCycleId || selectedAssignments.size === 0) return;
    const release = interaction.begin();
    if (!release) return;
    setCreating(true);
    try {
      const schoolIds = [...selectedAssignments];
      await adminRepository.releaseAssignments({
        cycleId: data.selectedCycleId,
        schoolIds,
        reason: "관리자 월별 미착수 학교 배정 정리",
      });
      setSelectedAssignments(new Set());
      await onLoadCycle(data.selectedCycleId);
      showToast(`${schoolIds.length}개 학교 배정을 제외했습니다.`, "success");
    } catch (error) {
      showToast(adminErrorMessage(error));
      await onLoadCycle(data.selectedCycleId);
    } finally {
      release();
      setCreating(false);
    }
  };
  const selectAssignment = (schoolId: string, selected: boolean) => {
    setSelectedAssignments((current) => {
      const next = new Set(current);
      if (selected) next.add(schoolId);
      else next.delete(schoolId);
      return next;
    });
  };

  const activeCycleStatus = selectedCycle?.status;

  return (
    <section className="admin-page" aria-labelledby="cycles-title">
      <PageHeading
        title="월별 학교 배정"
        description="전월 담당 학교를 복사한 뒤 필요한 학교만 더하고 빼며 직원별 담당을 확정합니다."
      />
      <fieldset className="admin-controls" disabled={creating || savingProducts} aria-label="월별 배정 설정">
      <div className="cycle-command-grid">
        <article className="admin-panel">
          <header>
            <div>
              <h2>새 월 시작</h2>
            </div>
          </header>
          <div className="cycle-create-form">
            <label>
              <span>대상 월</span>
              <input
                type="month"
                value={cycleId}
                onChange={(event) => setCycleId(event.target.value)}
              />
            </label>
            <label>
              <span>기준 월 배정 복사</span>
              <select
                value={copyFrom}
                onChange={(event) => setCopyFrom(event.target.value)}
              >
                <option value="">복사하지 않음</option>
                {data.cycles.map((cycle) => (
                  <option key={cycle.cycleId} value={cycle.cycleId}>
                    {cycle.cycleId}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-check-row">
              <input
                type="checkbox"
                checked={activate}
                onChange={(event) => setActivate(event.target.checked)}
              />
              <span aria-hidden="true">
                <Icon name="check" size={14} />
              </span>
              <strong>생성 후 운영 월로 적용</strong>
            </label>
            <GlassButton
              variant="primary"
              disabled={!/^\d{4}-\d{2}$/u.test(cycleId) || creating}
              onClick={() => void createCycle()}
            >
              {creating ? "생성 중…" : "새 월 만들기"}
            </GlassButton>
          </div>
        </article>
        <article className="admin-panel cycle-summary">
          <header>
            <div>
              <h2>{data.selectedCycleId ?? "선택된 Cycle 없음"}</h2>
            </div>
            <StatusBadge
              tone={activeCycleStatus === "active" ? "success" : "neutral"}
            >
              {activeCycleStatus
                ? (CYCLE_STATUS_LABELS[activeCycleStatus] ?? activeCycleStatus)
                : "없음"}
            </StatusBadge>
          </header>
          <strong>
            {data.assignments.length}
            <small>개 학교</small>
          </strong>
          <div>
            {salesEmployees.map((employee) => (
                <span key={employee.employeeId}>
                  <i />
                  {employee.displayName}{" "}
                  {data.assignments.filter((assignment) => assignment.assigneeIds.includes(employee.employeeId)).length}
                </span>
              ))}
          </div>
        </article>
      </div>
      <article className="admin-panel campaign-product-admin" aria-labelledby="campaign-products-title">
        <header>
          <div>
            <h2 id="campaign-products-title">홍보 제품 목록</h2>
          </div>
          <StatusBadge tone={promotedProductNames.length >= 5 ? "success" : "neutral"}>
            {promotedProductNames.length} / 12
          </StatusBadge>
        </header>
        <p className="campaign-product-admin__description">
          현장 직원은 방문 기록에서 이 목록을 탭해 여러 제품을 빠르게 선택하고, 목록에 없는 제품은 직접 입력할 수 있습니다.
        </p>
        <div className="campaign-product-admin__list" aria-live="polite">
          {promotedProductNames.map((name, index) => (
            <div key={index}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <input
                aria-label={`${index + 1}번째 홍보 제품명`}
                value={name}
                maxLength={120}
                onChange={(event) => setPromotedProductNames((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? event.target.value : candidate))}
              />
              <button type="button" aria-label={`${name || `${index + 1}번째 제품`} 삭제`} onClick={() => setPromotedProductNames((current) => current.filter((_, candidateIndex) => candidateIndex !== index))}>
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
          {promotedProductNames.length === 0 ? <p>아직 등록된 제품이 없습니다. 아래에서 이번 달 제품을 추가해주세요.</p> : null}
        </div>
        <div className="campaign-product-admin__add">
          <label>
            <span>제품 추가</span>
            <input
              value={newProductName}
              maxLength={120}
              placeholder="예: 우리밀 바삭 핫도그"
              onChange={(event) => setNewProductName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addPromotedProduct();
                }
              }}
            />
          </label>
          <GlassButton disabled={!newProductName.trim() || promotedProductNames.length >= 12} onClick={addPromotedProduct}>목록에 추가</GlassButton>
          <GlassButton
            variant="primary"
            disabled={!data.selectedCycleId || savingProducts || promotedProductNames.some((name) => !name.trim())}
            onClick={() => void savePromotedProducts()}
          >
            {savingProducts ? "저장 중…" : "이번 달 목록 저장"}
          </GlassButton>
        </div>
      </article>
      <div className="admin-panel assignment-panel">
        <header>
          <div>
            <h2>학교별 배정</h2>
          </div>
          <select
            aria-label="조회 Cycle"
            value={data.selectedCycleId ?? ""}
            onChange={(event) => { if (interaction.canNavigate()) void onLoadCycle(event.target.value || null); }}
          >
            {data.cycles.length === 0 ? <option value="">아직 시작된 월이 없습니다</option> : null}
            {data.cycles.map((cycle) => (
              <option key={cycle.cycleId} value={cycle.cycleId}>
                {cycle.cycleId} ·{" "}
                {CYCLE_STATUS_LABELS[cycle.status] ?? cycle.status}
              </option>
            ))}
          </select>
        </header>
        <div className="assignment-bulk-command">
          <div className="assignment-bulk-command__heading">
            <div>
              <h3>미배정 학교를 한 번에 연결</h3>
              <span>검색 결과 전체 선택과 선택 바구니로 300개 이상도 한 번에 처리합니다.</span>
            </div>
            <strong>{availableSchools.length}<small>곳 미배정</small></strong>
          </div>
          {!data.selectedCycleId ? (
            <div className="assignment-readiness" role="status">
              <span className="assignment-readiness__step">먼저 할 일</span>
              <span className="assignment-readiness__icon"><Icon name="calendar" size={24} /></span>
              <div>
                <h3>{cycleDisplayLabel(cycleId)} 배정을 시작하세요.</h3>
                <p>최초 월을 시작하면 운영 설정도 함께 안전하게 생성되고, 곧바로 담당자와 학교를 다중 선택할 수 있습니다.</p>
              </div>
              <GlassButton
                variant="primary"
                disabled={!/^\d{4}-\d{2}$/u.test(cycleId) || creating}
                onClick={() => void createCycle()}
              >
                {creating ? "준비 중…" : `${cycleDisplayLabel(cycleId)} 배정 시작`}
              </GlassButton>
            </div>
          ) : salesEmployees.length === 0 ? (
            <div className="assignment-readiness" role="alert">
              <span className="assignment-readiness__step">직원 필요</span>
              <span className="assignment-readiness__icon"><Icon name="user" size={24} /></span>
              <div>
                <h3>활성 영업 직원을 먼저 등록해주세요.</h3>
                <p>직원 관리에서 영업 권한을 가진 직원을 만든 뒤 이 화면으로 돌아오면 담당자 선택이 활성화됩니다.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="assignment-bulk-command__owners assignment-bulk-command__owners--direct">
                <label>
                  <span>배정할 담당자</span>
                  <select
                    value={assigneeId}
                    onChange={(event) => setAssigneeId(event.target.value)}
                  >
                    {salesEmployees.map((employee) => (
                      <option key={employee.employeeId} value={employee.employeeId}>
                        {employee.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <p><Icon name="user" size={16} />학교를 여러 곳 고른 뒤 한 명의 담당자에게 한 번에 연결합니다. 직원도 미배정 학교를 직접 가져올 수 있습니다.</p>
              </div>
              <SchoolAssignmentPicker
                key={`${data.selectedCycleId}-${data.assignments.length}`}
                candidates={availableSchools.map((school) => ({
                  schoolId: school.schoolId,
                  name: school.name,
                  district: school.district,
                  schoolType: school.schoolType,
                  address: school.roadAddress,
                }))}
                busy={creating}
                actionLabel={(count) => `${count}곳 · ${salesEmployees.find((employee) => employee.employeeId === assigneeId)?.displayName ?? "담당자"}에게 배정`}
                onSubmit={addAssignments}
              />
            </>
          )}
        </div>
        {selectedAssignments.size > 0 ? (
          <div className="admin-assignment-batch" role="region" aria-label="선택한 학교 배정 작업">
            <span><strong>{selectedAssignments.size}</strong>곳 선택</span>
            <button type="button" onClick={() => setSelectedAssignments(new Set())}>선택 해제</button>
            <button type="button" disabled={creating} onClick={() => void removeAssignments()}>{creating ? "확인 중…" : "미착수 배정 제외"}</button>
          </div>
        ) : null}
        <div className="admin-table-wrap">
          <table className="admin-table assignment-table">
            <thead>
              <tr>
                <th>학교</th>
                <th>주 담당자</th>
                <th>진행 상태</th>
                <th>저장</th>
              </tr>
            </thead>
            <tbody>
              {data.assignments.map((assignment) => (
                <AssignmentRow
                  key={assignment.schoolId}
                  assignment={assignment}
                  school={schools.get(assignment.schoolId)}
                  employees={data.employees}
                  cycleId={data.selectedCycleId ?? ""}
                  onReload={() => onLoadCycle(data.selectedCycleId)}
                  selected={selectedAssignments.has(assignment.schoolId)}
                  onSelect={selectAssignment}
                />
              ))}
            </tbody>
          </table>
          {data.assignments.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="아직 배정이 없습니다."
              description="위 입력란에서 담당자와 학교를 선택해 한 번에 추가하세요."
            />
          ) : null}
        </div>
      </div>
      </fieldset>
    </section>
  );
}
