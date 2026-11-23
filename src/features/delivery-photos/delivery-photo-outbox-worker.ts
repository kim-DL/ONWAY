import type { PhotoOutboxRecord, PhotoOutboxStore, OutboxScope } from "./delivery-photo-outbox";
import { PREVIOUS_DAY_MESSAGE, type DeliveryPhotoUploadProjection } from "./delivery-photo-upload-state";

const LOCK_PREFIX = "onnuriway-photo-worker:";
const RETRY_DELAYS = [2_000, 8_000, 30_000, 300_000] as const;

/** Document lifetime, cross-tab leases and durable reconciliation are loaded
 * only by the photo coordinator. No server or image processing dependency. */
export class PhotoOutboxWorker {
  private release: (() => void) | undefined;
  private locked = false;
  private poll: ReturnType<typeof setInterval> | undefined;
  private events: AbortController | undefined;
  private restoring = false;
  private waking = false;
  private foregroundWake = false;
  scope!: OutboxScope;
  constructor(private readonly store: PhotoOutboxStore, private readonly worker: string) {}

  async open(owner: string, live: () => boolean, existingScope: OutboxScope | null = null, preserveOwner = false) {
    try {
      const locks = globalThis.navigator?.locks;
      if (locks) {
        await new Promise<void>((ready) => {
          void locks.request(LOCK_PREFIX + this.worker, async () => {
            if (!live()) { ready(); return; }
            this.locked = true; ready();
            await new Promise<void>((release) => { this.release = release; });
          }).catch(() => ready());
        });
      }
      if (!live()) { this.close(); return false; }
      this.scope = existingScope ?? await this.store.activate(owner, { live, preserveOwner });
      if (!live()) { this.close(); return false; }
      return true;
    } catch (error) { this.close(); throw error; }
  }
  start(wake: (foreground?: boolean) => void, suspend: () => void, hasUnsavedSource: () => boolean, intervalMs: number) {
    this.poll = setInterval(() => wake(false), intervalMs); this.poll.unref?.();
    if (typeof window === "undefined") return;
    this.events = new AbortController();
    const options = { signal: this.events.signal };
    const foreground = () => { if (document.visibilityState === "visible") wake(true); };
    window.addEventListener("online", () => wake(true), options);
    window.addEventListener("focus", foreground, options);
    document.addEventListener("visibilitychange", foreground, options);
    document.addEventListener("resume", foreground, options);
    window.addEventListener("pagehide", (event) => {
      // A bfcache restore reloads this document. An external camera can instead
      // return to the live document, which still owns its uploads.
      if (!event.persisted) return;
      clearInterval(this.poll); this.release?.(); suspend();
    }, options);
    window.addEventListener("pageshow", (event) => { if (event.persisted) window.location.reload(); }, options);
    window.addEventListener("beforeunload", (event) => {
      if (hasUnsavedSource()) { event.preventDefault(); event.returnValue = ""; }
    }, options);
  }
  close() { clearInterval(this.poll); this.release?.(); this.events?.abort(); }
  retryDelay(attempt: number) { return RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)]!; }
  async wake(foreground: boolean, state: {
    records: ReadonlyMap<string, PhotoOutboxRecord>; restore: () => Promise<boolean>; live: () => boolean; now: () => number;
    expire: (id: string) => void; retry: (id: string) => Promise<boolean>;
  }) {
    if (!state.live()) return false;
    this.foregroundWake ||= foreground;
    if (this.waking) return false;
    this.waking = true;
    try {
      do {
        if (!await state.restore()) return false;
        const foreground = this.foregroundWake; this.foregroundWake = false;
        const now = state.now();
        for (const [id, record] of state.records) {
          if (record.job.status === "completed" && record.confirmed && Date.parse(record.confirmed.expiresAt) <= now) {
            state.expire(id);
            await this.store.remove(this.scope, id).catch(() => undefined);
          }
        }
        for (const { job } of state.records.values()) {
          const retryDue = (job.retryAt || job.updatedAt + RETRY_DELAYS[3]) <= now;
          if (job.status === "failed" && job.errorCategory === "retryable" && job.durable
            && (retryDue || foreground && job.updatedAt + RETRY_DELAYS[0] <= now)
            && globalThis.navigator?.onLine !== false) await state.retry(job.jobId);
        }
      } while (state.live() && this.foregroundWake);
      return true;
    } finally { this.waking = false; }
  }
  private async liveWorkers() {
    if (!this.locked) return;
    try {
      const locks = await navigator.locks.query();
      return locks.held?.flatMap(({ name }) => name?.startsWith(LOCK_PREFIX) ? [name.slice(LOCK_PREFIX.length)] : []);
    } catch { return undefined; }
  }
  async claim(id: string, stage: "prepare" | "upload", now: number) {
    return this.store.claim(this.scope, id, this.worker, stage, now, await this.liveWorkers());
  }
  async restore({ jobs, active, today, now, live, accept, remove }: {
    jobs: ReadonlyMap<string, DeliveryPhotoUploadProjection>; active: ReadonlySet<string>;
    today: string; now: number; live: () => boolean; accept: (record: PhotoOutboxRecord) => void; remove: (id: string) => void;
  }) {
    if (this.restoring) return false;
    this.restoring = true;
    try {
      // The database snapshot can arrive after a local upload has advanced.
      const jobsAtRead = new Map(jobs);
      const records = await this.store.list(this.scope); const workers = records.length ? await this.liveWorkers() : undefined;
      if (!live()) return false;
      const ids = new Set(records.map((record) => record.job.jobId));
      for (const [id, job] of jobs) {
        if (jobsAtRead.get(id) === job && job.durable && job.status !== "completed" && !ids.has(id) && !active.has(id)) {
          remove(id);
          if (typeof window !== "undefined") window.dispatchEvent(new Event("onnuriway:delivery-photo-reconcile"));
        }
      }
      for (const record of records) {
        const id = record.job.jobId;
        const local = jobs.get(id);
        if (local !== jobsAtRead.get(id) || active.has(id) || local?.status === "persisting") continue;
        if (record.job.status !== "completed") {
          if (record.approvedDay !== today) record.job = { ...record.job, status: "paused", message: PREVIOUS_DAY_MESSAGE };
          else if ((!record.lease || record.lease.until <= now || workers && !workers.includes(record.lease.worker))
            && (record.job.status === "uploading" || record.job.status === "preparing")) {
            record.job = { ...record.job, status: record.prepared ? "queued" : "preparing" };
          }
          // A failed storage operation cannot persist its own error. Keep the
          // visible manual-retry state unless another tab confirmed this photo.
          if (record.approvedDay === today && local?.status === "failed" && local.errorCategory === "storage") record.job = local;
        }
        accept(record);
      }
      return true;
    } catch { return false; } // Retain files. A read failure never means saved.
    finally { this.restoring = false; }
  }
}
