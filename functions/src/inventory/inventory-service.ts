import { createHash } from "node:crypto";
import { FieldPath, Timestamp, type DocumentData, type Firestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { getAdminFirestore } from "../shared/firebase-admin.js";
import { verifyInventoryTransactionActor, type InventoryAccess, type InventoryActor } from "./inventory-authorization.js";
import { defaultInventorySettings, inventoryCycle, inventoryToday, nextInventorySettings } from "./inventory-calendar.js";
import {
  INVENTORY_COMPANY_ID, INVENTORY_CYCLE_PATH, INVENTORY_LOCATIONS, INVENTORY_MAX_LOTS,
  INVENTORY_PRODUCT_PATH, INVENTORY_SETTINGS_PATH, inventoryEventSchema, inventoryInitialStockSchema, inventoryLocationMap, inventoryLotSchema,
  inventoryAuditReasonSchema, inventoryLotChangeSchema, inventoryQuantitySchema, inventorySettingsSchema, inventoryStatusChangeSchema,
  type DeleteInventoryProductInput, type InventoryCountInput, type InventoryEvent, type InventoryLocation,
  type InventoryLot, type InventoryLotChange, type InventoryMovementInput, type InventoryMutationResult, type InventoryProduct, type InventoryStatusChange,
  type InventorySettings, type SetInventoryProductStatusInput,
  type UpdateInventoryLotInput, type UpdateInventorySettingsInput,
} from "./inventory-contract.js";
import {
  INVENTORY_MANUFACTURER_PATH, inventoryManufacturerSchema, inventoryMutationResultWithManufacturerSchema,
  inventoryProductWithManufacturerSchema,
  type SaveInventoryProductWithManufacturerInput,
} from "./inventory-manufacturer-contract.js";
import { resolveInventoryPhotoChange } from "./inventory-photo-store.js";
import { inventoryProductRecord, inventoryProductWire, summarizeInventoryLotGroups,
  type InventoryLotChecks, type InventoryProductRecord } from "./inventory-stock-summary.js";

const REQUEST_PATH = "companies/onnuri/inventoryRequests";
function timestampToIso(value: unknown) { return value instanceof Timestamp ? value.toDate().toISOString() : value; }
function datesFromDocument(value: DocumentData) {
  return { ...value, ...(value.createdAt !== undefined ? { createdAt: timestampToIso(value.createdAt) } : {}),
    ...(value.updatedAt !== undefined ? { updatedAt: timestampToIso(value.updatedAt) } : {}) };
}
function persisted(value: Record<string, unknown>) {
  return { ...value, ...(typeof value.createdAt === "string" ? { createdAt: Timestamp.fromDate(new Date(value.createdAt)) } : {}),
    ...(typeof value.updatedAt === "string" ? { updatedAt: Timestamp.fromDate(new Date(value.updatedAt)) } : {}) };
}
export function inventoryProductFromDocument(data: DocumentData): InventoryProduct { return inventoryProductWire(inventoryProductRecord(datesFromDocument(data))); }
export function inventoryLotFromDocument(data: DocumentData): InventoryLot { return inventoryLotSchema.parse(datesFromDocument(data)); }
function settingsFromDocument(data: DocumentData | undefined): InventorySettings {
  return data ? inventorySettingsSchema.parse(datesFromDocument(data)) : defaultInventorySettings();
}
function activeSortedLots(lots: InventoryLot[]) {
  return lots.filter((lot) => lot.quantity > 0).sort((a, b) => a.locationId.localeCompare(b.locationId)
    || (a.expiryDate ?? "9999").localeCompare(b.expiryDate ?? "9999") || a.lotId.localeCompare(b.lotId));
}
function withoutMutationDetail<T>(result: T) {
  return result && typeof result === "object" && "detail" in result
    ? Object.fromEntries(Object.entries(result).filter(([key]) => key !== "detail")) : result;
}
function conflict(product: InventoryProduct): never {
  throw new HttpsError("aborted", "다른 직원이 먼저 변경했습니다. 최신 재고를 확인하고 다시 저장해주세요.",
    { reason: "inventory-revision", revision: product.revision, stockRevision: product.stockRevision });
}
function checkStockRevision(product: InventoryProduct, revision: number) {
  if (product.stockRevision !== revision) conflict(product);
  if (product.status !== "active") throw new HttpsError("failed-precondition", "사용 중인 상품의 재고만 변경할 수 있습니다.", { reason: "inventory-inactive" });
}
function ensureQuantity(quantity: number): number {
  const parsed = inventoryQuantitySchema.safeParse(quantity);
  if (!parsed.success) throw new HttpsError("failed-precondition", "재고가 부족하거나 허용 수량을 초과합니다.", { reason: "inventory-quantity" });
  return parsed.data;
}
export function summarizeInventoryLots(lots: InventoryLot[]) {
  const quantityByLocation = inventoryLocationMap(0);
  const nearestExpiryByLocation = inventoryLocationMap<string | null>(null);
  for (const lot of lots) {
    if (lot.quantity <= 0) continue;
    quantityByLocation[lot.locationId] = ensureQuantity(quantityByLocation[lot.locationId] + lot.quantity);
    const current = nearestExpiryByLocation[lot.locationId];
    if (lot.expiryDate && (!current || lot.expiryDate < current)) nearestExpiryByLocation[lot.locationId] = lot.expiryDate;
  }
  return { quantityByLocation, nearestExpiryByLocation };
}

export class InventoryService {
  constructor(private readonly db: Firestore = getAdminFirestore(), private readonly now: () => Date = () => new Date()) {}
  private productRef(productId: string) { return this.db.doc(`${INVENTORY_PRODUCT_PATH}/${productId}`); }
  private lotRef(productId: string, lotId: string) { return this.db.doc(`${INVENTORY_PRODUCT_PATH}/${productId}/lots/${lotId}`); }
  private lotsQuery(productId: string) {
    // Retain exhausted lots for history/reversal, but bound the active working set.
    return this.db.collection(`${INVENTORY_PRODUCT_PATH}/${productId}/lots`).where("quantity", ">", 0).limit(INVENTORY_MAX_LOTS + 1);
  }
  private parseLots(docs: Array<{ data(): DocumentData }>) {
    if (docs.length > INVENTORY_MAX_LOTS) throw new HttpsError("resource-exhausted", "이 상품의 재고 묶음이 너무 많습니다. 관리자에게 확인해주세요.");
    return docs.map((doc) => inventoryLotFromDocument(doc.data()));
  }
  private async product(transaction: Transaction, productId: string) {
    const snapshot = await transaction.get(this.productRef(productId));
    if (!snapshot.exists) throw new HttpsError("not-found", "상품을 찾을 수 없습니다.");
    return inventoryProductRecord(datesFromDocument(snapshot.data()!));
  }
  private async replayedProduct(transaction: Transaction, productId: string, allowDeleted = false) {
    const product = await this.product(transaction, productId);
    if (!allowDeleted && product.status === "deleted") throw new HttpsError("not-found", "삭제된 상품입니다.");
    return inventoryProductWire(product);
  }
  private async mutation<T>(operation: string,
    input: { requestId: string; includeDetail?: boolean | undefined; refreshOnReplay?: boolean | undefined; includeSummary?: boolean | undefined; includeManufacturerReference?: boolean | undefined },
    actor: InventoryActor, access: InventoryAccess, action: (transaction: Transaction, now: Date) => Promise<T>,
    replay?: (transaction: Transaction) => Promise<T>): Promise<T> {
    // Response expansion is not part of a stock command's identity. A delayed
    // request made by an older client remains the same command after an update.
    const command = Object.fromEntries(Object.entries(input).filter(([key]) => !["includeDetail", "refreshOnReplay", "includeSummary", "includeManufacturerReference"].includes(key)));
    const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
    const receiptRef = this.db.doc(`${REQUEST_PATH}/${input.requestId}`);
    return this.db.runTransaction(async (transaction) => {
      // Revalidate even an exact retry after the employee was disabled/revoked.
      await verifyInventoryTransactionActor(this.db, transaction, actor, access);
      const receipt = await transaction.get(receiptRef);
      if (receipt.exists) {
        const stored = receipt.data()!;
        if (stored.operation !== operation || stored.actorUid !== actor.uid || stored.fingerprint !== fingerprint) {
          throw new HttpsError("already-exists", "요청 식별자가 이미 다른 내용에 사용되었습니다.", { reason: "inventory-request-collision" });
        }
        // The command is already committed: never run its writes a second time.
        // Opt-in metadata/status clients receive today's canonical product so a
        // delayed retry cannot overwrite newer list quantities or revive a row.
        // Authorization and this read share the same transaction; the original
        // permanent receipt is intentionally left untouched.
        if (input.refreshOnReplay && replay) return replay(transaction);
        const result = stored.result as T;
        return result && typeof result === "object" && "replayed" in result
          ? { ...withoutMutationDetail(result), replayed: true } as T : result;
      }
      const now = this.now();
      const result = await action(transaction, now);
      // Permanent inventory receipt: never add TTL. Expiring retry protection
      // would allow an old, delayed stock command to be applied a second time.
      // Do not permanently duplicate up to 200 lots in every receipt, or replay
      // an old working set over stock changed since the original commit.
      const receiptResult = withoutMutationDetail(result);
      transaction.create(receiptRef, { operation, actorUid: actor.uid, fingerprint, result: receiptResult, createdAt: Timestamp.fromDate(now) });
      return result;
    });
  }
  private audit(transaction: Transaction, input: { requestId: string }, actor: InventoryActor, now: Date,
    eventType: string, targetId: string, changedFields: string[], reason = "",
    inventoryChange?: { inventoryStatusChange?: InventoryStatusChange; inventoryLotChange?: InventoryLotChange }) {
    const logId = `inventory-${input.requestId}`;
    transaction.create(this.db.doc(`auditLogs/${logId}`), { logId, eventType, actorUid: actor.uid,
      actorEmployeeId: actor.employeeId, targetType: "inventory", targetId, schoolId: null, cycleId: null,
      changedFields, changeReason: inventoryAuditReasonSchema.parse(reason) || null, requestId: input.requestId, appVersion: null,
      createdAt: Timestamp.fromDate(now), ...inventoryChange });
  }
  async context() {
    const settings = settingsFromDocument((await this.db.doc(INVENTORY_SETTINGS_PATH).get()).data());
    const today = inventoryToday(this.now());
    return { settings, cycle: inventoryCycle(settings, today), today };
  }
  async list(afterId: string | null) {
    let query = this.db.collection(INVENTORY_PRODUCT_PATH).orderBy(FieldPath.documentId()).limit(101);
    if (afterId) query = query.startAfter(afterId);
    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, 100);
    return { products: docs.map((doc) => inventoryProductFromDocument(doc.data())).filter((product) => product.status !== "deleted"),
      nextCursor: snapshot.docs.length > 100 ? docs.at(-1)!.id : null };
  }
  async detail(productId: string, actor: InventoryActor) {
    return this.db.runTransaction(async (transaction) => {
      await verifyInventoryTransactionActor(this.db, transaction, actor, "read");
      const [product, lotsSnapshot] = await Promise.all([
        this.product(transaction, productId), transaction.get(this.lotsQuery(productId)),
      ]);
      if (product.status === "deleted") throw new HttpsError("not-found", "삭제된 상품입니다.");
      const lots = activeSortedLots(this.parseLots(lotsSnapshot.docs));
      return { product: { ...inventoryProductWire(product), lotSummary: summarizeInventoryLotGroups(lots) }, lots };
    });
  }
  async save(input: SaveInventoryProductWithManufacturerInput, actor: InventoryActor): Promise<InventoryProduct> {
    return this.mutation("saveInventoryProduct", input, actor, "write", async (transaction, now) => {
      const productId = input.productId ?? input.requestId;
      const snapshot = await transaction.get(this.productRef(productId));
      const current = snapshot.exists ? inventoryProductRecord(datesFromDocument(snapshot.data()!)) : null;
      if (input.initialStock !== undefined && (input.productId !== null || input.expectedRevision !== null || current !== null
        || !inventoryInitialStockSchema.safeParse(input.initialStock).success)) {
        throw new HttpsError("invalid-argument", "초기 수량은 새 상품에 1 이상으로 입력해주세요.", { reason: "inventory-initial-stock" });
      }
      if (input.productId && !current) throw new HttpsError("not-found", "상품을 찾을 수 없습니다.");
      if (current?.status === "deleted") throw new HttpsError("failed-precondition", "삭제된 상품은 수정할 수 없습니다.");
      if ((current?.revision ?? null) !== input.expectedRevision) {
        if (current) conflict(current);
        throw new HttpsError("aborted", "상품 버전을 확인해주세요.");
      }
      const unitChanged = current !== null && (current.unitLabel !== input.draft.unitLabel || current.unitsPerBox !== input.draft.unitsPerBox);
      if (current?.hasHistory && unitChanged) {
        throw new HttpsError("failed-precondition", "이력이 있는 상품은 재고 단위를 바꿀 수 없습니다. 규격이 달라졌다면 새 상품으로 등록해주세요.", { reason: "inventory-unit-locked" });
      }
      const clearManufacturerReference = input.clearManufacturerReference === true;
      const manufacturerId = clearManufacturerReference ? undefined : input.draft.manufacturerId ?? current?.manufacturerId;
      let draft = clearManufacturerReference ? { ...input.draft, manufacturer: "" } : input.draft;
      if (clearManufacturerReference) delete draft.manufacturerId;
      if (manufacturerId) {
        const manufacturerSnapshot = await transaction.get(this.db.doc(`${INVENTORY_MANUFACTURER_PATH}/${manufacturerId}`));
        if (!manufacturerSnapshot.exists) throw new HttpsError("failed-precondition", "선택한 제조사를 찾을 수 없습니다.", { reason: "inventory-manufacturer-missing" });
        const data = manufacturerSnapshot.data()!;
        const date = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : value;
        const manufacturer = inventoryManufacturerSchema.parse({ ...data, createdAt: date(data.createdAt), updatedAt: date(data.updatedAt) });
        const newlyLinked = current?.manufacturerId !== manufacturerId;
        if (newlyLinked && !manufacturer.active) {
          throw new HttpsError("failed-precondition", "비활성 제조사는 새 상품에 연결할 수 없습니다.", { reason: "inventory-manufacturer-inactive" });
        }
        draft = { ...input.draft, manufacturerId, manufacturer: newlyLinked ? manufacturer.name : current!.manufacturer };
      }
      const photo = await resolveInventoryPhotoChange(this.db, transaction, input, current, actor, Timestamp.fromDate(now));
      const updated = inventoryProductWithManufacturerSchema.parse({ ...draft,
        productId, companyId: INVENTORY_COMPANY_ID, status: current?.status ?? "active", revision: (current?.revision ?? 0) + 1,
        // A first-receipt form may already have converted boxes using the old
        // unit definition. Invalidate that stock snapshot when units change.
        stockRevision: (current?.stockRevision ?? 0) + (unitChanged ? 1 : 0), hasHistory: current?.hasHistory ?? false,
        quantityByLocation: current?.quantityByLocation ?? inventoryLocationMap(0),
        nearestExpiryByLocation: current?.nearestExpiryByLocation ?? inventoryLocationMap(null),
        lastCountByLocation: current?.lastCountByLocation ?? inventoryLocationMap(null), photo: photo.photo ?? null,
        ...(current?.lotSummary ? { lotSummary: current.lotSummary } : !current ? { lotSummary: summarizeInventoryLotGroups([]) } : {}),
        createdAt: current?.createdAt ?? now.toISOString(), updatedAt: now.toISOString(),
        createdBy: current?.createdBy ?? actor.employeeId, updatedBy: actor.employeeId });
      const changedFields = [...Object.keys(draft), ...(clearManufacturerReference && current?.manufacturerId ? ["manufacturerId"] : []),
        ...(input.photoChange ? ["photo"] : [])];
      if (input.initialStock) {
        const locationId = input.draft.defaultLocationId;
        const lot = inventoryLotSchema.parse({ ...input.initialStock.lot,
          lotId: `${input.requestId}-${locationId}`, originLotId: input.requestId, productId, locationId,
          quantity: input.initialStock.quantity, revision: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() });
        // The first receipt, photo claim, product and permanent retry receipt
        // share this transaction. One audit represents the combined creation;
        // writeStock must not also create the same request's second audit ID.
        const result = this.writeStock(transaction, { requestId: input.requestId, productId, locationId, reason: "신규 상품 초기 입고" },
          actor, now, updated, [lot], [lot], "receive",
          [{ lotId: lot.lotId, locationId, before: 0, after: lot.quantity, delta: lot.quantity }], null, undefined,
          { eventType: "INVENTORY_PRODUCT_CREATED", changedFields: [...changedFields, "quantity", "lots"] });
        photo.commit(productId);
        return result.product;
      }
      transaction.set(this.productRef(productId), persisted({ ...updated, ...(current?.inspectionByLot ? { inspectionByLot: current.inspectionByLot } : {}) }));
      photo.commit(productId);
      this.audit(transaction, input, actor, now, current ? "INVENTORY_PRODUCT_UPDATED" : "INVENTORY_PRODUCT_CREATED", productId,
        changedFields);
      return updated;
    }, (transaction) => this.replayedProduct(transaction, input.productId ?? input.requestId));
  }
  private writeStock(transaction: Transaction, input: { requestId: string; productId: string; locationId: InventoryLocation; reason: string; includeDetail?: boolean | undefined },
    actor: InventoryActor, now: Date, product: InventoryProductRecord, lots: InventoryLot[], changedLots: InventoryLot[],
    kind: InventoryEvent["kind"], lines: InventoryEvent["lines"], cycleId: string | null = null,
    lotMetadataChange?: InventoryEvent["lotMetadataChange"],
    auditOverride?: { eventType: string; changedFields: string[] }): InventoryMutationResult {
    const quantityChanged = lines.some((line) => line.delta !== 0);
    // Metadata edits can change the nearest expiry without changing quantity.
    const stockRevision = product.stockRevision + (quantityChanged || kind === "lot_update" ? 1 : 0);
    const lastCountByLocation = { ...product.lastCountByLocation };
    for (const location of new Set(lines.filter((line) => line.delta !== 0).map((line) => line.locationId))) {
      const previous = lastCountByLocation[location];
      if (previous) lastCountByLocation[location] = { ...previous, stockChangedSinceCount: true };
    }
    const inspectionByLot: InventoryLotChecks = { ...product.inspectionByLot };
    // Migrate a legacy full-location confirmation lazily inside a stock write.
    // Use BEFORE quantities, otherwise a newly received lot would be falsely
    // inherited as checked merely because the old location was complete.
    if (product.inspectionByLot === undefined) for (const lot of lots) {
      const before = lines.find((line) => line.lotId === lot.lotId)?.before ?? lot.quantity;
      const summary = product.lastCountByLocation[lot.locationId];
      if (before > 0 && summary && !summary.stockChangedSinceCount) inspectionByLot[lot.lotId] = {
        cycleId: summary.cycleId, quantity: before, checkedAt: summary.checkedAt, checkedBy: summary.checkedBy, changed: summary.changed,
      };
    }
    for (const line of lines) {
      if (line.delta !== 0) delete inspectionByLot[line.lotId];
      if (cycleId) inspectionByLot[line.lotId] = { cycleId, quantity: line.after,
        checkedAt: now.toISOString(), checkedBy: actor.employeeId, changed: line.delta !== 0 };
    }
    if (cycleId) for (const location of new Set([input.locationId, ...lines.map((line) => line.locationId)])) {
      const positive = lots.filter((lot) => lot.locationId === location && lot.quantity > 0);
      if (positive.every((lot) => inspectionByLot[lot.lotId]?.cycleId === cycleId && inspectionByLot[lot.lotId]?.quantity === lot.quantity)) {
        lastCountByLocation[location] = { cycleId, checkedAt: now.toISOString(), checkedBy: actor.employeeId, stockRevision,
          changed: quantityChanged || positive.some((lot) => inspectionByLot[lot.lotId]?.changed), stockChangedSinceCount: false };
      }
    }
    // Exhausted lots retain their append-only events; the bounded working-set
    // confirmation map does not accumulate one entry per historical batch.
    const positiveIds = new Set(lots.filter((lot) => lot.quantity > 0).map((lot) => lot.lotId));
    for (const id of Object.keys(inspectionByLot)) if (!positiveIds.has(id)) delete inspectionByLot[id];
    const next = inventoryProductWithManufacturerSchema.parse({ ...inventoryProductWire(product), ...summarizeInventoryLots(lots), stockRevision,
      lotSummary: summarizeInventoryLotGroups(lots),
      hasHistory: true, updatedAt: now.toISOString(), updatedBy: actor.employeeId,
      lastCountByLocation });
    const event = inventoryEventSchema.parse({ eventId: input.requestId, productId: input.productId, kind,
      locationId: input.locationId, lines: lines.map((line) => {
        const lot = lots.find((item) => item.lotId === line.lotId);
        return lot ? { ...line, lotLabel: lot.label, expiryState: lot.expiryState, expiryDate: lot.expiryDate } : line;
      }), reason: input.reason, actorEmployeeId: actor.employeeId,
      createdAt: now.toISOString(), cycleId, unitLabel: product.unitLabel, unitsPerBox: product.unitsPerBox, stockRevision,
      ...(lotMetadataChange ? { lotMetadataChange } : {}) });
    for (const lot of changedLots) transaction.set(this.lotRef(input.productId, lot.lotId), persisted(lot));
    transaction.set(this.productRef(input.productId), persisted({ ...next, inspectionByLot }));
    // Per-product history avoids composite indexes and never rewrites an event.
    transaction.create(this.db.doc(`${INVENTORY_PRODUCT_PATH}/${input.productId}/events/${input.requestId}`), persisted(event));
    this.audit(transaction, input, actor, now, auditOverride?.eventType ?? `INVENTORY_${kind.toUpperCase()}`, input.productId,
      auditOverride?.changedFields ?? (kind.startsWith("count_") ? ["count", ...(quantityChanged ? ["quantity"] : [])] : [kind === "lot_update" ? "lot" : "quantity"]), input.reason,
      lotMetadataChange ? { inventoryLotChange: inventoryLotChangeSchema.parse({ productName: product.name, unitLabel: product.unitLabel, ...lotMetadataChange }) } : undefined);
    return inventoryMutationResultWithManufacturerSchema.parse({ product: next, event, replayed: false,
      ...(input.includeDetail ? { detail: { product: next, lots: activeSortedLots(lots) } } : {}) });
  }
  async move(input: InventoryMovementInput, actor: InventoryActor): Promise<InventoryMutationResult> {
    return this.mutation("recordInventoryMovement", input, actor, "write", async (transaction, now) => {
      const [product, activeSnapshot, settingsSnapshot] = await Promise.all([
        this.product(transaction, input.productId), transaction.get(this.lotsQuery(input.productId)),
        transaction.get(this.db.doc(INVENTORY_SETTINGS_PATH)),
      ]);
      checkStockRevision(product, input.expectedStockRevision);
      const today = inventoryToday(now);
      const cycle = inventoryCycle(settingsFromDocument(settingsSnapshot.data()), today);
      if (input.inspectionCycleId && input.inspectionCycleId !== cycle.cycleId) throw new HttpsError("aborted", "실사 회차가 바뀌었습니다. 이번 회차를 다시 확인해주세요.", { reason: "inventory-cycle", cycle });
      const inspectionCycleId = input.inspectionCycleId || (today === cycle.startDate ? cycle.cycleId : null);
      const activeLots = this.parseLots(activeSnapshot.docs);
      let current: InventoryLot | null = null;
      if (input.lotId) {
        // A positive source is already locked by the working-set query. Read
        // separately only when receiving into a previously exhausted lot.
        current = activeLots.find((lot) => lot.lotId === input.lotId) ?? null;
        if (!current) {
          const snapshot = await transaction.get(this.lotRef(input.productId, input.lotId));
          if (!snapshot.exists) throw new HttpsError("not-found", "재고 묶음을 찾을 수 없습니다.");
          current = inventoryLotFromDocument(snapshot.data()!);
        }
        if (current.productId !== input.productId || current.locationId !== input.locationId) throw new HttpsError("invalid-argument", "재고 묶음의 상품과 장소를 확인해주세요.");
      }
      const before = current?.quantity ?? 0;
      const after = ensureQuantity(input.kind === "adjust" ? input.quantity : before + (input.kind === "receive" ? input.quantity : -input.quantity));
      const changedLots: InventoryLot[] = [];
      const source = inventoryLotSchema.parse(current ? { ...current, quantity: after, revision: current.revision + 1, updatedAt: now.toISOString() }
        : { ...input.newLot, lotId: `${input.requestId}-${input.locationId}`, originLotId: input.requestId, productId: input.productId,
          locationId: input.locationId, quantity: after, revision: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() });
      changedLots.push(source);
      const lines: InventoryEvent["lines"] = [{ lotId: source.lotId, locationId: source.locationId, before, after, delta: after - before }];
      if (input.kind === "transfer") {
        const destinationId = `${source.originLotId}-${input.toLocationId!}`;
        const destinationSnapshot = await transaction.get(this.lotRef(input.productId, destinationId));
        const destination = destinationSnapshot.exists ? inventoryLotFromDocument(destinationSnapshot.data()!) : null;
        if (destination && (destination.originLotId !== source.originLotId || destination.productId !== product.productId
          || destination.locationId !== input.toLocationId || destination.expiryDate !== source.expiryDate || destination.expiryState !== source.expiryState)) {
          throw new HttpsError("failed-precondition", "이동할 재고 묶음 정보를 다시 확인해주세요.");
        }
        const destinationBefore = destination?.quantity ?? 0;
        const nextDestination = inventoryLotSchema.parse({ ...source, ...destination, lotId: destinationId,
          locationId: input.toLocationId, quantity: ensureQuantity(destinationBefore + input.quantity),
          revision: (destination?.revision ?? 0) + 1, createdAt: destination?.createdAt ?? now.toISOString(), updatedAt: now.toISOString() });
        changedLots.push(nextDestination);
        lines.push({ lotId: destinationId, locationId: nextDestination.locationId, before: destinationBefore,
          after: nextDestination.quantity, delta: input.quantity });
      }
      const changedIds = new Set(changedLots.map((lot) => lot.lotId));
      const all = [...activeLots.filter((lot) => !changedIds.has(lot.lotId)), ...changedLots];
      if (all.filter((lot) => lot.quantity > 0).length > INVENTORY_MAX_LOTS) throw new HttpsError("resource-exhausted", "상품별 보관 중인 묶음은 200개까지 등록할 수 있습니다.");
      return this.writeStock(transaction, input, actor, now, product, all, changedLots, input.kind, lines, inspectionCycleId);
    });
  }
  async count(input: InventoryCountInput, actor: InventoryActor): Promise<InventoryMutationResult> {
    return this.mutation("recordInventoryCount", input, actor, "write", async (transaction, now) => {
      // Independent reads share one wait, after membership and retry receipt
      // checks. Everything remains within this transaction and before writes.
      const [product, settingsSnapshot, lotsSnapshot] = await Promise.all([
        this.product(transaction, input.productId), transaction.get(this.db.doc(INVENTORY_SETTINGS_PATH)),
        transaction.get(this.lotsQuery(input.productId)),
      ]);
      checkStockRevision(product, input.expectedStockRevision);
      const settings = settingsFromDocument(settingsSnapshot.data());
      const cycle = inventoryCycle(settings, inventoryToday(now));
      if (cycle.cycleId !== input.cycleId) throw new HttpsError("aborted", "실사 회차가 바뀌었습니다. 이번 회차를 다시 확인해주세요.", { reason: "inventory-cycle", cycle });
      const lots = this.parseLots(lotsSnapshot.docs);
      const selected = lots.filter((lot) => lot.locationId === input.locationId);
      if (!selected.length && product.defaultLocationId !== input.locationId) throw new HttpsError("failed-precondition", "재고가 없는 상품은 기본 보관 장소에서 확인해주세요.");
      if (selected.length !== input.counts.length || selected.some((lot) => !input.counts.some((count) => count.lotId === lot.lotId))) {
        throw new HttpsError("aborted", "묶음 목록이 변경되었습니다. 현재 장소의 모든 묶음을 다시 확인해주세요.", { reason: "inventory-count-lots" });
      }
      const changedLots = selected.map((lot) => {
        const quantity = input.counts.find((count) => count.lotId === lot.lotId)!.quantity;
        return inventoryLotSchema.parse({ ...lot, quantity, revision: lot.revision + (quantity !== lot.quantity ? 1 : 0), updatedAt: quantity !== lot.quantity ? now.toISOString() : lot.updatedAt });
      });
      const lines = changedLots.map((lot) => { const before = selected.find((item) => item.lotId === lot.lotId)!.quantity;
        return { lotId: lot.lotId, locationId: lot.locationId, before, after: lot.quantity, delta: lot.quantity - before }; });
      const changed = lines.some((line) => line.delta !== 0);
      if (input.matchOnly && changed) throw new HttpsError("aborted", "현재 수량과 일치하지 않습니다. 최신 재고를 다시 확인해주세요.", { reason: "inventory-count-mismatch" });
      if (changed && !input.reason) throw new HttpsError("invalid-argument", "실사 수량이 다르면 조정 사유를 입력해주세요.");
      const cycleRef = this.db.doc(`${INVENTORY_CYCLE_PATH}/${cycle.cycleId}`);
      const cycleSnapshot = await transaction.get(cycleRef);
      const all = [...lots.filter((lot) => lot.locationId !== input.locationId), ...changedLots];
      const result = this.writeStock(transaction, input, actor, now, product, all,
        changedLots.filter((lot) => selected.find((item) => item.lotId === lot.lotId)!.quantity !== lot.quantity),
        changed ? "count_adjust" : "count_match", lines, cycle.cycleId);
      if (!cycleSnapshot.exists) transaction.create(cycleRef, { ...cycle, createdAt: Timestamp.fromDate(now) });
      transaction.set(this.db.doc(`${INVENTORY_CYCLE_PATH}/${cycle.cycleId}/entries/${input.productId}-${input.locationId}`), {
        productId: input.productId, locationId: input.locationId, ...result.product.lastCountByLocation[input.locationId]!,
        eventId: input.requestId, quantities: input.counts });
      return result;
    });
  }
  async updateLot(input: UpdateInventoryLotInput, actor: InventoryActor): Promise<InventoryMutationResult> {
    return this.mutation("updateInventoryLot", input, actor, "write", async (transaction, now) => {
      const [product, snapshot, activeSnapshot] = await Promise.all([
        this.product(transaction, input.productId), transaction.get(this.lotRef(input.productId, input.lotId)),
        transaction.get(this.lotsQuery(input.productId)),
      ]);
      checkStockRevision(product, input.expectedStockRevision);
      if (!snapshot.exists) throw new HttpsError("not-found", "재고 묶음을 찾을 수 없습니다.");
      const lot = inventoryLotFromDocument(snapshot.data()!);
      const related = await transaction.getAll(...INVENTORY_LOCATIONS.map((location) => this.lotRef(input.productId, `${lot.originLotId}-${location}`)));
      const active = this.parseLots(activeSnapshot.docs);
      // A transferred batch is the same physical expiry lot at every location.
      const changedLots = related.filter((item) => item.exists).map((item) => {
        const current = inventoryLotFromDocument(item.data()!);
        return inventoryLotSchema.parse({ ...current, ...input.draft, revision: current.revision + 1, updatedAt: now.toISOString() });
      });
      const changedIds = new Set(changedLots.map((item) => item.lotId));
      return this.writeStock(transaction, { ...input, locationId: lot.locationId }, actor, now, product,
        [...active.filter((item) => !changedIds.has(item.lotId)), ...changedLots], changedLots, "lot_update",
        changedLots.map((item) => ({ lotId: item.lotId, locationId: item.locationId, before: item.quantity, after: item.quantity, delta: 0 })), null,
        { originLotId: lot.originLotId, before: { label: lot.label, expiryState: lot.expiryState, expiryDate: lot.expiryDate }, after: input.draft });
    });
  }
  async status(input: SetInventoryProductStatusInput | DeleteInventoryProductInput, actor: InventoryActor, deleted = false): Promise<InventoryProduct> {
    return this.mutation(deleted ? "deleteInventoryProduct" : "setInventoryProductStatus", input, actor, "write", async (transaction, now) => {
      const product = await this.product(transaction, input.productId);
      if (product.revision !== input.expectedRevision) conflict(product);
      if (product.status === "deleted") throw new HttpsError("failed-precondition", "이미 삭제된 상품입니다.");
      const status = deleted ? "deleted" : (input as SetInventoryProductStatusInput).status;
      // These are lifecycle transitions, not stock disposal. Retain quantities,
      // lots, history and the private photo reference on the tombstone. Deleted
      // products/photos are hidden by their read APIs; no zeroing or file expiry
      // may silently erase the evidence needed to audit this employee action.
      const next = inventoryProductWithManufacturerSchema.parse({ ...inventoryProductWire(product), status,
        revision: product.revision + 1, updatedAt: now.toISOString(), updatedBy: actor.employeeId });
      transaction.set(this.productRef(input.productId), persisted({ ...next, ...(product.inspectionByLot ? { inspectionByLot: product.inspectionByLot } : {}) }));
      this.audit(transaction, input, actor, now, deleted ? "INVENTORY_PRODUCT_DELETED" : "INVENTORY_PRODUCT_STATUS_CHANGED", input.productId, ["status"], input.reason,
        { inventoryStatusChange: inventoryStatusChangeSchema.parse({ productName: product.name, unitLabel: product.unitLabel,
          before: { status: product.status, quantityByLocation: product.quantityByLocation },
          after: { status: next.status, quantityByLocation: next.quantityByLocation } }) });
      // Tombstones keep all stock/count history, request receipts and IDs intact.
      return next;
    }, (transaction) => this.replayedProduct(transaction, input.productId, true));
  }
  async updateSettings(input: UpdateInventorySettingsInput, actor: InventoryActor): Promise<InventorySettings> {
    return this.mutation("updateInventorySettings", input, actor, "admin", async (transaction, now) => {
      const ref = this.db.doc(INVENTORY_SETTINGS_PATH);
      const current = settingsFromDocument((await transaction.get(ref)).data());
      if (current.revision !== input.expectedRevision) throw new HttpsError("aborted", "설정이 변경되었습니다. 다시 확인해주세요.");
      const next = nextInventorySettings(current, input.weekday, input.urgentDays, now, actor.employeeId);
      transaction.set(ref, persisted(next));
      this.audit(transaction, input, actor, now, "INVENTORY_SETTINGS_UPDATED", "settings", ["weekday", "urgentDays"]);
      return next;
    });
  }
  async history(productId: string, afterId: string | null) {
    // History remains accessible for inactive/deleted products via a known ID.
    const collection = this.db.collection(`${INVENTORY_PRODUCT_PATH}/${productId}/events`);
    let query = collection.orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc").limit(51);
    if (afterId) {
      const cursor = await collection.doc(afterId).get();
      if (!cursor.exists) throw new HttpsError("invalid-argument", "기록 목록을 다시 불러와주세요.");
      query = query.startAfter(cursor);
    }
    const snapshot = await query.get();
    const docs = snapshot.docs.slice(0, 50);
    return { events: docs.map((item) => inventoryEventSchema.parse(datesFromDocument(item.data()))), nextCursor: snapshot.docs.length > 50 ? docs.at(-1)!.id : null };
  }
}
