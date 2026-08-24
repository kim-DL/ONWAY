const CONNECTIVITY_PROBE_URL = "/api/connectivity";
const DEFAULT_PROBE_TIMEOUT_MS = 1_500;
const DEFAULT_RETRY_MS = 5_000;

type ProbeOptions = {
  timeoutMs?: number;
};

export async function probeNetworkReachability(
  { timeoutMs = DEFAULT_PROBE_TIMEOUT_MS }: ProbeOptions = {},
): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return false;
  }

  try {
    const response = await fetch(`${CONNECTIVITY_PROBE_URL}?t=${Date.now()}`, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function subscribeToNetworkRecovery(
  onReachable: () => void,
  retryMs = DEFAULT_RETRY_MS,
) {
  let disposed = false;
  let checking = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    disposed = true;
    if (retryTimer) clearTimeout(retryTimer);
    window.removeEventListener("online", check);
  };
  const scheduleRetry = () => {
    if (!disposed) retryTimer = setTimeout(check, retryMs);
  };
  const check = async () => {
    if (disposed || checking) return;
    checking = true;
    const reachable = await probeNetworkReachability();
    checking = false;
    if (disposed) return;
    if (reachable) {
      cleanup();
      onReachable();
      return;
    }
    scheduleRetry();
  };

  window.addEventListener("online", check);
  scheduleRetry();
  return cleanup;
}
