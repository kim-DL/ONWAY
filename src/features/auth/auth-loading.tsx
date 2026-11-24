"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

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

export function AuthBrand({ company = false }: { company?: boolean } = {}) {
  return (
    <div className="auth-brand" aria-label={company ? "온누리종합식품" : "급식길"}>
      <span className="auth-brand__mark" aria-hidden="true"><AppIconMark variant="company" /></span>
      <span><strong>{company ? "온누리종합식품" : "급식길"}</strong>{company ? null : <small>온누리종합식품</small>}</span>
    </div>
  );
}

export function AuthHeader({ company = false }: { company?: boolean } = {}) {
  return <header className="auth-header"><AuthBrand company={company} /></header>;
}

const launchLabels = {
  boot: "앱을 여는 중",
  session: "로그인 확인 중",
  workspace: "업무 화면 여는 중",
};

const launchDetails = {
  boot: "앱을 준비하고 있습니다.",
  session: "로그인 상태를 확인하고 있습니다.",
  workspace: "업무 화면을 준비하고 있습니다.",
};

interface LaunchScreenProps {
  stage: keyof typeof launchLabels;
  message?: string | undefined;
  waitingForConnection?: boolean | undefined;
}

const InitialLaunchContext = createContext<((screen: LaunchScreenProps | null) => void) | null>(null);

const LaunchReadyContext = createContext<(() => void) | null>(null);

export function useLaunchReady(ready: boolean) {
  const notify = useContext(LaunchReadyContext);
  useLayoutEffect(() => {
    if (ready) notify?.();
  }, [notify, ready]);
}

export function InitialLaunch({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<LaunchScreenProps | null>(null);
  const [ready, setReady] = useState(false);
  const notifyReady = useCallback(() => setReady(true), []);
  const [finished, setFinished] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const firstPaint = useRef<number | null>(null);

  useEffect(() => {
    firstPaint.current ??= performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? performance.now();
    if (!ready || finished || pending) return;
    const remaining = Math.max(0, 1050 - (performance.now() - firstPaint.current));
    let exitTimer: ReturnType<typeof setTimeout>;
    const holdTimer = setTimeout(() => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setFinished(true);
        return;
      }
      setLeaving(true);
      exitTimer = setTimeout(() => setFinished(true), 200);
    }, remaining);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(exitTimer);
    };
  }, [ready, finished, pending]);

  const report = useCallback((screen: LaunchScreenProps | null) => {
    setPending(screen);
    setLeaving(false);
  }, []);

  return <InitialLaunchContext.Provider value={finished ? null : report}>
    <div style={{ display: finished || leaving ? "contents" : "none" }}><LaunchReadyContext.Provider value={notifyReady}>{children}</LaunchReadyContext.Provider></div>
    {!finished && <div className="initial-launch" data-leaving={leaving}>
      <LaunchSurface {...(pending ?? { stage: "boot" })} />
    </div>}
  </InitialLaunchContext.Provider>;
}

export function AuthLoadingScreen({ stage, message, waitingForConnection }: LaunchScreenProps) {
  const report = useContext(InitialLaunchContext);
  useLayoutEffect(() => {
    if (!report) return;
    report({ stage, message, waitingForConnection });
    return () => report(null);
  }, [report, stage, message, waitingForConnection]);
  return report ? null : <LaunchSurface stage={stage} message={message} waitingForConnection={waitingForConnection} />;
}

function LaunchSurface({ stage, message, waitingForConnection = false }: LaunchScreenProps) {
  const { startedAt } = useLaunchTiming();
  return (
    <main className="auth-shell auth-shell--launch" data-auth-stage={waitingForConnection ? "connection" : stage}>
      <div className="auth-launch-group">
        <div className="auth-launch-brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- The shared offline logo is already sized and compressed. */}
          <img src="/brand/onnuri-food-logo-auth.webp" width={576} height={214} alt="" />
          <h1>온누리<wbr />종합식품</h1>
        </div>
        <div className="auth-launch-content">
          <LoadingStatus
            label={message ?? launchLabels[stage]}
            detail={message ? undefined : launchDetails[stage]}
            startedAt={startedAt}
            indicator={!waitingForConnection}
          />
        </div>
      </div>
    </main>
  );
}
