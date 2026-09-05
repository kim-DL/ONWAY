const CONNECTIVITY_PROBE_URL = "/api/connectivity";
const DEFAULT_PROBE_TIMEOUT_MS = 1_500;
const DEFAULT_RETRY_MS = 5_000;

type ProbeOptions = {
  timeoutMs?: number;
};

const inFlightProbes = new Map<number, Promise<boolean>>();

export function probeNetworkReachability(
  { timeoutMs = DEFAULT_PROBE_TIMEOUT_MS }: ProbeOptions = {},
): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return Promise.resolve(false);
  }

  // Share only concurrent checks, never a cached connectivity result. Auth and
  // PWA recovery must still verify the network again after each completed check.
  const pending = inFlightProbes.get(timeoutMs);
  if (pending) return pending;
  const probe = performNetworkProbe(timeoutMs);
  inFlightProbes.set(timeoutMs, probe);
  void probe.then(() => inFlightProbes.delete(timeoutMs));
  return probe;
}

async function performNetworkProbe(timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetch(`${CONNECTIVITY_PROBE_URL}?t=${Date.now()}`, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok && (typeof navigator === "undefined" || navigator.onLine);
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
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
    window.removeEventListener("online", check);
  };
  const scheduleRetry = () => {
    if (!disposed && retryTimer === undefined) retryTimer = setTimeout(check, retryMs);
  };
  const check = async () => {
    if (disposed || checking) return;
    // An online event can arrive before the scheduled retry. Consume that timer
    // too, otherwise every event starts another background retry chain.
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
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
