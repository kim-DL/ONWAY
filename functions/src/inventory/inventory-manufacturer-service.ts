import { createHash } from "node:crypto";
import { Timestamp, type DocumentData, type Firestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { getAdminFirestore } from "../shared/firebase-admin.js";
import { verifyInventoryTransactionActor, type InventoryAccess, type InventoryActor } from "./inventory-authorization.js";
import {
  INVENTORY_MANUFACTURER_NAME_PATH, INVENTORY_MANUFACTURER_PATH, INVENTORY_MAX_MANUFACTURERS,
  canonicalInventoryManufacturerName, inventoryManufacturerSchema, normalizeInventoryManufacturerName,
  type CreateInventoryManufacturerInput, type InventoryManufacturer, type UpdateInventoryManufacturerInput,
} from "./inventory-manufacturer-contract.js";

const REQUEST_PATH = "companies/onnuri/inventoryRequests";
function persisted(manufacturer: InventoryManufacturer) {
  return { ...manufacturer, createdAt: Timestamp.fromDate(new Date(manufacturer.createdAt)), updatedAt: Timestamp.fromDate(new Date(manufacturer.updatedAt)) };
}
function fromDocument(data: DocumentData): InventoryManufacturer {
  const date = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : value;
  return inventoryManufacturerSchema.parse({ ...data, createdAt: date(data.createdAt), updatedAt: date(data.updatedAt) });
}
function duplicate(): never {
  throw new HttpsError("already-exists", "같은 이름의 제조사가 이미 등록되어 있습니다.", { reason: "inventory-manufacturer-duplicate" });
}
function reservationId(normalizedName: string) {
  return createHash("sha256").update(normalizedName).digest("hex");
}

export class InventoryManufacturerService {
  constructor(private readonly db: Firestore = getAdminFirestore(), private readonly now: () => Date = () => new Date()) {}
  private manufacturerRef(manufacturerId: string) { return this.db.doc(`${INVENTORY_MANUFACTURER_PATH}/${manufacturerId}`); }
  private nameRef(normalizedName: string) { return this.db.doc(`${INVENTORY_MANUFACTURER_NAME_PATH}/${reservationId(normalizedName)}`); }
  private audit(transaction: Transaction, input: { requestId: string }, actor: InventoryActor, now: Date,
    eventType: string, manufacturerId: string, changedFields: string[]) {
    const logId = `inventory-${input.requestId}`;
    transaction.create(this.db.doc(`auditLogs/${logId}`), { logId, eventType, actorUid: actor.uid,
      actorEmployeeId: actor.employeeId, targetType: "inventoryManufacturer", targetId: manufacturerId,
      schoolId: null, cycleId: null, changedFields, changeReason: null, requestId: input.requestId,
      appVersion: null, createdAt: Timestamp.fromDate(now) });
  }
  private async mutation<T>(operation: string, input: { requestId: string }, actor: InventoryActor, access: InventoryAccess,
    action: (transaction: Transaction, now: Date) => Promise<T>): Promise<T> {
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const receiptRef = this.db.doc(`${REQUEST_PATH}/${input.requestId}`);
    return this.db.runTransaction(async (transaction) => {
      await verifyInventoryTransactionActor(this.db, transaction, actor, access);
      const receipt = await transaction.get(receiptRef);
      if (receipt.exists) {
        const stored = receipt.data()!;
        if (stored.operation !== operation || stored.actorUid !== actor.uid || stored.fingerprint !== fingerprint) {
          throw new HttpsError("already-exists", "요청 식별자가 이미 다른 내용에 사용되었습니다.", { reason: "inventory-request-collision" });
        }
        return stored.result as T;
      }
      const now = this.now();
      const result = await action(transaction, now);
      transaction.create(receiptRef, { operation, actorUid: actor.uid, fingerprint, result, createdAt: Timestamp.fromDate(now) });
      return result;
    });
  }
  async list(): Promise<InventoryManufacturer[]> {
    const snapshot = await this.db.collection(INVENTORY_MANUFACTURER_PATH).limit(INVENTORY_MAX_MANUFACTURERS + 1).get();
    if (snapshot.docs.length > INVENTORY_MAX_MANUFACTURERS) {
      throw new HttpsError("resource-exhausted", "제조사 목록이 너무 많습니다. 관리자에게 확인해주세요.");
    }
    return snapshot.docs.map((doc) => fromDocument(doc.data())).filter((manufacturer) => manufacturer.active)
      .sort((a, b) => a.normalizedName.localeCompare(b.normalizedName, "ko-KR") || a.manufacturerId.localeCompare(b.manufacturerId));
  }
  async create(input: CreateInventoryManufacturerInput, actor: InventoryActor): Promise<InventoryManufacturer> {
    return this.mutation("createInventoryManufacturer", input, actor, "write", async (transaction, now) => {
      const manufacturerId = input.requestId;
      const name = canonicalInventoryManufacturerName(input.name);
      const normalizedName = normalizeInventoryManufacturerName(name);
      const manufacturerRef = this.manufacturerRef(manufacturerId);
      const nameRef = this.nameRef(normalizedName);
      const snapshots = await transaction.getAll(manufacturerRef, nameRef);
      const existing = snapshots[0]!;
      const reservation = snapshots[1]!;
      if (existing.exists || (reservation.exists && reservation.data()!.active === true)) duplicate();
      const manufacturer = inventoryManufacturerSchema.parse({ manufacturerId, name, normalizedName, active: true,
        revision: 1, createdAt: now.toISOString(), createdBy: actor.employeeId, updatedAt: now.toISOString() });
      transaction.create(manufacturerRef, persisted(manufacturer));
      const reservationData = { manufacturerId, normalizedName, active: true };
      if (reservation.exists) transaction.set(nameRef, reservationData); else transaction.create(nameRef, reservationData);
      this.audit(transaction, input, actor, now, "INVENTORY_MANUFACTURER_CREATED", manufacturerId, ["name", "active"]);
      return manufacturer;
    });
  }
  async update(input: UpdateInventoryManufacturerInput, actor: InventoryActor): Promise<InventoryManufacturer> {
    return this.mutation("updateInventoryManufacturer", input, actor, "admin", async (transaction, now) => {
      const manufacturerRef = this.manufacturerRef(input.manufacturerId);
      const snapshot = await transaction.get(manufacturerRef);
      if (!snapshot.exists) throw new HttpsError("not-found", "제조사를 찾을 수 없습니다.");
      const current = fromDocument(snapshot.data()!);
      if (current.revision !== input.expectedRevision) {
        throw new HttpsError("aborted", "다른 관리자가 먼저 변경했습니다. 제조사 목록을 다시 확인해주세요.",
          { reason: "inventory-manufacturer-revision", revision: current.revision });
      }
      const name = input.name === undefined ? current.name : canonicalInventoryManufacturerName(input.name);
      const normalizedName = normalizeInventoryManufacturerName(name);
      const renamed = normalizedName !== current.normalizedName;
      const nextReservation = renamed ? await transaction.get(this.nameRef(normalizedName)) : null;
      if (nextReservation?.exists && nextReservation.data()!.active === true
        && nextReservation.data()!.manufacturerId !== input.manufacturerId) duplicate();
      const changedFields = [...(input.name !== undefined && name !== current.name ? ["name"] : []),
        ...(input.active === false && current.active ? ["active"] : [])];
      if (!changedFields.length) throw new HttpsError("failed-precondition", "변경된 제조사 정보가 없습니다.");
      const next = inventoryManufacturerSchema.parse({ ...current, name, normalizedName,
        active: input.active ?? current.active, revision: current.revision + 1, updatedAt: now.toISOString() });
      transaction.set(manufacturerRef, persisted(next));
      if (renamed) {
        const oldRef = this.nameRef(current.normalizedName); const nextRef = this.nameRef(normalizedName);
        transaction.set(oldRef, { manufacturerId: input.manufacturerId, normalizedName: current.normalizedName, active: false });
        const reservationData = { manufacturerId: input.manufacturerId, normalizedName, active: true };
        if (nextReservation!.exists) transaction.set(nextRef, reservationData); else transaction.create(nextRef, reservationData);
      }
      this.audit(transaction, input, actor, now, "INVENTORY_MANUFACTURER_UPDATED", input.manufacturerId, changedFields);
      return next;
    });
  }
}
