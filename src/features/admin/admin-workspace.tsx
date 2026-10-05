"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { GlassButton } from "@/components/ui/glass-button";
import { Icon } from "@/components/ui/icon";
import { OnnuriLoader } from "@/components/ui/onnuri-loader";
import { useToast } from "@/components/ui/toast";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { SalesExportWorkspace } from "@/features/export/sales-export-workspace";
import { INVENTORY_ENABLED } from "@/features/inventory/inventory-feature";

import type { AdminWorkspaceData } from "./admin-contract";
import { formatDate, schoolNeedsReview } from "./admin-display";
import { AdminInteractionProvider, useAdminInteraction } from "./admin-interaction";
import { AdminNavigation, type AdminView } from "./admin-navigation";
import navigationStyles from "./admin-navigation.module.css";
import { adminErrorMessage, adminRepository } from "./admin-repository";
import styles from "./admin-workspace.module.css";
import { AuditPage } from "./pages/admin-audit-page";
import { CyclesPage } from "./pages/admin-cycles-page";
import { EmployeesPage } from "./pages/admin-employees-page";
import { OverviewPage } from "./pages/admin-overview-page";
import { SchoolsPage } from "./pages/admin-schools-page";
import { SettingsPage } from "./pages/admin-settings-page";
import { SyncPage } from "./pages/admin-sync-page";

const CustomerAdmin = dynamic(
  () => import("@/features/customers/customer-admin").then((module) => module.CustomerAdmin),
  { loading: () => <div className="admin-loading" role="status">거래처 관리를 준비하고 있습니다.</div> },
);

const InventoryWorkspace = dynamic(
  () => import("@/features/inventory/inventory-workspace").then((module) => module.InventoryWorkspace),
  { loading: () => <div className="admin-loading" role="status">재고 관리를 준비하고 있습니다.</div> },
);

function AdminWorkspaceContent({ session }: { session: AuthenticatedSession }) {
  const { showToast } = useToast();
  const [view, setView] = useState<AdminView>("overview");
  const [data, setData] = useState<AdminWorkspaceData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const loadGeneration = useRef(0);
  const interaction = useAdminInteraction();

  const load = useCallback(
    async (cycleId: string | null = null, silent = false) => {
      const generation = ++loadGeneration.current;
      if (!silent) setStatus("loading");
      else setRefreshing(true);
      setRefreshError(false);
      try {
        const result = await adminRepository.load(cycleId);
        if (generation !== loadGeneration.current) return;
        setData(result);
        setStatus("ready");
      } catch (error) {
        if (generation !== loadGeneration.current) return;
        if (!silent) setStatus("error");
        else setRefreshError(true);
        showToast(adminErrorMessage(error));
      } finally {
        if (generation === loadGeneration.current) setRefreshing(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    const generation = ++loadGeneration.current;
    adminRepository.load().then((result) => {
      if (generation !== loadGeneration.current) return;
      setData(result);
      setStatus("ready");
    }).catch((error: unknown) => {
      if (generation !== loadGeneration.current) return;
      setStatus("error");
      showToast(adminErrorMessage(error));
    });
    const requests = loadGeneration;
    return () => { ++requests.current; };
  }, [showToast]);

  const navigate = (next: AdminView) => {
    if (next === view || !interaction.canNavigate()) return;
    setView(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const reload = useCallback(async () => {
    await load(data?.selectedCycleId ?? null, true);
  }, [data?.selectedCycleId, load]);

  let content: ReactNode;
  if (view === "customers")
    content = <CustomerAdmin key={`${session.uid}:${session.claims.sessionVersion}`} session={session} />;
  else if (INVENTORY_ENABLED && view === "inventory")
    content = <InventoryWorkspace key={`${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}`} session={session} admin />;
  else if (status === "loading")
    content = (
      <div className="admin-loading" role="status">
        <OnnuriLoader size="large" decorative />
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
    content = <OverviewPage data={data} onNavigate={navigate} />;
  else if (view === "schools")
    content = <SchoolsPage data={data} onOpenSync={() => navigate("sync")} />;
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
  else if (view === "audit") content = <AuditPage initialLogs={data.audits} employees={data.employees} />;
  else
    content = <SettingsPage data={data} session={session} onReload={reload} />;

  return (
    <main className={`admin-shell ${navigationStyles.layout} ${styles.workspace}`}>
      <AdminNavigation view={view} onNavigate={navigate} displayName={session.displayName}
        needsSyncReview={data?.schools.some(schoolNeedsReview) ?? false} />
      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="admin-topbar__identity"><Icon name="settings" size={18} />관리자</span>
            <span className="admin-topbar__date">{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(new Date())}</span>
          </div>
          <button type="button" disabled={refreshing || status === "loading"} onClick={() => {
            if (interaction.canNavigate()) void reload();
          }}>
            <Icon name="refresh" size={16} />
            {refreshing ? "새로 고치는 중" : "새로고침"}
          </button>
        </header>
        <div className="admin-content" aria-busy={refreshing}>
          {refreshError ? <div className="admin-refresh-note" role="alert"><Icon name="bell" size={17} /><span>최신 정보를 가져오지 못했습니다. 이전에 확인한 정보를 표시하고 있어요. 다시 새로고침해주세요.</span></div> : null}
          {content}
          {data && view !== "customers" && view !== "inventory" ? <small className="admin-data-time">마지막 서버 확인 · {formatDate(data.generatedAt)}</small> : null}
        </div>
      </div>
    </main>
  );
}

export function AdminWorkspace({ session }: { session: AuthenticatedSession }) {
  return <AdminInteractionProvider><AdminWorkspaceContent session={session} /></AdminInteractionProvider>;
}
