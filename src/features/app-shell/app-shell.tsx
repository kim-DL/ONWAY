"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon, type IconName } from "@/components/ui/icon";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import { SoftCard } from "@/components/ui/soft-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ToastProvider, useToast } from "@/components/ui/toast";
import type { School } from "@/domain/school";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { useAuth } from "@/features/auth/auth-context";
import { usePwa } from "@/features/pwa/pwa-provider";
import { isVerifiedAdminSession } from "@/domain/auth";
import {
  createPilotDeviceDiagnostics,
  serializePilotDeviceDiagnostics,
} from "@/features/pilot/pilot-diagnostics";
import { APP_METADATA } from "@/lib/app-metadata";
import { markAppBootReady } from "@/lib/performance/performance-monitor";
import {
  getAvailableModes,
  getInitialMode,
  getNavigation,
  normalizeView,
  type ShellView,
  type WorkMode,
} from "./shell-policy";
import { useSchoolShellData } from "./use-school-shell-data";

const MODE_OPTIONS = [
  { value: "delivery", label: "납품" },
  { value: "sales", label: "영업" },
] as const;

const subscribeToStoredMode = () => () => undefined;

const AdminWorkspace = dynamic(
  () => import("@/features/admin/admin-workspace").then((module) => module.AdminWorkspace),
  { loading: () => <div className="admin-loading" role="status">관리자 화면을 준비하고 있습니다.</div> },
);

function WorkspaceFeatureLoading({ label = "업무 화면을 준비하고 있습니다." }: { label?: string }) {
  return (
    <section className="shell-page shell-feature-loading" role="status" aria-label={label}>
      <div className="field-loading"><SkeletonCard /><SkeletonCard /></div>
    </section>
  );
}

const SalesExportWorkspace = dynamic(
  () => import("@/features/export/sales-export-workspace").then((module) => module.SalesExportWorkspace),
  { loading: () => <WorkspaceFeatureLoading label="내보내기 화면을 준비하고 있습니다." /> },
);

const SchoolDetail = dynamic(
  () => import("@/features/school-detail/school-detail").then((module) => module.SchoolDetail),
  { loading: () => <WorkspaceFeatureLoading label="학교 상세정보를 준비하고 있습니다." /> },
);

const SalesWorkspace = dynamic(
  () => import("@/features/sales-cycle/sales-workspace").then((module) => module.SalesWorkspace),
  { loading: () => <WorkspaceFeatureLoading label="영업 화면을 준비하고 있습니다." /> },
);

const SchoolSearch = dynamic(
  () => import("@/features/search/school-search").then((module) => module.SchoolSearch),
  {
    loading: () => (
      <div className="school-search-layer" role="dialog" aria-modal="true" aria-label="학교 검색 준비 중">
        <span className="school-search-backdrop" />
        <section className="school-search-panel school-search-panel--loading" role="status">
          <span className="search-pulse" aria-hidden="true" />
          <strong>이 기기의 학교 지도를 여는 중이에요.</strong>
        </section>
      </div>
    ),
  },
);

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

function AppBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="app-brand">
      <span className="app-brand__mark" aria-hidden="true"><Icon name="route" size={compact ? 19 : 22} /></span>
      <span className="app-brand__wordmark"><strong>급식길</strong>{compact ? null : <small>ONNURIWAY</small>}</span>
    </div>
  );
}

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 11) return "좋은 아침이에요";
  if (hour < 17) return "힘찬 오후예요";
  return "오늘도 수고 많았어요";
}

function initials(name: string) {
  return Array.from(name.trim()).slice(0, 2).join("");
}

function schoolStatus(school: School) {
  if (school.operationalStatus !== "active" || school.possibleRelocation) {
    return { label: "운영 정보 확인 필요", tone: "attention" as const };
  }
  if (school.location.matchStatus === "confirmed") {
    return { label: "위치 확인됨", tone: "success" as const };
  }
  return { label: "위치 확인 필요", tone: "info" as const };
}

