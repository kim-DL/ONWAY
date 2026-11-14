import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "../../../src/components/ui/toast";
import { PinChangeDialog } from "../../../src/features/auth/pin-change-dialog";
import { EmployeesPage } from "../../../src/features/admin/pages/admin-employees-page";
import { AdminInteractionProvider } from "../../../src/features/admin/admin-interaction";
import styles from "../../../src/features/admin/admin-workspace.module.css";
import { adminFixtureData } from "./admin-workspace-mock";

function Fixture() {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [revision, setRevision] = useState(0);
  const data = { ...adminFixtureData, generatedAt: new Date(Date.UTC(2026, 10, 14, 0, 0, revision)).toISOString(), employees: [...adminFixtureData.employees, { ...adminFixtureData.employees[0]!, employeeId: "FIXTURE-PENDING", displayName: "Google 대기 운영자", permissionsVersion: 0 }] };
  return <main className={styles.root} style={{ padding: "24px", minHeight: "100vh" }}>
    {document.documentElement.dataset.fixture === "pin" ? <section aria-label="직원 설정">
      <h1>설정</h1><p>검증 직원 · 로그인 유지</p>
      <button type="button" onClick={() => setOpen(true)}>PIN 변경</button>
      <label><input type="checkbox" checked={online} onChange={(event) => setOnline(event.target.checked)} />온라인</label>
      {open ? <PinChangeDialog isOnline={online} onClose={() => setOpen(false)} /> : null}
    </section> : <AdminInteractionProvider><button type="button" onClick={() => setRevision((value) => value + 1)}>검증 새로고침</button><EmployeesPage data={data} currentEmployeeId="FIXTURE-ADMIN" onReload={async () => { setRevision((value) => value + 1); }} /></AdminInteractionProvider>}
  </main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><ToastProvider><Fixture /></ToastProvider></StrictMode>);
