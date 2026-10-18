import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { registerPrivateClientCleanup } from "@/features/auth/private-client-cleanup-registry";
import { registerPrivateBlobUrl, forgetPrivateBlobUrl } from "@/features/auth/private-client-state";
import { classifyDeliveryPhotoCreateError, deliveryPhotoCreateErrorMessage } from "./delivery-photo-upload-errors";
import type { DeliveryPhotoCreateInput, DeliveryPhotoCreateResult } from "./delivery-photo-create-repository";
import { deliveryPhotoDateKey } from "./delivery-photo-memory";
import type { OutboxScope, PhotoOutboxRecord, PhotoOutboxStore } from "./delivery-photo-outbox";
import { MAX_PENDING_PHOTO_BYTES, outboxBytes } from "./delivery-photo-outbox-size";
import { lazyDeliveryPhotoOutbox } from "./delivery-photo-outbox-lazy";
import { MAX_PENDING_PHOTOS_PER_CUSTOMER, MAX_PENDING_PHOTOS_TOTAL, isActiveDeliveryPhotoUpload,
  type DeliveryPhotoUploadProjection } from "./delivery-photo-upload-state";
import type { PhotoOutboxWorker } from "./delivery-photo-outbox-worker";
import type { PreparedDeliveryPhoto } from "./delivery-photo-preparation";
import { recordPerformanceMetric } from "@/lib/performance/performance-monitor";

export type DeliveryPhotoUploadDependencies = {
  prepare: (source: File, signal: AbortSignal) => Promise<PreparedDeliveryPhoto>;
  preparationMessage: (error: unknown) => string;
  create: (input: DeliveryPhotoCreateInput, session: AuthenticatedSession) => Promise<DeliveryPhotoCreateResult>;
  encode: (blob: Blob) => Promise<string>;
  uuid: () => string;
  now: () => number;
  maxConcurrentRelays: number;
  store?: PhotoOutboxStore;
  pollIntervalMs?: number;
};
function defaultDependencies(): DeliveryPhotoUploadDependencies {
  return {
    prepare: async (source, signal) => (await import("./delivery-photo-preparation")).prepareDeliveryPhoto(source, signal),
    preparationMessage: () => "사진 준비를 마치지 못했어요. 다시 시도해주세요.",
    create: async (input, session) => (await import("./delivery-photo-create-repository")).deliveryPhotoCreateRepository.create(input, session),
    encode: encodeDeliveryPhotoBlob,
    uuid: () => crypto.randomUUID(), now: () => Date.now(), maxConcurrentRelays: 2, store: lazyDeliveryPhotoOutbox,
  };
}
export async function encodeDeliveryPhotoBlob(blob: Blob): Promise<string> {
  return (await import("./delivery-photo-preparation")).encodeDeliveryPhotoBlob(blob);
}
export function deliveryPhotoUploadNamespace(session: AuthenticatedSession) {
  return JSON.stringify([session.uid, session.claims.employeeId, session.claims.sessionVersion, session.claims.permissionsVersion]);
}
type LocalPreview = { thumbnail: string; full: string };
const RETRY_DELAYS = [2_000, 8_000, 30_000];
const PREVIOUS_DAY = "이전 날짜 사진입니다. 서버 접수일로 기록됩니다. 날짜 확인 후 전송해주세요.";

export class DeliveryPhotoUploadCoordinator {
  private readonly jobs = new Map<string, DeliveryPhotoUploadProjection>();
  private readonly records = new Map<string, PhotoOutboxRecord>();
  private readonly confirmed = new Map<string, DeliveryPhotoMetadata>();
  private readonly previews = new Map<string, LocalPreview>();
  private readonly listeners = new Set<() => void>();
  private readonly activeRelays = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly sourceReads = new Set<string>();
  private snapshot: readonly DeliveryPhotoUploadProjection[] = Object.freeze([]);
  private activePreparation: string | null = null;
  private preparingPump = false;
  private relayPump = false;
  private epoch = 0;
  private authorized = true;
  private initialized = false;
  private scope: OutboxScope | null = null;
  private readonly worker: string;
  private outboxWorker: PhotoOutboxWorker | undefined;
  readonly ready: Promise<boolean>;

