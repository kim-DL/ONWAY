import type { InventoryContext } from "@/domain/inventory";

const KOREA_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
export function inventoryKoreaDate(now = Date.now()): string {
  return new Date(now + KOREA_OFFSET_MS).toISOString().slice(0, 10);
}
export function millisecondsUntilInventoryMidnight(now = Date.now()): number {
  const koreaTime = now + KOREA_OFFSET_MS;
  return DAY_MS - ((koreaTime % DAY_MS) + DAY_MS) % DAY_MS + 250;
}

/** One date-boundary timer, never a full-catalog polling loop. */
export function watchInventoryCalendar(options: {
  observedDate: string;
  load: () => Promise<InventoryContext>;
  onRefreshing: (refreshing: boolean) => void;
  onContext: (context: InventoryContext) => void;
  onError: (error: unknown) => void;
}) {
  let closed = false;
  let pending = false;
  let generation = 0;
  let checkedDate = options.observedDate;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const canRead = () => !closed && navigator.onLine && document.visibilityState === "visible";
  const schedule = () => {
    clearTimeout(timer);
    if (!closed) timer = setTimeout(() => void check(), millisecondsUntilInventoryMidnight());
  };
  async function check(force = false) {
    if (closed || pending) return;
    if (!canRead() || !force && checkedDate === inventoryKoreaDate()) { schedule(); return; }
    pending = true;
    clearTimeout(timer);
    const requestGeneration = generation;
    const requestDate = inventoryKoreaDate();
    options.onRefreshing(true);
    let succeeded = false;
    try {
      const context = await options.load();
      if (canRead() && generation === requestGeneration) {
        // A device clock differing from server time must not create a retry loop.
        checkedDate = requestDate; succeeded = true; options.onContext(context);
      }
    } catch (error) {
      if (!closed && generation === requestGeneration) options.onError(error);
    } finally {
      pending = false;
      if (!closed && generation === requestGeneration) options.onRefreshing(false);
      schedule();
      // A slow request may cross midnight; revalidate once for the new date.
      if (succeeded && checkedDate !== inventoryKoreaDate()) queueMicrotask(() => void check());
    }
  }
  const visible = () => { if (document.visibilityState === "visible") void check(); };
  const offline = () => { generation += 1; };
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("focus", visible);
  window.addEventListener("offline", offline);
  schedule();
  queueMicrotask(() => void check());
  return {
    refresh: () => void check(true),
    dispose: () => {
      closed = true; generation += 1; clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", visible);
      window.removeEventListener("offline", offline);
    },
  };
}
