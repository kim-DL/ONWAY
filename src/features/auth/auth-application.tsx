"use client";

import { AuthGate } from "./auth-gate";
import { AuthProvider } from "./auth-context";

export function AuthApplication() {
  return <AuthProvider><AuthGate /></AuthProvider>;
}
