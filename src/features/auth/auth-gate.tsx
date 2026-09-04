"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { AppIconMark } from "@/components/ui/app-icon-mark";
import { markAppBootReady } from "@/lib/performance/performance-monitor";
import { useAuth } from "./auth-context";

function AppShellFallback() {
  return (
    <main className="auth-shell auth-shell--center" aria-busy="true">
      <div className="auth-splash" role="status" aria-live="polite">
        <h1 className="sr-only">급식길 업무 화면 준비 중</h1>
        <Brand />
        <span className="auth-spinner" aria-hidden="true" />
        <p>저장된 업무 화면을 여는 중이에요.</p>
      </div>
    </main>
  );
}

const AppShell = dynamic(
  () => import("@/features/app-shell/app-shell").then((module) => module.AppShell),
  { loading: AppShellFallback },
);

function Brand() {
  return (
    <div className="auth-brand" aria-label="급식길">
      <span className="auth-brand__mark" aria-hidden="true"><AppIconMark /></span>
      <span><strong>급식길</strong><small>온누리종합식품</small></span>
    </div>
  );
}

function AuthSplash() {
  return (
    <main className="auth-shell auth-shell--center" aria-busy="true">
      <div className="auth-splash" role="status" aria-live="polite">
        <h1 className="sr-only">급식길 로그인 확인 중</h1>
        <Brand />
        <span className="auth-spinner" aria-hidden="true" />
        <p>안전하게 로그인 정보를 확인하고 있어요.</p>
      </div>
    </main>
  );
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

function PinLogin() {
  const { login, loginWithGoogle } = useAuth();
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pin.length !== 6 || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await login(pin);
    } catch (caught) {
      setPin("");
      setError(caught instanceof Error ? caught.message : "PIN을 확인해주세요.");
      setSubmitting(false);
      inputRef.current?.focus();
    }
  };

  const submitAdmin = async () => {
    if (adminSubmitting || submitting) return;
    setAdminSubmitting(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "관리자 로그인을 완료하지 못했습니다.");
      setAdminSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="login-story" aria-label="급식길 소개">
        <Brand />
        <div className="login-story__copy">
          <p className="auth-eyebrow">SCHOOL MEAL FIELD OPERATIONS</p>
          <h1>오늘의 현장으로<br /><em>빠르게.</em></h1>
          <p>학교 급식실 납품과 영업 업무를 한 길로 연결합니다.</p>
        </div>
        <div className="route-motif" aria-hidden="true">
          <span>출발</span><i /><i /><i /><span>현장</span>
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
            <button type="submit" disabled={pin.length !== 6 || submitting}>
              <span>{submitting ? "확인 중" : "급식길 시작하기"}</span>
              <span aria-hidden="true">→</span>
            </button>
          </form>
          <div className="admin-login-separator"><span>또는</span></div>
          <button
            className="admin-google-login"
            type="button"
            disabled={adminSubmitting || submitting}
            onClick={() => void submitAdmin()}
          >
            <span className="google-mark" aria-hidden="true">G</span>
            {adminSubmitting ? "관리자 확인 중…" : "Google로 관리자 로그인"}
          </button>
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
        <Brand />
        <p className="auth-eyebrow">CONFIGURATION REQUIRED</p>
        <h1>앱 연결 설정이<br />필요합니다.</h1>
        <p>Firebase 공개 환경 변수를 설정한 뒤 앱을 다시 시작해주세요.</p>
      </section>
    </main>
  );
}

export function AuthGate() {
  const { state } = useAuth();

  useEffect(() => {
    if (state.status !== "resolving" && state.status !== "authenticated") {
      markAppBootReady("runtime");
    }
  }, [state.status]);

  if (state.status === "resolving") return <AuthSplash />;
  if (state.status === "unconfigured") return <Unconfigured />;
  if (state.status === "invalid") return <InvalidSession message={state.message} />;
  if (state.status === "unauthenticated") return <PinLogin />;
  return <AppShell session={state.session} />;
}
