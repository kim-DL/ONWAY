"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";

import type { AdminEmployee, AdminRole, PinReservation } from "./admin-contract";
import { AdminDialog } from "./admin-dialog";
import { initials, ROLE_LABELS } from "./admin-display";
import { useAdminInteraction } from "./admin-interaction";
import { adminErrorMessage, adminRepository } from "./admin-repository";

function RoleChecks({
  roles,
  disabledAdmin = true,
  disabled = false,
  onChange,
}: {
  roles: AdminRole[];
  disabledAdmin?: boolean;
  disabled?: boolean;
  onChange: (roles: AdminRole[]) => void;
}) {
  return (
    <fieldset className="admin-role-checks" disabled={disabled}>
      <legend>업무 역할</legend>
      {(["delivery", "sales", "viewer", "admin"] as const).map((role) => (
        <label key={role} data-disabled={role === "admin" && disabledAdmin}>
          <input
            type="checkbox"
            checked={roles.includes(role)}
            disabled={role === "admin" && disabledAdmin}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...roles, role]
                  : roles.filter((item) => item !== role),
              )
            }
          />
          <span aria-hidden="true">
            <Icon name="check" size={14} />
          </span>
          <strong>{ROLE_LABELS[role]}</strong>
        </label>
      ))}
    </fieldset>
  );
}

function PinReveal({
  pin,
  title = "발급된 PIN",
}: {
  pin: string;
  title?: string;
}) {
  const { showToast } = useToast();
  const copy = async () => {
    await navigator.clipboard.writeText(pin);
    showToast("PIN을 클립보드에 복사했습니다.");
  };
  return (
    <div className="admin-pin-reveal" role="status">
      <div>
        <small>{title} · 한 번만 표시</small>
        <strong aria-label={`PIN ${pin.split("").join(" ")}`}>{pin}</strong>
      </div>
      <button type="button" onClick={() => void copy()}>
        <Icon name="copy" size={17} /> 복사
      </button>
      <p>
        안전한 경로로 직원에게 전달하고 이 창을 닫아주세요. 서버에는 PIN 원문을
        저장하지 않습니다.
      </p>
    </div>
  );
}

export function NewEmployeeDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const interaction = useAdminInteraction();
  const [displayName, setDisplayName] = useState("");
  const [roles, setRoles] = useState<AdminRole[]>(["delivery"]);
  const [exportTeam, setExportTeam] = useState(false);
  const [reservation, setReservation] = useState<PinReservation | null>(null);
  const [status, setStatus] = useState<"idle" | "pin" | "saving" | "done">(
    "idle",
  );
  const creationPending = useRef(false);
  const close = () => {
    if (!creationPending.current) onClose();
  };

  const reserve = async () => {
    setStatus("pin");
    try {
      setReservation(await adminRepository.reservePin());
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      setStatus("idle");
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (creationPending.current || !reservation || displayName.trim().length < 2 || roles.length === 0)
      return;
    const release = interaction.begin();
    if (!release) return;
    creationPending.current = true;
    setStatus("saving");
    try {
      await adminRepository.createEmployee({
        reservationId: reservation.reservationId,
        displayName: displayName.trim(),
        roleScopes: roles,
        exportTeam,
      });
      await onCreated();
      setStatus("done");
      showToast(`${displayName.trim()} 직원을 등록했습니다.`);
    } catch (error) {
      showToast(adminErrorMessage(error));
      setStatus("idle");
    } finally {
      creationPending.current = false;
      release();
    }
  };

  return (
    <AdminDialog
      title={status === "done" ? "직원 등록 완료" : "새 직원 등록"}
      eyebrow=""
      onClose={close}
      busy={status === "saving"}
    >
      {status === "done" && reservation ? (
        <div className="admin-dialog-body">
          <PinReveal
            pin={reservation.pin}
            title={`${displayName.trim()} 직원 PIN`}
          />
          <GlassButton variant="primary" onClick={close}>
            확인하고 닫기
          </GlassButton>
        </div>
      ) : (
        <form
          className="admin-dialog-body admin-form"
          onSubmit={(event) => void submit(event)}
        >
          <label>
            <span>직원 이름</span>
            <input
              autoFocus
              value={displayName}
              maxLength={100}
              disabled={status === "saving"}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="예: 김온누리"
            />
          </label>
          <RoleChecks roles={roles} onChange={setRoles} disabled={status === "saving"} />
          <label className="admin-switch-row">
            <span>
              <strong>팀 CSV 내보내기</strong>
              <small>영업 팀 전체 기록을 내보낼 수 있습니다.</small>
            </span>
            <input
              type="checkbox"
              checked={exportTeam}
              disabled={status === "saving"}
              onChange={(event) => setExportTeam(event.target.checked)}
            />
          </label>
          <div className="admin-pin-step">
            <div>
              <span>로그인 PIN</span>
              <small>암호학적 난수로 만들고 10분간 등록을 예약합니다.</small>
            </div>
            {reservation ? (
              <PinReveal pin={reservation.pin} title="사용 가능한 PIN" />
            ) : (
              <button
                type="button"
                disabled={status === "pin"}
                onClick={() => void reserve()}
              >
                <Icon name="sparkles" size={17} />
                {status === "pin" ? "안전한 PIN 생성 중…" : "무작위 PIN 생성"}
              </button>
            )}
          </div>
          <footer>
            <GlassButton variant="quiet" type="button" disabled={status === "saving"} onClick={close}>
              취소
            </GlassButton>
            <GlassButton
              variant="primary"
              type="submit"
              disabled={
                !reservation ||
                roles.length === 0 ||
                displayName.trim().length < 2 ||
                status === "saving"
              }
            >
              {status === "saving" ? "등록 중…" : "직원 등록"}
            </GlassButton>
          </footer>
        </form>
      )}
    </AdminDialog>
  );
}