  constructor(readonly session: AuthenticatedSession, private readonly dependencies: DeliveryPhotoUploadDependencies = defaultDependencies()) {
    this.worker = dependencies.uuid(); this.ready = this.initialize();
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.snapshot;
  getPreview = (jobId: string) => this.previews.get(jobId);
  private today() { return deliveryPhotoDateKey(new Date(this.dependencies.now())); }
  private live(epoch: number, id?: string) { return this.authorized && this.epoch === epoch && (!id || this.jobs.has(id)); }
  private async initialize() {
    const epoch = this.epoch;
    try {
      if (this.dependencies.store) {
        const { PhotoOutboxWorker } = await import("./delivery-photo-outbox-worker");
        const worker = new PhotoOutboxWorker(this.dependencies.store, this.worker);
        this.outboxWorker = worker;
        if (!await worker.open(deliveryPhotoUploadNamespace(this.session), () => this.live(epoch))) return false;
        this.scope = worker.scope; await this.restore();
        if (!this.live(epoch)) { worker.close(); return false; }
        worker.start(() => { void this.wake(); }, () => {
          this.epoch++; this.authorized = false;
          for (const controller of this.controllers.values()) controller.abort();
        }, () => !!this.sourceReads.size || this.snapshot.some((job) => !job.durable && this.records.get(job.jobId)?.source),
        this.dependencies.pollIntervalMs ?? 3_000);
      }
      this.initialized = true; this.publish(); this.pumpPreparation(); this.pumpRelays(); return true;
    } catch { this.initialized = false; return false; }
  }
  private async wake() {
    if (!this.authorized) return;
    await this.restore();
    const now = this.dependencies.now();
    let expired = false;
    for (const [id, record] of this.records) {
      if (record.job.status === "completed" && record.confirmed && Date.parse(record.confirmed.expiresAt) <= now) {
        this.removeLocal(id); expired = true;
        if (this.scope) await this.dependencies.store?.remove(this.scope, id).catch(() => undefined);
      }
    }
    if (expired) this.publish();
    for (const job of this.jobs.values()) {
      if (job.status === "failed" && job.errorCategory === "retryable" && job.retryAt && job.retryAt <= now
        && (typeof navigator === "undefined" || navigator.onLine !== false)) void this.retry(job.jobId, false);
    }
    this.pumpPreparation(); this.pumpRelays();
  }
  private async restore() {
    if (!this.outboxWorker) return;
    const epoch = this.epoch;
    const active = new Set(this.activeRelays); if (this.activePreparation) active.add(this.activePreparation);
    const restored = await this.outboxWorker.restore({ jobs: this.jobs, active, today: this.today(), now: this.dependencies.now(),
      live: () => this.live(epoch), remove: (id) => this.removeLocal(id), accept: (record) => {
        const id = record.job.jobId;
        if (record.job.status === "completed" && record.confirmed) this.confirmed.set(id, record.confirmed);
        this.records.set(id, record); this.jobs.set(id, record.job); this.makePreview(record);
      } });
    if (restored) this.publish();
  }
  getPendingCount(customerId: string) { return this.snapshot.filter((job) => job.customerId === customerId && isActiveDeliveryPhotoUpload(job)).length; }
  canBegin(customerId: string) {
    return this.initialized && this.authorized && !this.sourceReads.size && this.getPendingCount(customerId) < MAX_PENDING_PHOTOS_PER_CUSTOMER
      && this.snapshot.filter(isActiveDeliveryPhotoUpload).length < MAX_PENDING_PHOTOS_TOTAL
      && !this.snapshot.some((job) => job.errorCategory === "storage" && !job.durable)
      && [...this.records.values()].reduce((sum, record) => sum + outboxBytes(record), 0)
        + 30 * 1024 * 1024 <= MAX_PENDING_PHOTO_BYTES;
  }
  begin(customerId: string, source: "camera" | "album") {
    if (!this.canBegin(customerId)) return null;
    // Retain this screen's recent confirmed previews without unbounded memory.
    for (const job of [...this.jobs.values()].sort((a, b) => a.startedAt - b.startedAt)) {
      if (this.jobs.size < 8) break;
      const record = this.records.get(job.jobId);
      if (job.status === "completed" && !this.confirmed.has(job.jobId)
        || job.status === "failed" && !record?.source && !record?.prepared) this.removeLocal(job.jobId);
    }
    const now = this.dependencies.now();
    const job: DeliveryPhotoUploadProjection = { jobId: this.dependencies.uuid(), requestId: this.dependencies.uuid(), customerId, source,
      status: "preparing", errorCategory: null, message: "", startedAt: now, updatedAt: now, attempts: 0, durable: false };
    this.jobs.set(job.jobId, job);
    this.records.set(job.jobId, { version: 1, owner: deliveryPhotoUploadNamespace(this.session), job,
      source: null, prepared: null, confirmed: null, lease: null, approvedDay: this.today() });
    this.publish(); return job;
  }
  async acceptNativeSource(jobId: string, native: File) {
    if (!this.jobs.has(jobId) || !this.authorized) return false;
    const epoch = this.epoch; const controller = new AbortController();
    this.controllers.set(jobId, controller); this.sourceReads.add(jobId);
    try {
      const preparation = await import("./delivery-photo-preparation");
      const source = await preparation.materializeDeliveryPhotoSource(native, controller.signal);
      if (!this.live(epoch, jobId)) return false;
      return await this.acceptSource(jobId, source);
    } catch (error) {
      if (!this.live(epoch, jobId)) return false;
      const preparation = await import("./delivery-photo-preparation");
      this.failPreparation(jobId, preparation.deliveryPhotoPreparationMessage(error));
      return true;
    } finally {
      this.sourceReads.delete(jobId);
      if (this.controllers.get(jobId) === controller) this.controllers.delete(jobId);
      this.publish();
    }
  }
  canRetry(jobId: string) {
    const job = this.jobs.get(jobId); const record = this.records.get(jobId);
    return !!job && !!record && this.authorized && (job.status === "paused" || job.status === "failed" && job.errorCategory !== "auth")
      && !!(record.source || record.prepared);
  }
  async acceptSource(jobId: string, source: File) {
    const started = performance.now();
    const record = this.records.get(jobId);
    if (!record || !this.authorized || !["preparing", "failed"].includes(record.job.status)) return false;
    const epoch = this.epoch; record.source = source;
    this.update(jobId, { status: "persisting", errorCategory: null, message: "" });
    try {
      if (this.dependencies.store && this.scope) {
        record.job = { ...record.job, durable: true, status: "preparing" };
        await this.dependencies.store.add(this.scope, record);
      }
      if (!this.live(epoch, jobId)) return false;
      recordPerformanceMetric("deliveryPhotoPersistDuration", started, "indexeddb");
      this.update(jobId, { status: "preparing", durable: !!this.dependencies.store }); this.pumpPreparation(); return true;
    } catch {
      if (this.live(epoch, jobId)) this.update(jobId, { status: "failed", errorCategory: "storage", durable: false,
        message: "기기에 보관하지 못했어요. 저장 공간·권한 확인 후 다시 시도해주세요." });
      return true; // Keep the independent file for the visible storage retry.
    }
  }
  failPreparation(jobId: string, message: string) {
    this.update(jobId, { status: "failed", errorCategory: "preparation", message });
  }
  async retry(jobId: string, manual = true) {
    const record = this.records.get(jobId); const job = this.jobs.get(jobId);
    if (!record || !job || !this.authorized || !["failed", "paused"].includes(job.status) || job.errorCategory === "auth") return false;
    if (!manual && record.approvedDay !== this.today()) { this.update(jobId, { status: "paused", message: PREVIOUS_DAY }); return false; }
    if (job.errorCategory === "storage" && !job.durable && record.source) return this.acceptSource(jobId, record.source);
    if (!record.prepared && !record.source) return false;
    try {
      const claimed = await this.claim(jobId, record.prepared ? "upload" : "prepare");
      if (!claimed) return false;
    } catch { this.storageFailure(jobId); return false; }
    if (manual) record.approvedDay = this.today();
    this.update(jobId, { status: record.prepared ? "queued" : "preparing", errorCategory: null, message: "", retryAt: 0,
      ...(manual ? { attempts: 0 } : {}) });
    record.lease = null;
    try { await this.save(record, this.worker); } catch { this.storageFailure(jobId); return false; }
    this.pumpPreparation(); this.pumpRelays(); return true;
  }
  dismiss(jobId: string) {
    const job = this.jobs.get(jobId); if (!job || job.status === "uploading") return false;
    const scope = this.scope; this.removeLocal(jobId); this.publish();
    if (scope) void this.dependencies.store?.remove(scope, jobId, this.worker).catch(() => undefined);
    if (job.attempts && job.status !== "completed" && typeof window !== "undefined") window.dispatchEvent(new Event("onnuriway:delivery-photo-reconcile"));
    return true;
  }
  peekConfirmed(jobId: string) { return this.confirmed.get(jobId); }
  markConfirmedMerged(jobId: string) {
    this.confirmed.delete(jobId);
    if (this.scope) void this.dependencies.store?.remove(this.scope, jobId).catch(() => undefined);
  }
  releaseCompletedPreviews() {
    for (const job of this.jobs.values()) if (job.status === "completed" && !this.confirmed.has(job.jobId)) this.removeLocal(job.jobId);
    this.publish();
  }
  clear() {
    this.epoch += 1; this.authorized = false; this.outboxWorker?.close();
    for (const id of this.jobs.keys()) this.removeLocal(id);
    this.confirmed.clear(); this.activePreparation = null; this.publish();
    return this.scope ? this.dependencies.store?.clear(this.scope) ?? Promise.resolve() : Promise.resolve();
  }
  private publish() {
    this.snapshot = Object.freeze([...this.jobs.values()].sort((a, b) => b.startedAt - a.startedAt || b.jobId.localeCompare(a.jobId)));
    for (const listener of this.listeners) listener();
  }
  private update(id: string, update: Partial<DeliveryPhotoUploadProjection>) {
    const job = this.jobs.get(id); if (!job) return;
    const next = { ...job, ...update, updatedAt: this.dependencies.now() };
    this.jobs.set(id, next); const record = this.records.get(id); if (record) record.job = next; this.publish();
  }
  private makePreview(record: PhotoOutboxRecord) {
    if (!record.prepared || this.previews.has(record.job.jobId) || typeof URL.createObjectURL !== "function") return;
    const full = registerPrivateBlobUrl(URL.createObjectURL(record.prepared.blob));
    const thumbnail = record.prepared.preview ? registerPrivateBlobUrl(URL.createObjectURL(record.prepared.preview)) : full;
    this.previews.set(record.job.jobId, { thumbnail, full });
  }
  private removeLocal(id: string) {
    this.controllers.get(id)?.abort(); this.controllers.delete(id);
    this.sourceReads.delete(id);
    const preview = this.previews.get(id);
    if (preview) { forgetPrivateBlobUrl(preview.thumbnail); if (preview.full !== preview.thumbnail) forgetPrivateBlobUrl(preview.full); }
    this.previews.delete(id); this.records.delete(id); this.jobs.delete(id); this.confirmed.delete(id);
  }
  private async save(record: PhotoOutboxRecord, worker?: string) {
    if (this.dependencies.store && this.scope) await this.dependencies.store.save(this.scope, record, worker);
  }
  private storageFailure(id: string) {
    this.update(id, { status: "failed", errorCategory: "storage", message: "보관 상태를 확인하지 못했어요. 다시 시도해주세요." });
  }
  private async claim(id: string, stage: "prepare" | "upload") {
    if (this.outboxWorker) {
      try { return await this.outboxWorker.claim(id, stage, this.dependencies.now()); }
      catch { this.storageFailure(id); return null; }
    }
    return this.records.get(id) ?? null;
  }
  private pumpPreparation() {
    if (this.activePreparation || this.preparingPump || !this.initialized || !this.authorized
      || !this.snapshot.some((job) => job.status === "preparing" && this.records.get(job.jobId)?.source)) return;
    this.preparingPump = true;
    let progressed = false;
    void (async () => {
      for (const job of [...this.snapshot].reverse()) {
        if (job.status !== "preparing" || !this.records.get(job.jobId)?.source) continue;
        const epoch = this.epoch; const record = await this.claim(job.jobId, "prepare");
        if (!record || !this.live(epoch, job.jobId)) continue;
        progressed = true;
        const id = job.jobId; this.activePreparation = id;
        this.records.set(id, record); const controller = new AbortController(); this.controllers.set(id, controller);
        try {
          const started = performance.now();
          const prepared = await this.dependencies.prepare(record.source!, controller.signal);
          if (!this.live(epoch, id)) return;
          record.prepared = prepared; record.source = null;
          record.job = { ...record.job, status: record.approvedDay === this.today() ? "queued" : "paused", message: record.approvedDay === this.today() ? "" : PREVIOUS_DAY };
          const saved = { ...record, lease: null };
          await this.save(saved, this.worker);
          if (!this.live(epoch, id)) return;
          this.records.set(id, saved); this.jobs.set(id, saved.job); this.makePreview(saved);
          recordPerformanceMetric("deliveryPhotoPreviewDuration", started, "runtime"); this.publish(); this.pumpRelays();
        } catch (error) {
          if (this.live(epoch, id)) {
            this.failPreparation(id, this.dependencies.preparationMessage(error));
            record.lease = null; await this.save(record, this.worker).catch(() => this.storageFailure(id));
          }
        } finally { this.controllers.delete(id); this.activePreparation = null; }
      }
    })().catch(() => undefined).finally(() => { this.preparingPump = false; if (progressed) this.pumpPreparation(); });
  }
  private pumpRelays() {
    if (this.relayPump || !this.initialized || !this.authorized || typeof navigator !== "undefined" && navigator.onLine === false
      || !this.snapshot.some((job) => job.status === "queued" && !this.activeRelays.has(job.jobId))) return;
    this.relayPump = true;
    let progressed = false;
    void (async () => {
      for (const job of [...this.snapshot].reverse()) {
        if (this.activeRelays.size >= this.dependencies.maxConcurrentRelays) break;
        if (job.status !== "queued" || this.activeRelays.has(job.jobId)) continue;
        const epoch = this.epoch; const record = await this.claim(job.jobId, "upload");
        if (!record?.prepared || !this.live(epoch, job.jobId)) continue;
        progressed = true;
        if (record.approvedDay !== this.today()) {
          record.job = { ...record.job, status: "paused", message: PREVIOUS_DAY }; record.lease = null;
          await this.save(record, this.worker); this.records.set(job.jobId, record); this.jobs.set(job.jobId, record.job); this.publish(); continue;
        }
        this.records.set(job.jobId, record); this.activeRelays.add(job.jobId);
        this.update(job.jobId, { status: "uploading", attempts: (job.attempts ?? 0) + 1 });
        void this.relay(record, epoch).finally(() => { this.activeRelays.delete(job.jobId); this.pumpRelays(); });
      }
    })().catch(() => undefined).finally(() => { this.relayPump = false; if (progressed) this.pumpRelays(); });
  }
  private async relay(record: PhotoOutboxRecord, epoch: number) {
    const id = record.job.jobId;
    const started = performance.now();
    try {
      await this.save(record, this.worker);
      const fileBase64 = await this.dependencies.encode(record.prepared!.blob);
      // Logout/revocation during encoding must not start a new network write.
      if (!this.live(epoch, id)) return;
      if (record.approvedDay !== this.today()) {
        this.update(id, { status: "paused", message: PREVIOUS_DAY }); record.lease = null; await this.save(record, this.worker); return;
      }
      const metadata = await this.dependencies.create({ requestId: record.job.requestId, customerId: record.job.customerId,
        source: record.job.source, contentType: record.prepared!.contentType, fileBase64 }, this.session);
      if (!this.live(epoch, id)) return;
      if (metadata.customerId !== record.job.customerId || metadata.source !== record.job.source) {
        throw Object.assign(new Error(), { code: "delivery-photo/invalid-response" });
      }
      const completed: PhotoOutboxRecord = { ...record, source: null, prepared: null, lease: null, confirmed: metadata,
        job: { ...record.job, status: "completed", errorCategory: null, message: "", photoId: metadata.photoId, registeredDate: metadata.deliveryDateKey, retryAt: 0 } };
      await this.save(completed, this.worker);
      if (!this.live(epoch, id)) return;
      recordPerformanceMetric("deliveryPhotoServerDuration", started, "network");
      this.records.set(id, completed); this.confirmed.set(id, metadata); this.jobs.set(id, completed.job); this.publish();
    } catch (error) {
      if (!this.live(epoch, id)) return;
      const category = classifyDeliveryPhotoCreateError(error);
      if (category === "auth") {
        const jobs = [...this.jobs.values()]; await this.clear().catch(() => undefined);
        for (const job of jobs) if (isActiveDeliveryPhotoUpload(job)) this.jobs.set(job.jobId, { ...job, status: "failed", errorCategory: "auth", message: deliveryPhotoCreateErrorMessage(error) });
        this.publish(); return;
      }
      const attempt = record.job.attempts ?? 1;
      this.update(id, { status: "failed", errorCategory: category,
        message: category === "retryable" ? "전송을 마치지 못했어요. 사진은 보관 중이에요." : deliveryPhotoCreateErrorMessage(error),
        retryAt: this.dependencies.store && category === "retryable" && attempt <= RETRY_DELAYS.length
          ? this.dependencies.now() + (RETRY_DELAYS[attempt - 1] ?? 30_000) : 0 });
      record.lease = null; await this.save(record, this.worker).catch(() => this.storageFailure(id));
    }
  }
}

const coordinators = new Map<string, DeliveryPhotoUploadCoordinator>();
export function getDeliveryPhotoUploadCoordinator(session: AuthenticatedSession) {
  const key = deliveryPhotoUploadNamespace(session);
  const coordinator = coordinators.get(key) ?? new DeliveryPhotoUploadCoordinator(session);
  coordinators.set(key, coordinator);
  return coordinator;
}
export async function clearDeliveryPhotoUploadMemory() {
  const pending = [...coordinators.values()].map((coordinator) => coordinator.clear());
  coordinators.clear(); await Promise.all(pending);
}
registerPrivateClientCleanup(clearDeliveryPhotoUploadMemory);
