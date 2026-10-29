"use client";

import dynamic from "next/dynamic";

import { AuthLoadingScreen, LaunchTimingProvider } from "./auth-loading";

function ApplicationBootFallback() {
  return <AuthLoadingScreen stage="boot" />;
}

const AuthApplication = dynamic(
  () => import("./auth-application").then((module) => module.AuthApplication),
  { loading: ApplicationBootFallback, ssr: false },
);

export function AuthApplicationLoader() {
  return <LaunchTimingProvider><AuthApplication /></LaunchTimingProvider>;
}
