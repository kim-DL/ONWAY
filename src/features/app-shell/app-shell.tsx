"use client";

import "@/app/workspace.css";
import "@/components/ui/search-field.module.css";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { GlassButton } from "@/components/ui/glass-button";
import { Icon, type IconName } from "@/components/ui/icon";
import { LoadingStatus } from "@/components/ui/loading-status";
import { SoftCard } from "@/components/ui/soft-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { ToastProvider, useToast } from "@/components/ui/toast";
import type { School } from "@/domain/school";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { useAuth } from "@/features/auth/auth-context";
import { useLaunchTiming } from "@/features/auth/auth-loading";
import { usePwa } from "@/features/pwa/pwa-provider";
import { isVerifiedAdminSession } from "@/domain/auth";
import {
  createPilotDeviceDiagnostics,
  serializePilotDeviceDiagnostics,
} from "@/features/pilot/pilot-diagnostics";
import { APP_METADATA } from "@/lib/app-metadata";
import { customHistoryState } from "@/lib/browser-history";
import { markAppBootReady } from "@/lib/performance/performance-monitor";
import {
  getAvailableModes,
  getInitialMode,
  getNavigation,
  normalizeView,
  isSchoolWorkMode,
  isWorkMode,
  type ShellView,
  type WorkMode,
} from "./shell-policy";
import { DeliveryRecentSchools } from "./delivery-recent-schools";
import { useTimeGreeting } from "./time-greeting";
import { WelcomeGreeting } from "./welcome-greeting";
import { AppBrand } from "./app-brand";
import { ShellHeader } from "./app-shell-header";
import { useHeaderMotionPreference } from "./header-motion-preference";
import { DELIVERY_PHOTOS_ENABLED } from "@/features/delivery-photos/delivery-photo-feature";
import { readShellResume, shellResumeKey, writeShellResume } from "./shell-resume";
import { WorkspaceFeatureLoading } from "./workspace-feature-loading";
import { InitialWorkspaceTiming } from "./initial-workspace-timing";
import { readCustomerNavigationContext, type CustomerNavigationContext, type DeliveryPhotoEntry } from "./customer-photo-entry";

const subscribeToStoredMode = () => () => undefined;

const PinChangeDialog = dynamic(() => import("@/features/auth/pin-change-dialog").then((module) => module.PinChangeDialog));

function AdminWorkspaceLoading() {
  const { startedAt } = useLaunchTiming();
  return <LoadingStatus className="admin-loading" label="관리자 화면 여는 중" detail="관리자 화면을 준비하고 있습니다." startedAt={startedAt} />;
}

const AdminWorkspace = dynamic(
  () => import("@/features/admin/admin-workspace").then((module) => module.AdminWorkspace),
  { loading: AdminWorkspaceLoading },
);

const SalesActivityWorkspace = dynamic(
  () => import("@/features/sales-cycle/sales-activity-workspace").then((module) => module.SalesActivityWorkspace),
  { loading: () => <WorkspaceFeatureLoading mode="activity" /> },
);

const SchoolDetail = dynamic(
  () => import("@/features/school-detail/school-detail").then((module) => module.SchoolDetail),
  { loading: () => <WorkspaceFeatureLoading mode="detail" /> },
);

const SalesWorkspace = dynamic(
  () => import("@/features/sales-cycle/sales-workspace").then((module) => module.SalesWorkspace),
  { loading: () => <WorkspaceFeatureLoading mode="sales" /> },
);

const CustomerWorkspace = dynamic(
  () => import("@/features/customers/customer-workspace").then((module) => module.CustomerWorkspace),
  { loading: () => <WorkspaceFeatureLoading mode="customer" /> },
);

const DeliveryPhotoWorkspace = dynamic(
  () => import("@/features/delivery-photos/delivery-photo-workspace").then((module) => module.DeliveryPhotoWorkspace),
  { loading: () => <WorkspaceFeatureLoading mode="delivery" /> },
);

const InventoryWorkspace = dynamic(
  () => import("@/features/inventory/inventory-workspace").then((module) => module.InventoryWorkspace),
  { loading: () => <WorkspaceFeatureLoading mode="inventory" /> },
);

