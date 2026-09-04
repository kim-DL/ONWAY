"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { GlassButton } from "@/components/ui/glass-button";
import { AppIconMark } from "@/components/ui/app-icon-mark";
import { Icon, type IconName } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { useToast } from "@/components/ui/toast";
import { SchoolAssignmentPicker } from "@/components/assignment/school-assignment-picker";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { useAuth } from "@/features/auth/auth-context";
import { SalesExportWorkspace } from "@/features/export/sales-export-workspace";
import {
  type AdminAssignment,
  type AdminActivityTag,
  type AdminAudit,
  type AdminEmployee,
  type AdminRole,
  type AdminSchool,
  type AdminWorkspaceData,
  type KakaoReview,
  type NeisPreview,
  type PinReservation,
} from "./admin-contract";
import { adminErrorMessage, adminRepository } from "./admin-repository";

type AdminView =
  | "overview"
  | "schools"
  | "employees"
  | "cycles"
  | "sync"
  | "export"
  | "audit"
  | "settings";

const NAVIGATION: readonly {
  id: AdminView;
  label: string;
  hint: string;
  icon: IconName;
}[] = [
  { id: "overview", label: "운영 개요", hint: "오늘의 상태", icon: "home" },
  {
    id: "schools",
    label: "학교 관리",
    hint: "기준정보·위치",
    icon: "building",
  },
  { id: "employees", label: "직원 관리", hint: "PIN·권한·세션", icon: "user" },
  { id: "cycles", label: "학교 배정", hint: "월별 담당·복사", icon: "calendar" },
  { id: "sync", label: "데이터 동기화", hint: "NEIS·Kakao", icon: "refresh" },
  { id: "export", label: "CSV", hint: "안전한 내보내기", icon: "download" },
  { id: "audit", label: "감사 기록", hint: "변경 추적", icon: "clipboard" },
  { id: "settings", label: "설정", hint: "앱 운영 정책", icon: "settings" },
] as const;

const ROLE_LABELS: Record<AdminRole, string> = {
  delivery: "납품",
  sales: "영업",
  viewer: "조회",
  admin: "관리자",
};

const DISTRICT_LABELS: Record<string, string> = {
  dong: "동구",
  jung: "중구",
  seo: "서구",
  yuseong: "유성구",
  daedeok: "대덕구",
};

const SCHOOL_TYPE_LABELS: Record<string, string> = {
  elementary: "초등학교",
  middle: "중학교",
  high: "고등학교",
  special: "특수학교",
  other: "기타",
};

const CHANGE_LABELS: Record<string, string> = {
  NEW: "신규",
  NAME_CHANGED: "교명 변경",
  ADDRESS_CHANGED: "주소 변경",
  PHONE_CHANGED: "전화 변경",
  HOMEPAGE_CHANGED: "홈페이지 변경",
  TYPE_CHANGED: "학교급 변경",
  MISSING: "원천 누락",
};

const MONTHLY_STATUS_LABELS: Record<string, string> = {
  before: "방문 전",
  completed: "방문 완료",
  followUp: "후속 필요",
  revisit: "재방문",
  onHold: "보류",
};

const CYCLE_STATUS_LABELS: Record<string, string> = {
  draft: "준비 중",
  active: "운영 중",
  closed: "종료",
};

const SYNC_STATUS_LABELS: Record<string, string> = {
  PREVIEWED: "미리보기 완료",
  APPLYING: "적용 중",
  COMPLETED: "적용 완료",
  FAILED: "실패",
  SUSPICIOUS_RESULT: "안전 검토 필요",
};

const KAKAO_STATUS_LABELS: Record<string, string> = {
  unmatched: "후보 조회 필요",
  autoMatched: "자동 확인",
  needsReview: "관리자 검토 필요",
  confirmed: "관리자 확정",
  failed: "후보 없음",
};

const AUDIT_EVENT_LABELS: Record<string, string> = {
  ADMIN_SESSION_ACTIVATED: "관리자 세션 승인",
  APP_SETTINGS_UPDATED: "앱 운영 설정 변경",
  ACTIVITY_TAGS_UPDATED: "영업 활동 태그 변경",
  EMPLOYEE_CREATED: "직원 등록",
  EMPLOYEE_PIN_ROTATED: "직원 PIN 재발급",
  EMPLOYEE_SESSIONS_REVOKED: "직원 세션 종료",
  EMPLOYEE_UPDATED: "직원 정보 변경",
  CSV_EXPORTED: "CSV 내보내기",
  SCHOOL_FIELD_PROFILE_UPDATED: "학교 현장정보 변경",
  PHOTO_ADDED: "현장 사진 추가",
  PHOTO_REPLACED: "현장 사진 교체",
  PHOTO_DELETED: "현장 사진 삭제",
  PHOTO_RESTORED: "현장 사진 복원",
  SALES_ASSIGNMENT_CHANGED: "영업 배정 변경",
  SALES_ASSIGNMENTS_CREATED: "영업 배정 생성",
  SALES_ASSIGNMENTS_RELEASED: "영업 배정 제외",
  SALES_ASSIGNMENTS_CLAIMED: "담당자 학교 가져오기",
  SALES_CYCLE_CREATED: "영업 Cycle 생성",
  SALES_CYCLE_PRODUCTS_UPDATED: "월별 홍보 제품 변경",
  SALES_PROFILE_UPDATED: "영업 상태 변경",
  SALES_VISIT_RECORDED: "방문 기록 등록",
  NEIS_SYNC_STARTED: "NEIS 동기화 시작",
  NEIS_SYNC_COMPLETED: "NEIS 동기화 완료",
  NEIS_SYNC_FAILED: "NEIS 동기화 실패",
  KAKAO_AUTO_MATCHED: "Kakao 위치 자동 확인",
  KAKAO_MATCH_REVIEW_REQUIRED: "Kakao 위치 검토 요청",
  KAKAO_MATCH_FAILED: "Kakao 위치 매칭 실패",
  KAKAO_MATCH_CONFIRMED: "Kakao 위치 확정",
  KAKAO_MATCH_CHANGED: "Kakao 확정 위치 변경",
};

const PAGE_HEADING_IDS: Record<string, string> = {
  "학교 관리": "schools-title",
  "직원 관리": "employees-title",
  "월별 학교 배정": "cycles-title",
  "데이터 동기화": "sync-title",
  "감사 기록": "audit-title",
  설정: "admin-settings-title",
};

