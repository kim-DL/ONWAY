import { useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import { WelcomeGreeting } from "../../../src/features/app-shell/welcome-greeting";
import { setHeaderMotionPaused, useHeaderMotionPreference } from "../../../src/features/app-shell/header-motion-preference";
import { useTimeGreeting } from "../../../src/features/app-shell/time-greeting";

type Placement = "delivery" | "sales" | "activity" | "team";

function Fixture({ placement, longName, greetingText, realClock }: { placement: Placement; longName: boolean; greetingText?: string; realClock: boolean }) {
  const { paused } = useHeaderMotionPreference();
  const timeGreeting = useTimeGreeting();
  const [mounted, setMounted] = useState(true);
  const [revision, setRevision] = useState(0);
  const [updatedCopy, setUpdatedCopy] = useState(false);
  const copy = updatedCopy ? "김대인 부장님, 편안한 저녁 보내세요." : realClock ? `김대인 부장님, ${timeGreeting}.` : greetingText ?? (longName
    ? "김온누리직원님, 오늘도 반가워요."
    : "김온누리님, 오늘도 반가워요.");
  const hero = placement === "delivery" ? "shell-hero shell-hero--delivery"
    : placement === "sales" || placement === "team" ? "sales-cycle-hero" : "sales-activity-hero";
  const headings = {
    delivery: { title: "학교를 찾고", accent: "현장으로.", titleId: "delivery-home-title" },
    sales: { title: "오늘 움직일", accent: "학교의 흐름.", titleId: "sales-cycle-title" },
    activity: { title: "좋은 대화가", accent: "기다리고 있어요.", titleId: "sales-activity-title" },
    team: { title: "함께 이어가는", accent: "팀의 흐름.", titleId: "sales-team-title" },
  };
  const salesHome = placement === "sales" || placement === "team";
  return <main id="welcome-fixture" className="workspace-shell" data-mode={placement === "delivery" ? "delivery" : "sales"}>
    <div className="fixture-controls">
      <button type="button" role="switch" aria-label="인사 애니메이션" aria-checked={!paused}
        onClick={() => setHeaderMotionPaused(!paused)}>{paused ? "애니메이션 켜기" : "애니메이션 끄기"}</button>
      <output data-testid="motion-preference">{paused ? "paused" : "running"}</output>
      <button type="button" data-testid="toggle-page" onClick={() => setMounted(value => !value)}>{mounted ? "다른 페이지" : "인사로 돌아가기"}</button>
      <button type="button" data-testid="rerender-page" onClick={() => setRevision(value => value + 1)}>목록 갱신</button>
      <button type="button" data-testid="update-copy" onClick={() => setUpdatedCopy(true)}>시간대 변경</button>
    </div>
    {mounted ? <section className={`shell-page ${placement === "delivery" ? "shell-home" : salesHome ? "sales-cycle-page" : "sales-activity-page"}`}
      aria-label="오늘의 인사" data-fixture-revision={revision}>
      <div className={hero}>
        <div className={salesHome ? "sales-cycle-hero__copy" : undefined}>
          <p className="shell-kicker">{placement === "delivery" ? "DELIVERY · SCHOOL" : salesHome ? "SALES · MONTHLY ROUTE" : "SALES · ACTION DESK"}</p>
          <WelcomeGreeting className={salesHome ? "sales-cycle-hero__greeting" : "shell-greeting"} {...headings[placement]}>{copy}</WelcomeGreeting>
          <h2 data-testid="next-content">이번 달 학교</h2>
        </div>
      </div>
    </section> : <section aria-label="다른 페이지"><h2>다른 페이지</h2></section>}
    <div className="fixture-spacer" aria-hidden="true" />
    <button type="button" data-testid="page-bottom">페이지 아래</button>
  </main>;
}

const params = new URL(location.href).searchParams;
const requested = params.get("placement");
const placement: Placement = requested === "sales" || requested === "activity" || requested === "team" ? requested : "delivery";
const props = { placement, longName: params.get("long") === "true", greetingText: params.get("copy") ?? undefined, realClock: params.get("clock") === "true" };
const container = document.getElementById("root")!;
// The real React server renderer exercises getServerSnapshot; hydration is
// deliberately separate so tests can verify stopped CSS motion before effects run.
container.innerHTML = renderToString(<Fixture {...props} />);
container.dataset.ssrReady = "true";
window.addEventListener("welcome-fixture-hydrate", () => hydrateRoot(container, <Fixture {...props} />), { once: true });