const SchoolSearch = dynamic(
  () => import("@/features/search/school-search").then((module) => module.SchoolSearch),
  {
    loading: () => (
      <div className="school-search-layer" role="dialog" aria-modal="true" aria-label="학교 검색 준비 중">
        <span className="school-search-backdrop" />
        <section className="school-search-panel school-search-panel--loading">
          <LoadingStatus label="학교 검색 여는 중" detail="학교 목록을 불러오고 있습니다." />
        </section>
      </div>
    ),
  },
);

function initials(name: string) {
  return Array.from(name.trim()).slice(0, 2).join("");
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

function DeliveryHome({
  session,
  onOpenSearch,
  onSelectSchool,
}: {
  session: AuthenticatedSession;
  onOpenSearch: () => void;
  onSelectSchool: (school: School) => void;
}) {
  const greeting = useTimeGreeting();
  return (
    <section className="shell-page shell-home" aria-labelledby="delivery-home-title">
      <div className="shell-hero shell-hero--delivery">
        <div>
          <p className="shell-kicker">학교 납품</p>
          <WelcomeGreeting className="shell-greeting" titleId="delivery-home-title"
            title="학교를 찾고" accent="현장으로.">
            {`${session.displayName}님, ${greeting}.`}
          </WelcomeGreeting>
        </div>
        <button
          className="school-search-trigger"
          type="button"
          onClick={onOpenSearch}
        >
          <span>{/* Static ceramic asset, sized before CSS loads. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="school-ceramic-icon" src="/ui/customer-ceramic-search-v1.webp" width={48} height={48} alt="" /><span><strong>학교 이름으로 찾기</strong><small>학교명 · 초성 · 주소</small></span></span>
          <Icon name="chevron-right" />
        </button>
      </div>
      <DeliveryRecentSchools session={session} onSelectSchool={onSelectSchool} onOpenSearch={onOpenSearch} />
    </section>
  );
}

function SettingsPage({ session, onBack, backLabel = "재고로 돌아가기" }: { session: AuthenticatedSession; onBack?: () => void; backLabel?: string }) {
  const pageRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const scroller = pageRef.current?.closest(".workspace-content");
    if (scroller) scroller.scrollTop = 0;
  }, []);
  const { logout } = useAuth();
  const { install, installState, isOnline } = usePwa();
  const { showToast } = useToast();
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [changingPin, setChangingPin] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [exportingDiagnostics, setExportingDiagnostics] = useState(false);
  const { paused: headerMotionPaused, setPaused: setHeaderMotionPaused } = useHeaderMotionPreference();

  const roleLabels = session.claims.roleScopes.map((scope) => ({
    delivery: "학교납품",
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
    <section ref={pageRef} className="shell-page settings-page" aria-labelledby="settings-title">
      {onBack ? <GlassButton compact variant="quiet" onClick={onBack}><Icon name="arrow-left" />{backLabel}</GlassButton> : null}
      <div className="shell-page-heading">
        <p className="shell-kicker">ACCOUNT · DEVICE</p>
        <h1 id="settings-title">설정</h1>
      </div>

      <div className="settings-grid">
        <SoftCard className="profile-card" tone="accent">
          <div className="profile-card__avatar">{initials(session.displayName)}</div>
          <div><span>로그인 계정</span><h2>{session.displayName}</h2><p>{session.claims.employeeId}</p></div>
          <div className="profile-card__roles">{roleLabels.map((role) => <StatusBadge key={role} tone="success">{role} 업무</StatusBadge>)}</div>
        </SoftCard>

        <SoftCard className="settings-list">
          {!session.claims.roleScopes.includes("admin") ? <div><span className="settings-list__icon"><Icon name="user" /></span><span><strong>로그인 PIN</strong><small>원하는 숫자 6자리로 바꿀 수 있습니다. 현재 로그인은 유지됩니다.</small></span><button className="pwa-install-action" type="button" onClick={() => setChangingPin(true)}>PIN 변경</button></div> : null}
          <div><span className="settings-list__icon"><Icon name="check" /></span><span><strong>세션 보호</strong><small>권한 변경을 실시간으로 확인합니다.</small></span><StatusBadge tone="success">안전하게 연결됨</StatusBadge></div>
          <div><span className="settings-list__icon"><Icon name="download" /></span><span><strong>기기 앱</strong><small>{installState === "installed" ? "홈 화면에서 독립 실행됩니다." : "설치하면 오프라인에서도 빠르게 시작합니다."}</small></span>{installState === "available" ? <button className="pwa-install-action" type="button" onClick={() => void install()}>앱 설치</button> : <StatusBadge tone={installState === "installed" ? "success" : "neutral"}>{installState === "installed" ? "설치됨" : "브라우저에서 사용 중"}</StatusBadge>}</div>
          <div><span className="settings-list__icon"><Icon name={isOnline ? "refresh" : "wifi-off"} /></span><span><strong>네트워크</strong><small>{isOnline ? "최신 정보와 권한을 확인할 수 있습니다." : "저장된 학교 정보만 표시합니다."}</small></span><StatusBadge tone={isOnline ? "success" : "attention"}>{isOnline ? "온라인" : "오프라인"}</StatusBadge></div>
          <div><span className="settings-list__icon"><Icon name="user" /></span><span><strong>기기 데이터</strong><small>로그아웃하면 비공개 로컬 상태를 정리합니다.</small></span><StatusBadge tone="info">이 기기</StatusBadge></div>
          <div><span className="settings-list__icon"><Icon name="sparkles" /></span><span><strong>화면 애니메이션</strong><small>화면 장식과 테두리에 적용됩니다. 기기의 동작 감소 설정을 따릅니다.</small></span><button className="pwa-install-action" type="button" role="switch" aria-label="화면 애니메이션" aria-checked={!headerMotionPaused} onClick={() => setHeaderMotionPaused(!headerMotionPaused)}>{headerMotionPaused ? "꺼짐" : "켜짐"}</button></div>
          <div><span className="settings-list__icon"><Icon name="clipboard" /></span><span><strong>기기 진단</strong><small>개인정보 없이 성능·캐시·연결 상태만 내보냅니다. {APP_METADATA.buildVersion}</small></span><button className="pwa-install-action" type="button" disabled={exportingDiagnostics} onClick={() => void exportDeviceDiagnostics()}>{exportingDiagnostics ? "준비 중…" : "진단 내보내기"}</button></div>
        </SoftCard>

        <GlassButton className="settings-logout" variant="quiet" onClick={() => setConfirmingLogout(true)}>
          <span><Icon name="logout" />로그아웃</span><Icon name="chevron-right" />
        </GlassButton>
      </div>

      {changingPin ? <PinChangeDialog isOnline={isOnline} onClose={() => setChangingPin(false)} /> : null}
      <BottomSheet
        open={confirmingLogout}
        dismissible={!loggingOut}
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
  const { startedAt } = useLaunchTiming();
  const availableModes = useMemo(
    () => getAvailableModes(session.claims.roleScopes),
    [session.claims.roleScopes],
  );
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
  const resumeKey = shellResumeKey(session.uid, session.claims.sessionVersion, session.claims.permissionsVersion);
  const [resumedLocation] = useState(() => readShellResume(resumeKey, availableModes));
  const [chosenMode, setChosenMode] = useState<WorkMode | null>(resumedLocation?.mode ?? null);
  const mode = chosenMode && availableModes.includes(chosenMode)
    ? chosenMode
    : getInitialMode(session.claims.roleScopes, storedMode);
  const [view, setView] = useState<ShellView>(resumedLocation?.view ?? "schools");
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [customerContext, setCustomerContext] = useState<CustomerNavigationContext | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMounted, setSearchMounted] = useState(false);
  const historyReadyRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const selectedSchoolId = selectedSchool?.schoolId;

  useEffect(() => {
    if (!selectedSchoolId) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [selectedSchoolId]);

  useEffect(() => {
    const scroller = contentRef.current;
    if ((mode !== "customer" && mode !== "inventory") || !scroller) return;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const showScrollbar = () => {
      scroller.dataset.scrolling = "";
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => { delete scroller.dataset.scrolling; }, 700);
    };
    scroller.addEventListener("scroll", showScrollbar, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", showScrollbar);
      clearTimeout(hideTimer);
      delete scroller.dataset.scrolling;
    };
  }, [mode]);

  const writeHistory = useCallback((
    next: { mode: WorkMode; view: ShellView; school: School | null; searchOpen: boolean; inventorySettingsReturn?: boolean; customerHomeReturn?: boolean; customerContext?: CustomerNavigationContext },
    replace = false,
  ) => {
    const state: Record<string, unknown> = {
      ...customHistoryState(window.history.state),
      onnuriwayShell: { version: 1, ...next },
    };
    if (next.customerContext?.kind === "photo-record") delete state.onnuriwaySheet;
    // Workspace modes share one URL; do not request a Next route restoration.
    if (replace) window.history.replaceState(state, "");
    else window.history.pushState(state, "");
    writeShellResume(resumeKey, next.mode, next.view);
  }, [resumeKey]);

  useEffect(() => {
    if (!historyReadyRef.current) {
      historyReadyRef.current = true;
      writeHistory({ mode, view, school: null, searchOpen: false }, true);
    }
    const restore = (event: PopStateEvent) => {
      const snapshot = event.state?.onnuriwayShell as {
        version?: unknown;
        mode?: unknown;
        view?: unknown;
        school?: unknown;
        searchOpen?: unknown;
        customerContext?: unknown;
      } | undefined;
      if (!snapshot || snapshot.version !== 1) return;
      const restoredMode = isWorkMode(snapshot.mode)
        && availableModes.includes(snapshot.mode)
        ? snapshot.mode
        : getInitialMode(session.claims.roleScopes);
      const restoredView = snapshot.view === "schools" || snapshot.view === "activity" || snapshot.view === "settings"
        ? normalizeView(restoredMode, snapshot.view)
        : "schools";
      const restoredSchool = isSchoolWorkMode(restoredMode) && snapshot.school
        && typeof snapshot.school === "object"
        && typeof (snapshot.school as { schoolId?: unknown }).schoolId === "string"
        ? snapshot.school as School
        : null;
      setChosenMode(restoredMode);
      setView(restoredView);
      setSelectedSchool(restoredSchool);
      setCustomerContext(readCustomerNavigationContext(snapshot.customerContext, restoredMode, restoredView));
      const nextSearchOpen = isSchoolWorkMode(restoredMode) && snapshot.searchOpen === true && restoredSchool === null;
      if (nextSearchOpen) setSearchMounted(true);
      setSearchOpen(nextSearchOpen);
      writeShellResume(resumeKey, restoredMode, restoredView);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [availableModes, mode, resumeKey, session.claims.roleScopes, view, writeHistory]);

  const openSearch = () => {
    setSearchMounted(true);
    setSearchOpen(true);
    writeHistory({ mode, view, school: null, searchOpen: true });
  };

  const closeSearch = () => {
    const snapshot = window.history.state?.onnuriwayShell as { searchOpen?: unknown } | undefined;
    if (snapshot?.searchOpen === true) window.history.back();
    else setSearchOpen(false);
  };

  const openSchool = (school: School) => {
    setSearchOpen(false);
    setSelectedSchool(school);
    writeHistory({ mode, view, school, searchOpen: false });
  };

  const resolveSearchSchool = (school: School) => {
    setSearchOpen(false);
    setSelectedSchool(school);
    writeHistory({ mode, view, school, searchOpen: false }, true);
  };

  const closeSchool = () => {
    const snapshot = window.history.state?.onnuriwayShell as { school?: unknown } | undefined;
    if (snapshot?.school) window.history.back();
    else setSelectedSchool(null);
  };

  const changeMode = (nextMode: WorkMode) => {
    if (!availableModes.includes(nextMode) || nextMode === mode) return;
    setChosenMode(nextMode);
    setView((current) => normalizeView(nextMode, current));
    setSelectedSchool(null);
    setSearchOpen(false);
    setCustomerContext(null);
    const nextView = normalizeView(nextMode, view);
    writeHistory({ mode: nextMode, view: nextView, school: null, searchOpen: false });
    try {
      localStorage.setItem(storageKey, nextMode);
    } catch {
      // The mode still changes for this session when storage is unavailable.
    }
  };

  const navigate = (nextView: ShellView) => {
    if (nextView === view && !selectedSchool) return;
    setSelectedSchool(null);
    setView(nextView);
    setSearchOpen(false);
    setCustomerContext(null);
    writeHistory({ mode, view: nextView, school: null, searchOpen: false,
      ...(mode === "inventory" && nextView === "settings" ? { inventorySettingsReturn: true } : {}),
      ...(mode === "customer" && view === "schools" && nextView !== "schools" ? { customerHomeReturn: true } : {}),
    });
  };

  const closeInventorySettings = () => {
    // A restored settings screen may have no preceding inventory history entry.
    if (window.history.state?.onnuriwayShell?.inventorySettingsReturn === true) {
      window.history.back();
    } else {
      setView("schools");
      writeHistory({ mode, view: "schools", school: null, searchOpen: false }, true);
    }
  };

  const openCustomerDetailFromPhoto = (customerId: string) => {
    const context: CustomerNavigationContext = { kind: "detail", customerId };
    setCustomerContext(context);
    setView("schools");
    writeHistory({ mode: "customer", view: "schools", school: null, searchOpen: false });
  };

  const openDeliveryPhotos = (entry?: DeliveryPhotoEntry) => {
    if (!entry) { navigate("activity"); return; }
    writeHistory({ mode: "customer", view: "schools", school: null, searchOpen: false,
      customerContext: { kind: "detail", customerId: entry.customerId } }, true);
    const context: CustomerNavigationContext = { kind: "photo-record", customerId: entry.customerId };
    setCustomerContext(context);
    setSelectedSchool(null);
    setSearchOpen(false);
    setView("activity");
    writeHistory({ mode: "customer", view: "activity", school: null, searchOpen: false,
      customerContext: context, customerHomeReturn: true });
  };

  const closeCustomerPage = () => {
    if (window.history.state?.onnuriwayShell?.customerHomeReturn === true) {
      window.history.back();
    } else {
      // A restored subpage still needs a way home without a prior history entry.
      setView("schools");
      setCustomerContext(null);
      writeHistory({ mode: "customer", view: "schools", school: null, searchOpen: false }, true);
    }
  };

  let content;
  if (selectedSchool && isSchoolWorkMode(mode)) {
    content = <SchoolDetail key={`${mode}:${selectedSchool.schoolId}`} school={selectedSchool} session={session} mode={mode} />;
  } else if (view === "settings") {
    content = <SettingsPage session={session} {...(mode === "inventory" ? { onBack: closeInventorySettings } : mode === "customer" ? { onBack: closeCustomerPage, backLabel: "거래처로 돌아가기" } : {})} />;
  } else if (mode === "customer" && view === "activity" && DELIVERY_PHOTOS_ENABLED) {
    content = <DeliveryPhotoWorkspace key={`${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}:${customerContext?.kind === "photo-record" ? customerContext.customerId : "all"}`}
      session={session} onOpenCustomerDetail={openCustomerDetailFromPhoto}
      requestedCustomerId={customerContext?.kind === "photo-record" ? customerContext.customerId : undefined} onReturnToCustomer={closeCustomerPage} />;
  } else if (mode === "customer") {
    content = <CustomerWorkspace key={`${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}:${customerContext?.kind === "detail" ? customerContext.customerId : "home"}`} session={session}
      requestedCustomerId={customerContext?.kind === "detail" ? customerContext.customerId : null}
      onOpenDeliveryPhotos={DELIVERY_PHOTOS_ENABLED ? openDeliveryPhotos : undefined} />;
  } else if (mode === "inventory") {
    content = <InventoryWorkspace key={`${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}`} session={session} onOpenAppSettings={() => navigate("settings")} />;
  } else if (view === "activity" && mode === "sales") {
    content = <SalesActivityWorkspace session={session} onSelectSchool={openSchool} onOpenSearch={openSearch} onOpenSchools={() => navigate("schools")} />;
  } else if (mode === "sales") {
    content = <SalesWorkspace session={session} onSelectSchool={openSchool} onOpenSearch={openSearch} />;
  } else {
    content = <DeliveryHome session={session} onOpenSearch={openSearch} onSelectSchool={openSchool} />;
  }

  return (
    <main className="workspace-shell" data-mode={mode} data-detail={selectedSchool ? "true" : "false"}>
      <div className="aurora-background" aria-hidden="true"><i /><i /><i /></div>
      <ShellHeader
        mode={mode}
        availableModes={availableModes}
        onModeChange={changeMode}
        onActiveModeClick={mode === "customer" && view === "activity" ? closeCustomerPage : undefined}
        onDetailBack={selectedSchool ? closeSchool : undefined}
      />
      {mode !== "inventory" && mode !== "customer" ? <ShellNavigation mode={mode} view={view} onNavigate={navigate} /> : null}
      <div ref={contentRef} className="workspace-content"><InitialWorkspaceTiming startedAt={startedAt}
        navigationKey={JSON.stringify([mode, view, selectedSchoolId ?? null, searchOpen])}>
        {content}
      </InitialWorkspaceTiming></div>
      {searchMounted && isSchoolWorkMode(mode) ? (
        <SchoolSearch
          open={searchOpen}
          session={session}
          roleScope={mode}
          onClose={closeSearch}
          onSchoolResolved={resolveSearchSchool}
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
