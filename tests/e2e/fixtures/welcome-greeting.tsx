import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import { WelcomeGreeting } from "../../../src/features/app-shell/welcome-greeting";
import { setHeaderMotionPaused, useHeaderMotionPreference } from "../../../src/features/app-shell/header-motion-preference";

type Placement = "delivery" | "sales" | "activity";

function Fixture({ placement, longName }: { placement: Placement; longName: boolean }) {
  const { paused } = useHeaderMotionPreference();
  const copy = longName
    ? "이름이아주긴온누리종합식품영업지원담당직원님, 오늘도 반가워요."
    : "김온누리님, 오늘도 반가워요.";
  const hero = placement === "delivery" ? "shell-hero shell-hero--delivery"
    : placement === "sales" ? "sales-cycle-hero" : "sales-activity-hero";
  return <main id="welcome-fixture" className="workspace-shell" data-mode={placement === "delivery" ? "delivery" : "sales"}>
    <h1>웰컴 인사 검증</h1>
    <div className="fixture-controls">
      <button type="button" role="switch" aria-label="인사 애니메이션" aria-checked={!paused}
        onClick={() => setHeaderMotionPaused(!paused)}>{paused ? "애니메이션 켜기" : "애니메이션 끄기"}</button>
      <output data-testid="motion-preference">{paused ? "paused" : "running"}</output>
    </div>
    <section className={`shell-page ${placement === "delivery" ? "shell-home" : placement === "sales" ? "sales-cycle-page" : "sales-activity-page"}`}
      aria-label="오늘의 인사">
      <div className={hero}>
        <div className={placement === "sales" ? "sales-cycle-hero__copy" : undefined}>
          <WelcomeGreeting className={placement === "sales" ? "sales-cycle-hero__greeting" : "shell-greeting"}>{copy}</WelcomeGreeting>
          <h2 data-testid="next-content">좋은 대화가 기다리고 있어요.</h2>
        </div>
      </div>
    </section>
    <div className="fixture-spacer" aria-hidden="true" />
    <button type="button" data-testid="page-bottom">페이지 아래</button>
  </main>;
}

const params = new URL(location.href).searchParams;
const requested = params.get("placement");
const placement: Placement = requested === "sales" || requested === "activity" ? requested : "delivery";
const props = { placement, longName: params.get("long") === "true" };
const container = document.getElementById("root")!;
// The real React server renderer exercises getServerSnapshot; hydration is
// deliberately separate so tests can verify a static poster before effects run.
container.innerHTML = renderToString(<Fixture {...props} />);
container.dataset.ssrReady = "true";
window.addEventListener("welcome-fixture-hydrate", () => hydrateRoot(container, <Fixture {...props} />), { once: true });
