"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

import { AppIconMark } from "@/components/ui/app-icon-mark";
import { LoadingStatus } from "@/components/ui/loading-status";

const LaunchTimingContext = createContext<{
  startedAt?: number;
  restart: (submission?: boolean) => void;
  consumeSubmission: () => boolean;
}>({ restart: () => {}, consumeSubmission: () => false });

/** Only the launch journey shares this clock; each later operation owns its own. */
export function LaunchTimingProvider({ children }: { children: ReactNode }) {
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const submissionPending = useRef(false);
  const restart = useCallback((submission = false) => {
    submissionPending.current = submission;
    setStartedAt(Date.now());
  }, []);
  const consumeSubmission = useCallback(() => {
    const pending = submissionPending.current;
    submissionPending.current = false;
    return pending;
  }, []);
  const value = useMemo(() => ({ startedAt, restart, consumeSubmission }), [startedAt, restart, consumeSubmission]);
  return <LaunchTimingContext.Provider value={value}>{children}</LaunchTimingContext.Provider>;
}

export const useLaunchTiming = () => useContext(LaunchTimingContext);

export function AuthBrand() {
  return (
    <div className="auth-brand" aria-label="급식길">
      <span className="auth-brand__mark" aria-hidden="true"><AppIconMark /></span>
      <span><strong>급식길</strong><small>온누리종합식품</small></span>
    </div>
  );
}

export function AuthHeader() {
  return <header className="auth-header"><AuthBrand /></header>;
}

const launchLabels = {
  boot: "급식길 여는 중",
  session: "로그인 확인 중",
  workspace: "업무 화면 여는 중",
};

const launchDetails = {
  boot: "앱을 준비하고 있습니다.",
  session: "로그인 상태를 확인하고 있습니다.",
  workspace: "업무 화면을 준비하고 있습니다.",
};

export function AuthLoadingScreen({ stage, message }: {
  stage: keyof typeof launchLabels;
  message?: string | undefined;
}) {
  const { startedAt } = useLaunchTiming();
  return (
    <main className="auth-shell auth-shell--launch" data-auth-stage={stage}>
      <AuthHeader />
      <section className="auth-launch-content" aria-label="급식길 준비">
        <h1 className="sr-only">급식길</h1>
        <LoadingStatus
          label={message ?? launchLabels[stage]}
          detail={message ? undefined : launchDetails[stage]}
          startedAt={startedAt}
        />
      </section>
    </main>
  );
}
