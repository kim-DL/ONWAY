import type { DeliveryPhotoMetadata } from "@/domain/delivery-photo";
import type { AuthenticatedSession } from "@/features/auth/auth-context";
import { registerPrivateClientCleanup } from "@/features/auth/private-client-cleanup-registry";
import {
  classifyDeliveryPhotoCreateError,
  deliveryPhotoCreateErrorMessage,
  deliveryPhotoCreateRepository,
  type DeliveryPhotoCreateInput,
  type DeliveryPhotoCreateResult,
} from "./delivery-photo-create-repository";
import {
  isActiveDeliveryPhotoUpload,
  type DeliveryPhotoUploadProjection,
} from "./delivery-photo-upload-state";
import type { PreparedDeliveryPhoto } from "./delivery-photo-preparation";

const MAX_CONCURRENT_RELAYS = 2;

type UploadPayload = {
  source?: File;
  prepared?: PreparedDeliveryPhoto;
  preparation?: AbortController;
};

export type DeliveryPhotoUploadDependencies = {
  prepare: (source: File, signal: AbortSignal) => Promise<PreparedDeliveryPhoto>;
  preparationMessage: (error: unknown) => string;
  create: (input: DeliveryPhotoCreateInput, session: AuthenticatedSession) => Promise<DeliveryPhotoCreateResult>;
  encode: (blob: Blob) => Promise<string>;
  uuid: () => string;
  now: () => number;
  maxConcurrentRelays: number;
};

function defaultDependencies(): DeliveryPhotoUploadDependencies {
  return {
    prepare: async (source, signal) => (await import("./delivery-photo-preparation")).prepareDeliveryPhoto(source, signal),
    preparationMessage: (error) => {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code === "AbortError" || code === "delivery-photo/cancelled") return "사진 준비가 취소되었습니다.";
      return "사진을 안전한 WebP로 준비하지 못했어요. 다시 촬영하거나 선택해주세요.";
    },
    create: deliveryPhotoCreateRepository.create,
    encode: encodeDeliveryPhotoBlob,
    uuid: () => crypto.randomUUID(),
    now: () => Date.now(),
    maxConcurrentRelays: MAX_CONCURRENT_RELAYS,
  };
}

export async function encodeDeliveryPhotoBlob(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let start = 0; start < bytes.length; start += 8_192) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 8_192));
  }
  return btoa(binary);
}

export function deliveryPhotoUploadNamespace(session: AuthenticatedSession) {
  return `${session.uid}:${session.claims.sessionVersion}:${session.claims.permissionsVersion}`;
}

export class DeliveryPhotoUploadCoordinator {
  private readonly jobs = new Map<string, DeliveryPhotoUploadProjection>();
  private readonly latestByCustomer = new Map<string, string>();
  private readonly payloads = new Map<string, UploadPayload>();
  private readonly confirmed = new Map<string, DeliveryPhotoMetadata>();
  private readonly listeners = new Set<() => void>();
  private readonly preparationQueue: string[] = [];
  private readonly relayQueue: string[] = [];
  private readonly activeRelays = new Set<string>();
  private snapshot: readonly DeliveryPhotoUploadProjection[] = Object.freeze([]);
  private activePreparation: string | null = null;
  private epoch = 0;

  constructor(
    readonly session: AuthenticatedSession,
    private readonly dependencies: DeliveryPhotoUploadDependencies = defaultDependencies(),
  ) {}

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.snapshot;

  getCustomerJob(customerId: string) {
    const id = this.latestByCustomer.get(customerId);
    return id ? this.jobs.get(id) : undefined;
  }

  begin(customerId: string, source: "camera" | "album") {
    const current = this.getCustomerJob(customerId);
    if (isActiveDeliveryPhotoUpload(current)) return null;
    if (current) {
      this.jobs.delete(current.jobId); this.confirmed.delete(current.jobId); this.payloads.delete(current.jobId);
    }
    const now = this.dependencies.now();
    const job: DeliveryPhotoUploadProjection = {
      jobId: this.dependencies.uuid(), requestId: this.dependencies.uuid(), customerId, source,
      status: "preparing", errorCategory: null, message: "", startedAt: now, updatedAt: now,
    };
    this.jobs.set(job.jobId, job); this.latestByCustomer.set(customerId, job.jobId); this.payloads.set(job.jobId, {});
    this.publish();
    return job;
  }

  acceptSource(jobId: string, source: File) {
    const job = this.jobs.get(jobId); const payload = this.payloads.get(jobId);
    if (!job || !payload || job.status !== "preparing") return false;
    payload.source = source; this.preparationQueue.push(jobId); this.pumpPreparation();
    return true;
  }