function ShellHeader({
  session,
  mode,
  availableModes,
  onModeChange,
}: {
  session: AuthenticatedSession;
  mode: WorkMode;
  availableModes: readonly WorkMode[];
  onModeChange: (mode: WorkMode) => void;
}) {
  return (
    <header className="workspace-header">
      <AppBrand />
      <div className="workspace-header__controls">
        {availableModes.length > 1 ? (
          <SegmentedControl
            className="mode-control"
            label="업무 모드"
            options={MODE_OPTIONS.filter((option) => availableModes.includes(option.value))}
            value={mode}
            onChange={onModeChange}
          />
        ) : (
          <span className="mode-label"><i aria-hidden="true" />{mode === "delivery" ? "납품 모드" : "영업 모드"}</span>
        )}
        <div className="employee-avatar" aria-label={`${session.displayName} 로그인됨`}>
          {initials(session.displayName)}
        </div>
      </div>
    </header>
  );
}

function ShellNavigation({
  mode,
  view,
  onNavigate,
}: {
  mode: WorkMode;
  view: ShellView;
  onNavigate: (view: ShellView) => void;
}) {
  return (
    <nav className="workspace-navigation" aria-label="주요 메뉴">
      <div className="workspace-navigation__brand"><AppBrand compact /></div>
      <div className="workspace-navigation__items">
        {getNavigation(mode).map((item) => (
          <button
            key={item.id}
            type="button"
            data-active={view === item.id}
            aria-current={view === item.id ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon as IconName} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <span className="workspace-navigation__route" aria-hidden="true"><i /><i /><i /></span>
    </nav>
  );
}

function SchoolList({
  schools,
  status,
  onRetry,
  onSelect,
  emptyMessage = "표시할 학교가 없습니다.",
}: {
  schools: School[];
  status: "loading" | "ready" | "error";
  onRetry: () => void;
  onSelect: (school: School) => void;
  emptyMessage?: string;
}) {
  if (status === "loading" && schools.length === 0) {
    return <div className="school-grid" aria-label="학교 목록 불러오는 중">{[0, 1, 2].map((item) => <SkeletonCard key={item} />)}</div>;
  }

  if (status === "error" && schools.length === 0) {
    return (
      <SoftCard className="shell-empty-state" role="alert">
        <span className="shell-empty-state__icon"><Icon name="building" /></span>
        <h3>학교 정보를 불러오지 못했어요.</h3>
        <p>연결을 확인한 뒤 다시 시도해주세요.</p>
        <GlassButton compact onClick={onRetry}>다시 불러오기</GlassButton>
      </SoftCard>
    );
  }

  if (schools.length === 0) {
    return (
      <SoftCard className="shell-empty-state">
        <span className="shell-empty-state__icon"><Icon name="building" /></span>
        <h3>아직 연결된 학교가 없어요.</h3>
        <p>{emptyMessage}</p>
      </SoftCard>
    );
  }

  return (
    <div className="school-grid">
      {schools.map((school) => {
        const schoolState = schoolStatus(school);
        return (
          <button
            className="school-card"
            data-tone={schoolState.tone}
            key={school.schoolId}
            type="button"
            onClick={() => onSelect(school)}
          >
            <span className="school-card__rail" aria-hidden="true" />
            <span className="school-card__topline">
              <span className="school-card__icon"><Icon name="building" size={19} /></span>
              <StatusBadge tone={schoolState.tone}>{schoolState.label}</StatusBadge>
            </span>
            <strong>{school.name}</strong>
            <span className="school-card__address"><Icon name="location" size={15} />{school.address.road ?? "주소 확인 필요"}</span>
            <span className="school-card__footer">
              <span>{DISTRICT_LABELS[school.district]} · {SCHOOL_TYPE_LABELS[school.schoolType]}</span>
              <Icon name="chevron-right" size={18} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DeliveryHome({
  session,
  schoolData,
  onSelect,
  onOpenSearch,
}: {
  session: AuthenticatedSession;
  schoolData: ReturnType<typeof useSchoolShellData>;
  onSelect: (school: School) => void;
  onOpenSearch: () => void;
}) {
  return (
    <section className="shell-page shell-home" aria-labelledby="delivery-home-title">
      <div className="shell-hero shell-hero--delivery">
        <div>
          <p className="shell-kicker">DELIVERY · SCHOOL</p>
          <p className="shell-greeting">{session.displayName}님, {greetingForNow()}.</p>
          <h1 id="delivery-home-title">학교를 찾고<br /><em>현장으로.</em></h1>
        </div>
        <button
          className="school-search-trigger"
          type="button"
          onClick={onOpenSearch}
        >
          <span><Icon name="search" /><span><strong>학교 이름으로 찾기</strong><small>학교명 · 초성 · 주소</small></span></span>
          <Icon name="chevron-right" />
        </button>
      </div>

      <div className="shell-section-heading">
        <div><p>READY TO GO</p><h2>연결된 학교</h2></div>
        <StatusBadge tone={schoolData.status === "ready" ? "success" : "neutral"}>
          {schoolData.status === "ready" ? `${schoolData.schools.length}곳` : "동기화 중"}
        </StatusBadge>
      </div>
      <SchoolList {...schoolData} onRetry={schoolData.retry} onSelect={onSelect} />
    </section>
  );
}

function SettingsPage({ session }: { session: AuthenticatedSession }) {
  const { logout } = useAuth();
  const { install, installState, isOnline } = usePwa();
  const { showToast } = useToast();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [exportingDiagnostics, setExportingDiagnostics] = useState(false);

  const roleLabels = session.claims.roleScopes.map((scope) => ({
    delivery: "납품",
    sales: "영업",
    viewer: "조회",
    admin: "관리",
  })[scope]);

  const performLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      setLoggingOut(false);
      setConfirmingLogout(false);
      showToast("로그아웃하지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  const exportDeviceDiagnostics = async () => {
    setExportingDiagnostics(true);
    const serialized = serializePilotDeviceDiagnostics(createPilotDeviceDiagnostics({
      online: isOnline,
      installed: installState === "installed",
    }));
    try {
      await navigator.clipboard.writeText(serialized);
      showToast("개인정보 없는 기기 진단을 복사했습니다.");
    } catch {
      const objectUrl = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
      const download = document.createElement("a");
      download.href = objectUrl;
      download.download = `onnuriway-device-diagnostics-${Date.now()}.json`;
      download.hidden = true;
      document.body.append(download);
      download.click();
      download.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      showToast("개인정보 없는 기기 진단을 저장했습니다.");
    } finally {
      setExportingDiagnostics(false);
    }
  };

  return (
    <section className="shell-page settings-page" aria-labelledby="settings-title">
      <div className="shell-page-heading">
        <p className="shell-kicker">ACCOUNT · DEVICE</p>
        <h1 id="settings-title">설정</h1>
        <p>현재 계정과 이 기기의 앱 정보를 확인합니다.</p>
      </div>

      <div className="settings-grid">
        <SoftCard className="profile-card" tone="accent">
          <div className="profile-card__avatar">{initials(session.displayName)}</div>
          <div><span>로그인 계정</span><h2>{session.displayName}</h2><p>{session.claims.employeeId}</p></div>
          <div className="profile-card__roles">{roleLabels.map((role) => <StatusBadge key={role} tone="success">{role} 업무</StatusBadge>)}</div>
        </SoftCard>

        <SoftCard className="settings-list">
          <div><span className="settings-list__icon"><Icon name="check" /></span><span><strong>세션 보호</strong><small>권한 변경을 실시간으로 확인합니다.</small></span><StatusBadge tone="success">안전하게 연결됨</StatusBadge></div>
          <div><span className="settings-list__icon"><Icon name="download" /></span><span><strong>기기 앱</strong><small>{installState === "installed" ? "홈 화면에서 독립 실행됩니다." : "설치하면 오프라인에서도 빠르게 시작합니다."}</small></span>{installState === "available" ? <button className="pwa-install-action" type="button" onClick={() => void install()}>앱 설치</button> : <StatusBadge tone={installState === "installed" ? "success" : "neutral"}>{installState === "installed" ? "설치됨" : "브라우저에서 사용 중"}</StatusBadge>}</div>
          <div><span className="settings-list__icon"><Icon name={isOnline ? "refresh" : "wifi-off"} /></span><span><strong>네트워크</strong><small>{isOnline ? "최신 정보와 권한을 확인할 수 있습니다." : "저장된 학교 정보만 표시합니다."}</small></span><StatusBadge tone={isOnline ? "success" : "attention"}>{isOnline ? "온라인" : "오프라인"}</StatusBadge></div>
          <div><span className="settings-list__icon"><Icon name="sparkles" /></span><span><strong>디자인 시스템</strong><small>Aurora · Soft Solid · Liquid Glass</small></span><StatusBadge>v1.0</StatusBadge></div>
          <div><span className="settings-list__icon"><Icon name="user" /></span><span><strong>기기 데이터</strong><small>로그아웃하면 비공개 로컬 상태를 정리합니다.</small></span><StatusBadge tone="info">이 기기</StatusBadge></div>
          <div><span className="settings-list__icon"><Icon name="clipboard" /></span><span><strong>Pilot 기기 진단</strong><small>개인정보 없이 성능·캐시·연결 상태만 내보냅니다. {APP_METADATA.buildVersion}</small></span><button className="pwa-install-action" type="button" disabled={exportingDiagnostics} onClick={() => void exportDeviceDiagnostics()}>{exportingDiagnostics ? "준비 중…" : "진단 내보내기"}</button></div>
        </SoftCard>

        <GlassButton className="settings-logout" variant="quiet" onClick={() => setConfirmingLogout(true)}>
          <span><Icon name="logout" />로그아웃</span><Icon name="chevron-right" />
        </GlassButton>
      </div>

      <BottomSheet
        open={confirmingLogout}
        title="로그아웃할까요?"
        description="이 기기의 로그인 상태와 비공개 임시 데이터를 안전하게 정리합니다."
        onClose={() => {
          if (!loggingOut) setConfirmingLogout(false);
        }}
      >
        <div className="logout-actions">
          <GlassButton variant="quiet" disabled={loggingOut} onClick={() => setConfirmingLogout(false)}>계속 사용하기</GlassButton>
          <GlassButton variant="danger" disabled={loggingOut} onClick={() => void performLogout()}>{loggingOut ? "로그아웃 중…" : "로그아웃"}</GlassButton>
        </div>
      </BottomSheet>
    </section>
  );
}

function AppShellContent({ session }: { session: AuthenticatedSession }) {
  const availableModes = getAvailableModes(session.claims.roleScopes);
  const storageKey = `onnuriway:private:v1:mode:${session.uid}`;
  const storedMode = useSyncExternalStore(
    subscribeToStoredMode,
    () => {
      try {
        return localStorage.getItem(storageKey);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const [chosenMode, setChosenMode] = useState<WorkMode | null>(null);
  const mode = chosenMode && availableModes.includes(chosenMode)
    ? chosenMode
    : getInitialMode(session.claims.roleScopes, storedMode);
  const [view, setView] = useState<ShellView>("schools");
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMounted, setSearchMounted] = useState(false);
  const schoolData = useSchoolShellData(mode === "delivery" && view === "schools" && !selectedSchool);

  const openSearch = () => {
    setSearchMounted(true);
    setSearchOpen(true);
  };

  const changeMode = (nextMode: WorkMode) => {
    setChosenMode(nextMode);
    setView((current) => normalizeView(nextMode, current));
    setSelectedSchool(null);
    try {
      localStorage.setItem(storageKey, nextMode);
    } catch {
      // The mode still changes for this session when storage is unavailable.
    }
  };

  const navigate = (nextView: ShellView) => {
    setSelectedSchool(null);
    setView(nextView);
  };

  let content;
  if (selectedSchool) {
    content = <SchoolDetail key={`${mode}:${selectedSchool.schoolId}`} school={selectedSchool} session={session} mode={mode} onBack={() => setSelectedSchool(null)} />;
  } else if (view === "settings") {
    content = <SettingsPage session={session} />;
  } else if (view === "activity" && mode === "sales") {
    content = <SalesExportWorkspace session={session} />;
  } else if (mode === "sales") {
    content = <SalesWorkspace session={session} onSelectSchool={setSelectedSchool} onOpenSearch={openSearch} />;
  } else {
    content = <DeliveryHome session={session} schoolData={schoolData} onSelect={setSelectedSchool} onOpenSearch={openSearch} />;
  }

  return (
    <main className="workspace-shell" data-mode={mode}>
      <div className="aurora-background" aria-hidden="true"><i /><i /><i /></div>
      <ShellHeader session={session} mode={mode} availableModes={availableModes} onModeChange={changeMode} />
      <ShellNavigation mode={mode} view={view} onNavigate={navigate} />
      <div className="workspace-content">{content}</div>
      {searchMounted ? (
        <SchoolSearch
          open={searchOpen}
          session={session}
          roleScope={mode}
          onClose={() => setSearchOpen(false)}
          onSchoolResolved={setSelectedSchool}
        />
      ) : null}
    </main>
  );
}

export function AppShell({ session }: { session: AuthenticatedSession }) {
  useEffect(() => {
    markAppBootReady("runtime");
  }, []);

  if (isVerifiedAdminSession(session.claims)) {
    return <ToastProvider><AdminWorkspace session={session} /></ToastProvider>;
  }
  return <ToastProvider><AppShellContent session={session} /></ToastProvider>;
}
