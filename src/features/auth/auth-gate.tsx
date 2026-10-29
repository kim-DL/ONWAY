"use client";

import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { LoadingStatus } from "@/components/ui/loading-status";
import { markAppBootReady } from "@/lib/performance/performance-monitor";
import { useAuth } from "./auth-context";
import { AuthBrand, AuthHeader, AuthLoadingScreen, useLaunchTiming } from "./auth-loading";

function AppShellFallback() {
  return <AuthLoadingScreen stage="workspace" />;
}

const AppShell = dynamic(
  () => import("@/features/app-shell/app-shell").then((module) => module.AppShell),
  { loading: AppShellFallback },
);

function AuthSplash({ message }: { message?: string | undefined }) {
  return <AuthLoadingScreen stage="session" message={message} />;
}

function PinIndicator({ length }: { length: number }) {
  return (
    <div className="pin-indicator" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} data-filled={index < length} />
      ))}
    </div>
  );
}

function PinLogin({ initialError = null }: { initialError?: string | null }) {
  const { login, loginWithGoogle } = useAuth();
  const { startedAt, restart, consumeSubmission } = useLaunchTiming();
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submissionLockRef = useRef(false);

  useEffect(() => {
    // Focus only after React has removed the pending input's disabled state.
    if (error && !submitting && !adminSubmitting) inputRef.current?.focus();
  }, [adminSubmitting, error, submitting]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pin.length !== 6 || submitting || adminSubmitting || submissionLockRef.current) return;

    submissionLockRef.current = true;
    restart(true);
    setSubmitting(true);
    setError(null);
    try {
      await login(pin);
    } catch (caught) {
      consumeSubmission();
      submissionLockRef.current = false;
      setPin("");
      setError(caught instanceof Error ? caught.message : "PIN을 확인해주세요.");
      setSubmitting(false);
    }
  };

  const submitAdmin = async () => {
    if (adminSubmitting || submitting || submissionLockRef.current) return;
    submissionLockRef.current = true;
    restart(true);
    setAdminSubmitting(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (caught) {
      consumeSubmission();
      submissionLockRef.current = false;
      setError(caught instanceof Error ? caught.message : "관리자 로그인을 완료하지 못했습니다.");
      setAdminSubmitting(false);
    }
  };

  return (
    <main className="auth-shell auth-shell--login">
      <AuthHeader />
      <section className="login-story" aria-label="급식길 소개">
        <div className="login-story__copy">
          <p className="auth-eyebrow">온누리종합식품 현장 업무</p>
          <h1>오늘의 업무를<br /><em>시작합니다.</em></h1>
          <p>납품부터 재고까지, 필요한 업무를 한곳에서.</p>
        </div>
      </section>

      <section className="login-panel" aria-labelledby="pin-title">
        <div className="login-card">
          <h2 id="pin-title">6자리 PIN을<br />입력해주세요.</h2>

          <form onSubmit={submit} className="pin-form">
            <label htmlFor="employee-pin">직원 PIN</label>
            <div className="pin-field" onClick={() => inputRef.current?.focus()}>
              <PinIndicator length={pin.length} />
              <input
                ref={inputRef}
                id="employee-pin"
                name="employee-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoComplete="off"
                autoFocus
                data-1p-ignore
                disabled={submitting || adminSubmitting}
                value={pin}
                onChange={(event) => {
                  setPin(event.target.value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
                aria-describedby={error ? "pin-error" : "pin-help"}
                aria-invalid={Boolean(error)}
              />
            </div>
            <p id="pin-help" className="sr-only">숫자 6자리 PIN</p>
            {error ? <p id="pin-error" className="pin-error" role="alert" aria-live="assertive">{error}</p> : null}
            <button type="submit" aria-busy={submitting} disabled={pin.length !== 6 || submitting || adminSubmitting}>
              <span>{submitting ? "로그인 확인 중" : "급식길 시작하기"}</span>
              {submitting ? <LoadingIndicator size="small" tone="inherit" decorative startedAt={startedAt} /> : <span aria-hidden="true">→</span>}
            </button>
          </form>
          <div className="admin-login-separator"><span>또는</span></div>
          <button
            className="admin-google-login"
            type="button"
            aria-busy={adminSubmitting}
            disabled={adminSubmitting || submitting}
            onClick={() => void submitAdmin()}
          >
            {adminSubmitting ? <LoadingIndicator size="small" decorative startedAt={startedAt} /> : <span className="google-mark" aria-hidden="true">G</span>}
            {adminSubmitting ? "관리자 로그인 확인 중" : "Google로 관리자 로그인"}
          </button>
          <div className="login-progress">
            {submitting || adminSubmitting ? (
              <LoadingStatus
                label={<span className="sr-only">{adminSubmitting ? "관리자 로그인 확인 중" : "로그인 확인 중"}</span>}
                detail={adminSubmitting ? "관리자 로그인 응답을 기다리고 있습니다." : "로그인 상태를 확인하고 있습니다."}
                startedAt={startedAt}
                indicator={false}
              />
            ) : null}
          </div>
        </div>
        <p className="login-support">PIN을 잊으셨나요? 운영 관리자에게 문의해주세요.</p>
      </section>
    </main>
  );
}

function InvalidSession({ message }: { message: string }) {
  const { dismissInvalidSession } = useAuth();
  return (
    <main className="auth-shell auth-shell--center">
      <section className="session-card" role="alert">
        <span className="session-card__icon" aria-hidden="true">!</span>
        <p className="auth-eyebrow">SESSION NOTICE</p>
        <h1>다시 로그인이<br />필요합니다.</h1>
        <p>{message}</p>
        <button type="button" onClick={dismissInvalidSession}>PIN 로그인으로 돌아가기</button>
      </section>
    </main>
  );
}

function Unconfigured() {
  return (
    <main className="auth-shell auth-shell--center">
      <section className="session-card" role="alert">
        <AuthBrand />
        <p className="auth-eyebrow">CONFIGURATION REQUIRED</p>
        <h1>앱 연결 설정이<br />필요합니다.</h1>
        <p>Firebase 공개 환경 변수를 설정한 뒤 앱을 다시 시작해주세요.</p>
      </section>
    </main>
  );
}

export function AuthGate() {
  const { state } = useAuth();
  const { restart, consumeSubmission } = useLaunchTiming();
  const previousStatus = useRef(state.status);

  useLayoutEffect(() => {
    // A submitted PIN/Google request continues its clock into session resolution.
    // Logout, cleanup, and a sign-in from another tab start fresh feedback.
    if (state.status === "resolving" && previousStatus.current !== "resolving") {
      if (!consumeSubmission()) restart();
    } else if (state.status !== "resolving") {
      consumeSubmission();
    }
    previousStatus.current = state.status;
  }, [consumeSubmission, restart, state.status]);

  useEffect(() => {
    if (state.status !== "resolving" && state.status !== "authenticated") {
      markAppBootReady("runtime");
    }
  }, [state.status]);

  if (state.status === "resolving") return <AuthSplash message={state.message} />;
  if (state.status === "unconfigured") return <Unconfigured />;
  if (state.status === "invalid") return <InvalidSession message={state.message} />;
  if (state.status === "unauthenticated") return <PinLogin initialError={state.message ?? null} />;
  return <AppShell key={`${state.session.uid}:${state.session.claims.sessionVersion}:${state.session.claims.permissionsVersion}`} session={state.session} />;
}
