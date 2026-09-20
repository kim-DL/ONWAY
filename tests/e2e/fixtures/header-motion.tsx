import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ShellHeader } from "../../../src/features/app-shell/app-shell-header";
import { WelcomeGreeting } from "../../../src/features/app-shell/welcome-greeting";
import { useHeaderMotionPreference } from "../../../src/features/app-shell/header-motion-preference";
import type { WorkMode } from "../../../src/features/app-shell/shell-policy";
import { OnnuriLoader } from "../../../src/components/ui/onnuri-loader";

function HeaderMotionFixture() {
  const [mode, setMode] = useState<WorkMode>("customer");
  const [activity, setActivity] = useState(false);
  const { paused, setPaused } = useHeaderMotionPreference();
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, headerFixtureMode: "customer" }, "");
    const restore = (event: PopStateEvent) => {
      if (event.state?.headerFixtureMode) setMode(event.state.headerFixtureMode);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const changeMode = (next: WorkMode) => {
    if (next === mode) return;
    setMode(next);
    window.history.pushState({ ...window.history.state, headerFixtureMode: next }, "");
  };
  return <main className="workspace-shell" data-mode={mode}>
    <div className="aurora-background" aria-hidden="true"><i /><i /><i /></div>
    <ShellHeader mode={mode} availableModes={["customer", "delivery", "sales", "inventory"]} onModeChange={changeMode} />
    <section className="shell-page"><div className="shell-hero">
      <WelcomeGreeting key={`${mode}:${activity}`} className="shell-greeting" titleId="motion-title" title={mode === "customer" ? "거래처 정보를" : mode === "delivery" ? "어느 학교로" : "다음 방문을"} accent={mode === "customer" ? "한눈에." : mode === "delivery" ? "갈까요?" : "준비해요."}>김대인 부장님, 반가워요.</WelcomeGreeting>
    </div><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <button type="button" style={{ minHeight: 44 }} onClick={() => setActivity((current) => !current)}>활동 탭</button>
      <button type="button" style={{ minHeight: 44 }} onClick={() => setPaused(!paused)}>{paused ? "모션 재개" : "모션 일시정지"}</button>
    </div></section>
  </main>;
}

function LoaderFixture() {
  const [mode, setMode] = useState<WorkMode>("customer");
  const [clicks, setClicks] = useState(0);
  const { paused, setPaused } = useHeaderMotionPreference();
  return <main className="workspace-shell" data-mode={mode} style={{ padding: 16 }}>
    <h1 style={{ fontSize: 24 }}>온누리 로더 검증</h1>
    <div role="group" aria-label="검증용 업무 모드" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {(["customer", "delivery", "sales"] as const).map((value) => <button key={value} type="button" data-mode={value} aria-pressed={mode === value} onClick={() => setMode(value)} style={{ minHeight: 44 }}>{value}</button>)}
      <button type="button" style={{ minHeight: 44 }} onClick={() => setPaused(!paused)}>{paused ? "모션 재개" : "모션 일시정지"}</button>
    </div>
    <section aria-label="로더 표시" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 20, paddingBlock: 24 }}>
      {(["small", "medium", "large"] as const).map((size) => <OnnuriLoader key={size} size={size} label={`${size} 정보 불러오는 중`} />)}
    </section>
    <section aria-label="명시적 로더 색상" style={{ display: "flex", flexWrap: "wrap", gap: 20, paddingBlock: 24 }}>
      {(["delivery", "customer", "sales"] as const).map((tone) => <OnnuriLoader key={tone} tone={tone} decorative />)}
      <button type="button" onClick={() => setClicks((value) => value + 1)} style={{ display: "inline-flex", gap: 12, alignItems: "center", minHeight: 44, color: "#315b65" }}><OnnuriLoader size="small" tone="inherit" decorative />저장 상태</button>
    </section>
    <output aria-label="검증용 버튼 입력 횟수">{clicks}</output>
  </main>;
}

createRoot(document.getElementById("root")!).render(document.documentElement.dataset.fixture === "loader" ? <StrictMode><LoaderFixture /></StrictMode> : <HeaderMotionFixture />);