  failPreparation(jobId: string, message: string) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "preparing") return;
    this.releasePayload(jobId);
    this.jobs.set(jobId, { ...job, status: "failed", errorCategory: "preparation", message, updatedAt: this.dependencies.now() });
    this.publish();
  }

  retry(jobId: string) {
    const job = this.jobs.get(jobId); const payload = this.payloads.get(jobId);
    if (!job || job.status !== "failed" || job.errorCategory !== "retryable" || !payload?.prepared) return false;
    this.jobs.set(jobId, { ...job, status: "queued", errorCategory: null, message: "", updatedAt: this.dependencies.now() });
    if (!this.relayQueue.includes(jobId) && !this.activeRelays.has(jobId)) this.relayQueue.push(jobId);
    this.publish(); this.pumpRelays();
    return true;
  }

  dismiss(jobId: string) {
    const job = this.jobs.get(jobId); if (!job || job.status === "uploading") return false;
    this.releasePayload(jobId); this.confirmed.delete(jobId); this.jobs.delete(jobId);
    if (this.latestByCustomer.get(job.customerId) === jobId) this.latestByCustomer.delete(job.customerId);
    this.removeQueued(jobId); this.publish(); return true;
  }

  peekConfirmed(jobId: string) { return this.confirmed.get(jobId); }
  markConfirmedMerged(jobId: string) { this.confirmed.delete(jobId); }

  clear() {
    this.epoch += 1;
    for (const payload of this.payloads.values()) payload.preparation?.abort();
    this.jobs.clear(); this.latestByCustomer.clear(); this.payloads.clear(); this.confirmed.clear();
    this.preparationQueue.length = 0; this.relayQueue.length = 0; this.activePreparation = null;
    this.publish();
  }

  private publish() {
    this.snapshot = Object.freeze([...this.jobs.values()].sort((a, b) => b.updatedAt - a.updatedAt));
    for (const listener of this.listeners) listener();
  }

  private update(jobId: string, update: Partial<DeliveryPhotoUploadProjection>) {
    const current = this.jobs.get(jobId); if (!current) return;
    this.jobs.set(jobId, { ...current, ...update, updatedAt: this.dependencies.now() }); this.publish();
  }

  private releasePayload(jobId: string) {
    this.payloads.get(jobId)?.preparation?.abort(); this.payloads.delete(jobId);
  }

  private failAllForAuth(message: string) {
    this.epoch += 1;
    for (const payload of this.payloads.values()) payload.preparation?.abort();
    this.payloads.clear(); this.preparationQueue.length = 0; this.relayQueue.length = 0;
    const now = this.dependencies.now();
    for (const [id, job] of this.jobs) {
      if (isActiveDeliveryPhotoUpload(job)) this.jobs.set(id, { ...job, status: "failed", errorCategory: "auth", message, updatedAt: now });
    }
    this.publish();
  }

  private removeQueued(jobId: string) {
    for (const queue of [this.preparationQueue, this.relayQueue]) {
      let index = queue.indexOf(jobId);
      while (index >= 0) { queue.splice(index, 1); index = queue.indexOf(jobId); }
    }
  }

  private pumpPreparation() {
    if (this.activePreparation) return;
    const jobId = this.preparationQueue.shift(); if (!jobId) return;
    const job = this.jobs.get(jobId); const payload = this.payloads.get(jobId);
    if (!job || !payload?.source || job.status !== "preparing") { this.pumpPreparation(); return; }
    const source = payload.source; delete payload.source;
    const controller = new AbortController(); payload.preparation = controller;
    const epoch = this.epoch; this.activePreparation = jobId;
    void this.dependencies.prepare(source, controller.signal).then((prepared) => {
      const current = this.jobs.get(jobId); const retained = this.payloads.get(jobId);
      if (this.epoch !== epoch || !current || !retained || current.status !== "preparing") return;
      delete retained.preparation; retained.prepared = prepared;
      this.update(jobId, { status: "queued", errorCategory: null, message: "" });
      this.relayQueue.push(jobId); this.pumpRelays();
    }).catch((error: unknown) => {
      if (this.epoch === epoch && this.jobs.has(jobId)) this.failPreparation(jobId, this.dependencies.preparationMessage(error));
    }).finally(() => {
      if (this.activePreparation === jobId) this.activePreparation = null;
      this.pumpPreparation();
    });
  }

  private pumpRelays() {
    while (this.activeRelays.size < this.dependencies.maxConcurrentRelays) {
      const jobId = this.relayQueue.shift(); if (!jobId) return;
      const job = this.jobs.get(jobId); const payload = this.payloads.get(jobId);
      if (!job || !payload?.prepared || job.status !== "queued") continue;
      this.activeRelays.add(jobId); this.update(jobId, { status: "uploading" });
      const epoch = this.epoch;
      const stable = { requestId: job.requestId, customerId: job.customerId, source: job.source,
        contentType: payload.prepared.contentType, blob: payload.prepared.blob } as const;
      void this.dependencies.encode(stable.blob).then((fileBase64) => this.dependencies.create({
        requestId: stable.requestId, customerId: stable.customerId, source: stable.source,
        contentType: stable.contentType, fileBase64,
      }, this.session)).then((metadata) => {
        if (this.epoch !== epoch || !this.jobs.has(jobId)) return;
        this.releasePayload(jobId); this.confirmed.set(jobId, metadata);
        this.update(jobId, { status: "completed", errorCategory: null, message: "", photoId: metadata.photoId });
      }).catch((error: unknown) => {
        if (this.epoch !== epoch || !this.jobs.has(jobId)) return;
        const category = classifyDeliveryPhotoCreateError(error);
        if (category === "auth") {
          this.failAllForAuth(deliveryPhotoCreateErrorMessage(error));
          return;
        } else if (category !== "retryable") {
          this.releasePayload(jobId);
        }
        this.update(jobId, { status: "failed", errorCategory: category, message: deliveryPhotoCreateErrorMessage(error) });
      }).finally(() => {
        this.activeRelays.delete(jobId); this.pumpRelays();
      });
    }
  }
}

const coordinators = new Map<string, DeliveryPhotoUploadCoordinator>();

export function getDeliveryPhotoUploadCoordinator(session: AuthenticatedSession) {
  const key = deliveryPhotoUploadNamespace(session);
  let coordinator = coordinators.get(key);
  if (!coordinator) { coordinator = new DeliveryPhotoUploadCoordinator(session); coordinators.set(key, coordinator); }
  return coordinator;
}

export function clearDeliveryPhotoUploadMemory() {
  for (const coordinator of coordinators.values()) coordinator.clear();
  coordinators.clear();
}

registerPrivateClientCleanup(clearDeliveryPhotoUploadMemory);