export function EmployeeDetail({
  employee,
  currentEmployeeId,
  onReload,
}: {
  employee: AdminEmployee;
  currentEmployeeId: string;
  onReload: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const interaction = useAdminInteraction();
  const [displayName, setDisplayName] = useState(employee.displayName);
  const [roles, setRoles] = useState<AdminRole[]>(employee.roleScopes);
  const [exportTeam, setExportTeam] = useState(employee.exportTeam);
  const [status, setStatus] = useState(employee.status);
  const [reason, setReason] = useState("정기 직원 정보 정비");
  const [revokeOnSave, setRevokeOnSave] = useState(false);
  const [working, setWorking] = useState(false);
  const [rotatedPin, setRotatedPin] = useState<string | null>(null);
  const pinRelease = useRef<(() => void) | null>(null);
  const employeePending = useRef(false);
  const [securityAction, setSecurityAction] = useState<"pin" | "sessions" | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pinRelease.current?.();
      pinRelease.current = null;
    };
  }, []);

  const closeSecurity = async () => {
    if (!mounted.current || employeePending.current) return;
    const release = pinRelease.current;
    if (!release) {
      setRotatedPin(null);
      setSecurityAction(null);
      return;
    }
    // Refresh only after the user has acknowledged the one-time PIN. A renamed
    // employee can disappear from the current search results during this load.
    employeePending.current = true;
    setWorking(true);
    try {
      await onReload();
    } catch (error) {
      if (mounted.current) showToast(adminErrorMessage(error));
    } finally {
      pinRelease.current = null;
      employeePending.current = false;
      if (mounted.current) {
        setRotatedPin(null);
        setSecurityAction(null);
        setWorking(false);
      }
      release();
    }
  };

  const perform = async (action: () => Promise<unknown>, success: string) => {
    const release = interaction.begin();
    if (!release) return;
    employeePending.current = true;
    setWorking(true);
    try {
      await action();
      await onReload();
      showToast(success);
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      setWorking(false);
      employeePending.current = false;
      release();
    }
  };

  const save = () =>
    perform(
      () =>
        adminRepository.updateEmployee({
          employeeId: employee.employeeId,
          displayName: displayName.trim(),
          roleScopes: roles,
          exportTeam,
          status,
          revokeSessions: revokeOnSave,
          reason,
        }),
      "직원 정보와 권한을 반영했습니다.",
    );
  const rotate = async () => {
    const release = interaction.begin();
    if (!release) return;
    pinRelease.current = release;
    employeePending.current = true;
    setWorking(true);
    try {
      const result = await adminRepository.rotatePin({
        employeeId: employee.employeeId,
        revokeSessions: true,
        reason: reason || "관리자 PIN 재발급",
      });
      if (!mounted.current) return;
      setRotatedPin(result.pin);
      showToast("새 PIN을 발급하고 기존 세션을 종료했습니다.");
    } catch (error) {
      release();
      pinRelease.current = null;
      if (mounted.current) showToast(adminErrorMessage(error));
    } finally {
      if (mounted.current) setWorking(false);
      employeePending.current = false;
    }
  };

  const isAdmin = employee.roleScopes.includes("admin");
  const isSelf = employee.employeeId === currentEmployeeId;

  return (
    <aside
      className="employee-detail"
      aria-label={`${employee.displayName} 직원 상세`}
    >
      <header>
        <span className="employee-detail__avatar">
          {initials(employee.displayName)}
        </span>
        <div>
          <StatusBadge
            tone={employee.status === "active" ? "success" : "neutral"}
          >
            {employee.status === "active" ? "활성" : "비활성"}
          </StatusBadge>
          <h2>{employee.displayName}</h2>
          <p>{employee.employeeId}</p>
        </div>
      </header>
      {securityAction ? (
        <AdminDialog title={securityAction === "pin" ? (rotatedPin ? "새 PIN을 확인해주세요." : "PIN을 재발급할까요?") : "기존 로그인을 종료할까요?"} eyebrow="" busy={working} onClose={() => void closeSecurity()}>
          <div className="admin-dialog-body">
            {rotatedPin ? <PinReveal pin={rotatedPin} title={`${employee.displayName} 직원 PIN`} /> :
              <p>{employee.displayName} 직원의 {securityAction === "pin" ? "기존 PIN과 모든 로그인 세션이 종료됩니다. 새 PIN은 이 창에서 한 번만 표시됩니다." : "모든 기존 로그인 세션을 종료합니다. 다시 로그인하면 업무를 이어갈 수 있습니다."}</p>}
            <footer>
              <GlassButton variant="quiet" disabled={working} onClick={() => void closeSecurity()}>{rotatedPin ? "확인하고 닫기" : "취소"}</GlassButton>
              {!rotatedPin ? <GlassButton variant="primary" disabled={working} onClick={() => {
                if (securityAction === "pin") void rotate();
                else void perform(() => adminRepository.revokeSessions({
                  employeeId: employee.employeeId,
                  reason: reason || "관리자 세션 종료",
                }), "모든 기존 세션을 종료했습니다.").then(() => setSecurityAction(null));
              }}>{working ? "처리 중…" : securityAction === "pin" ? "PIN 재발급" : "세션 종료"}</GlassButton> : null}
            </footer>
          </div>
        </AdminDialog>
      ) : null}
      <fieldset className="employee-detail__form" disabled={working} aria-label="직원 정보 수정">
        <label>
          <span>직원 이름</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <RoleChecks roles={roles} disabledAdmin onChange={setRoles} />
        <p className="admin-field-help">
          관리자 역할은 Google 서버 허용목록 절차로만 부여하거나 해제합니다.
        </p>
        <label className="admin-switch-row">
          <span>
            <strong>팀 CSV 내보내기</strong>
            <small>팀 범위 자료 생성 권한</small>
          </span>
          <input
            type="checkbox"
            checked={exportTeam}
            onChange={(event) => setExportTeam(event.target.checked)}
          />
        </label>
        <label className="admin-switch-row">
          <span>
            <strong>계정 활성 상태</strong>
            <small>비활성화하면 다음 권한 확인에서 접근이 차단됩니다.</small>
          </span>
          <input
            type="checkbox"
            checked={status === "active"}
            disabled={isSelf}
            onChange={(event) =>
              setStatus(event.target.checked ? "active" : "disabled")
            }
          />
        </label>
        <label>
          <span>변경 사유</span>
          <input
            value={reason}
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <label className="admin-check-row">
          <input
            type="checkbox"
            checked={revokeOnSave}
            onChange={(event) => setRevokeOnSave(event.target.checked)}
          />
          <span aria-hidden="true">
            <Icon name="check" size={14} />
          </span>
          <strong>저장과 함께 기존 로그인 세션 종료</strong>
        </label>
        <GlassButton
          variant="primary"
          disabled={
            working ||
            roles.length === 0 ||
            displayName.trim().length < 2 ||
            reason.trim().length < 2
          }
          onClick={() => void save()}
        >
          {working ? "반영 중…" : "변경사항 저장"}
        </GlassButton>
      </fieldset>
      <div className="employee-security-actions">
        <h3>인증 보안</h3>
        <p>
          PIN은 새 값만 한 번 표시되며, 기존 값은 즉시 사용할 수 없게 됩니다.
        </p>
        <button
          type="button"
          disabled={working || isAdmin}
          onClick={() => { if (interaction.canNavigate()) setSecurityAction("pin"); }}
        >
          <Icon name="refresh" size={17} />
          <span>
            <strong>PIN 재발급</strong>
            <small>
              {isAdmin
                ? "관리자는 Google 로그인 사용"
                : "기존 세션도 함께 종료"}
            </small>
          </span>
          <Icon name="chevron-right" size={17} />
        </button>
        <button
          type="button"
          disabled={working || isSelf}
          onClick={() => { if (interaction.canNavigate()) setSecurityAction("sessions"); }}
        >
          <Icon name="logout" size={17} />
          <span>
            <strong>모든 세션 종료</strong>
            <small>
              {isSelf
                ? "현재 계정은 직접 로그아웃"
                : `현재 버전 ${employee.sessionVersion}`}
            </small>
          </span>
          <Icon name="chevron-right" size={17} />
        </button>
      </div>
    </aside>
  );
}
