/** Only an explicit authentication/authorization rejection ends a session. */
export function isSessionRejection(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return [
    "auth/user-disabled", "auth/user-not-found", "auth/user-token-expired", "auth/invalid-user-token",
    "permission-denied", "unauthenticated",
  ].includes(code);
}

/** One retry, accelerated by foreground/network recovery; never polls a hidden app. */
export function subscribeToSessionRetry(retry: () => void, delayMs = 5_000) {
  let disposed = false;
  const cleanup = () => {
    disposed = true;
    clearTimeout(timer);
    window.removeEventListener("online", resume);
    window.removeEventListener("focus", resume);
    document.removeEventListener("visibilitychange", resume);
  };
  const resume = () => {
    if (disposed || document.visibilityState === "hidden") return;
    cleanup();
    retry();
  };
  window.addEventListener("online", resume);
  window.addEventListener("focus", resume);
  document.addEventListener("visibilitychange", resume);
  const timer = setTimeout(resume, delayMs);
  return cleanup;
}
