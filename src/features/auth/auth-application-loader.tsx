"use client";

import dynamic from "next/dynamic";

function ApplicationBootFallback() {
  return (
    <main className="auth-shell auth-shell--center" aria-busy="true">
      <div className="auth-splash" role="status" aria-live="polite">
        <div className="auth-brand" aria-label="급식길">
          <span className="auth-brand__mark" aria-hidden="true">길</span>
          <span><strong>급식길</strong><small>ONNURIWAY</small></span>
        </div>
        <span className="auth-spinner" aria-hidden="true" />
        <p>현장 앱을 빠르게 준비하고 있어요.</p>
      </div>
    </main>
  );
}

const AuthApplication = dynamic(
  () => import("./auth-application").then((module) => module.AuthApplication),
  { loading: ApplicationBootFallback, ssr: false },
);

export function AuthApplicationLoader() {
  return <AuthApplication />;
}
