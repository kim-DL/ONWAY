import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { AuthLoadingScreen, LaunchTimingProvider, useLaunchTiming } from "../../../src/features/auth/auth-loading";
import { AuthGate } from "../../../src/features/auth/auth-gate";
import { LoadingStatus } from "../../../src/components/ui/loading-status";
import { WorkspaceFeatureLoading } from "../../../src/features/app-shell/workspace-feature-loading";
import { InitialWorkspaceTiming, useInitialWorkspaceStartedAt } from "../../../src/features/app-shell/initial-workspace-timing";

function WorkspaceJourney() {
  const { startedAt } = useLaunchTiming();
  const [mode, setMode] = useState<"customer" | "inventory">("customer");
  const [opened, setOpened] = useState(false);
  return <><div className="fixture-controls"><button onClick={() => setOpened(true)}>업무 진입</button><button onClick={() => setMode("inventory")}>재고 이동</button><button onClick={() => setMode("customer")}>거래처 복귀</button></div>
    {opened ? <main className="workspace-shell"><InitialWorkspaceTiming navigationKey={mode} startedAt={startedAt}><WorkspaceFeatureLoading key={mode} mode={mode} /></InitialWorkspaceTiming></main> : <AuthLoadingScreen stage="session" />}</>;
}

function InitialDataLoading() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const startedAt = useInitialWorkspaceStartedAt(state === "loading");
  return <main>
    <div className="fixture-controls"><button onClick={() => setState("ready")}>조회 완료</button><button onClick={() => setState("error")}>조회 실패</button><button onClick={() => setState("loading")}>다시 조회</button></div>
    {state === "loading" ? <LoadingStatus label="거래처 불러오는 중" detail="거래처 목록을 확인하고 있습니다." startedAt={startedAt} />
      : state === "error" ? <p role="alert">조회 실패</p> : <h1>거래처 목록</h1>}
  </main>;
}

function DataRetryJourney() {
  const { startedAt } = useLaunchTiming();
  const [opened, setOpened] = useState(false);
  return <><div className="fixture-controls"><button onClick={() => setOpened(true)}>데이터 조회 시작</button></div>
    {opened ? <InitialWorkspaceTiming navigationKey="customer" startedAt={startedAt}><InitialDataLoading /></InitialWorkspaceTiming> : <AuthLoadingScreen stage="session" />}</>;
}

function Fixture() {
  const [stage, setStage] = useState<"boot" | "session" | "workspace">("boot");
  const [done, setDone] = useState(false);
  const view = new URL(location.href).searchParams.get("view");
  if (view === "workspace") return <LaunchTimingProvider><WorkspaceJourney /></LaunchTimingProvider>;
  if (view === "data-retry") return <LaunchTimingProvider><DataRetryJourney /></LaunchTimingProvider>;
  if (view === "pin") return <LaunchTimingProvider><AuthGate /></LaunchTimingProvider>;
  if (view === "skeleton") return <main className="workspace-shell" data-mode="inventory"><WorkspaceFeatureLoading mode="inventory" /></main>;
  if (view === "operation") return <main><LoadingStatus label="사진 등록 중" detail="등록 결과를 확인하고 있습니다." /></main>;
  return <LaunchTimingProvider>
    <div className="fixture-controls"><button onClick={() => setStage("session")}>세션 단계</button><button onClick={() => setStage("workspace")}>업무 단계</button><button onClick={() => setDone(true)}>완료</button></div>
    {done ? <main><h1>업무 화면</h1><input aria-label="업무 검색" /></main> : <AuthLoadingScreen key={stage} stage={stage} />}
  </LaunchTimingProvider>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