const RISKY_CHANGE_TYPES = new Set([
  "NAME_CHANGED",
  "ADDRESS_CHANGED",
  "TYPE_CHANGED",
  "MISSING",
]);

const DEFAULT_ACTIVITY_TAG_LABELS = [
  "첫 방문",
  "담당자 상담",
  "샘플 전달",
  "견적 요청",
  "재방문 약속",
  "담당자 부재",
] as const;

type EditableActivityTag = Pick<AdminActivityTag, "tagId" | "label" | "active"> & {
  clientId: string;
};

function editableActivityTags(tags: AdminActivityTag[]): EditableActivityTag[] {
  return tags.map((tag) => ({
    tagId: tag.tagId,
    label: tag.label,
    active: tag.active,
    clientId: tag.tagId,
  }));
}

function auditEventLabel(eventType: string) {
  return AUDIT_EVENT_LABELS[eventType] ?? eventType;
}

function initials(name: string) {
  return Array.from(name.trim()).slice(0, 2).join("");
}

function formatDate(value: string | null, includeTime = true) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

function currentCycleId() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function cycleDisplayLabel(cycleId: string) {
  const [year, month] = cycleId.split("-");
  return `${year}년 ${Number(month)}월`;
}

function suggestedCycleId(cycles: readonly { cycleId: string }[]) {
  const current = currentCycleId();
  if (!cycles.some((cycle) => cycle.cycleId === current)) return current;
  const [year, month] = current.split("-").map(Number);
  const next = new Date(year!, month!, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function PageHeading({
  kicker,
  title,
  description,
  action,
}: {
  kicker: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="admin-page-heading">
      <div>
        <p>{kicker}</p>
        <h1 id={PAGE_HEADING_IDS[title]}>{title}</h1>
        <span>{description}</span>
      </div>
      {action ? (
        <div className="admin-page-heading__action">{action}</div>
      ) : null}
    </header>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: IconName;
  title: string;
  description: string;
}) {
  return (
    <div className="admin-empty">
      <span>
        <Icon name={icon} />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function AdminDialog({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="admin-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-dialog-title"
      >
        <header>
          <div>
            <p>{eyebrow}</p>
            <h2 id="admin-dialog-title">{title}</h2>
          </div>
          <button type="button" aria-label="닫기" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function OverviewPage({
  data,
  onNavigate,
}: {
  data: AdminWorkspaceData;
  onNavigate: (view: AdminView) => void;
}) {
  const activeEmployees = data.employees.filter(
    (employee) => employee.status === "active",
  ).length;
  const needsLocationReview = data.schools.filter(
    (school) =>
      (school.locationStatus !== "confirmed" &&
        school.locationStatus !== "autoMatched") ||
      school.possibleRelocation,
  ).length;
  const activeCycle = data.cycles.find((cycle) => cycle.status === "active");
  const latestSync = data.syncRuns[0] ?? null;
  const completed = data.assignments.filter(
    (assignment) => assignment.monthlyStatus === "completed",
  ).length;
  const completionRate =
    data.assignments.length === 0
      ? 0
      : Math.round((completed / data.assignments.length) * 100);

  return (
    <section
      className="admin-page admin-overview"
      aria-labelledby="overview-title"
    >
      <header className="admin-overview-hero">
        <div>
          <p>OPERATIONS CONTROL</p>
          <h1 id="overview-title">
            운영의 흐름을
            <br />
            <em>한눈에.</em>
          </h1>
          <span>
            권한, 배정, 학교 데이터의 현재 상태를 안전하게 관리합니다.
          </span>
        </div>
        <div className="admin-overview-hero__signal">
          <span>
            <i />
            SYSTEM READY
          </span>
          <strong>{formatDate(data.generatedAt)}</strong>
          <small>마지막 서버 확인</small>
        </div>
      </header>

      <div className="admin-metric-grid">
        <button type="button" onClick={() => onNavigate("employees")}>
          <span>
            <Icon name="user" />
          </span>
          <small>활성 직원</small>
          <strong>
            {activeEmployees}
            <em>명</em>
          </strong>
          <p>전체 {data.employees.length}명 · 권한 관리</p>
        </button>
        <button type="button" onClick={() => onNavigate("cycles")}>
          <span>
            <Icon name="calendar" />
          </span>
          <small>{activeCycle?.cycleId ?? "활성 월 없음"}</small>
          <strong>
            {completionRate}
            <em>%</em>
          </strong>
          <p>
            {completed}/{data.assignments.length}개 학교 방문 완료
          </p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate("sync")}
          data-alert={needsLocationReview > 0}
        >
          <span>
            <Icon name="location" />
          </span>
          <small>위치 검토</small>
          <strong>
            {needsLocationReview}
            <em>곳</em>
          </strong>
          <p>후보 확인 또는 직접 위치 입력</p>
        </button>
        <button type="button" onClick={() => onNavigate("sync")}>
          <span>
            <Icon name="refresh" />
          </span>
          <small>최근 NEIS</small>
          <strong className="admin-metric-grid__status">
            {latestSync?.status ?? "기록 없음"}
          </strong>
          <p>
            {latestSync
              ? `${latestSync.appliedCount}건 적용 · ${formatDate(latestSync.completedAt ?? latestSync.startedAt, false)}`
              : "첫 미리보기를 실행해주세요."}
          </p>
        </button>
      </div>

      <div className="admin-overview-grid">
        <article className="admin-panel admin-cycle-snapshot">
          <header>
            <div>
              <p>MONTHLY CYCLE</p>
              <h2>이번 달 배정</h2>
            </div>
            <button type="button" onClick={() => onNavigate("cycles")}>
              전체 관리 <Icon name="chevron-right" size={16} />
            </button>
          </header>
          <div className="admin-progress">
            <span>
              <i style={{ width: `${completionRate}%` }} />
            </span>
            <strong>{completionRate}%</strong>
          </div>
          <dl>
            <div>
              <dt>방문 전</dt>
              <dd>
                {
                  data.assignments.filter(
                    (item) => item.monthlyStatus === "before",
                  ).length
                }
              </dd>
            </div>
            <div>
              <dt>후속 필요</dt>
              <dd>
                {
                  data.assignments.filter(
                    (item) => item.monthlyStatus === "followUp",
                  ).length
                }
              </dd>
            </div>
            <div>
              <dt>재방문</dt>
              <dd>
                {
                  data.assignments.filter(
                    (item) => item.monthlyStatus === "revisit",
                  ).length
                }
              </dd>
            </div>
            <div>
              <dt>보류</dt>
              <dd>
                {
                  data.assignments.filter(
                    (item) => item.monthlyStatus === "onHold",
                  ).length
                }
              </dd>
            </div>
          </dl>
        </article>
        <article className="admin-panel admin-audit-snapshot">
          <header>
            <div>
              <p>RECENT ACTIVITY</p>
              <h2>최근 감사 기록</h2>
            </div>
            <button type="button" onClick={() => onNavigate("audit")}>
              전체 보기 <Icon name="chevron-right" size={16} />
            </button>
          </header>
          <ul>
            {data.audits.slice(0, 5).map((log) => (
              <li key={log.logId}>
                <span>
                  <Icon name="check" size={14} />
                </span>
                <div>
                  <strong>{auditEventLabel(log.eventType)}</strong>
                  <small>
                    {log.actorEmployeeId ?? "SYSTEM"} ·{" "}
                    {formatDate(log.createdAt)}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

function SchoolsPage({
  data,
  onOpenSync,
}: {
  data: AdminWorkspaceData;
  onOpenSync: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "review" | "confirmed">("all");
  const schools = useMemo(
    () =>
      data.schools.filter((school) => {
        const matchesQuery = `${school.name} ${school.roadAddress ?? ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase());
        const needsReview =
          school.locationStatus === "needsReview" ||
          school.locationStatus === "failed" ||
          school.possibleRelocation;
        return (
          matchesQuery &&
          (filter === "all" ||
            (filter === "review"
              ? needsReview
              : school.locationStatus === "confirmed" &&
                !school.possibleRelocation))
        );
      }),
    [data.schools, filter, query],
  );

  return (
    <section className="admin-page" aria-labelledby="schools-title">
      <PageHeading
        kicker="SCHOOL DIRECTORY"
        title="학교 관리"
        description="NEIS 기준정보와 Kakao 위치 확인 상태를 함께 봅니다."
        action={
          <GlassButton variant="primary" compact onClick={onOpenSync}>
            <Icon name="refresh" size={17} /> 동기화 센터
          </GlassButton>
        }
      />
      <div className="admin-toolbar">
        <label className="admin-search">
          <Icon name="search" size={17} />
          <input
            aria-label="학교 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="학교명 또는 주소 검색"
          />
        </label>
        <div className="admin-filter-tabs" role="group" aria-label="학교 상태">
          <button
            type="button"
            data-active={filter === "all"}
            onClick={() => setFilter("all")}
          >
            전체 {data.schools.length}
          </button>
          <button
            type="button"
            data-active={filter === "review"}
            onClick={() => setFilter("review")}
          >
            검토 필요
          </button>
          <button
            type="button"
            data-active={filter === "confirmed"}
            onClick={() => setFilter("confirmed")}
          >
            확정
          </button>
        </div>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>학교</th>
              <th>행정구·학교급</th>
              <th>NEIS 주소</th>
              <th>위치 상태</th>
              <th>Revision</th>
            </tr>
          </thead>
          <tbody>
            {schools.map((school) => {
              const review =
                school.locationStatus === "needsReview" ||
                school.locationStatus === "failed" ||
                school.possibleRelocation;
              return (
                <tr key={school.schoolId}>
                  <td>
                    <strong>{school.name}</strong>
                    <small>{school.schoolId}</small>
                  </td>
                  <td>
                    {DISTRICT_LABELS[school.district] ?? school.district} ·{" "}
                    {SCHOOL_TYPE_LABELS[school.schoolType] ?? school.schoolType}
                  </td>
                  <td>{school.roadAddress ?? "주소 확인 필요"}</td>
                  <td>
                    <StatusBadge
                      tone={
                        review
                          ? "attention"
                          : school.locationStatus === "confirmed"
                            ? "success"
                            : "info"
                      }
                    >
                      {review
                        ? "검토 필요"
                        : school.locationStatus === "confirmed"
                          ? "관리자 확정"
                          : "자동 확인"}
                    </StatusBadge>
                  </td>
                  <td>r{school.schoolBaseRevision}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {schools.length === 0 ? (
          <EmptyState
            icon="building"
            title="조건에 맞는 학교가 없습니다."
            description="검색어나 상태 필터를 바꿔보세요."
          />
        ) : null}
      </div>
    </section>
  );
}

function RoleChecks({
  roles,
  disabledAdmin = true,
  onChange,
}: {
  roles: AdminRole[];
  disabledAdmin?: boolean;
  onChange: (roles: AdminRole[]) => void;
}) {
  return (
    <fieldset className="admin-role-checks">
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

function NewEmployeeDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [displayName, setDisplayName] = useState("");
  const [roles, setRoles] = useState<AdminRole[]>(["delivery"]);
  const [exportTeam, setExportTeam] = useState(false);
  const [reservation, setReservation] = useState<PinReservation | null>(null);
  const [status, setStatus] = useState<"idle" | "pin" | "saving" | "done">(
    "idle",
  );

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
    if (!reservation || displayName.trim().length < 2 || roles.length === 0)
      return;
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
    }
  };

  return (
    <AdminDialog
      title={status === "done" ? "직원 등록 완료" : "새 직원 등록"}
      eyebrow="EMPLOYEE · CREATE"
      onClose={onClose}
    >
      {status === "done" && reservation ? (
        <div className="admin-dialog-body">
          <PinReveal
            pin={reservation.pin}
            title={`${displayName.trim()} 직원 PIN`}
          />
          <GlassButton variant="primary" onClick={onClose}>
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
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="예: 김온누리"
            />
          </label>
          <RoleChecks roles={roles} onChange={setRoles} />
          <label className="admin-switch-row">
            <span>
              <strong>팀 CSV 내보내기</strong>
              <small>영업 팀 전체 기록을 내보낼 수 있습니다.</small>
            </span>
            <input
              type="checkbox"
              checked={exportTeam}
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
            <GlassButton variant="quiet" type="button" onClick={onClose}>
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

function EmployeeDetail({
  employee,
  currentEmployeeId,
  onReload,
}: {
  employee: AdminEmployee;
  currentEmployeeId: string;
  onReload: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [displayName, setDisplayName] = useState(employee.displayName);
  const [roles, setRoles] = useState<AdminRole[]>(employee.roleScopes);
  const [exportTeam, setExportTeam] = useState(employee.exportTeam);
  const [status, setStatus] = useState(employee.status);
  const [reason, setReason] = useState("정기 직원 정보 정비");
  const [revokeOnSave, setRevokeOnSave] = useState(false);
  const [working, setWorking] = useState(false);
  const [rotatedPin, setRotatedPin] = useState<string | null>(null);

  const perform = async (action: () => Promise<unknown>, success: string) => {
    setWorking(true);
    try {
      await action();
      await onReload();
      showToast(success);
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      setWorking(false);
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
    setWorking(true);
    try {
      const result = await adminRepository.rotatePin({
        employeeId: employee.employeeId,
        revokeSessions: true,
        reason: reason || "관리자 PIN 재발급",
      });
      setRotatedPin(result.pin);
      await onReload();
      showToast("새 PIN을 발급하고 기존 세션을 종료했습니다.");
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      setWorking(false);
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
      {rotatedPin ? <PinReveal pin={rotatedPin} title="새 PIN" /> : null}
      <div className="employee-detail__form">
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
      </div>
      <div className="employee-security-actions">
        <h3>인증 보안</h3>
        <p>
          PIN은 새 값만 한 번 표시되며, 기존 값은 즉시 사용할 수 없게 됩니다.
        </p>
        <button
          type="button"
          disabled={working || isAdmin}
          onClick={() => void rotate()}
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
          onClick={() =>
            void perform(
              () =>
                adminRepository.revokeSessions({
                  employeeId: employee.employeeId,
                  reason: reason || "관리자 세션 종료",
                }),
              "모든 기존 세션을 종료했습니다.",
            )
          }
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

function EmployeesPage({
  data,
  currentEmployeeId,
  onReload,
}: {
  data: AdminWorkspaceData;
  currentEmployeeId: string;
  onReload: () => Promise<void>;
}) {
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
    data.employees.find((employee) => employee.employeeId === selectedId) ??
    employees[0] ??
    null;
  return (
    <section className="admin-page" aria-labelledby="employees-title">
      <PageHeading
        kicker="IDENTITY · ACCESS"
        title="직원 관리"
        description="직원 역할, 일회성 PIN, 계정 상태와 세션을 한곳에서 관리합니다."
        action={
          <GlassButton
            variant="primary"
            compact
            onClick={() => setCreating(true)}
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
                aria-label="직원 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="이름 또는 직원 ID"
              />
            </label>
          </div>
          <div className="employee-list" role="listbox" aria-label="직원 목록">
            {employees.map((employee) => (
              <button
                type="button"
                role="option"
                aria-selected={selected?.employeeId === employee.employeeId}
                data-active={selected?.employeeId === employee.employeeId}
                key={employee.employeeId}
                onClick={() => setSelectedId(employee.employeeId)}
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
  const [assigneeId, setAssigneeId] = useState(assignment.primaryAssigneeId);
  const [saving, setSaving] = useState(false);
  const dirty = assigneeId !== assignment.primaryAssigneeId;
  const save = async () => {
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
            disabled={assignment.monthlyStatus !== "before"}
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

function CyclesPage({
  data,
  onLoadCycle,
}: {
  data: AdminWorkspaceData;
  onLoadCycle: (cycleId: string | null) => Promise<void>;
}) {
  const { showToast } = useToast();
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
      setSavingProducts(false);
    }
  };

  const createCycle = async () => {
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
      setCreating(false);
    }
  };
  const removeAssignments = async () => {
    if (!data.selectedCycleId || selectedAssignments.size === 0) return;
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
        kicker="MONTHLY SALES CYCLE"
        title="월별 학교 배정"
        description="전월 담당 학교를 복사한 뒤 필요한 학교만 더하고 빼며 직원별 담당을 확정합니다."
      />
      <div className="cycle-command-grid">
        <article className="admin-panel">
          <header>
            <div>
              <p>CREATE CYCLE</p>
              <h2>새 월 시작</h2>
            </div>
            <span className="admin-step">01</span>
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
              <strong>생성 즉시 활성 Cycle로 전환</strong>
            </label>
            <GlassButton
              variant="primary"
              disabled={!/^\d{4}-\d{2}$/u.test(cycleId) || creating}
              onClick={() => void createCycle()}
            >
              {creating ? "생성 중…" : "Cycle 생성"}
            </GlassButton>
          </div>
        </article>
        <article className="admin-panel cycle-summary">
          <header>
            <div>
              <p>ACTIVE SNAPSHOT</p>
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
            <p>MONTHLY PRODUCT SHORTLIST</p>
            <h2 id="campaign-products-title">이번 달 홍보 제품</h2>
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
            <div key={`${name}-${index}`}>
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
            <p>ASSIGNMENTS</p>
            <h2>학교별 배정</h2>
          </div>
          <select
            aria-label="조회 Cycle"
            value={data.selectedCycleId ?? ""}
            onChange={(event) => void onLoadCycle(event.target.value || null)}
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
              <p>BULK ASSIGN</p>
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
    </section>
  );
}

function changeName(change: NeisPreview["changes"][number]) {
  const oldName =
    typeof change.oldData?.name === "string" ? change.oldData.name : null;
  const newName =
    typeof change.newData?.name === "string" ? change.newData.name : null;
  return newName ?? oldName ?? change.schoolCode;
}

function KakaoReviewCard({
  review,
  onReload,
}: {
  review: KakaoReview;
  onReload: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [candidateId, setCandidateId] = useState(
    review.candidates[0]?.candidateId ?? "",
  );
  const [manual, setManual] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [roadAddress, setRoadAddress] = useState(review.neisRoadAddress ?? "");
  const [working, setWorking] = useState(false);
  const confirm = async () => {
    setWorking(true);
    try {
      await adminRepository.confirmKakao({
        schoolId: review.schoolId,
        expectedSchoolBaseRevision: review.schoolBaseRevision,
        candidateId: manual ? null : candidateId,
        manualLocation: manual
          ? {
              latitude: Number(latitude),
              longitude: Number(longitude),
              name: review.neisName,
              roadAddress,
            }
          : null,
      });
      await onReload();
      showToast(`${review.neisName} 위치를 관리자 확정했습니다.`);
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };
  return (
    <article className="kakao-review-card">
      <header>
        <div>
          <StatusBadge tone={review.status === "failed" ? "attention" : "info"}>
            {KAKAO_STATUS_LABELS[review.status] ?? review.status}
          </StatusBadge>
          <h3>{review.neisName}</h3>
          <p>{review.neisRoadAddress ?? "NEIS 주소 없음"}</p>
        </div>
        <small>r{review.schoolBaseRevision}</small>
      </header>
      {review.candidates.length > 0 ? (
        <div className="kakao-candidates">
          {review.candidates.map((candidate, index) => (
            <label
              key={candidate.candidateId}
              data-selected={!manual && candidateId === candidate.candidateId}
            >
              <input
                type="radio"
                name={`candidate-${review.schoolId}`}
                checked={!manual && candidateId === candidate.candidateId}
                onChange={() => {
                  setManual(false);
                  setCandidateId(candidate.candidateId);
                }}
              />
              <span>
                <strong>
                  후보 {index + 1} · {candidate.name}
                </strong>
                <small>{candidate.roadAddress || candidate.addressName}</small>
                <em>신뢰 점수 {candidate.score}</em>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="kakao-no-candidate">
          저장된 후보가 없습니다. 직접 위치를 입력하거나 후보를 다시 조회하세요.
        </p>
      )}
      <button
        className="kakao-manual-toggle"
        type="button"
        data-active={manual}
        onClick={() => setManual((current) => !current)}
      >
        <Icon name="location" size={16} />
        직접 위치 입력
      </button>
      {manual ? (
        <div className="kakao-manual-fields">
          <label>
            <span>위도</span>
            <input
              inputMode="decimal"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              placeholder="36.35"
            />
          </label>
          <label>
            <span>경도</span>
            <input
              inputMode="decimal"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              placeholder="127.38"
            />
          </label>
          <label>
            <span>도로명 주소</span>
            <input
              value={roadAddress}
              onChange={(event) => setRoadAddress(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      <footer>
        <GlassButton
          variant="primary"
          compact
          disabled={
            working ||
            (manual ? !latitude || !longitude || !roadAddress : !candidateId)
          }
          onClick={() => void confirm()}
        >
          {working ? "확정 중…" : "이 위치로 확정"}
        </GlassButton>
      </footer>
    </article>
  );
}

function SyncPage({
  data,
  onReload,
}: {
  data: AdminWorkspaceData;
  onReload: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<"neis" | "kakao">("neis");
  const [preview, setPreview] = useState<NeisPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [working, setWorking] = useState(false);
  const runPreview = async () => {
    setWorking(true);
    try {
      const result = await adminRepository.previewNeis();
      setPreview(result);
      setSelected(
        new Set(
          result.changes
            .filter((change) => !RISKY_CHANGE_TYPES.has(change.type))
            .map((change) => change.changeId),
        ),
      );
      showToast("DB를 변경하지 않고 NEIS 차이를 계산했습니다.");
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };
  const selectedChanges =
    preview?.changes.filter((change) => selected.has(change.changeId)) ?? [];
  const hasRisky = selectedChanges.some((change) =>
    RISKY_CHANGE_TYPES.has(change.type),
  );
  const apply = async () => {
    if (!preview || selected.size === 0 || (hasRisky && !riskAcknowledged))
      return;
    setWorking(true);
    try {
      await adminRepository.applyNeis({
        runId: preview.runId,
        approvedChangeIds: [...selected],
        confirmRiskyChanges: hasRisky,
      });
      await onReload();
      setPreview(null);
      showToast(
        `${selected.size}개 변경을 적용하고 검색 Catalog를 갱신했습니다.`,
      );
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };
  const needsLocation = data.schools.filter(
    (school) =>
      school.locationStatus !== "confirmed" &&
      school.locationStatus !== "autoMatched",
  );
  const refreshKakao = async (schoolId: string) => {
    setWorking(true);
    try {
      await adminRepository.matchKakao(schoolId);
      await onReload();
      showToast("Kakao 후보를 갱신했습니다.");
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      setWorking(false);
    }
  };
  return (
    <section className="admin-page" aria-labelledby="sync-title">
      <PageHeading
        kicker="EXTERNAL DATA CONTROL"
        title="데이터 동기화"
        description="원천 데이터는 반드시 미리보고, 승인한 항목만 서버에서 반영합니다."
      />
      <div className="admin-sync-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "neis"}
          onClick={() => setTab("neis")}
        >
          <Icon name="building" size={18} />
          NEIS 학교 정보
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "kakao"}
          onClick={() => setTab("kakao")}
        >
          <Icon name="location" size={18} />
          Kakao 위치 검토 <span>{needsLocation.length}</span>
        </button>
      </div>
      {tab === "neis" ? (
        <div className="sync-layout">
          <article className="admin-panel sync-command">
            <header>
              <div>
                <p>NEIS SCHOOL INFO</p>
                <h2>학교 기준정보 미리보기</h2>
              </div>
              <StatusBadge
                tone={
                  data.syncRuns[0]?.status === "COMPLETED"
                    ? "success"
                    : "neutral"
                }
              >
                {data.syncRuns[0]?.status
                  ? (SYNC_STATUS_LABELS[data.syncRuns[0].status] ??
                    data.syncRuns[0].status)
                  : "실행 전"}
              </StatusBadge>
            </header>
            <p>
              대전 초·중·고 학교 목록을 가져와 현재 DB와 비교합니다.
              미리보기만으로는 학교·현장·영업 데이터가 바뀌지 않습니다.
            </p>
            <dl>
              <div>
                <dt>최근 실행</dt>
                <dd>{formatDate(data.syncRuns[0]?.startedAt ?? null)}</dd>
              </div>
              <div>
                <dt>검색 Catalog</dt>
                <dd>v{data.settings.commonCatalogVersion}</dd>
              </div>
              <div>
                <dt>최근 적용</dt>
                <dd>{data.syncRuns[0]?.appliedCount ?? 0}건</dd>
              </div>
            </dl>
            <GlassButton
              variant="primary"
              disabled={working}
              onClick={() => void runPreview()}
            >
              <Icon name="refresh" />
              {working ? "차이 계산 중…" : "최신 목록 가져와 비교"}
            </GlassButton>
          </article>
          {preview ? (
            <article className="admin-panel sync-preview">
              <header>
                <div>
                  <p>DIFF PREVIEW</p>
                  <h2>적용 항목 선택</h2>
                </div>
                <StatusBadge
                  tone={
                    preview.status === "SUSPICIOUS_RESULT"
                      ? "attention"
                      : "info"
                  }
                >
                  {SYNC_STATUS_LABELS[preview.status] ?? preview.status}
                </StatusBadge>
              </header>
              <div className="sync-counts">
                <span>
                  <small>신규</small>
                  <strong>{preview.newCount}</strong>
                </span>
                <span>
                  <small>변경</small>
                  <strong>{preview.changedCount}</strong>
                </span>
                <span>
                  <small>누락</small>
                  <strong>{preview.missingCount}</strong>
                </span>
                <span>
                  <small>원천 전체</small>
                  <strong>{preview.sourceCount}</strong>
                </span>
              </div>
              {preview.suspiciousReasons.length > 0 ? (
                <div className="sync-risk-warning" role="alert">
                  <Icon name="bell" />
                  <span>
                    <strong>안전 임계값을 초과했습니다.</strong>
                    {preview.suspiciousReasons.join(" ")} 이 실행은 적용할 수
                    없습니다.
                  </span>
                </div>
              ) : null}
              <div className="sync-select-actions">
                <button
                  type="button"
                  onClick={() =>
                    setSelected(
                      new Set(
                        preview.changes
                          .filter(
                            (change) => !RISKY_CHANGE_TYPES.has(change.type),
                          )
                          .map((change) => change.changeId),
                      ),
                    )
                  }
                >
                  낮은 위험만 선택
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSelected(
                      new Set(preview.changes.map((change) => change.changeId)),
                    )
                  }
                >
                  전체 선택
                </button>
                <button type="button" onClick={() => setSelected(new Set())}>
                  선택 해제
                </button>
              </div>
              <div className="sync-change-list">
                {preview.changes.map((change) => (
                  <label
                    key={change.changeId}
                    data-risk={RISKY_CHANGE_TYPES.has(change.type)}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(change.changeId)}
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(change.changeId);
                          else next.delete(change.changeId);
                          return next;
                        })
                      }
                    />
                    <span aria-hidden="true">
                      <Icon name="check" size={14} />
                    </span>
                    <div>
                      <strong>{changeName(change)}</strong>
                      <small>{change.schoolCode}</small>
                    </div>
                    <StatusBadge
                      tone={
                        RISKY_CHANGE_TYPES.has(change.type)
                          ? "attention"
                          : "info"
                      }
                    >
                      {CHANGE_LABELS[change.type]}
                    </StatusBadge>
                  </label>
                ))}
              </div>
              {hasRisky ? (
                <label className="admin-check-row sync-risk-confirm">
                  <input
                    type="checkbox"
                    checked={riskAcknowledged}
                    onChange={(event) =>
                      setRiskAcknowledged(event.target.checked)
                    }
                  />
                  <span aria-hidden="true">
                    <Icon name="check" size={14} />
                  </span>
                  <strong>
                    교명·주소·학교급·누락 위험 항목을 확인했습니다.
                  </strong>
                </label>
              ) : null}
              <footer>
                <span>
                  <strong>{selected.size}</strong>개 항목 선택
                </span>
                <GlassButton
                  variant="primary"
                  disabled={
                    working ||
                    selected.size === 0 ||
                    (hasRisky && !riskAcknowledged) ||
                    preview.status === "SUSPICIOUS_RESULT"
                  }
                  onClick={() => void apply()}
                >
                  {working ? "안전하게 적용 중…" : "선택 항목 적용"}
                </GlassButton>
              </footer>
            </article>
          ) : (
            <article className="admin-panel sync-history">
              <header>
                <div>
                  <p>SYNC HISTORY</p>
                  <h2>최근 실행 기록</h2>
                </div>
              </header>
              {data.syncRuns.length ? (
                <ul>
                  {data.syncRuns.map((run) => (
                    <li key={run.runId}>
                      <StatusBadge
                        tone={
                          run.status === "COMPLETED"
                            ? "success"
                            : run.status === "FAILED" ||
                                run.status === "SUSPICIOUS_RESULT"
                              ? "attention"
                              : "neutral"
                        }
                      >
                        {SYNC_STATUS_LABELS[run.status] ?? run.status}
                      </StatusBadge>
                      <span>
                        <strong>{formatDate(run.startedAt)}</strong>
                        <small>
                          신규 {run.newCount} · 변경 {run.changedCount} · 누락{" "}
                          {run.missingCount}
                        </small>
                      </span>
                      <em>{run.appliedCount} 적용</em>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon="refresh"
                  title="동기화 실행 기록이 없습니다."
                  description="미리보기를 실행하면 이곳에 안전한 변경 이력이 남습니다."
                />
              )}
            </article>
          )}
        </div>
      ) : (
        <div className="kakao-workspace">
          <div className="kakao-summary">
            <span>
              <small>관리자 확정</small>
              <strong>
                {
                  data.schools.filter(
                    (school) => school.locationStatus === "confirmed",
                  ).length
                }
              </strong>
            </span>
            <span>
              <small>검토·조회 대기</small>
              <strong>
                {
                  needsLocation.filter(
                    (school) => school.locationStatus !== "failed",
                  ).length
                }
              </strong>
            </span>
            <span>
              <small>매칭 실패</small>
              <strong>
                {
                  needsLocation.filter(
                    (school) => school.locationStatus === "failed",
                  ).length
                }
              </strong>
            </span>
          </div>
          {data.kakaoReviews
            .filter(
              (review) =>
                review.status === "needsReview" || review.status === "failed",
            )
            .map((review) => (
              <KakaoReviewCard
                key={review.schoolId}
                review={review}
                onReload={onReload}
              />
            ))}
          {needsLocation.filter(
            (school) =>
              !data.kakaoReviews.some(
                (review) => review.schoolId === school.schoolId,
              ),
          ).length > 0 ? (
            <article className="admin-panel kakao-unmatched">
              <header>
                <div>
                  <p>NO CANDIDATE YET</p>
                  <h2>후보 조회가 필요한 학교</h2>
                </div>
              </header>
              {needsLocation
                .filter(
                  (school) =>
                    !data.kakaoReviews.some(
                      (review) => review.schoolId === school.schoolId,
                    ),
                )
                .map((school) => (
                  <div key={school.schoolId}>
                    <span>
                      <strong>{school.name}</strong>
                      <small>{school.roadAddress ?? "주소 없음"}</small>
                    </span>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => void refreshKakao(school.schoolId)}
                    >
                      후보 조회
                    </button>
                  </div>
                ))}
            </article>
          ) : null}
          {data.kakaoReviews.filter(
            (review) =>
              review.status === "needsReview" || review.status === "failed",
          ).length === 0 && needsLocation.length === 0 ? (
            <EmptyState
              icon="check"
              title="위치 검토가 모두 끝났습니다."
              description="관리자 확정 위치는 이후 자동 매칭보다 항상 우선합니다."
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

function AuditPage({ initialLogs }: { initialLogs: AdminAudit[] }) {
  const { showToast } = useToast();
  const [logs, setLogs] = useState(initialLogs);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const visible = useMemo(
    () =>
      logs.filter((log) =>
        `${log.eventType} ${log.actorEmployeeId ?? ""} ${log.targetId ?? ""} ${log.changeReason ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [logs, query],
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
        kicker="IMMUTABLE TRACE"
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
                {log.actorEmployeeId ?? "SYSTEM"} → {log.targetType}
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

function SettingsPage({
  data,
  session,
  onReload,
}: {
  data: AdminWorkspaceData;
  session: AuthenticatedSession;
  onReload: () => Promise<void>;
}) {
  const { logout } = useAuth();
  const { showToast } = useToast();
  const [minimumVersion, setMinimumVersion] = useState(
    data.settings.minimumAppVersion ?? "",
  );
  const [maintenance, setMaintenance] = useState(data.settings.maintenanceMode);
  const [saving, setSaving] = useState(false);
  const [activityTags, setActivityTags] = useState<EditableActivityTag[]>(() => editableActivityTags(data.activityTags));
  const [savingTags, setSavingTags] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await adminRepository.updateSettings({
        minimumAppVersion: minimumVersion.trim() || null,
        maintenanceMode: maintenance,
      });
      await onReload();
      showToast("앱 운영 설정을 반영했습니다.");
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };
  const addActivityTag = (label = "") => {
    setActivityTags((current) => current.length >= 20 ? current : [...current, {
      tagId: "",
      label,
      active: true,
      clientId: crypto.randomUUID(),
    }]);
  };
  const applyDefaultActivityTags = () => {
    setActivityTags(DEFAULT_ACTIVITY_TAG_LABELS.map((label) => ({
      tagId: "",
      label,
      active: true,
      clientId: crypto.randomUUID(),
    })));
  };
  const saveActivityTags = async () => {
    const cleaned = activityTags.map((tag) => ({ ...tag, label: tag.label.trim() }));
    if (cleaned.length === 0 || cleaned.some((tag) => tag.label.length === 0)) {
      showToast("활동 태그 이름을 한 글자 이상 입력해주세요.");
      return;
    }
    const labels = cleaned.map((tag) => tag.label.toLocaleLowerCase("ko-KR"));
    if (new Set(labels).size !== labels.length) {
      showToast("같은 이름의 활동 태그는 한 번만 등록할 수 있습니다.");
      return;
    }
    setSavingTags(true);
    try {
      const result = await adminRepository.updateActivityTags({
        tags: cleaned.map((tag) => ({
          tagId: tag.tagId || null,
          label: tag.label,
          active: tag.active,
        })),
      });
      setActivityTags(editableActivityTags(result.tags));
      await onReload();
      showToast("영업 활동 태그를 반영했습니다.");
    } catch (error) {
      showToast(adminErrorMessage(error));
    } finally {
      setSavingTags(false);
    }
  };
  return (
    <section className="admin-page" aria-labelledby="admin-settings-title">
      <PageHeading
        kicker="APPLICATION POLICY"
        title="설정"
        description="현장 앱에 적용할 공개 운영 정책과 현재 관리자 세션을 관리합니다."
      />
      <div className="settings-admin-grid">
        <article className="admin-panel">
          <header>
            <div>
              <p>PUBLIC APP SETTINGS</p>
              <h2>현장 앱 운영 정책</h2>
            </div>
            <StatusBadge tone={maintenance ? "attention" : "success"}>
              {maintenance ? "점검 모드" : "정상 운영"}
            </StatusBadge>
          </header>
          <div className="admin-form">
            <label>
              <span>최소 지원 앱 버전</span>
              <input
                value={minimumVersion}
                onChange={(event) => setMinimumVersion(event.target.value)}
                placeholder="비워두면 제한 없음"
              />
              <small>
                이 버전보다 낮은 클라이언트에 업데이트 안내를 표시할 기준입니다.
              </small>
            </label>
            <label className="admin-switch-row admin-switch-row--warning">
              <span>
                <strong>유지보수 모드</strong>
                <small>
                  현장 직원에게 점검 상태를 알립니다. 저장 전 운영 공지를
                  확인하세요.
                </small>
              </span>
              <input
                type="checkbox"
                checked={maintenance}
                onChange={(event) => setMaintenance(event.target.checked)}
              />
            </label>
            <dl className="settings-readonly">
              <div>
                <dt>현재 영업 Cycle</dt>
                <dd>{data.settings.currentSalesCycleId ?? "없음"}</dd>
              </div>
              <div>
                <dt>공용 Catalog 버전</dt>
                <dd>v{data.settings.commonCatalogVersion}</dd>
              </div>
              <div>
                <dt>마지막 변경</dt>
                <dd>{formatDate(data.settings.updatedAt)}</dd>
              </div>
            </dl>
            <GlassButton
              variant="primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "정책 반영 중…" : "운영 설정 저장"}
            </GlassButton>
          </div>
        </article>
        <article className="admin-panel activity-tag-admin">
          <header>
            <div>
              <p>SALES ACTIVITY TAXONOMY</p>
              <h2>영업 활동 태그</h2>
            </div>
            <StatusBadge tone={activityTags.some((tag) => tag.active) ? "success" : "attention"}>
              활성 {activityTags.filter((tag) => tag.active).length}개
            </StatusBadge>
          </header>
          <div className="activity-tag-admin__intro">
            <span><Icon name="sparkles" size={18} /></span>
            <p><strong>방문 결과를 빠르게 분류합니다.</strong>영업 직원은 방문 기록에서 여러 태그를 선택하고, 태그는 이력과 CSV에 함께 보존됩니다.</p>
          </div>
          {activityTags.length > 0 ? (
            <div className="activity-tag-admin__list">
              {activityTags.map((tag, index) => (
                <div className="activity-tag-admin__row" data-active={tag.active} key={tag.clientId}>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <label>
                    <span className="sr-only">활동 태그 {index + 1} 이름</span>
                    <input
                      maxLength={40}
                      value={tag.label}
                      placeholder="활동 태그 이름"
                      onChange={(event) => setActivityTags((current) => current.map((candidate) => candidate.clientId === tag.clientId ? { ...candidate, label: event.target.value } : candidate))}
                    />
                  </label>
                  <label className="activity-tag-admin__toggle">
                    <input
                      type="checkbox"
                      checked={tag.active}
                      onChange={(event) => setActivityTags((current) => current.map((candidate) => candidate.clientId === tag.clientId ? { ...candidate, active: event.target.checked } : candidate))}
                    />
                    <span>{tag.active ? "사용" : "중지"}</span>
                  </label>
                  {!tag.tagId ? (
                    <button type="button" aria-label={`${tag.label || `활동 태그 ${index + 1}`} 삭제`} onClick={() => setActivityTags((current) => current.filter((candidate) => candidate.clientId !== tag.clientId))}>
                      <Icon name="trash" size={17} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="activity-tag-admin__empty">
              <Icon name="clipboard" size={24} />
              <strong>아직 활동 태그가 없습니다.</strong>
              <p>현장에서 바로 쓸 수 있는 기본 6개 태그로 시작할 수 있습니다.</p>
              <GlassButton compact onClick={applyDefaultActivityTags}>기본 태그 구성</GlassButton>
            </div>
          )}
          <div className="activity-tag-admin__actions">
            <button type="button" disabled={activityTags.length >= 20} onClick={() => addActivityTag()}><Icon name="sparkles" size={17} />태그 추가</button>
            <GlassButton variant="primary" disabled={savingTags || activityTags.length === 0} onClick={() => void saveActivityTags()}>
              {savingTags ? "태그 반영 중…" : "활동 태그 저장"}
            </GlassButton>
          </div>
        </article>
        <article className="admin-panel admin-session-card">
          <header>
            <div>
              <p>ADMIN SESSION</p>
              <h2>관리자 계정</h2>
            </div>
            <span className="admin-session-card__avatar">
              {initials(session.displayName)}
            </span>
          </header>
          <strong>{session.displayName}</strong>
          <p>{session.claims.employeeId}</p>
          <div>
            <StatusBadge tone="success">Google 인증</StatusBadge>
            <StatusBadge tone="success">서버 승인</StatusBadge>
            <StatusBadge>Session v{session.claims.sessionVersion}</StatusBadge>
          </div>
          <ul>
            <li>
              <Icon name="check" size={15} />
              Google Provider 확인
            </li>
            <li>
              <Icon name="check" size={15} />
              서버 허용목록 확인
            </li>
            <li>
              <Icon name="check" size={15} />
              활성 admin 역할 확인
            </li>
          </ul>
          <GlassButton variant="quiet" onClick={() => void logout()}>
            <Icon name="logout" />
            안전하게 로그아웃
          </GlassButton>
        </article>
      </div>
    </section>
  );
}

function AdminWorkspaceContent({ session }: { session: AuthenticatedSession }) {
  const { showToast } = useToast();
  const [view, setView] = useState<AdminView>("overview");
  const [data, setData] = useState<AdminWorkspaceData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (cycleId: string | null = null, silent = false) => {
      if (!silent) setStatus("loading");
      else setRefreshing(true);
      try {
        const result = await adminRepository.load(cycleId);
        setData(result);
        setStatus("ready");
      } catch (error) {
        if (!silent) setStatus("error");
        showToast(adminErrorMessage(error));
      } finally {
        setRefreshing(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    let active = true;
    adminRepository
      .load()
      .then((result) => {
        if (!active) return;
        setData(result);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus("error");
        showToast(adminErrorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [showToast]);

  const reload = useCallback(async () => {
    await load(data?.selectedCycleId ?? null, true);
  }, [data?.selectedCycleId, load]);

  let content: ReactNode;
  if (status === "loading")
    content = (
      <div className="admin-loading" role="status">
        <span className="auth-spinner" />
        <strong>운영 데이터를 안전하게 불러오는 중</strong>
        <p>권한과 최신 버전을 서버에서 함께 확인합니다.</p>
      </div>
    );
  else if (status === "error" || !data)
    content = (
      <div className="admin-loading" role="alert">
        <Icon name="wifi-off" size={30} />
        <strong>관리자 데이터를 불러오지 못했습니다.</strong>
        <p>인터넷 연결과 관리자 권한을 확인해주세요.</p>
        <GlassButton variant="primary" onClick={() => void load()}>
          다시 시도
        </GlassButton>
      </div>
    );
  else if (view === "overview")
    content = <OverviewPage data={data} onNavigate={setView} />;
  else if (view === "schools")
    content = <SchoolsPage data={data} onOpenSync={() => setView("sync")} />;
  else if (view === "employees")
    content = (
      <EmployeesPage
        data={data}
        currentEmployeeId={session.claims.employeeId}
        onReload={reload}
      />
    );
  else if (view === "cycles")
    content = (
      <CyclesPage
        key={`${data.selectedCycleId ?? "none"}:${JSON.stringify(data.cycles.find((cycle) => cycle.cycleId === data.selectedCycleId)?.promotedProductNames ?? [])}`}
        data={data}
        onLoadCycle={(cycleId) => load(cycleId, true)}
      />
    );
  else if (view === "sync")
    content = <SyncPage data={data} onReload={reload} />;
  else if (view === "export")
    content = <SalesExportWorkspace session={session} />;
  else if (view === "audit") content = <AuditPage initialLogs={data.audits} />;
  else
    content = <SettingsPage data={data} session={session} onReload={reload} />;

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span>
            <AppIconMark />
          </span>
          <div>
            <strong>급식길</strong>
            <small>온누리종합식품</small>
          </div>
        </div>
        <nav aria-label="관리자 주요 메뉴">
          {NAVIGATION.map((item) => (
            <button
              type="button"
              key={item.id}
              data-active={view === item.id}
              aria-label={`${item.label} · ${item.hint}`}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
            >
              <Icon name={item.icon} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
              {item.id === "sync" &&
              data &&
              data.schools.some(
                (school) =>
                  (school.locationStatus !== "confirmed" &&
                    school.locationStatus !== "autoMatched") ||
                  school.possibleRelocation,
              ) ? (
                <i aria-label="검토 필요" />
              ) : null}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar__account">
          <span>{initials(session.displayName)}</span>
          <div>
            <strong>{session.displayName}</strong>
            <small>승인된 관리자</small>
          </div>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="admin-topbar__live">
              <i />
              LIVE ADMIN
            </span>
            <span>{data?.settings.currentSalesCycleId ?? "Cycle 확인 중"}</span>
          </div>
          <div>
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void reload()}
            >
              <Icon name="refresh" size={17} />
              {refreshing ? "새로 고치는 중" : "최신 상태"}
            </button>
            <span className="admin-topbar__date">
              {new Intl.DateTimeFormat("ko-KR", {
                timeZone: "Asia/Seoul",
                month: "long",
                day: "numeric",
                weekday: "short",
              }).format(new Date())}
            </span>
          </div>
        </header>
        <div className="admin-content">{content}</div>
      </div>
    </main>
  );
}

export function AdminWorkspace({ session }: { session: AuthenticatedSession }) {
  return <AdminWorkspaceContent session={session} />;
}
