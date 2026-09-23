import { createHash, randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type DocumentData, type DocumentReference, type Firestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { z } from "zod";

import { verifyCustomerTransactionActor, type CustomerActor } from "../customer/customer-authorization.js";
import { CUSTOMER_COLLECTION_PATH } from "../customer/customer-contract.js";
import { detectPhotoContentType } from "../photo/photo-processor.js";
import { getAdminFirestore } from "../shared/firebase-admin.js";
import {
  createDeliveryPhotoResultSchema,
  DELIVERY_PHOTO_DAY_OVERRIDE_RETENTION_DAYS,
  DELIVERY_PHOTO_MAX_BYTES,
  DELIVERY_PHOTO_RETENTION_HOURS,
  deleteDeliveryPhotoResultSchema,
  deliveryPhotoDayResultSchema,
  deliveryPhotoDaySchema,
  deliveryPhotoRouteSchema,
  deliveryPhotoDownloadSchema,
  listDeliveryPhotosResultSchema,
  type createDeliveryPhotoInputSchema,
  type deleteDeliveryPhotoInputSchema,
  type getDeliveryPhotoInputSchema,
  type listDeliveryPhotosInputSchema,
  type saveDeliveryPhotoDayInputSchema,
  type saveDeliveryPhotoRouteInputSchema,
  type DeliveryPhoto,
  type DeliveryPhotoDay,
  type DeliveryPhotoRoute,
} from "./delivery-photo-contract.js";
import { decodeDeliveryPhoto, processDeliveryPhoto } from "./delivery-photo-processor.js";
import {
  DELIVERY_PHOTO_DAY_PATH,
  DELIVERY_PHOTO_PATH,
  DELIVERY_PHOTO_ROUTE_PATH,
  deliveryPhotoFromDocument,
  deliveryPhotoMetadata,
  deliveryPhotoPath,
  GoogleDeliveryPhotoStorage,
  type DeliveryPhotoStorage,
  type InspectedDeliveryPhotoObject,
  type OwnedDeliveryPhotoObject,
  type StoredDeliveryPhoto,
} from "./delivery-photo-store.js";

const COMPANY_ID = "onnuri";
const CREATE_LEASE_MS = 5 * 60 * 1000;
const CLEANUP_LEASE_MS = 5 * 60 * 1000;
const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000;
// Active application recovery period. It does not bound when a pending Storage write may finish.
const CREATE_RECOVERY_WINDOW_MS = 2 * SCHEDULER_INTERVAL_MS;
const DELIVERY_PHOTO_RATE_LIMIT = 60;

type CleanupTarget = Required<Pick<InspectedDeliveryPhotoObject, "objectPath" | "generation" | "uploadAttemptToken">>;

export class DeliveryPhotoRevisionConflict extends Error {}
export class DeliveryPhotoRequestCollision extends Error {}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function deliveryDateKeyInSeoul(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function activeCustomer(snapshot: { exists: boolean; id: string; data(): DocumentData | undefined }, customerId: string) {
  const data = snapshot.data();
  return snapshot.exists && snapshot.id === customerId && data?.customerId === customerId
    && data.companyId === COMPANY_ID && data.status === "active";
}

function activeCustomerOrThrow(snapshot: { exists: boolean; id: string; data(): DocumentData | undefined }, customerId: string) {
  if (!activeCustomer(snapshot, customerId)) throw new HttpsError("failed-precondition", "활성 거래처를 확인할 수 없습니다.");
}

async function validateCustomers(db: Firestore, transaction: Transaction, customerIds: string[]) {
  if (customerIds.length === 0) return;
  const snapshots = await transaction.getAll(...customerIds.map((customerId) => db.doc(`${CUSTOMER_COLLECTION_PATH}/${customerId}`)));
  for (let index = 0; index < customerIds.length; index += 1) {
    activeCustomerOrThrow(snapshots[index]!, customerIds[index]!);
  }
}

function routeFromDocument(data: DocumentData): DeliveryPhotoRoute {
  return deliveryPhotoRouteSchema.parse({
    ...data,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
  });
}

function dayFromDocument(data: DocumentData): DeliveryPhotoDay {
  return deliveryPhotoDaySchema.parse({
    ...data,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
    expiresAt: data.expiresAt instanceof Timestamp ? data.expiresAt.toDate().toISOString() : data.expiresAt,
  });
}

function auditRecord(eventType: string, actor: CustomerActor, targetType: string, targetId: string, requestId: string, now: Timestamp, details: Record<string, unknown>) {
  return {
    logId: randomUUID(), eventType, actorUid: actor.uid, actorEmployeeId: actor.employeeId,
    targetType, targetId, companyId: COMPANY_ID, requestId, createdAt: now, ...details,
  };
}

function createAudit(transaction: Transaction, db: Firestore, record: { logId: string } & Record<string, unknown>) {
  transaction.create(db.doc(`auditLogs/${record.logId}`), record);
}

function cleanupTargets(value: unknown, allowedPath?: (path: string, uploadAttemptToken: string) => boolean): CleanupTarget[] {
  if (!Array.isArray(value)) return [];
  const targets: CleanupTarget[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const objectPath = "objectPath" in item ? item.objectPath : undefined;
    const generation = "generation" in item ? item.generation : undefined;
    const uploadAttemptToken = "uploadAttemptToken" in item ? item.uploadAttemptToken : undefined;
    if (typeof objectPath !== "string" || typeof generation !== "string" || !/^\d+$/.test(generation)
      || typeof uploadAttemptToken !== "string" || uploadAttemptToken.length < 1 || uploadAttemptToken.length > 128) continue;
    if (allowedPath && !allowedPath(objectPath, uploadAttemptToken)) continue;
    if (!targets.some((target) => target.objectPath === objectPath && target.generation === generation
      && target.uploadAttemptToken === uploadAttemptToken)) {
      targets.push({ objectPath, generation, uploadAttemptToken });
    }
  }
  return targets.slice(0, 4);
}

function photoUsesTarget(photo: StoredDeliveryPhoto | null, target: CleanupTarget) {
  return photo?.status === "active" && [photo.evidence, photo.thumbnail].some((object) =>
    object.objectPath === target.objectPath && object.generation === target.generation
      && object.uploadAttemptToken === target.uploadAttemptToken);
}

function attemptPaths(deliveryDateKey: string, photoId: string, uploadAttemptToken: string) {
  return {
    evidence: deliveryPhotoPath(deliveryDateKey, photoId, uploadAttemptToken, "evidence"),
    thumbnail: deliveryPhotoPath(deliveryDateKey, photoId, uploadAttemptToken, "thumbnail"),
  };
}

export class DeliveryPhotoService {
  private storageInstance: DeliveryPhotoStorage | undefined;

  constructor(
    private readonly db: Firestore = getAdminFirestore(),
    storage?: DeliveryPhotoStorage,
    private readonly currentTime: () => Timestamp = Timestamp.now,
  ) {
    this.storageInstance = storage;
  }

  private get storage() {
    this.storageInstance ??= new GoogleDeliveryPhotoStorage();
    return this.storageInstance;
  }

  private async cleanCreatePaths(
    lockRef: DocumentReference,
    paths: { evidence: string; thumbnail: string },
    cleanupToken: string,
    expectedUploadAttemptToken: string | null,
  ): Promise<"failed" | "lost" | "pending" | "complete"> {
    const inspectionStartedAt = this.currentTime();
    let inspected: CleanupTarget[];
    try {
      inspected = (await Promise.all(Object.values(paths).map((path) => this.storage.inspect(path))))
        .filter((object): object is InspectedDeliveryPhotoObject => Boolean(object))
        .filter((object): object is CleanupTarget => expectedUploadAttemptToken !== null
          && object.uploadAttemptToken === expectedUploadAttemptToken);
    } catch {
      const checkedAt = this.currentTime();
      await this.db.runTransaction(async (transaction) => {
        const current = await transaction.get(lockRef);
        if (current.exists && current.get("state") === "cleaning" && current.get("cleanupToken") === cleanupToken) {
          transaction.update(lockRef, {
            cleanupToken: null, cleanupLeaseExpiresAt: checkedAt, cleanupAfter: checkedAt,
          });
        }
      });
      return "failed" as const;
    }

    const checkedAt = this.currentTime();
    const targets = await this.db.runTransaction(async (transaction) => {
      const current = await transaction.get(lockRef);
      const leaseExpiresAt = current.get("cleanupLeaseExpiresAt");
      if (!current.exists || current.get("state") !== "cleaning" || current.get("cleanupToken") !== cleanupToken
        || !(leaseExpiresAt instanceof Timestamp) || leaseExpiresAt.toMillis() <= checkedAt.toMillis()) return null;
      const pinned = inspected.map(({ objectPath, generation, uploadAttemptToken }) => ({ objectPath, generation, uploadAttemptToken }));
      transaction.update(lockRef, { cleanupTargets: pinned });
      return pinned;
    });
    if (!targets) return "lost" as const;

    const unresolved = await this.deleteExactTargets(targets);
    const finalizedAt = this.currentTime();
    const outcome = await this.db.runTransaction(async (transaction) => {
      const current = await transaction.get(lockRef);
      if (!current.exists || current.get("state") !== "cleaning" || current.get("cleanupToken") !== cleanupToken) return "lost" as const;
      if (unresolved.length > 0) {
        transaction.update(lockRef, {
          cleanupTargets: unresolved, cleanupToken: null,
          cleanupLeaseExpiresAt: finalizedAt, cleanupAfter: finalizedAt,
        });
        return "failed" as const;
      }
      const recoveryUntil = current.get("recoveryUntil");
      if (recoveryUntil instanceof Timestamp && recoveryUntil.toMillis() > finalizedAt.toMillis()) {
        const nextCheckAt = Timestamp.fromMillis(Math.min(
          recoveryUntil.toMillis(),
          finalizedAt.toMillis() + SCHEDULER_INTERVAL_MS,
        ));
        transaction.update(lockRef, {
          cleanupTargets: FieldValue.delete(), cleanupToken: null,
          cleanupLeaseExpiresAt: nextCheckAt, cleanupAfter: nextCheckAt,
        });
        return "pending" as const;
      }
      if (recoveryUntil instanceof Timestamp && inspectionStartedAt.toMillis() < recoveryUntil.toMillis()) {
        return "refresh" as const;
      }
      transaction.update(lockRef, {
        state: "failed", leaseToken: null, leaseExpiresAt: FieldValue.delete(),
        cleanupToken: null, cleanupLeaseExpiresAt: FieldValue.delete(), cleanupAfter: FieldValue.delete(),
        cleanupTargets: FieldValue.delete(), cleanupOwnerToken: FieldValue.delete(), recoveryUntil: FieldValue.delete(),
      });
      return "complete" as const;
    });
    if (outcome === "refresh") {
      return this.cleanCreatePaths(lockRef, paths, cleanupToken, expectedUploadAttemptToken);
    }
    return outcome;
  }

  private async deleteExactTargets(targets: CleanupTarget[]) {
    const unresolved: CleanupTarget[] = [];
    await Promise.all(targets.map(async (target) => {
      try {
        const current = await this.storage.inspect(target.objectPath);
        if (!current || current.generation !== target.generation
          || current.uploadAttemptToken !== target.uploadAttemptToken) return;
        await this.storage.delete(target);
      } catch {
        try {
          const current = await this.storage.inspect(target.objectPath);
          if (current?.generation === target.generation
            && current.uploadAttemptToken === target.uploadAttemptToken) unresolved.push(target);
        } catch {
          unresolved.push(target);
        }
      }
    }));
    return unresolved;
  }

  private async protectCompletedTargets(lockRef: DocumentReference, photoId: string, targets: CleanupTarget[]) {
    return this.db.runTransaction(async (transaction) => {
      const [lock, photoSnapshot] = await transaction.getAll(lockRef, this.db.doc(`${DELIVERY_PHOTO_PATH}/${photoId}`));
      if (!lock!.exists) return [];
      const photo = photoSnapshot!.exists ? deliveryPhotoFromDocument(photoSnapshot!.data()!) : null;
      return targets.filter((target) => !photoUsesTarget(photo, target));
    });
  }

  private async persistOrphanTargets(lockRef: DocumentReference, photoId: string, targets: CleanupTarget[], now: Timestamp) {
    if (targets.length === 0) return;
    await this.db.runTransaction(async (transaction) => {
      const [lock, photoSnapshot] = await transaction.getAll(lockRef, this.db.doc(`${DELIVERY_PHOTO_PATH}/${photoId}`));
      if (!lock!.exists || lock!.get("operation") !== "createDeliveryPhoto") return;
      const photo = photoSnapshot!.exists ? deliveryPhotoFromDocument(photoSnapshot!.data()!) : null;
      const dateKey = String(lock!.get("deliveryDateKey"));
      const allowedPath = (path: string, token: string) => Object.values(attemptPaths(dateKey, photoId, token)).includes(path);
      const existing = cleanupTargets(lock!.get("orphanTargets"), allowedPath);
      const candidates = [...existing, ...targets]
        .filter((target) => allowedPath(target.objectPath, target.uploadAttemptToken) && !photoUsesTarget(photo, target));
      const bounded = cleanupTargets(candidates, allowedPath);
      if (bounded.length === 0) return;
      transaction.update(lock!.ref, { orphanTargets: bounded, orphanCleanupAfter: now });
    });
  }

  private async cleanLostUploads(lockRef: DocumentReference, photoId: string, targets: CleanupTarget[], now: Timestamp) {
    const candidates = await this.protectCompletedTargets(lockRef, photoId, targets);
    const unresolved = await this.deleteExactTargets(candidates);
    await this.persistOrphanTargets(lockRef, photoId, unresolved, now);
  }

  async getRoute(actor: CustomerActor): Promise<DeliveryPhotoRoute | null> {
    return this.db.runTransaction(async (transaction) => {
      await verifyCustomerTransactionActor(this.db, transaction, actor);
      const snapshot = await transaction.get(this.db.doc(`${DELIVERY_PHOTO_ROUTE_PATH}/${actor.employeeId}`));
      return snapshot.exists ? routeFromDocument(snapshot.data()!) : null;
    });
  }

  async saveRoute(input: z.infer<typeof saveDeliveryPhotoRouteInputSchema>, actor: CustomerActor, now = Timestamp.now()) {
    const requestFingerprint = fingerprint(input);
    const ref = this.db.doc(`${DELIVERY_PHOTO_ROUTE_PATH}/${actor.employeeId}`);
    const lockRef = this.db.doc(`requestLocks/delivery-photo-route-${input.requestId}`);
    return this.db.runTransaction(async (transaction) => {
      await verifyCustomerTransactionActor(this.db, transaction, actor);
      const [lock, current] = await transaction.getAll(lockRef, ref);
      if (lock!.exists) {
        const data = lock!.data()!;
        if (data.operation !== "saveDeliveryPhotoRoute" || data.actorUid !== actor.uid || data.requestFingerprint !== requestFingerprint) {
          throw new DeliveryPhotoRequestCollision();
        }
        return deliveryPhotoRouteSchema.parse(data.result);
      }
      const revision = current!.exists ? Number(current!.get("revision")) : null;
      if (revision !== input.expectedRevision) throw new DeliveryPhotoRevisionConflict();
      await validateCustomers(this.db, transaction, input.customerIds);
      const route: DeliveryPhotoRoute = {
        employeeId: actor.employeeId, customerIds: input.customerIds,
        revision: (revision ?? 0) + 1, updatedAt: now.toDate().toISOString(), updatedByEmployeeId: actor.employeeId,
      };
      transaction.set(ref, { ...route, updatedAt: now });
      transaction.create(lockRef, { operation: "saveDeliveryPhotoRoute", actorUid: actor.uid, requestFingerprint, result: route, createdAt: now });
      createAudit(transaction, this.db, auditRecord("DELIVERY_PHOTO_ROUTE_UPDATED", actor, "deliveryPhotoRoute", actor.employeeId, input.requestId, now,
        { revision: route.revision, customerCount: route.customerIds.length }));
      return route;
    });
  }

  async getDay(actor: CustomerActor, now = Timestamp.now()) {
    const dateKey = deliveryDateKeyInSeoul(now.toDate());
    return this.db.runTransaction(async (transaction) => {
      await verifyCustomerTransactionActor(this.db, transaction, actor);
      const [route, day] = await transaction.getAll(
        this.db.doc(`${DELIVERY_PHOTO_ROUTE_PATH}/${actor.employeeId}`),
        this.db.doc(`${DELIVERY_PHOTO_DAY_PATH}/${actor.employeeId}_${dateKey}`),
      );
      if (day!.exists && day!.get("expiresAt") instanceof Timestamp && day!.get("expiresAt").toMillis() > now.toMillis()) {
        const value = dayFromDocument(day!.data()!);
        if (value.hasOverride) {
          return deliveryPhotoDayResultSchema.parse({ deliveryDateKey: dateKey, customerIds: value.customerIds, revision: value.revision, isOverride: true });
        }
        const customerIds = route!.exists ? routeFromDocument(route!.data()!).customerIds : [];
        return deliveryPhotoDayResultSchema.parse({ deliveryDateKey: dateKey, customerIds, revision: value.revision, isOverride: false });
      }
      const customerIds = route!.exists ? routeFromDocument(route!.data()!).customerIds : [];
      return deliveryPhotoDayResultSchema.parse({ deliveryDateKey: dateKey, customerIds, revision: null, isOverride: false });
    });
  }

  async saveDay(input: z.infer<typeof saveDeliveryPhotoDayInputSchema>, actor: CustomerActor, now = Timestamp.now()) {
    const dateKey = deliveryDateKeyInSeoul(now.toDate());
    const requestFingerprint = fingerprint(input);
    const ref = this.db.doc(`${DELIVERY_PHOTO_DAY_PATH}/${actor.employeeId}_${dateKey}`);
    const routeRef = this.db.doc(`${DELIVERY_PHOTO_ROUTE_PATH}/${actor.employeeId}`);
    const lockRef = this.db.doc(`requestLocks/delivery-photo-day-${input.requestId}`);
    return this.db.runTransaction(async (transaction) => {
      await verifyCustomerTransactionActor(this.db, transaction, actor);
      const [lock, routeSnapshot, current] = await transaction.getAll(lockRef, routeRef, ref);
      if (lock!.exists) {
        const data = lock!.data()!;
        if (data.operation !== "saveDeliveryPhotoDay" || data.actorUid !== actor.uid || data.requestFingerprint !== requestFingerprint) {
          throw new DeliveryPhotoRequestCollision();
        }
        return deliveryPhotoDayResultSchema.parse(data.result);
      }
      const currentRevision = current!.exists ? Number(current!.get("revision")) : null;
      if (currentRevision !== input.expectedRevision) throw new DeliveryPhotoRevisionConflict();
      await validateCustomers(this.db, transaction, input.customerIds);
      const routeIds = routeSnapshot!.exists ? routeFromDocument(routeSnapshot!.data()!).customerIds : [];
      const matchesRoute = JSON.stringify(routeIds) === JSON.stringify(input.customerIds);
      const nextRevision = (currentRevision ?? 0) + 1;
      const result = deliveryPhotoDayResultSchema.parse({
        deliveryDateKey: dateKey,
        customerIds: input.customerIds,
        revision: nextRevision,
        isOverride: !matchesRoute,
      });
      const day: DeliveryPhotoDay = {
        employeeId: actor.employeeId, deliveryDateKey: dateKey, hasOverride: !matchesRoute,
        customerIds: matchesRoute ? [] : input.customerIds,
        revision: nextRevision, updatedAt: now.toDate().toISOString(), updatedByEmployeeId: actor.employeeId,
        expiresAt: Timestamp.fromMillis(now.toMillis() + DELIVERY_PHOTO_DAY_OVERRIDE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toDate().toISOString(),
      };
      transaction.set(ref, { ...day, updatedAt: now, expiresAt: Timestamp.fromDate(new Date(day.expiresAt)) });
      transaction.create(lockRef, { operation: "saveDeliveryPhotoDay", actorUid: actor.uid, requestFingerprint, result, createdAt: now });
      createAudit(transaction, this.db, auditRecord(matchesRoute ? "DELIVERY_PHOTO_DAY_CLEARED" : "DELIVERY_PHOTO_DAY_UPDATED", actor,
        "deliveryPhotoDay", `${actor.employeeId}_${dateKey}`, input.requestId, now,
        { revision: result.revision, customerCount: result.customerIds.length, deliveryDateKey: dateKey }));
      return result;
    });
  }

  async create(input: z.infer<typeof createDeliveryPhotoInputSchema>, actor: CustomerActor, now = Timestamp.now()) {
    const source = decodeDeliveryPhoto(input);
    const storage = this.storage; // Resolve configuration before creating an in-flight receipt.
    const inputHash = createHash("sha256").update(source).update(input.contentType).update(input.customerId).update(input.source).digest("hex");
    const lockRef = this.db.doc(`requestLocks/delivery-photo-create-${input.requestId}`);
    const leaseToken = randomUUID();
    const uploadAttemptToken = randomUUID();

    const prepare = () => this.db.runTransaction(async (transaction) => {
      await verifyCustomerTransactionActor(this.db, transaction, actor);
      const [lock, customer, employee, rate] = await transaction.getAll(
        lockRef,
        this.db.doc(`${CUSTOMER_COLLECTION_PATH}/${input.customerId}`),
        this.db.doc(`employees/${actor.employeeId}`),
        this.db.doc(`deliveryPhotoUploadRates/${actor.uid}`),
      );
      activeCustomerOrThrow(customer!, input.customerId);
      const employeeName = typeof employee!.get("displayName") === "string" ? employee!.get("displayName").trim() : "";
      if (!employeeName || employeeName.length > 120) throw new HttpsError("failed-precondition", "직원 이름을 확인할 수 없습니다.");
      if (lock!.exists) {
        const data = lock!.data()!;
        if (data.operation !== "createDeliveryPhoto" || data.actorUid !== actor.uid || data.inputHash !== inputHash) {
          throw new DeliveryPhotoRequestCollision();
        }
        if (data.state === "complete") return { kind: "replay" as const, result: createDeliveryPhotoResultSchema.parse(data.result) };
        const photoId = String(data.photoId);
        const deliveryDateKey = String(data.deliveryDateKey);
        const currentAttemptToken = typeof data.uploadAttemptToken === "string" ? data.uploadAttemptToken : "";
        const paths = { evidence: String(data.evidencePath), thumbnail: String(data.thumbnailPath) };
        const expectedPaths = attemptPaths(deliveryDateKey, photoId, currentAttemptToken);
        if (paths.evidence !== expectedPaths.evidence || paths.thumbnail !== expectedPaths.thumbnail
          || !(data.operationStartedAt instanceof Timestamp)) {
          throw new HttpsError("failed-precondition", "사진 복구 상태를 확인할 수 없습니다.");
        }
        if (data.state === "processing" && data.leaseExpiresAt instanceof Timestamp && data.leaseExpiresAt.toMillis() > now.toMillis()) {
          throw new HttpsError("aborted", "같은 사진 요청을 처리하고 있습니다. 잠시 후 다시 시도해주세요.");
        }
        if (data.state === "cleaning" && data.cleanupLeaseExpiresAt instanceof Timestamp && data.cleanupLeaseExpiresAt.toMillis() > now.toMillis()) {
          throw new HttpsError("aborted", "이전 사진 요청을 정리하고 있습니다. 잠시 후 다시 시도해주세요.");
        }
        if (data.state === "processing" || data.state === "cleaning") {
          const cleanupOwnerToken = data.state === "processing" && typeof data.uploadAttemptToken === "string"
            ? data.uploadAttemptToken
            : typeof data.cleanupOwnerToken === "string" ? data.cleanupOwnerToken : null;
          const recoveryUntil = data.recoveryUntil instanceof Timestamp ? data.recoveryUntil : null;
          if (!recoveryUntil) throw new HttpsError("failed-precondition", "사진 복구 기한을 확인할 수 없습니다.");
          const cleanupToken = randomUUID();
          const cleanupLeaseExpiresAt = Timestamp.fromMillis(now.toMillis() + CLEANUP_LEASE_MS);
          transaction.update(lockRef, {
            state: "cleaning", cleanupToken, cleanupLeaseExpiresAt, cleanupAfter: cleanupLeaseExpiresAt,
            leaseToken: null, leaseExpiresAt: FieldValue.delete(),
            cleanupOwnerToken, ...(recoveryUntil ? { recoveryUntil } : {}),
          });
          return { kind: "cleanup" as const, cleanupToken, cleanupOwnerToken, paths };
        }
        if (data.state !== "failed") throw new HttpsError("failed-precondition", "사진 요청 상태를 확인할 수 없습니다.");
        if (cleanupTargets(data.orphanTargets).length > 0) {
          throw new HttpsError("aborted", "이전 사진 파일을 정리하고 있습니다. 잠시 후 다시 시도해주세요.");
        }
        const retryPaths = attemptPaths(deliveryDateKey, photoId, uploadAttemptToken);
        transaction.update(lockRef, {
          state: "processing", leaseToken, uploadAttemptToken, processingStartedAt: now,
          evidencePath: retryPaths.evidence, thumbnailPath: retryPaths.thumbnail,
          leaseExpiresAt: Timestamp.fromMillis(now.toMillis() + CREATE_LEASE_MS),
          recoveryUntil: Timestamp.fromMillis(now.toMillis() + CREATE_RECOVERY_WINDOW_MS),
          cleanupToken: null, cleanupLeaseExpiresAt: FieldValue.delete(), cleanupAfter: FieldValue.delete(),
          cleanupTargets: FieldValue.delete(), cleanupOwnerToken: FieldValue.delete(),
        });
        return {
          kind: "ready" as const, photoId, deliveryDateKey, paths: retryPaths, employeeName,
          operationStartedAt: data.operationStartedAt as Timestamp,
        };
      }
      const window = Math.floor(now.toMillis() / 3_600_000);
      const count = rate!.get("window") === window && Number.isInteger(rate!.get("count")) ? Number(rate!.get("count")) : 0;
      if (count >= DELIVERY_PHOTO_RATE_LIMIT) throw new HttpsError("resource-exhausted", "납품 사진 등록이 많습니다. 잠시 후 다시 시도해주세요.");
      const photoId = randomUUID();
      const deliveryDateKey = deliveryDateKeyInSeoul(now.toDate());
      const paths = attemptPaths(deliveryDateKey, photoId, uploadAttemptToken);
      transaction.set(rate!.ref, { window, count: count + 1 });
      transaction.create(lockRef, {
        operation: "createDeliveryPhoto", actorUid: actor.uid, actorEmployeeId: actor.employeeId,
        inputHash, state: "processing", photoId, deliveryDateKey,
        evidencePath: paths.evidence, thumbnailPath: paths.thumbnail,
        operationStartedAt: now, processingStartedAt: now, leaseToken, uploadAttemptToken,
        recoveryUntil: Timestamp.fromMillis(now.toMillis() + CREATE_RECOVERY_WINDOW_MS),
        leaseExpiresAt: Timestamp.fromMillis(now.toMillis() + CREATE_LEASE_MS), createdAt: now,
      });
      return { kind: "ready" as const, photoId, deliveryDateKey, paths, employeeName, operationStartedAt: now };
    });

    let prepared = await prepare();
    if (prepared.kind === "replay") return prepared.result;
    if (prepared.kind === "cleanup") {
      const cleaned = await this.cleanCreatePaths(lockRef, prepared.paths, prepared.cleanupToken, prepared.cleanupOwnerToken);
      if (cleaned !== "complete") throw new HttpsError("unavailable", "이전 사진 파일을 정리하지 못했습니다. 잠시 후 다시 시도해주세요.");
      prepared = await prepare();
      if (prepared.kind === "replay") return prepared.result;
      if (prepared.kind !== "ready") throw new HttpsError("aborted", "사진 요청 상태가 변경되었습니다. 다시 시도해주세요.");
    }

    const { deliveryDateKey, paths } = prepared;
    let uploadedTargets: CleanupTarget[] = [];
    try {
      const processed = await processDeliveryPhoto(source);
      const uploads = await Promise.allSettled([
        storage.save(paths.evidence, processed.evidence.buffer, { width: processed.evidence.width, height: processed.evidence.height }, uploadAttemptToken),
        storage.save(paths.thumbnail, processed.thumbnail.buffer, { width: processed.thumbnail.width, height: processed.thumbnail.height }, uploadAttemptToken),
      ]);
      uploadedTargets = uploads.flatMap((item) => item.status === "fulfilled"
        ? [{
          objectPath: item.value.objectPath,
          generation: item.value.generation,
          uploadAttemptToken: item.value.uploadAttemptToken,
        }]
        : []);
      const failedUpload = uploads.find((item): item is PromiseRejectedResult => item.status === "rejected");
      if (failedUpload) throw failedUpload.reason;
      const evidence = (uploads[0] as PromiseFulfilledResult<OwnedDeliveryPhotoObject>).value;
      const thumbnail = (uploads[1] as PromiseFulfilledResult<OwnedDeliveryPhotoObject>).value;
      if (evidence.objectPath !== paths.evidence || thumbnail.objectPath !== paths.thumbnail
        || evidence.uploadAttemptToken !== uploadAttemptToken || thumbnail.uploadAttemptToken !== uploadAttemptToken) {
        throw new HttpsError("aborted", "사진 업로드 시도 식별자가 일치하지 않습니다.");
      }
      const expiresAt = Timestamp.fromMillis(prepared.operationStartedAt.toMillis() + DELIVERY_PHOTO_RETENTION_HOURS * 60 * 60 * 1000);
      const stored: StoredDeliveryPhoto = {
        photoId: prepared.photoId, customerId: input.customerId, deliveryDateKey, source: input.source,
        status: "active", createdAt: prepared.operationStartedAt, createdByUid: actor.uid, createdByEmployeeId: actor.employeeId,
        createdByName: prepared.employeeName, expiresAt, evidence, thumbnail,
      };
      return await this.db.runTransaction(async (transaction) => {
        await verifyCustomerTransactionActor(this.db, transaction, actor);
        const [lock, customer] = await transaction.getAll(lockRef, this.db.doc(`${CUSTOMER_COLLECTION_PATH}/${input.customerId}`));
        activeCustomerOrThrow(customer!, input.customerId);
        const leaseExpiresAt = lock!.get("leaseExpiresAt");
        if (!lock!.exists || lock!.get("state") !== "processing" || lock!.get("leaseToken") !== leaseToken
          || lock!.get("uploadAttemptToken") !== uploadAttemptToken
          || lock!.get("evidencePath") !== paths.evidence || lock!.get("thumbnailPath") !== paths.thumbnail
          || !(leaseExpiresAt instanceof Timestamp) || leaseExpiresAt.toMillis() <= this.currentTime().toMillis()) {
          throw new HttpsError("aborted", "사진 저장 상태가 변경되었습니다. 다시 확인해주세요.");
        }
        transaction.create(this.db.doc(`${DELIVERY_PHOTO_PATH}/${prepared.photoId}`), stored);
        const response = createDeliveryPhotoResultSchema.parse(deliveryPhotoMetadata(stored));
        transaction.update(lockRef, {
          state: "complete", result: response, completedAt: now,
          leaseToken: null, leaseExpiresAt: FieldValue.delete(), cleanupToken: null,
          cleanupLeaseExpiresAt: FieldValue.delete(), cleanupAfter: FieldValue.delete(), cleanupTargets: FieldValue.delete(),
          cleanupOwnerToken: FieldValue.delete(), recoveryUntil: FieldValue.delete(),
        });
        createAudit(transaction, this.db, auditRecord("DELIVERY_PHOTO_CREATED", actor, "deliveryPhoto", prepared.photoId, input.requestId, now,
          { customerId: input.customerId, deliveryDateKey, expiresAt }));
        return response;
      });
    } catch (error) {
      const resolution = await this.db.runTransaction(async (transaction) => {
        const [lock, photo] = await transaction.getAll(lockRef, this.db.doc(`${DELIVERY_PHOTO_PATH}/${prepared.photoId}`));
        if (lock!.exists && lock!.get("state") === "complete" && photo!.exists) {
          return { kind: "complete" as const, result: createDeliveryPhotoResultSchema.parse(lock!.get("result")) };
        }
        if (!lock!.exists || lock!.get("state") !== "processing" || lock!.get("leaseToken") !== leaseToken || photo!.exists) {
          return { kind: "lost" as const };
        }
        const cleanupToken = randomUUID();
        const cleanupLeaseExpiresAt = Timestamp.fromMillis(now.toMillis() + CLEANUP_LEASE_MS);
        transaction.update(lockRef, {
          state: "cleaning", cleanupToken, cleanupLeaseExpiresAt, cleanupAfter: cleanupLeaseExpiresAt,
          leaseToken: null, leaseExpiresAt: FieldValue.delete(),
          cleanupOwnerToken: uploadAttemptToken, recoveryUntil: this.currentTime(),
        });
        return { kind: "cleanup" as const, cleanupToken };
      });
      if (resolution.kind === "complete") {
        await this.cleanLostUploads(lockRef, prepared.photoId, uploadedTargets, this.currentTime());
        return resolution.result;
      }
      if (resolution.kind === "cleanup") {
        await this.cleanCreatePaths(lockRef, paths, resolution.cleanupToken, uploadAttemptToken);
      } else {
        await this.cleanLostUploads(lockRef, prepared.photoId, uploadedTargets, this.currentTime());
      }
      throw error;
    }
  }

  private async verifyRead(actor: CustomerActor) {
    return this.db.runTransaction(async (transaction) => {
      await verifyCustomerTransactionActor(this.db, transaction, actor);
    });
  }

  async list(input: z.infer<typeof listDeliveryPhotosInputSchema>, actor: CustomerActor, now = Timestamp.now()) {
    await this.verifyRead(actor);
    if (input.scope === "today") {
      const dateKey = deliveryDateKeyInSeoul(now.toDate());
      const snapshot = await this.db.collection(DELIVERY_PHOTO_PATH)
        .where("deliveryDateKey", "==", dateKey).orderBy("createdAt", "desc").limit(501).get();
      const truncated = snapshot.docs.length > 500;
      const photos = snapshot.docs.slice(0, 500).map((doc) => deliveryPhotoFromDocument(doc.data()))
        .filter((photo) => photo.status === "active" && photo.expiresAt.toMillis() > now.toMillis());
      await this.verifyRead(actor);
      const summaries = new Map<string, { customerId: string; count: number; latest: ReturnType<typeof deliveryPhotoMetadata> }>();
      for (const photo of photos) {
        const metadata = deliveryPhotoMetadata(photo);
        const current = summaries.get(photo.customerId);
        if (current) current.count += 1;
        else summaries.set(photo.customerId, { customerId: photo.customerId, count: 1, latest: metadata });
      }
      return listDeliveryPhotosResultSchema.parse({
        scope: "today", deliveryDateKey: dateKey, truncated,
        photos: photos.map(deliveryPhotoMetadata), customers: [...summaries.values()],
      });
    }
    const from = Timestamp.fromMillis(now.toMillis() - DELIVERY_PHOTO_RETENTION_HOURS * 60 * 60 * 1000);
    const fromDateKey = deliveryDateKeyInSeoul(from.toDate());
    const snapshot = await this.db.collection(DELIVERY_PHOTO_PATH)
      .where("customerId", "==", input.customerId).where("createdAt", ">=", from)
      .orderBy("createdAt", "desc").limit(Math.min(input.limit * 4, 400)).get();
    const photos = snapshot.docs.map((doc) => deliveryPhotoFromDocument(doc.data()))
      .filter((photo) => photo.status === "active" && photo.expiresAt.toMillis() > now.toMillis()).slice(0, input.limit);
    await this.verifyRead(actor);
    return listDeliveryPhotosResultSchema.parse({ scope: "customer", customerId: input.customerId, fromDateKey, photos: photos.map(deliveryPhotoMetadata) });
  }

  async get(
    input: z.infer<typeof getDeliveryPhotoInputSchema>,
    actor: CustomerActor,
    now = Timestamp.now(),
    currentTime: () => Timestamp = Timestamp.now,
  ) {
    const storage = this.storage;
    const check = async (checkedAt: Timestamp) => this.db.runTransaction(async (transaction) => {
      await verifyCustomerTransactionActor(this.db, transaction, actor);
      const photoSnapshot = await transaction.get(this.db.doc(`${DELIVERY_PHOTO_PATH}/${input.photoId}`));
      if (!photoSnapshot.exists) throw new HttpsError("not-found", "납품 사진을 찾을 수 없습니다.");
      const photo = deliveryPhotoFromDocument(photoSnapshot.data()!);
      if (photo.status !== "active" || photo.expiresAt.toMillis() <= checkedAt.toMillis()) throw new HttpsError("not-found", "납품 사진을 찾을 수 없습니다.");
      return photo;
    });
    const before = await check(now);
    const object = before[input.variant];
    const buffer = await storage.download(object);
    if (buffer.length === 0 || buffer.length > DELIVERY_PHOTO_MAX_BYTES || buffer.length !== object.byteSize || detectPhotoContentType(buffer) !== "image/webp") {
      throw new HttpsError("failed-precondition", "저장된 납품 사진을 확인할 수 없습니다.");
    }
    const after = await check(currentTime());
    if (after[input.variant].objectPath !== object.objectPath || after[input.variant].generation !== object.generation
      || after[input.variant].uploadAttemptToken !== object.uploadAttemptToken) {
      throw new HttpsError("not-found", "납품 사진이 변경되었습니다.");
    }
    return deliveryPhotoDownloadSchema.parse({
      photoId: input.photoId, variant: input.variant, contentType: "image/webp",
      byteSize: buffer.length, fileBase64: buffer.toString("base64"),
    });
  }

  async delete(input: z.infer<typeof deleteDeliveryPhotoInputSchema>, actor: CustomerActor, now = Timestamp.now()) {
    const storage = this.storage;
    const requestFingerprint = fingerprint(input);
    const lockRef = this.db.doc(`requestLocks/delivery-photo-delete-${input.requestId}`);
    const outcome = await this.db.runTransaction(async (transaction) => {
      await verifyCustomerTransactionActor(this.db, transaction, actor);
      const [lock, photoSnapshot] = await transaction.getAll(lockRef, this.db.doc(`${DELIVERY_PHOTO_PATH}/${input.photoId}`));
      if (lock!.exists) {
        const data = lock!.data()!;
        if (data.operation !== "deleteDeliveryPhoto" || data.actorUid !== actor.uid || data.requestFingerprint !== requestFingerprint) {
          throw new DeliveryPhotoRequestCollision();
        }
        if (!photoSnapshot!.exists) throw new HttpsError("not-found", "삭제된 납품 사진 기록을 찾을 수 없습니다.");
        return { result: deleteDeliveryPhotoResultSchema.parse(data.result), photo: deliveryPhotoFromDocument(photoSnapshot!.data()!) };
      }
      if (!photoSnapshot!.exists) throw new HttpsError("not-found", "납품 사진을 찾을 수 없습니다.");
      const photo = deliveryPhotoFromDocument(photoSnapshot!.data()!);
      if (photo.status !== "active" || photo.expiresAt.toMillis() <= now.toMillis()) throw new HttpsError("not-found", "납품 사진을 찾을 수 없습니다.");
      const today = deliveryDateKeyInSeoul(now.toDate());
      const ownsSameDay = photo.createdByUid === actor.uid && photo.createdByEmployeeId === actor.employeeId && photo.deliveryDateKey === today;
      if (!ownsSameDay && !actor.isAdmin) throw new HttpsError("permission-denied", "본인이 오늘 등록한 사진만 삭제할 수 있습니다.");
      const result = deleteDeliveryPhotoResultSchema.parse({ photoId: photo.photoId, deletedAt: now.toDate().toISOString() });
      const deletion: NonNullable<DeliveryPhoto["deletion"]> = {
        deletedAt: result.deletedAt, deletedByEmployeeId: actor.employeeId,
        deleteReason: ownsSameDay ? "user" : "admin",
      };
      transaction.update(photoSnapshot!.ref, { status: "deleted", deletion: { ...deletion, deletedAt: now }, cleanupAfter: now });
      transaction.create(lockRef, { operation: "deleteDeliveryPhoto", actorUid: actor.uid, requestFingerprint, result, createdAt: now });
      createAudit(transaction, this.db, auditRecord("DELIVERY_PHOTO_DELETED", actor, "deliveryPhoto", photo.photoId, input.requestId, now,
        { customerId: photo.customerId, deliveryDateKey: photo.deliveryDateKey, deleteReason: deletion.deleteReason }));
      return { result, photo: { ...photo, status: "deleted" as const, deletion: { ...deletion, deletedAt: now }, cleanupAfter: now } };
    });
    const cleanup = await Promise.allSettled([storage.delete(outcome.photo.evidence), storage.delete(outcome.photo.thumbnail)]);
    if (cleanup.every((item) => item.status === "fulfilled")) {
      await this.db.runTransaction(async (transaction) => {
        const current = await transaction.get(this.db.doc(`${DELIVERY_PHOTO_PATH}/${input.photoId}`));
        if (!current.exists) return;
        const photo = deliveryPhotoFromDocument(current.data()!);
        if (photo.status === "deleted"
          && photo.evidence.generation === outcome.photo.evidence.generation
          && photo.thumbnail.generation === outcome.photo.thumbnail.generation) {
          transaction.update(current.ref, { cleanupAfter: FieldValue.delete() });
        }
      });
    }
    return outcome.result;
  }

  private async claimCreateCleanup(candidateRef: DocumentReference, now: Timestamp) {
    return this.db.runTransaction(async (transaction) => {
      const current = await transaction.get(candidateRef);
      if (!current.exists || current.get("operation") !== "createDeliveryPhoto") return null;
      const data = current.data()!;
      const processingExpired = data.state === "processing" && data.leaseExpiresAt instanceof Timestamp
        && data.leaseExpiresAt.toMillis() <= now.toMillis();
      const cleanupExpired = data.state === "cleaning" && data.cleanupLeaseExpiresAt instanceof Timestamp
        && data.cleanupLeaseExpiresAt.toMillis() <= now.toMillis();
      if (!processingExpired && !cleanupExpired) return null;
      const photoId = String(data.photoId);
      const deliveryDateKey = String(data.deliveryDateKey);
      const currentAttemptToken = typeof data.uploadAttemptToken === "string" ? data.uploadAttemptToken : "";
      const paths = { evidence: String(data.evidencePath), thumbnail: String(data.thumbnailPath) };
      const expectedPaths = attemptPaths(deliveryDateKey, photoId, currentAttemptToken);
      if (paths.evidence !== expectedPaths.evidence || paths.thumbnail !== expectedPaths.thumbnail) return null;
      const cleanupOwnerToken = processingExpired && typeof data.uploadAttemptToken === "string"
        ? data.uploadAttemptToken
        : typeof data.cleanupOwnerToken === "string" ? data.cleanupOwnerToken : null;
      const recoveryUntil = data.recoveryUntil instanceof Timestamp ? data.recoveryUntil : null;
      if (!recoveryUntil) return null;
      const cleanupToken = randomUUID();
      const cleanupLeaseExpiresAt = Timestamp.fromMillis(now.toMillis() + CLEANUP_LEASE_MS);
      transaction.update(candidateRef, {
        state: "cleaning", cleanupToken, cleanupLeaseExpiresAt, cleanupAfter: cleanupLeaseExpiresAt,
        leaseToken: null, leaseExpiresAt: FieldValue.delete(),
        cleanupOwnerToken, ...(recoveryUntil ? { recoveryUntil } : {}),
      });
      return { cleanupToken, cleanupOwnerToken, paths };
    });
  }

  private async claimOrphanCleanup(candidateRef: DocumentReference, now: Timestamp) {
    return this.db.runTransaction(async (transaction) => {
      const current = await transaction.get(candidateRef);
      if (!current.exists || current.get("operation") !== "createDeliveryPhoto") return null;
      const cleanupAfter = current.get("orphanCleanupAfter");
      const leaseExpiresAt = current.get("orphanCleanupLeaseExpiresAt");
      if (!(cleanupAfter instanceof Timestamp) || cleanupAfter.toMillis() > now.toMillis()
        || (leaseExpiresAt instanceof Timestamp && leaseExpiresAt.toMillis() > now.toMillis())) return null;
      const dateKey = String(current.get("deliveryDateKey"));
      const photoId = String(current.get("photoId"));
      const targets = cleanupTargets(current.get("orphanTargets"), (path, token) =>
        Object.values(attemptPaths(dateKey, photoId, token)).includes(path));
      if (targets.length === 0) {
        transaction.update(current.ref, {
          orphanTargets: FieldValue.delete(), orphanCleanupAfter: FieldValue.delete(),
          orphanCleanupToken: FieldValue.delete(), orphanCleanupLeaseExpiresAt: FieldValue.delete(),
        });
        return null;
      }
      const token = randomUUID();
      const expiresAt = Timestamp.fromMillis(now.toMillis() + CLEANUP_LEASE_MS);
      transaction.update(current.ref, { orphanCleanupToken: token, orphanCleanupLeaseExpiresAt: expiresAt, orphanCleanupAfter: expiresAt });
      return { token, photoId, targets };
    });
  }

  private async cleanClaimedOrphans(candidateRef: DocumentReference, claim: { token: string; photoId: string; targets: CleanupTarget[] }) {
    const targets = await this.db.runTransaction(async (transaction) => {
      const [current, photoSnapshot] = await transaction.getAll(
        candidateRef,
        this.db.doc(`${DELIVERY_PHOTO_PATH}/${claim.photoId}`),
      );
      if (!current!.exists || current!.get("orphanCleanupToken") !== claim.token) return null;
      const photo = photoSnapshot!.exists ? deliveryPhotoFromDocument(photoSnapshot!.data()!) : null;
      const unprotected = claim.targets.filter((target) => !photoUsesTarget(photo, target));
      transaction.update(current!.ref, { orphanTargets: unprotected });
      return unprotected;
    });
    if (!targets) return "lost" as const;
    const unresolved = await this.deleteExactTargets(targets);
    const finishedAt = this.currentTime();
    return this.db.runTransaction(async (transaction) => {
      const current = await transaction.get(candidateRef);
      if (!current.exists || current.get("orphanCleanupToken") !== claim.token) return "lost" as const;
      if (unresolved.length > 0) {
        transaction.update(current.ref, {
          orphanTargets: unresolved, orphanCleanupAfter: finishedAt,
          orphanCleanupToken: FieldValue.delete(), orphanCleanupLeaseExpiresAt: FieldValue.delete(),
        });
        return "failed" as const;
      }
      transaction.update(current.ref, {
        orphanTargets: FieldValue.delete(), orphanCleanupAfter: FieldValue.delete(),
        orphanCleanupToken: FieldValue.delete(), orphanCleanupLeaseExpiresAt: FieldValue.delete(),
      });
      return "complete" as const;
    });
  }

  async expire(now = Timestamp.now(), limit = 100) {
    const storage = this.storage;
    const candidates = await this.db.collection(DELIVERY_PHOTO_PATH).where("expiresAt", "<=", now).limit(limit).get();
    let removed = 0;
    let failures = 0;
    for (const candidate of candidates.docs) {
      try {
        const photo = deliveryPhotoFromDocument(candidate.data());
        const cleanup = await Promise.allSettled([storage.delete(photo.evidence), storage.delete(photo.thumbnail)]);
        if (cleanup.some((item) => item.status === "rejected")) throw new Error("Expired photo cleanup failed.");
        const deleted = await this.db.runTransaction(async (transaction) => {
          const current = await transaction.get(candidate.ref);
          if (!current.exists) return false;
          const latest = deliveryPhotoFromDocument(current.data()!);
          if (latest.expiresAt.toMillis() > now.toMillis()) return false;
          transaction.delete(current.ref);
          const record = {
            logId: randomUUID(), eventType: "DELIVERY_PHOTO_EXPIRED", actorUid: "system", actorEmployeeId: "system",
            targetType: "deliveryPhoto", targetId: latest.photoId, companyId: COMPANY_ID,
            customerId: latest.customerId, deliveryDateKey: latest.deliveryDateKey, createdAt: now,
          };
          createAudit(transaction, this.db, record);
          return true;
        });
        if (deleted) removed += 1;
      } catch { failures += 1; }
    }
    const deletedCandidates = await this.db.collection(DELIVERY_PHOTO_PATH).where("cleanupAfter", "<=", now).limit(limit).get();
    for (const candidate of deletedCandidates.docs) {
      try {
        const photo = deliveryPhotoFromDocument(candidate.data());
        if (photo.status !== "deleted") continue;
        const cleanup = await Promise.allSettled([storage.delete(photo.evidence), storage.delete(photo.thumbnail)]);
        if (cleanup.some((item) => item.status === "rejected")) throw new Error("Deleted photo cleanup failed.");
        await this.db.runTransaction(async (transaction) => {
          const current = await transaction.get(candidate.ref);
          if (!current.exists) return;
          const latest = deliveryPhotoFromDocument(current.data()!);
          if (latest.status === "deleted"
            && latest.evidence.generation === photo.evidence.generation
            && latest.thumbnail.generation === photo.thumbnail.generation) {
            transaction.update(current.ref, { cleanupAfter: FieldValue.delete() });
          }
        });
      } catch { failures += 1; }
    }

    const staleProcessing = await this.db.collection("requestLocks").where("leaseExpiresAt", "<=", now).limit(limit).get();
    const pendingCleanup = await this.db.collection("requestLocks").where("cleanupAfter", "<=", now).limit(limit).get();
    const operationCandidates = new Map([...staleProcessing.docs, ...pendingCleanup.docs].map((candidate) => [candidate.ref.path, candidate]));
    for (const candidate of operationCandidates.values()) {
      try {
        const claim = await this.claimCreateCleanup(candidate.ref, now);
        if (!claim) continue;
        const cleaned = await this.cleanCreatePaths(candidate.ref, claim.paths, claim.cleanupToken, claim.cleanupOwnerToken);
        if (cleaned === "failed") failures += 1;
      } catch { failures += 1; }
    }

    const orphanCandidates = await this.db.collection("requestLocks").where("orphanCleanupAfter", "<=", now).limit(limit).get();
    for (const candidate of orphanCandidates.docs) {
      try {
        const claim = await this.claimOrphanCleanup(candidate.ref, now);
        if (!claim) continue;
        const cleaned = await this.cleanClaimedOrphans(candidate.ref, claim);
        if (cleaned === "failed") failures += 1;
      } catch { failures += 1; }
    }
    return { removed, failures };
  }
}
