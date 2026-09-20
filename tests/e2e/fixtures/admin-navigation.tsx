import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import { AdminNavigation, ADMIN_NAVIGATION, type AdminView } from "../../../src/features/admin/admin-navigation";
import styles from "../../../src/features/admin/admin-navigation.module.css";
import { AdminWorkspace } from "../../../src/features/admin/admin-workspace";
import { ToastProvider } from "../../../src/components/ui/toast";
import type { AuthenticatedSession } from "../../../src/features/auth/auth-context";

function Fixture() {
  const [view, setView] = useState<AdminView>("overview");
  return (
    <main className={`admin-shell ${styles.layout}`}>
      <AdminNavigation view={view} onNavigate={setView} displayName="검증 관리자" needsSyncReview />
      <div className="admin-main">
        <div className="admin-content">
          <h1>{ADMIN_NAVIGATION.find((item) => item.id === view)?.label}</h1>
          <div style={{ minHeight: "1200px" }}><p>관리자 메뉴 검증 화면</p></div>
          <button type="button" style={{ minHeight: "44px" }}>마지막 작업</button>
        </div>
      </div>
    </main>
  );
}

const session = { uid: "SYNTHETIC-ADMIN", displayName: "김온누리 관리자", claims: { employeeId: "FIXTURE-ADMIN", roleScopes: ["admin", "delivery", "sales"], sessionVersion: 2, permissionsVersion: 3, adminApproved: true, signInProvider: "google.com" } } as AuthenticatedSession;
createRoot(document.getElementById("root")!).render(<StrictMode><ToastProvider>{document.documentElement.dataset.fixture === "workspace" ? <AdminWorkspace session={session} /> : <Fixture />}</ToastProvider></StrictMode>);
