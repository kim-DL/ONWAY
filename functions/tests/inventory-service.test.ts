import { randomUUID } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import type { InventoryActor } from "../src/inventory/inventory-authorization.js";
import { defaultInventorySettings, inventoryCycle, inventoryToday, nextInventorySettings } from "../src/inventory/inventory-calendar.js";
import {
  INVENTORY_CYCLE_PATH, INVENTORY_LOCATIONS, INVENTORY_MAX_QUANTITY, INVENTORY_PRODUCT_PATH, INVENTORY_SETTINGS_PATH,
  inventoryCountInputSchema, inventoryCountSummarySchema, inventoryDateSchema, inventoryLotDraftSchema, inventoryMovementInputSchema,
  deleteInventoryProductInputSchema, inventoryProductDraftSchema, inventoryQuantityFromPackages, saveInventoryProductInputSchema,
  setInventoryProductStatusInputSchema, updateInventoryLotInputSchema,
  type InventoryCountInput, type InventoryMovementInput, type InventoryProduct, type SaveInventoryProductInput,
} from "../src/inventory/inventory-contract.js";
import { InventoryService } from "../src/inventory/inventory-service.js";
import {
  INVENTORY_MANUFACTURER_PATH, type SaveInventoryProductWithManufacturerInput,
} from "../src/inventory/inventory-manufacturer-contract.js";
import { backfillInventoryLotSummary } from "../../scripts/backfill-inventory-lot-summary.js";

const actor: InventoryActor = { uid: "uid-staff", employeeId: "EMP-STAFF", roleScopes: ["delivery"], sessionVersion: 1, permissionsVersion: 1, isAdmin: false };
const admin: InventoryActor = { uid: "uid-admin", employeeId: "EMP-ADMIN", roleScopes: ["admin"], sessionVersion: 1, permissionsVersion: 1, isAdmin: true };
const viewer: InventoryActor = { uid: "uid-viewer", employeeId: "EMP-VIEWER", roleScopes: ["viewer"], sessionVersion: 1, permissionsVersion: 1, isAdmin: false };
const sales: InventoryActor = { uid: "uid-sales", employeeId: "EMP-SALES", roleScopes: ["sales"], sessionVersion: 1, permissionsVersion: 1, isAdmin: false };
const draft = inventoryProductDraftSchema.parse({ name: "냉동 만두", manufacturer: "온누리", specification: "1kg × 8봉", origin: "대한민국",
  unitLabel: "봉", unitsPerBox: 8, defaultLocationId: "freezer1", note: "", urgent: false });
const initialNow = new Date("2026-09-11T01:00:00Z");

type RecordValue = Record<string, unknown>;
type QuerySpec = { path: string; filters: Array<[string, string, unknown]>; orders: Array<[string, string]>; maximum: number; after: string | null };
function fixture() {
  const values = new Map<string, RecordValue>();
  const reads: string[][] = [];
  let concurrentReads = 0;
  let maxConcurrentReads = 0;
  const read = async <T>(paths: string[], result: () => T) => {
    reads.push(paths);
    concurrentReads += 1;
    maxConcurrentReads = Math.max(maxConcurrentReads, concurrentReads);
    // A controlled asynchronous boundary records overlapping requests without
    // a flaky wall-clock assertion or pretending to measure production latency.
    await Promise.resolve();
    try { return result(); } finally { concurrentReads -= 1; }
  };
  for (const member of [actor, admin, viewer, sales]) {
    values.set(`authz/${member.uid}`, { employeeId: member.employeeId, active: true, sessionVersion: 1, permissionsVersion: 1 });
    values.set(`employees/${member.employeeId}`, { employeeId: member.employeeId, firebaseUid: member.uid, roleScopes: member.roleScopes, status: "active" });
  }
  let currentTime = initialNow;
  let serial = Promise.resolve();
  const ref = (path: string) => ({ path, id: path.split("/").at(-1)!, get: async () => snapshot(path) });
  const snapshot = (path: string) => ({ id: path.split("/").at(-1)!, ref: ref(path), exists: values.has(path),
    data: () => values.get(path), get: (field: string) => values.get(path)?.[field] });
  const scalar = (value: unknown): string | number => value instanceof Timestamp ? value.toMillis() : typeof value === "number" || typeof value === "string" ? value : "";
  const select = (spec: QuerySpec) => {
    let rows = [...values.entries()].filter(([path]) => path.startsWith(`${spec.path}/`) && path.split("/").length === spec.path.split("/").length + 1);
    rows = rows.filter(([, data]) => spec.filters.every(([field, op, value]) => op === ">" ? scalar(data[field]) > scalar(value) : data[field] === value));
    rows.sort(([pathA, dataA], [pathB, dataB]) => {
      for (const [field, direction] of spec.orders) {
        const a = scalar(field === "__name__" ? pathA : dataA[field]); const b = scalar(field === "__name__" ? pathB : dataB[field]);
        if (a !== b) return (a < b ? -1 : 1) * (direction === "desc" ? -1 : 1);
      }
      return pathA.localeCompare(pathB);
    });
    if (spec.after) {
      const index = rows.findIndex(([path]) => path.split("/").at(-1) === spec.after);
      rows = index >= 0 ? rows.slice(index + 1) : rows.filter(([path]) => path.split("/").at(-1)! > spec.after!);
    }
    return { docs: rows.slice(0, spec.maximum).map(([path]) => snapshot(path)) };
  };
  const query = (spec: QuerySpec) => ({
    querySpec: spec,
    doc: (id: string) => ref(`${spec.path}/${id}`),
    where: (field: string, op: string, value: unknown) => query({ ...spec, filters: [...spec.filters, [field, op, value]] }),
    orderBy: (field: unknown, direction = "asc") => query({ ...spec, orders: [...spec.orders, [typeof field === "string" ? field : "__name__", direction]] }),
    limit: (maximum: number) => query({ ...spec, maximum }),
    startAfter: (cursor: string | { id: string }) => query({ ...spec, after: typeof cursor === "string" ? cursor : cursor.id }),
    get: async () => select(spec),
  });
  const db = {
    doc: ref, collection: (path: string) => query({ path, filters: [], orders: [], maximum: Infinity, after: null }),
    async runTransaction<T>(action: (transaction: unknown) => Promise<T>) {
      // Serialized commits model Firestore retrying transactions after a
      // conflicting write; requests still carry the original expected revision.
      const preceding = serial;
      let release!: () => void;
      serial = new Promise<void>((resolve) => { release = resolve; });
      await preceding;
      const writes: Array<{ kind: "set" | "create" | "update"; path: string; data: RecordValue }> = [];
      const beforeRead = () => { if (writes.length) throw new Error("Firestore transaction read after write"); };
      try {
        const tx = {
          get: async (target: { path?: string; querySpec?: QuerySpec }) => { beforeRead(); return read([target.querySpec?.path ?? target.path!], () => target.querySpec ? select(target.querySpec) : snapshot(target.path!)); },
          getAll: async (...targets: Array<{ path: string }>) => { beforeRead(); return read(targets.map((target) => target.path), () => targets.map((target) => snapshot(target.path))); },
          set: (target: { path: string }, data: RecordValue) => writes.push({ kind: "set", path: target.path, data }),
          create: (target: { path: string }, data: RecordValue) => writes.push({ kind: "create", path: target.path, data }),
          update: (target: { path: string }, data: RecordValue) => writes.push({ kind: "update", path: target.path, data }),
        };
        const result = await action(tx);
        const newPaths = new Set<string>();
        for (const write of writes) if (write.kind === "create") {
          if (values.has(write.path) || newPaths.has(write.path)) throw new Error("Duplicate create");
          newPaths.add(write.path);
        }
        for (const write of writes) values.set(write.path, write.kind === "update" ? { ...values.get(write.path), ...write.data } : write.data);
        return result;
      } finally { release(); }
    },
  } as unknown as Firestore;
  return { values, reads, maxConcurrentReads: () => maxConcurrentReads,
    resetReadMetrics: () => { reads.length = 0; maxConcurrentReads = 0; },
    db, service: new InventoryService(db, () => currentTime), time: (value: string) => { currentTime = new Date(value); } };
}
function createInput(): SaveInventoryProductInput { return { requestId: randomUUID(), productId: null, expectedRevision: null, draft }; }
function initialStockInput(): SaveInventoryProductInput {
  return { ...createInput(), initialStock: { quantity: 19, lot: { label: "", expiryState: "dated", expiryDate: "2026-12-20" } } };
}
function stagePhoto(state: ReturnType<typeof fixture>, uploadId = randomUUID()) {
  state.values.set(`inventoryPhotoUploads/${uploadId}`, { uploadId, actorUid: actor.uid, actorEmployeeId: actor.employeeId,
    inputHash: "a".repeat(64), contentType: "image/jpeg", state: "uploaded", width: 1280, height: 960,
    createdAt: Timestamp.fromDate(initialNow), expiresAt: Timestamp.fromMillis(initialNow.valueOf() + 86_400_000) });
  return uploadId;
}
function receive(product: InventoryProduct, quantity = 10, expiryDate = "2026-10-01"): InventoryMovementInput {
  return inventoryMovementInputSchema.parse({ requestId: randomUUID(), productId: product.productId, expectedStockRevision: product.stockRevision,
    kind: "receive", locationId: "freezer1", lotId: null, quantity, newLot: { label: "입고", expiryState: "dated", expiryDate }, reason: "입고" });
}
function countInput(product: InventoryProduct, counts: InventoryCountInput["counts"] = []): InventoryCountInput {
  return { requestId: randomUUID(), productId: product.productId, locationId: "freezer1", cycleId: "week-2026-09-11", expectedStockRevision: product.stockRevision, counts, reason: "" };
}
async function stocked() {
  const state = fixture(); const product = await state.service.save(createInput(), actor);
  const first = await state.service.move(receive(product), actor);
  return { ...state, product: first.product, lotId: first.event.lines[0]!.lotId };
}

describe("inventory wire boundaries and calendar", () => {
  it("accepts a bounded initial receipt only on new-product registration and keeps legacy registration compatible", () => {
    expect(saveInventoryProductInputSchema.safeParse(createInput()).success).toBe(true);
    expect(saveInventoryProductInputSchema.safeParse(initialStockInput()).success).toBe(true);
    for (const quantity of [0, -1, 0.5, NaN, Infinity, INVENTORY_MAX_QUANTITY + 1]) {
      expect(saveInventoryProductInputSchema.safeParse({ ...initialStockInput(), initialStock: { ...initialStockInput().initialStock!, quantity } }).success).toBe(false);
    }
    expect(saveInventoryProductInputSchema.safeParse({ ...initialStockInput(), initialStock: { ...initialStockInput().initialStock!, quantity: INVENTORY_MAX_QUANTITY } }).success).toBe(true);
    expect(saveInventoryProductInputSchema.safeParse({ ...initialStockInput(), productId: "existing", expectedRevision: 1 }).success).toBe(false);
    expect(saveInventoryProductInputSchema.safeParse({ ...initialStockInput(), initialStock: { quantity: 1,
      lot: { label: "", expiryState: "dated", expiryDate: "2026-02-30" } } }).success).toBe(false);
    expect(saveInventoryProductInputSchema.safeParse({ ...initialStockInput(), initialStock: { quantity: 1,
      lot: { label: "", expiryState: "unknown", expiryDate: "2026-12-20" } } }).success).toBe(false);
    expect(saveInventoryProductInputSchema.safeParse({ ...initialStockInput(), initialStock: { quantity: 1, locationId: "sample",
      lot: { label: "", expiryState: "unknown", expiryDate: null } } }).success).toBe(false);
    for (const expiryState of ["unknown", "not_applicable"] as const) {
      expect(saveInventoryProductInputSchema.safeParse({ ...initialStockInput(), initialStock: { quantity: 1,
        lot: { label: "", expiryState, expiryDate: null } } }).success).toBe(true);
    }
  });
  it("reads legacy count summaries without confusing a historical correction with later stock changes", () => {
    const summary = inventoryCountSummarySchema.parse({ cycleId: "week-2026-09-11", checkedAt: initialNow.toISOString(),
      checkedBy: actor.employeeId, stockRevision: 2, changed: true });
    expect(summary).toMatchObject({ changed: true, stockChangedSinceCount: false });
  });
  it("validates calendar dates, explicit expiry absence, counts, and fixed whole-unit calculations", () => {
    expect(inventoryDateSchema.safeParse("2026-02-29").success).toBe(false);
    expect(inventoryDateSchema.safeParse("2028-02-29").success).toBe(true);
    expect(inventoryLotDraftSchema.safeParse({ label: "", expiryState: "unknown", expiryDate: "2026-10-01" }).success).toBe(false);
    expect(inventoryLotDraftSchema.safeParse({ label: "", expiryState: "not_applicable", expiryDate: null }).success).toBe(true);
    expect(inventoryQuantityFromPackages(2, 3, 8)).toBe(19);
    expect(() => inventoryQuantityFromPackages(0, 0.5, 8)).toThrow();
    expect(() => inventoryQuantityFromPackages(1_000_000_000, 0, 8)).toThrow();
    expect(saveInventoryProductInputSchema.safeParse({ ...createInput(), actorUid: "admin" }).success).toBe(false);
    expect(saveInventoryProductInputSchema.safeParse({ ...createInput(), productId: "../other" }).success).toBe(false);
    expect(inventoryCountInputSchema.safeParse({ requestId: randomUUID(), productId: "one", locationId: "freezer1", cycleId: "week-2026-09-11", expectedStockRevision: 0,
      counts: [{ lotId: "same", quantity: 1 }, { lotId: "same", quantity: 1 }], reason: "" }).success).toBe(false);
  });
  it("uses Korean midnight and keeps the existing cycle through a pending weekday change", () => {
    const settings = defaultInventorySettings();
    expect(inventoryToday(new Date("2026-09-10T14:59:59Z"))).toBe("2026-09-10");
    expect(inventoryToday(new Date("2026-09-10T15:00:00Z"))).toBe("2026-09-11");
    expect(inventoryCycle(settings, "2026-09-10").cycleId).toBe("week-2026-09-04");
    expect(inventoryCycle(settings, "2026-09-11").cycleId).toBe("week-2026-09-11");
    const pending = nextInventorySettings(settings, 1, 10, initialNow, actor.employeeId);
    expect(pending).toMatchObject({ weekday: 5, pendingWeekday: 1, effectiveDate: "2026-09-21" });
    expect(inventoryCycle(pending, "2026-09-18")).toMatchObject({ cycleId: "week-2026-09-11", nextDate: "2026-09-21" });
    expect(inventoryCycle(pending, "2026-09-21")).toMatchObject({ cycleId: "week-2026-09-21", weekday: 1, nextDate: "2026-09-28" });
    const preserved = nextInventorySettings(pending, 1, 20, new Date("2026-09-15T00:00:00Z"), actor.employeeId);
    expect(preserved.effectiveDate).toBe("2026-09-21");
  });
});

describe("inventory transactions", () => {
  it("keeps legacy manufacturer strings compatible and snapshots a selected active master without rewriting inactive links", async () => {
    const state = fixture(); const manufacturerId = randomUUID();
    state.values.set(`${INVENTORY_MANUFACTURER_PATH}/${manufacturerId}`, {
      manufacturerId, name: "온누리 식품", normalizedName: "온누리식품", active: true, revision: 1,
      createdAt: Timestamp.fromDate(initialNow), createdBy: admin.employeeId, updatedAt: Timestamp.fromDate(initialNow),
    });
    const requestId = randomUUID();
    const linkedInput: SaveInventoryProductWithManufacturerInput = { requestId, productId: null, expectedRevision: null,
      draft: { ...draft, name: "Master 연결 상품", manufacturer: "직원 입력 오타", manufacturerId } };
    const linked = await state.service.save(linkedInput, actor);
    expect(linked).toMatchObject({ productId: requestId, manufacturerId, manufacturer: "온누리 식품" });
    expect(state.values.get(`${INVENTORY_PRODUCT_PATH}/${requestId}`)).toMatchObject({ manufacturerId, manufacturer: "온누리 식품" });
    expect(state.values.get(`auditLogs/inventory-${requestId}`)).toMatchObject({
      eventType: "INVENTORY_PRODUCT_CREATED", changedFields: expect.arrayContaining(["manufacturer", "manufacturerId"]),
    });

    state.values.set(`${INVENTORY_MANUFACTURER_PATH}/${manufacturerId}`, {
      ...state.values.get(`${INVENTORY_MANUFACTURER_PATH}/${manufacturerId}`), active: false, revision: 2,
    });
    const rejectedId = randomUUID();
    await expect(state.service.save({ ...linkedInput, requestId: rejectedId,
      draft: { ...linkedInput.draft, name: "비활성 신규 연결" } }, actor)).rejects.toMatchObject({
      code: "failed-precondition", details: { reason: "inventory-manufacturer-inactive" },
    });
    expect(state.values.has(`${INVENTORY_PRODUCT_PATH}/${rejectedId}`)).toBe(false);
    expect(state.values.has(`companies/onnuri/inventoryRequests/${rejectedId}`)).toBe(false);

    const preserved = await state.service.save({ requestId: randomUUID(), productId: linked.productId,
      expectedRevision: linked.revision, draft: { ...draft, name: "기존 연결 상품 수정", manufacturer: linked.manufacturer } }, actor);
    expect(preserved).toMatchObject({ manufacturerId, manufacturer: "온누리 식품", revision: 2 });
    expect((await state.service.detail(linked.productId, actor)).product).toMatchObject({ manufacturerId, manufacturer: "온누리 식품" });

    const legacy = await state.service.save({ requestId: randomUUID(), productId: null, expectedRevision: null,
      draft: { ...draft, name: "Legacy 문자열 상품", manufacturer: "문자열 제조사" } }, actor);
    expect(legacy).toMatchObject({ manufacturer: "문자열 제조사" });
    expect(legacy).not.toHaveProperty("manufacturerId");
  });

  it("rejects a missing manufacturer master atomically", async () => {
    const state = fixture(); const requestId = randomUUID();
    await expect(state.service.save({ requestId, productId: null, expectedRevision: null,
      draft: { ...draft, manufacturerId: randomUUID() } }, actor)).rejects.toMatchObject({
      code: "failed-precondition", details: { reason: "inventory-manufacturer-missing" },
    });
    expect(state.values.has(`${INVENTORY_PRODUCT_PATH}/${requestId}`)).toBe(false);
    expect(state.values.has(`companies/onnuri/inventoryRequests/${requestId}`)).toBe(false);
  });

  it("backfills only a missing summary with dry-run and per-product transaction protection", async () => {
    const state = await stocked(); const path = `${INVENTORY_PRODUCT_PATH}/${state.product.productId}`;
    const stored = state.values.get(path)!; delete stored.lotSummary;
    const before = JSON.stringify([...state.values]);
    expect((await backfillInventoryLotSummary(state.db, { apply: false, maxProducts: 5 })).results[0]?.status).toBe("would-update");
    expect(JSON.stringify([...state.values])).toBe(before);
    expect((await backfillInventoryLotSummary(state.db, { apply: true, maxProducts: 5 })).results[0]?.status).toBe("updated");
    const updated = state.values.get(path)!;
    expect(updated).toEqual({ ...stored, lotSummary: state.product.lotSummary });
    expect((await backfillInventoryLotSummary(state.db, { apply: true, maxProducts: 5 })).results[0]?.status).toBe("already-summarized");
    delete updated.lotSummary;
    updated.quantityByLocation = { ...state.product.quantityByLocation, freezer1: 999 };
    await expect(backfillInventoryLotSummary(state.db, { apply: true, maxProducts: 5 })).rejects.toThrow("inconsistent");
    expect(state.values.get(path)).not.toHaveProperty("lotSummary");
  });
  it("rejects an over-broad summary migration before making any writes", async () => {
    const state = await stocked(); await state.service.save(createInput(), actor);
    const before = JSON.stringify([...state.values]);
    await expect(backfillInventoryLotSummary(state.db, { apply: true, maxProducts: 1 })).rejects.toThrow("limit exceeded");
    expect(JSON.stringify([...state.values])).toBe(before);
  });
  it("does not auto-confirm an extra Friday during a pending weekday transition", async () => {
    const state = fixture(); const product = await state.service.save(initialStockInput(), actor);
    await state.service.updateSettings({ requestId: randomUUID(), expectedRevision: 0, weekday: 1, urgentDays: 100 }, admin);
    state.time("2026-09-18T01:00:00Z");
    const result = await state.service.move({ requestId: randomUUID(), productId: product.productId,
      expectedStockRevision: product.stockRevision, kind: "adjust", locationId: "freezer1", lotId: `${product.productId}-freezer1`, quantity: 19, reason: "" }, actor);
    expect(result.product.lastCountByLocation.freezer1).toBeNull();
    const manual = await state.service.move({ requestId: randomUUID(), productId: product.productId,
      expectedStockRevision: result.product.stockRevision, kind: "adjust", locationId: "freezer1", lotId: `${product.productId}-freezer1`,
      quantity: 19, reason: "", inspectionCycleId: "week-2026-09-11" }, actor);
    expect(manual.product.lastCountByLocation.freezer1).toMatchObject({ cycleId: "week-2026-09-11", stockChangedSinceCount: false });
  });
  it("confirms only touched expiry lots on the scheduled day, and completes a location only after every positive lot is confirmed", async () => {
    const state = fixture(); const product = await state.service.save(initialStockInput(), actor);
    const firstLotId = `${product.productId}-freezer1`;
    expect(product.lastCountByLocation.freezer1).toBeNull();
    const received = await state.service.move({ ...receive(product, 5, "2027-01-01"), reason: "", includeDetail: true }, actor);
    expect(received.product.lastCountByLocation.freezer1).toBeNull();
    expect(received.product.lotSummary).toMatchObject({ all: { lotCount: 2, expiryCount: 2 }, byLocation: { freezer1: { lotCount: 2, expiryCount: 2 } } });
    const checked = await state.service.move({ requestId: randomUUID(), productId: product.productId,
      expectedStockRevision: received.product.stockRevision, kind: "adjust", locationId: "freezer1", lotId: firstLotId, quantity: 19, reason: "" }, sales);
    expect(checked.product.lastCountByLocation.freezer1).toMatchObject({ cycleId: "week-2026-09-11", checkedBy: sales.employeeId, stockChangedSinceCount: false });
    expect(checked.event).toMatchObject({ reason: "", actorEmployeeId: sales.employeeId, lines: [{ before: 19, after: 19, delta: 0 }] });
    expect(checked.product).not.toHaveProperty("inspectionByLot");
    const stored = state.values.get(`${INVENTORY_PRODUCT_PATH}/${product.productId}`)!;
    expect(Object.keys(stored.inspectionByLot as object)).toHaveLength(2);

    state.time("2026-09-12T01:00:00Z");
    const changed = await state.service.move({ requestId: randomUUID(), productId: product.productId,
      expectedStockRevision: checked.product.stockRevision, kind: "issue", locationId: "freezer1", lotId: firstLotId, quantity: 1, reason: "" }, actor);
    expect(changed.product.lastCountByLocation.freezer1?.stockChangedSinceCount).toBe(true);
    const reconfirmed = await state.service.move({ requestId: randomUUID(), productId: product.productId,
      expectedStockRevision: changed.product.stockRevision, kind: "adjust", locationId: "freezer1", lotId: firstLotId, quantity: 18, reason: "",
      inspectionCycleId: "week-2026-09-11" }, actor);
    expect(reconfirmed.product.lastCountByLocation.freezer1?.stockChangedSinceCount).toBe(false);
    state.time("2026-09-18T01:00:00Z");
    const nextWeekPartial = await state.service.move({ requestId: randomUUID(), productId: product.productId,
      expectedStockRevision: reconfirmed.product.stockRevision, kind: "adjust", locationId: "freezer1", lotId: firstLotId, quantity: 18, reason: "" }, actor);
    expect(nextWeekPartial.product.lastCountByLocation.freezer1?.cycleId).toBe("week-2026-09-11");
  });
  it("rejects stale or forged match-only confirmation atomically and preserves legacy editable counts", async () => {
    const state = fixture(); const product = await state.service.save(initialStockInput(), actor);
    const lotId = `${product.productId}-freezer1`;
    const base = { ...countInput(product, [{ lotId, quantity: 19 }]), matchOnly: true, includeDetail: true };
    for (const changed of [{ counts: [{ lotId, quantity: 18 }] }, { counts: [] }, { expectedStockRevision: 0 }, { cycleId: "week-2026-09-04" }]) {
      const input = { ...base, requestId: randomUUID(), ...changed };
      await expect(state.service.count(input, actor)).rejects.toMatchObject({ code: "aborted" });
      expect(state.values.has(`companies/onnuri/inventoryRequests/${input.requestId}`)).toBe(false);
    }
    const matched = await state.service.count(base, actor);
    expect(matched.event).toMatchObject({ kind: "count_match", lines: [{ before: 19, after: 19, delta: 0 }] });
    expect(matched.product.stockRevision).toBe(product.stockRevision);
    expect((await state.service.count({ ...base, includeSummary: true }, actor)).replayed).toBe(true);
    await expect(state.service.count({ ...base, matchOnly: false }, actor)).rejects.toMatchObject({ code: "already-exists" });
    await expect(state.service.count({ ...base, requestId: randomUUID() }, viewer)).rejects.toMatchObject({ code: "permission-denied" });
    const adjusted = await state.service.count({ ...countInput(matched.product, [{ lotId, quantity: 17 }]), reason: "기존 설치 앱 수량 조정" }, actor);
    expect(adjusted.event.kind).toBe("count_adjust");
  });
  it("keeps weekday opt-in in command identity, rejects stale cycles and counts only current positive lots after exhaustion", async () => {
    const state = fixture(); state.time("2026-09-12T01:00:00Z");
    const product = await state.service.save(initialStockInput(), actor);
    const request = { ...receive(product), reason: "" };
    const added = await state.service.move(request, actor);
    expect(added.product.lastCountByLocation.freezer1).toBeNull();
    await expect(state.service.move({ ...request, inspectionCycleId: "week-2026-09-11" }, actor)).rejects.toMatchObject({ code: "already-exists" });
    const stale = { ...receive(added.product), inspectionCycleId: "week-2026-09-04" };
    await expect(state.service.move(stale, actor)).rejects.toMatchObject({ code: "aborted", details: { reason: "inventory-cycle" } });
    const checked = await state.service.move({ requestId: randomUUID(), productId: product.productId,
      expectedStockRevision: added.product.stockRevision, kind: "adjust", locationId: "freezer1", lotId: `${product.productId}-freezer1`,
      quantity: 19, reason: "", inspectionCycleId: "week-2026-09-11" }, actor);
    expect(checked.product.lastCountByLocation.freezer1).toBeNull();
    const exhausted = await state.service.move({ requestId: randomUUID(), productId: product.productId,
      expectedStockRevision: checked.product.stockRevision, kind: "issue", locationId: "freezer1", lotId: added.event.lines[0]!.lotId,
      quantity: 10, reason: "", inspectionCycleId: "week-2026-09-11" }, actor);
    expect(exhausted.product.lastCountByLocation.freezer1?.stockChangedSinceCount).toBe(false);
    expect(exhausted.product.lotSummary?.all).toEqual({ lotCount: 1, expiryCount: 1 });
    expect(Object.keys(state.values.get(`${INVENTORY_PRODUCT_PATH}/${product.productId}`)!.inspectionByLot as object)).toEqual([`${product.productId}-freezer1`]);
  });
  it("preserves private per-lot checks through metadata edits and tombstones without sending them in detail or receipts", async () => {
    const state = await stocked();
    const path = `${INVENTORY_PRODUCT_PATH}/${state.product.productId}`;
    const checks = state.values.get(path)!.inspectionByLot;
    const edited = await state.service.save({ ...createInput(), productId: state.product.productId, expectedRevision: state.product.revision,
      draft: { ...draft, name: "새 품명" } }, actor);
    expect(state.values.get(path)!.inspectionByLot).toEqual(checks);
    const inactive = await state.service.status({ requestId: randomUUID(), productId: edited.productId, expectedRevision: edited.revision, status: "inactive", reason: "" }, actor);
    expect(state.values.get(path)!.inspectionByLot).toEqual(checks);
    expect((await state.service.detail(edited.productId, actor)).product).not.toHaveProperty("inspectionByLot");
    await state.service.status({ requestId: randomUUID(), productId: edited.productId, expectedRevision: inactive.revision, reason: "삭제" }, actor, true);
    expect(state.values.get(path)!.inspectionByLot).toEqual(checks);
    for (const [key, value] of state.values) if (key.startsWith("companies/onnuri/inventoryRequests/")) expect(JSON.stringify(value.result)).not.toContain("inspectionByLot");
  });
  it("inherits only a fresh legacy location count, never falsely inherits a newly received or previously stale lot", async () => {
    const state = await stocked(); state.time("2026-09-12T01:00:00Z");
    const path = `${INVENTORY_PRODUCT_PATH}/${state.product.productId}`;
    const stored = state.values.get(path)!; delete stored.inspectionByLot;
    const added = await state.service.move({ ...receive(state.product), inspectionCycleId: "week-2026-09-11" }, actor);
    expect(added.product.lastCountByLocation.freezer1?.stockChangedSinceCount).toBe(false);
    const stale = state.values.get(path)!; delete stale.inspectionByLot;
    stale.lastCountByLocation = { ...added.product.lastCountByLocation,
      freezer1: { ...added.product.lastCountByLocation.freezer1!, stockChangedSinceCount: true } };
    const partial = await state.service.move({ ...receive(added.product), inspectionCycleId: "week-2026-09-11" }, actor);
    expect(partial.product.lastCountByLocation.freezer1?.stockChangedSinceCount).toBe(true);
  });
  it.each(INVENTORY_LOCATIONS)("creates the first quantity and expiry lot atomically in the chosen %s location", async (locationId) => {
    const state = fixture();
    const input = { ...initialStockInput(), draft: { ...draft, defaultLocationId: locationId } };
    const product = await state.service.save(input, actor);
    const lotId = `${input.requestId}-${locationId}`;
    expect(product).toMatchObject({ revision: 1, stockRevision: 1, hasHistory: true,
      quantityByLocation: { [locationId]: 19 }, nearestExpiryByLocation: { [locationId]: "2026-12-20" } });
    expect(Object.values(product.quantityByLocation).reduce((total, quantity) => total + quantity, 0)).toBe(19);
    expect(Object.values(product.lastCountByLocation)).toEqual([null, null, null, null]);
    const detail = await state.service.detail(product.productId, actor);
    expect(detail.product).toEqual(product);
    expect(detail.lots).toHaveLength(1);
    expect(detail.lots[0]).toMatchObject({ lotId, originLotId: input.requestId, productId: product.productId,
      quantity: 19, locationId, expiryState: "dated", expiryDate: "2026-12-20" });
    const history = await state.service.history(product.productId, null);
    expect(history.events).toHaveLength(1);
    expect(history.events[0]).toMatchObject({ eventId: input.requestId, kind: "receive", stockRevision: 1,
      actorEmployeeId: actor.employeeId, unitLabel: "봉", unitsPerBox: 8, reason: "신규 상품 초기 입고", cycleId: null,
      lines: [{ lotId, locationId, before: 0, after: 19, delta: 19, expiryDate: "2026-12-20" }] });
    const audits = [...state.values.entries()].filter(([path]) => path.startsWith("auditLogs/"));
    expect(audits).toHaveLength(1);
    expect(audits[0]![1]).toMatchObject({ eventType: "INVENTORY_PRODUCT_CREATED", requestId: input.requestId,
      changedFields: expect.arrayContaining(["name", "unitLabel", "quantity", "lots"]) });
    const requests = [...state.values.entries()].filter(([path]) => path.startsWith("companies/onnuri/inventoryRequests/"));
    expect(requests).toHaveLength(1);
    expect(requests[0]![1]).toMatchObject({ operation: "saveInventoryProduct", result: product });
    expect(requests[0]![1]).not.toHaveProperty("expiresAt");
    await expect(state.service.save({ ...createInput(), productId: product.productId, expectedRevision: product.revision,
      draft: { ...draft, unitsPerBox: 10 } }, actor)).rejects.toMatchObject({ code: "failed-precondition" });
  });
  it("replays concurrent initial registration exactly once and rejects a changed quantity, identity or operation", async () => {
    const state = fixture(); const input = initialStockInput();
    const products = await Promise.all([state.service.save(input, actor), state.service.save(input, actor)]);
    expect(products[0]).toEqual(products[1]);
    expect((await state.service.detail(input.requestId, actor)).product.quantityByLocation.freezer1).toBe(19);
    expect((await state.service.history(input.requestId, null)).events).toHaveLength(1);
    await expect(state.service.save({ ...input, initialStock: { ...input.initialStock!, quantity: 20 } }, actor)).rejects.toMatchObject({ code: "already-exists" });
    await expect(state.service.save(input, admin)).rejects.toMatchObject({ code: "already-exists" });
    await expect(state.service.move({ ...receive(products[0]!), requestId: input.requestId }, actor)).rejects.toMatchObject({ code: "already-exists" });
    state.values.get(`authz/${actor.uid}`)!.sessionVersion = 2;
    await expect(state.service.save(input, actor)).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("claims a staged photo in the same initial-stock transaction and replays without reclaiming it", async () => {
    const state = fixture(); const uploadId = stagePhoto(state);
    const input: SaveInventoryProductInput = { ...initialStockInput(), photoChange: { action: "replace", uploadId } };
    const product = await state.service.save(input, actor);
    expect(product.photo).toEqual({ photoId: uploadId, width: 1280, height: 960 });
    expect(state.values.get(`inventoryPhotoUploads/${uploadId}`)).toMatchObject({ state: "attached", productId: product.productId, attachedRequestId: input.requestId });
    const size = state.values.size;
    expect(await state.service.save(input, actor)).toEqual(product);
    expect(state.values.size).toBe(size);
    expect((await state.service.history(product.productId, null)).events).toHaveLength(1);
  });
  it("leaves no product, stock or photo claim when the atomic initial receipt cannot commit", async () => {
    const state = fixture(); const uploadId = stagePhoto(state);
    const input: SaveInventoryProductInput = { ...initialStockInput(), photoChange: { action: "replace", uploadId } };
    // A pre-existing event simulates a final write precondition failure after
    // all reads. None of the queued product/lot/photo/receipt writes may commit.
    state.values.set(`${INVENTORY_PRODUCT_PATH}/${input.requestId}/events/${input.requestId}`, { occupied: true });
    const before = new Map(state.values);
    await expect(state.service.save(input, actor)).rejects.toThrow("Duplicate create");
    expect(state.values).toEqual(before);
    expect(state.values.get(`inventoryPhotoUploads/${uploadId}`)).toMatchObject({ state: "uploaded" });
    expect(state.values.has(`${INVENTORY_PRODUCT_PATH}/${input.requestId}`)).toBe(false);
    expect(state.values.has(`companies/onnuri/inventoryRequests/${input.requestId}`)).toBe(false);
  });
  it("rejects an unavailable photo without creating a partially registered initial-stock product", async () => {
    const state = fixture(); const input: SaveInventoryProductInput = { ...initialStockInput(), photoChange: { action: "replace", uploadId: randomUUID() } };
    const before = new Map(state.values);
    await expect(state.service.save(input, actor)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(state.values).toEqual(before);
  });
  it("rejects initial stock on existing products and raw invalid quantities, retaining write authorization", async () => {
    const state = fixture(); const input = initialStockInput();
    await expect(state.service.save(input, viewer)).rejects.toMatchObject({ code: "permission-denied" });
    const product = await state.service.save(createInput(), actor);
    const before = new Map(state.values);
    await expect(state.service.save({ ...input, productId: product.productId, expectedRevision: product.revision }, actor)).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(state.service.save({ ...input, requestId: product.productId }, actor)).rejects.toMatchObject({ code: "already-exists" });
    await expect(state.service.save({ ...input, initialStock: { ...input.initialStock!, quantity: 0 } }, actor)).rejects.toMatchObject({ code: "invalid-argument" });
    expect(state.values).toEqual(before);
  });
  it("refreshes a registration replay without extra first-save reads or rewriting its receipt and initial stock", async () => {
    const state = fixture(); const input = { ...initialStockInput(), refreshOnReplay: true };
    const first = await state.service.save(input, actor);
    expect(state.reads).toEqual([
      [`authz/${actor.uid}`, `employees/${actor.employeeId}`], [`companies/onnuri/inventoryRequests/${input.requestId}`],
      [`${INVENTORY_PRODUCT_PATH}/${first.productId}`],
    ]);
    const added = await state.service.move(receive(first, 2), actor);
    const latest = await state.service.save({ ...createInput(), productId: first.productId,
      expectedRevision: first.revision, draft: { ...draft, name: "변경된 상품명", note: "나중에 저장한 참고" } }, admin);
    expect(latest.quantityByLocation).toEqual(added.product.quantityByLocation);
    const before = new Map(state.values); state.resetReadMetrics();
    expect(await state.service.save(input, actor)).toEqual(latest);
    expect(state.reads).toEqual([
      [`authz/${actor.uid}`, `employees/${actor.employeeId}`], [`companies/onnuri/inventoryRequests/${input.requestId}`],
      [`${INVENTORY_PRODUCT_PATH}/${first.productId}`],
    ]);
    expect(state.values).toEqual(before);
    expect(state.values.get(`companies/onnuri/inventoryRequests/${input.requestId}`)?.result).toEqual(first);
    // The response-only flag does not alter the original command fingerprint.
    // Older clients can still obtain the exact original result.
    expect(await state.service.save({ ...input, refreshOnReplay: false }, actor)).toEqual(first);
    expect((await state.service.history(first.productId, null)).events).toHaveLength(2);
    await expect(state.service.save({ ...input, draft: { ...draft, name: "다른 요청" } }, actor)).rejects.toMatchObject({ code: "already-exists" });
  });
  it("upgrades a legacy metadata replay to current quantities and metadata only when requested", async () => {
    const state = await stocked();
    const input = { ...createInput(), productId: state.product.productId, expectedRevision: state.product.revision,
      draft: { ...draft, manufacturer: "첫 수정" } };
    const edited = await state.service.save(input, actor);
    const issued = await state.service.move({ requestId: randomUUID(), productId: edited.productId,
      expectedStockRevision: edited.stockRevision, kind: "issue", locationId: "freezer1", lotId: state.lotId,
      quantity: 2, reason: "납품" }, admin);
    const latest = await state.service.save({ ...createInput(), productId: edited.productId, expectedRevision: edited.revision,
      draft: { ...draft, manufacturer: "다른 직원의 최신 수정" } }, admin);
    const before = new Map(state.values);
    expect(latest.stockRevision).toBe(issued.product.stockRevision);
    expect(await state.service.save({ ...input, refreshOnReplay: true }, actor)).toEqual(latest);
    expect(await state.service.save(input, actor)).toEqual(edited);
    expect(state.values).toEqual(before);
    state.values.get(`authz/${actor.uid}`)!.active = false;
    state.resetReadMetrics();
    await expect(state.service.save({ ...input, refreshOnReplay: true }, actor)).rejects.toMatchObject({ code: "permission-denied" });
    expect(state.reads).toEqual([[`authz/${actor.uid}`, `employees/${actor.employeeId}`]]);
  });
  it.each(["deleted", "missing"] as const)("cannot revive a %s product with a refreshed save replay", async (stateAfterSave) => {
    const state = fixture(); const input = createInput(); const created = await state.service.save(input, actor);
    if (stateAfterSave === "deleted") await state.service.status({ requestId: randomUUID(), productId: created.productId,
      expectedRevision: created.revision, reason: "잘못 등록" }, admin, true);
    else state.values.delete(`${INVENTORY_PRODUCT_PATH}/${created.productId}`);
    const before = new Map(state.values);
    await expect(state.service.save({ ...input, refreshOnReplay: true }, actor)).rejects.toMatchObject({ code: "not-found" });
    expect(state.values).toEqual(before);
  });
  it("returns canonical status on delayed status/delete retries without reverting reactivation or resurrecting deletion", async () => {
    const state = fixture(); const created = await state.service.save(createInput(), actor);
    const input = { requestId: randomUUID(), productId: created.productId, expectedRevision: created.revision,
      status: "inactive" as const, reason: "잠시 보관" };
    const inactive = await state.service.status(input, admin);
    const active = await state.service.status({ requestId: randomUUID(), productId: created.productId,
      expectedRevision: inactive.revision, status: "active", reason: "다시 사용" }, admin);
    expect(await state.service.status({ ...input, refreshOnReplay: true }, admin)).toEqual(active);
    expect(await state.service.status(input, admin)).toEqual(inactive);
    const removeInput = { requestId: randomUUID(), productId: active.productId, expectedRevision: active.revision,
      reason: "중복 등록 정리", refreshOnReplay: true };
    const deleted = await state.service.status(removeInput, admin, true);
    const before = new Map(state.values);
    expect(await state.service.status({ ...input, refreshOnReplay: true }, admin)).toEqual(deleted);
    expect(await state.service.status(removeInput, admin, true)).toEqual(deleted);
    expect(state.values).toEqual(before);
    expect(state.values.get(`companies/onnuri/inventoryRequests/${input.requestId}`)?.result).toEqual(inactive);
    await expect(state.service.status({ ...input, refreshOnReplay: true, status: "active" }, admin)).rejects.toMatchObject({ code: "already-exists" });
    await expect(state.service.status(removeInput, actor, true)).rejects.toMatchObject({ code: "already-exists" });
    await expect(state.service.status(removeInput, viewer, true)).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("creates a zero-stock product and permits its explicit zero confirmation only at the default location", async () => {
    const state = fixture(); const product = await state.service.save(createInput(), actor);
    expect(product).toMatchObject({ status: "active", revision: 1, stockRevision: 0, photo: null, quantityByLocation: { freezer1: 0 } });
    await expect(state.service.count({ ...countInput(product), locationId: "sample" }, actor)).rejects.toMatchObject({ code: "failed-precondition" });
    const saved = await state.service.count(countInput(product), actor);
    expect(saved.event).toMatchObject({ kind: "count_match", lines: [] });
    expect(saved.product.lastCountByLocation.freezer1).toMatchObject({ cycleId: "week-2026-09-11", checkedBy: actor.employeeId, changed: false });
    expect(state.values.has(`${INVENTORY_CYCLE_PATH}/week-2026-09-11/entries/${product.productId}-freezer1`)).toBe(true);
  });
  it("keeps expiration lots separate and advances the nearest date when the oldest lot is depleted", async () => {
    const state = await stocked();
    const second = await state.service.move(receive(state.product, 20, "2026-11-01"), actor);
    const issued = await state.service.move({ requestId: randomUUID(), productId: state.product.productId, expectedStockRevision: second.product.stockRevision,
      kind: "issue", locationId: "freezer1", lotId: state.lotId, quantity: 10, reason: "납품" }, actor);
    expect(issued.product.quantityByLocation.freezer1).toBe(20);
    expect(issued.product.nearestExpiryByLocation.freezer1).toBe("2026-11-01");
    const detail = await state.service.detail(state.product.productId, viewer);
    expect(detail.lots).toHaveLength(1);
    expect(state.values.get(`${INVENTORY_PRODUCT_PATH}/${state.product.productId}/lots/${state.lotId}`)?.quantity).toBe(0);
  });
  it("moves sample stock atomically and preserves batch identity when transferring it back", async () => {
    const state = await stocked();
    const transferred = await state.service.move({ requestId: randomUUID(), productId: state.product.productId, expectedStockRevision: state.product.stockRevision,
      kind: "transfer", locationId: "freezer1", toLocationId: "sample", lotId: state.lotId, quantity: 3, reason: "샘플 분리" }, actor);
    expect(transferred.product.quantityByLocation).toMatchObject({ freezer1: 7, sample: 3 });
    expect(transferred.event.lines.map((line) => line.delta)).toEqual([-3, 3]);
    const returned = await state.service.move({ requestId: randomUUID(), productId: state.product.productId, expectedStockRevision: transferred.product.stockRevision,
      kind: "transfer", locationId: "sample", toLocationId: "freezer1", lotId: transferred.event.lines[1]!.lotId, quantity: 3, reason: "반납" }, actor);
    expect(returned.product.quantityByLocation).toMatchObject({ freezer1: 10, sample: 0 });
    expect((await state.service.detail(state.product.productId, actor)).lots.map((lot) => lot.lotId)).toEqual([state.lotId]);
  });
  it("replays the committed response once and rejects a request ID reused with different content or identity", async () => {
    const state = fixture(); const product = await state.service.save(createInput(), actor); const request = receive(product);
    const first = await state.service.move(request, actor);
    const repeated = await state.service.move(request, actor);
    expect(repeated).toEqual({ ...first, replayed: true });
    await expect(state.service.move({ ...request, quantity: 9 }, actor)).rejects.toMatchObject({ code: "already-exists" });
    await expect(state.service.move(request, admin)).rejects.toMatchObject({ code: "already-exists" });
    const receipt = state.values.get(`companies/onnuri/inventoryRequests/${request.requestId}`)!;
    expect(receipt).not.toHaveProperty("expiresAt");
    expect((await state.service.history(product.productId, null)).events).toHaveLength(1);
  });
  it("returns opt-in commit-confirmed lots for stock changes, without duplicating them in the permanent receipt", async () => {
    const state = await stocked();
    const request = { ...receive(state.product, 4, "2027-02-01"), includeDetail: true };
    const result = await state.service.move(request, actor);
    expect(result.detail).toEqual(await state.service.detail(state.product.productId, actor));
    expect(result.detail!.lots.map((lot) => lot.quantity)).toEqual([10, 4]);
    expect(state.values.get(`companies/onnuri/inventoryRequests/${request.requestId}`)?.result).not.toHaveProperty("detail");
    const changed = await state.service.move({ requestId: randomUUID(), productId: result.product.productId,
      expectedStockRevision: result.product.stockRevision, kind: "issue", locationId: "freezer1", lotId: state.lotId,
      quantity: 10, reason: "납품", includeDetail: true }, actor);
    expect(changed.detail!.lots.map((lot) => lot.quantity)).toEqual([4]);
    expect(changed.detail).toEqual(await state.service.detail(state.product.productId, actor));
    // An old retry is confirmed, but deliberately requires a fresh detail read
    // instead of presenting its original lots as the current working set.
    const replay = await state.service.move(request, actor);
    expect(replay).toMatchObject({ replayed: true, product: result.product });
    expect(replay).not.toHaveProperty("detail");
    expect((await state.service.detail(state.product.productId, actor)).product).toEqual(changed.product);
  });
  it("keeps legacy responses strict and response options outside a command's idempotency identity", async () => {
    const state = fixture(); const product = await state.service.save(createInput(), actor);
    const request = receive(product);
    const legacy = await state.service.move(request, actor);
    expect(Object.keys(legacy).sort()).toEqual(["event", "product", "replayed"]);
    const replay = await state.service.move({ ...request, includeDetail: true }, actor);
    expect(replay).toEqual({ ...legacy, replayed: true });
    await expect(state.service.move({ ...request, includeDetail: true, quantity: 99 }, actor)).rejects.toMatchObject({ code: "already-exists" });
    const nextRequest = { ...receive(legacy.product), includeDetail: true };
    const expanded = await state.service.move(nextRequest, actor);
    const noDetail = await state.service.move({ ...nextRequest, includeDetail: false }, actor);
    expect(noDetail).toEqual({ product: expanded.product, event: expanded.event, replayed: true });
    expect((await state.service.history(product.productId, null)).events).toHaveLength(2);
  });
  it("returns exact count and corrected expiry details, including an empty active set after zeroing stock", async () => {
    const state = await stocked();
    const counted = await state.service.count({ ...countInput(state.product, [{ lotId: state.lotId, quantity: 9 }]), reason: "실물 수량 확인", includeDetail: true }, actor);
    expect(counted.detail).toEqual(await state.service.detail(state.product.productId, actor));
    expect(counted.detail!.product.lastCountByLocation.freezer1).toMatchObject({ changed: true, stockChangedSinceCount: false });
    const updated = await state.service.updateLot({ requestId: randomUUID(), productId: state.product.productId, lotId: state.lotId,
      expectedStockRevision: counted.product.stockRevision, draft: { label: "유통기한 정정", expiryState: "dated", expiryDate: "2027-01-01" },
      reason: "라벨 재확인", includeDetail: true }, actor);
    expect(updated.detail).toEqual(await state.service.detail(state.product.productId, actor));
    expect(updated.detail!.lots[0]).toMatchObject({ quantity: 9, expiryDate: "2027-01-01" });
    const empty = await state.service.count({ ...countInput(updated.product, [{ lotId: state.lotId, quantity: 0 }]), reason: "실물 없음", includeDetail: true }, actor);
    expect(empty.detail).toEqual({ product: empty.product, lots: [] });
  });
  it("overlaps independent count reads only after transactional authorization and the retry receipt check", async () => {
    const state = await stocked();
    state.resetReadMetrics();
    const input = { ...countInput(state.product, [{ lotId: state.lotId, quantity: 10 }]), includeDetail: true };
    const result = await state.service.count(input, actor);
    expect(result.detail).toBeDefined();
    expect(state.reads).toEqual([
      [`authz/${actor.uid}`, `employees/${actor.employeeId}`],
      [`companies/onnuri/inventoryRequests/${input.requestId}`],
      [`${INVENTORY_PRODUCT_PATH}/${state.product.productId}`], [INVENTORY_SETTINGS_PATH],
      [`${INVENTORY_PRODUCT_PATH}/${state.product.productId}/lots`], [`${INVENTORY_CYCLE_PATH}/week-2026-09-11`],
    ]);
    expect(state.maxConcurrentReads()).toBe(3);
    state.resetReadMetrics();
    await state.service.count(input, actor);
    expect(state.reads).toHaveLength(2);
    expect(state.maxConcurrentReads()).toBe(1);
  });
  it("reuses positive lots from the transaction query but still resolves exhausted lots before receiving again", async () => {
    const state = await stocked(); state.resetReadMetrics();
    const result = await state.service.move({ requestId: randomUUID(), productId: state.product.productId,
      expectedStockRevision: state.product.stockRevision, kind: "issue", locationId: "freezer1", lotId: state.lotId,
      quantity: 10, reason: "전량 납품", includeDetail: true }, actor);
    const lotPath = `${INVENTORY_PRODUCT_PATH}/${state.product.productId}/lots/${state.lotId}`;
    expect(state.reads.flat()).not.toContain(lotPath);
    expect(result.detail!.lots).toEqual([]);
    state.resetReadMetrics();
    const restocked = await state.service.move({ requestId: randomUUID(), productId: state.product.productId,
      expectedStockRevision: result.product.stockRevision, kind: "receive", locationId: "freezer1", lotId: state.lotId,
      quantity: 2, reason: "동일 묶음 재입고", includeDetail: true }, actor);
    expect(state.reads.flat()).toContain(lotPath);
    expect(restocked.detail!.lots).toHaveLength(1);
    expect(restocked.detail!.lots[0]).toMatchObject({ lotId: state.lotId, quantity: 2 });
  });
  it("prevents simultaneous stale withdrawals from overselling and commits no partial failure", async () => {
    const state = await stocked();
    const input = { productId: state.product.productId, expectedStockRevision: state.product.stockRevision, kind: "issue" as const,
      locationId: "freezer1" as const, lotId: state.lotId, quantity: 7, reason: "동시 출고" };
    const results = await Promise.allSettled([state.service.move({ ...input, requestId: randomUUID() }, actor), state.service.move({ ...input, requestId: randomUUID() }, admin)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected && rejected.status === "rejected" ? rejected.reason : null).toMatchObject({ code: "aborted" });
    const current = (await state.service.detail(state.product.productId, actor)).product;
    const before = state.values.size;
    await expect(state.service.move({ ...input, requestId: randomUUID(), expectedStockRevision: current.stockRevision, quantity: 4 }, actor)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(state.values.size).toBe(before);
    expect(current.quantityByLocation.freezer1).toBe(3);
    expect((await state.service.history(current.productId, null)).events).toHaveLength(2);
  });
  it("rejects counts after intervening stock changes, omitted lots, and expired weekly cycles", async () => {
    const state = await stocked();
    const observed = countInput(state.product, [{ lotId: state.lotId, quantity: 10 }]);
    const added = await state.service.move(receive(state.product, 2), actor);
    await expect(state.service.count(observed, actor)).rejects.toMatchObject({ code: "aborted" });
    await expect(state.service.count({ ...observed, expectedStockRevision: added.product.stockRevision }, actor)).rejects.toMatchObject({ code: "aborted", details: { reason: "inventory-count-lots" } });
    state.time("2026-09-18T00:00:00Z");
    await expect(state.service.count({ ...observed, expectedStockRevision: added.product.stockRevision }, actor)).rejects.toMatchObject({ code: "aborted", details: { reason: "inventory-cycle" } });
  });
  it("acknowledges matching quantities and records a later zero adjustment without deleting its history", async () => {
    const state = await stocked();
    const matched = await state.service.count(countInput(state.product, [{ lotId: state.lotId, quantity: 10 }]), actor);
    expect(matched.product.stockRevision).toBe(state.product.stockRevision);
    expect(matched.event.kind).toBe("count_match");
    await expect(state.service.count(countInput(matched.product, [{ lotId: state.lotId, quantity: 0 }]), actor)).rejects.toMatchObject({ code: "invalid-argument" });
    const adjusted = await state.service.count({ ...countInput(matched.product, [{ lotId: state.lotId, quantity: 0 }]), reason: "실물 재고 없음" }, actor);
    expect(adjusted.product.quantityByLocation.freezer1).toBe(0);
    expect(adjusted.product.nearestExpiryByLocation.freezer1).toBeNull();
    expect(adjusted.event).toMatchObject({ kind: "count_adjust", lines: [{ before: 10, after: 0, delta: -10 }] });
    expect(adjusted.product.lastCountByLocation.freezer1).toMatchObject({ changed: true, stockChangedSinceCount: false });
    expect((await state.service.history(state.product.productId, null)).events.map((event) => event.kind).sort()).toEqual(["count_adjust", "count_match", "receive"]);
  });
  it.each(["receive", "issue", "adjust"] as const)("marks a counted location stale after a later %s without rewriting the count's historical correction", async (kind) => {
    const state = await stocked();
    const counted = await state.service.count(countInput(state.product, [{ lotId: state.lotId, quantity: 10 }]), actor);
    expect(counted.product.lastCountByLocation.freezer1).toMatchObject({ changed: false, stockChangedSinceCount: false });
    state.time("2026-09-12T01:00:00Z");
    const moved = await state.service.move({ requestId: randomUUID(), productId: state.product.productId,
      expectedStockRevision: counted.product.stockRevision, kind, locationId: "freezer1", lotId: state.lotId,
      quantity: kind === "adjust" ? 8 : 2, reason: "확인 후 변동" }, actor);
    expect(moved.product.lastCountByLocation.freezer1).toEqual({ ...counted.product.lastCountByLocation.freezer1, stockChangedSinceCount: true });
    const entry = state.values.get(`${INVENTORY_CYCLE_PATH}/week-2026-09-11/entries/${state.product.productId}-freezer1`)!;
    expect(entry).toMatchObject({ changed: false, stockChangedSinceCount: false, eventId: counted.event.eventId });
    const confirmedAgain = await state.service.count(countInput(moved.product, [{ lotId: state.lotId, quantity: moved.product.quantityByLocation.freezer1 }]), actor);
    expect(confirmedAgain.product.lastCountByLocation.freezer1).toMatchObject({ changed: false, stockChangedSinceCount: false });
  });
  it("invalidates only the changed location, and both counted ends of a transfer", async () => {
    const state = await stocked();
    state.time("2026-09-12T01:00:00Z");
    const sample = await state.service.move({ ...receive(state.product, 5), locationId: "sample" }, actor);
    const sampleLotId = sample.event.lines[0]!.lotId;
    const countedSample = await state.service.count({ ...countInput(sample.product, [{ lotId: sampleLotId, quantity: 5 }]), locationId: "sample" }, actor);
    const counted = await state.service.count(countInput(countedSample.product, [{ lotId: state.lotId, quantity: 10 }]), actor);
    const issued = await state.service.move({ requestId: randomUUID(), productId: state.product.productId,
      expectedStockRevision: counted.product.stockRevision, kind: "issue", locationId: "sample", lotId: sampleLotId, quantity: 2, reason: "샘플 출고" }, actor);
    expect(issued.product.lastCountByLocation.freezer1).toEqual(counted.product.lastCountByLocation.freezer1);
    expect(issued.product.lastCountByLocation.sample).toMatchObject({ stockChangedSinceCount: true });
    const confirmedSample = await state.service.count({ ...countInput(issued.product, [{ lotId: sampleLotId, quantity: 3 }]), locationId: "sample" }, actor);
    const transferred = await state.service.move({ requestId: randomUUID(), productId: state.product.productId,
      expectedStockRevision: confirmedSample.product.stockRevision, kind: "transfer", locationId: "freezer1", toLocationId: "sample",
      lotId: state.lotId, quantity: 1, reason: "샘플 추가" }, actor);
    expect(transferred.product.lastCountByLocation.freezer1).toMatchObject({ stockChangedSinceCount: true });
    expect(transferred.product.lastCountByLocation.sample).toMatchObject({ stockChangedSinceCount: true });
    expect(transferred.product.lastCountByLocation.freezer2).toBeNull();
  });
  it("keeps a count fresh after a no-op quantity adjustment or expiry-only correction", async () => {
    const state = await stocked();
    const counted = await state.service.count(countInput(state.product, [{ lotId: state.lotId, quantity: 10 }]), actor);
    const adjusted = await state.service.move({ requestId: randomUUID(), productId: state.product.productId,
      expectedStockRevision: counted.product.stockRevision, kind: "adjust", locationId: "freezer1", lotId: state.lotId, quantity: 10, reason: "기록 확인" }, actor);
    const corrected = await state.service.updateLot({ requestId: randomUUID(), productId: state.product.productId, lotId: state.lotId,
      expectedStockRevision: adjusted.product.stockRevision, draft: { label: "입고", expiryState: "dated", expiryDate: "2026-09-25" }, reason: "날짜만 정정" }, actor);
    expect(adjusted.product.lastCountByLocation.freezer1).toEqual(counted.product.lastCountByLocation.freezer1);
    expect(corrected.product.lastCountByLocation.freezer1).toEqual(counted.product.lastCountByLocation.freezer1);
  });
  it("preserves both fresh and stale count badges when only product metadata changes", async () => {
    const state = await stocked();
    state.time("2026-09-12T01:00:00Z");
    const counted = await state.service.count({ ...countInput(state.product, [{ lotId: state.lotId, quantity: 9 }]), reason: "실물 재확인" }, actor);
    const edited = await state.service.save({ ...createInput(), productId: state.product.productId,
      expectedRevision: counted.product.revision, draft: { ...draft, name: "만두 이름 정정", note: "보관 참고", urgent: true } }, actor);
    expect(edited.lastCountByLocation).toEqual(counted.product.lastCountByLocation);
    expect(edited.stockRevision).toBe(counted.product.stockRevision);
    const issued = await state.service.move({ requestId: randomUUID(), productId: edited.productId,
      expectedStockRevision: edited.stockRevision, kind: "issue", locationId: "freezer1", lotId: state.lotId, quantity: 1, reason: "납품" }, actor);
    expect(issued.product.lastCountByLocation.freezer1).toMatchObject({ changed: true, stockChangedSinceCount: true });
    const revised = await state.service.save({ ...createInput(), productId: edited.productId,
      expectedRevision: issued.product.revision, draft: { ...draft, manufacturer: "제조사 정정", urgent: false } }, actor);
    expect(revised.lastCountByLocation).toEqual(issued.product.lastCountByLocation);
    expect(revised.stockRevision).toBe(issued.product.stockRevision);
    expect((await state.service.detail(edited.productId, viewer)).product.lastCountByLocation).toEqual(revised.lastCountByLocation);
  });
  it("sets an adjustment target, keeps unit conversions immutable, and preserves remaining stock on deletion", async () => {
    const state = await stocked();
    const adjusted = await state.service.move({ requestId: randomUUID(), productId: state.product.productId, expectedStockRevision: state.product.stockRevision,
      kind: "adjust", locationId: "freezer1", lotId: state.lotId, quantity: 4, reason: "파손 확인" }, actor);
    expect(adjusted.event.lines[0]).toMatchObject({ before: 10, after: 4, delta: -6 });
    await expect(state.service.save({ ...createInput(), productId: state.product.productId, expectedRevision: adjusted.product.revision, draft: { ...draft, unitsPerBox: 10 } }, actor)).rejects.toMatchObject({ code: "failed-precondition" });
    const lotPath = `${INVENTORY_PRODUCT_PATH}/${state.product.productId}/lots/${state.lotId}`;
    const beforeLot = state.values.get(lotPath);
    const removed = await state.service.status({ requestId: randomUUID(), productId: state.product.productId,
      expectedRevision: adjusted.product.revision, reason: "단종" }, actor, true);
    expect(removed).toMatchObject({ status: "deleted", hasHistory: true, stockRevision: adjusted.product.stockRevision,
      quantityByLocation: adjusted.product.quantityByLocation, nearestExpiryByLocation: adjusted.product.nearestExpiryByLocation });
    expect(state.values.get(lotPath)).toEqual(beforeLot);
    expect((await state.service.list(null)).products).toHaveLength(0);
    expect((await state.service.history(removed.productId, null)).events).toHaveLength(2);
    expect(state.values.has(`${INVENTORY_PRODUCT_PATH}/${removed.productId}`)).toBe(true);
    await expect(state.service.move({ requestId: randomUUID(), productId: removed.productId,
      expectedStockRevision: removed.stockRevision, kind: "issue", locationId: "freezer1", lotId: state.lotId,
      quantity: 1, reason: "삭제 뒤 출고" }, actor)).rejects.toMatchObject({ code: "failed-precondition" });
  });
  it("keeps zero-stock count history and its photo reference when an employee deletes the product", async () => {
    const state = fixture(); const uploadId = stagePhoto(state);
    const product = await state.service.save({ ...createInput(), photoChange: { action: "replace", uploadId } }, actor);
    const counted = await state.service.count(countInput(product), actor);
    expect(counted.product).toMatchObject({ hasHistory: true, quantityByLocation: { freezer1: 0 } });
    const photoBefore = state.values.get(`inventoryPhotoUploads/${uploadId}`);
    const removed = await state.service.status({ requestId: randomUUID(), productId: product.productId,
      expectedRevision: counted.product.revision, reason: "빈 품목 정리" }, actor, true);
    expect(removed).toMatchObject({ status: "deleted", hasHistory: true, photo: counted.product.photo,
      lastCountByLocation: counted.product.lastCountByLocation });
    expect(state.values.get(`inventoryPhotoUploads/${uploadId}`)).toEqual(photoBefore);
    expect(photoBefore).toMatchObject({ state: "attached", productId: product.productId });
    expect((await state.service.history(product.productId, null)).events).toHaveLength(1);
    await expect(state.service.detail(product.productId, viewer)).rejects.toMatchObject({ code: "not-found" });
  });
  it("lets delivery and sales employees change lifecycle status while preserving positive stock, lots and trusted audit snapshots", async () => {
    const state = await stocked();
    const beforeLots = (await state.service.detail(state.product.productId, actor)).lots;
    const deactivate = { requestId: randomUUID(), productId: state.product.productId, expectedRevision: state.product.revision,
      status: "inactive" as const, reason: "시즌 종료", refreshOnReplay: true };
    const inactive = await state.service.status(deactivate, actor);
    expect(inactive).toMatchObject({ status: "inactive", quantityByLocation: state.product.quantityByLocation,
      stockRevision: state.product.stockRevision, hasHistory: true });
    expect((await state.service.detail(inactive.productId, viewer)).lots).toEqual(beforeLots);
    await expect(state.service.move(receive(inactive), actor)).rejects.toMatchObject({ code: "failed-precondition" });
    const active = await state.service.status({ ...deactivate, requestId: randomUUID(), expectedRevision: inactive.revision,
      status: "active", reason: "판매 재개" }, sales);
    expect(active.quantityByLocation).toEqual(state.product.quantityByLocation);
    const deletion = { requestId: randomUUID(), productId: active.productId, expectedRevision: active.revision, reason: "중복 품목 정리", refreshOnReplay: true };
    const deleted = await state.service.status(deletion, sales, true);
    expect(deleted).toMatchObject({ status: "deleted", hasHistory: true, quantityByLocation: state.product.quantityByLocation });
    expect(state.values.get(`auditLogs/inventory-${deactivate.requestId}`)).toMatchObject({
      actorUid: actor.uid, actorEmployeeId: actor.employeeId, changeReason: "시즌 종료",
      inventoryStatusChange: { productName: state.product.name, unitLabel: state.product.unitLabel,
        before: { status: "active", quantityByLocation: state.product.quantityByLocation },
        after: { status: "inactive", quantityByLocation: state.product.quantityByLocation } },
    });
    expect(state.values.get(`auditLogs/inventory-${deletion.requestId}`)).toMatchObject({
      eventType: "INVENTORY_PRODUCT_DELETED", actorUid: sales.uid, actorEmployeeId: sales.employeeId,
      inventoryStatusChange: { productName: state.product.name, unitLabel: state.product.unitLabel,
        before: { status: "active", quantityByLocation: state.product.quantityByLocation },
        after: { status: "deleted", quantityByLocation: state.product.quantityByLocation } },
    });
    const beforeReplay = new Map(state.values);
    expect(await state.service.status(deletion, sales, true)).toEqual(deleted);
    expect(state.values).toEqual(beforeReplay);
    expect((await state.service.history(deleted.productId, null)).events).toHaveLength(1);
    await expect(state.service.status({ ...deactivate, requestId: randomUUID(), expectedRevision: deleted.revision, status: "active" }, actor)).rejects.toMatchObject({ code: "failed-precondition" });
    await expect(state.service.count(countInput(deleted, [{ lotId: state.lotId, quantity: 10 }]), actor)).rejects.toMatchObject({ code: "failed-precondition" });
    await expect(state.service.status(deletion, viewer, true)).rejects.toMatchObject({ code: "permission-denied" });
    state.values.get(`authz/${sales.uid}`)!.active = false;
    await expect(state.service.status(deletion, sales, true)).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("records expiry edits automatically with a blank reason and rejects forged audit fields at the boundary", async () => {
    const state = await stocked();
    const input = { requestId: randomUUID(), productId: state.product.productId, lotId: state.lotId,
      expectedStockRevision: state.product.stockRevision, draft: { label: "정정 묶음", expiryState: "dated" as const, expiryDate: "2027-01-31" },
      reason: "", includeDetail: true };
    expect(updateInventoryLotInputSchema.parse(input)).toEqual(input);
    const changed = await state.service.updateLot(input, actor);
    const before = { label: "입고", expiryState: "dated", expiryDate: "2026-10-01" };
    expect(changed.event).toMatchObject({ kind: "lot_update", reason: "", actorEmployeeId: actor.employeeId,
      createdAt: initialNow.toISOString(), lotMetadataChange: { before, after: input.draft } });
    expect(state.values.get(`auditLogs/inventory-${input.requestId}`)).toMatchObject({ actorEmployeeId: actor.employeeId,
      actorUid: actor.uid, changeReason: null, inventoryLotChange: { productName: state.product.name, unitLabel: state.product.unitLabel,
        originLotId: changed.event.lotMetadataChange!.originLotId, before, after: input.draft } });
    expect(changed.product.quantityByLocation).toEqual(state.product.quantityByLocation);
    expect((await state.service.updateLot(input, actor)).replayed).toBe(true);
    expect((await state.service.history(state.product.productId, null)).events).toHaveLength(2);
    const status = { requestId: randomUUID(), productId: state.product.productId, expectedRevision: changed.product.revision, status: "inactive", reason: "" };
    expect(setInventoryProductStatusInputSchema.safeParse({ ...status, actorUid: "forged" }).success).toBe(false);
    expect(setInventoryProductStatusInputSchema.safeParse({ ...status, inventoryStatusChange: {} }).success).toBe(false);
    expect(deleteInventoryProductInputSchema.safeParse({ requestId: randomUUID(), productId: state.product.productId,
      expectedRevision: changed.product.revision, reason: "정리", productName: "다른 이름" }).success).toBe(false);
    expect(updateInventoryLotInputSchema.safeParse({ ...input, inventoryLotChange: {} }).success).toBe(false);
    expect(updateInventoryLotInputSchema.safeParse({ ...input, reason: "x".repeat(2001) }).success).toBe(false);
  });
  it("rolls back a lifecycle transition if its append-only audit cannot be committed", async () => {
    const state = await stocked();
    const input = { requestId: randomUUID(), productId: state.product.productId, expectedRevision: state.product.revision,
      reason: "중복 정리" };
    state.values.set(`auditLogs/inventory-${input.requestId}`, { occupied: true });
    const before = new Map(state.values);
    await expect(state.service.status(input, actor, true)).rejects.toThrow("Duplicate create");
    expect(state.values).toEqual(before);
    expect((await state.service.detail(state.product.productId, actor)).product).toEqual(state.product);
    expect(state.values.has(`companies/onnuri/inventoryRequests/${input.requestId}`)).toBe(false);
  });
  it.each([false, true])("preserves the complete 2000-character lifecycle reason and trusted employee in the audit (delete=%s)", async (deleted) => {
    const state = await stocked();
    const reason = `${"가".repeat(1_994)}\n끝까지보존`;
    expect(reason).toHaveLength(2_000);
    const input = { requestId: randomUUID(), productId: state.product.productId, expectedRevision: state.product.revision,
      reason, refreshOnReplay: true, ...(deleted ? {} : { status: "inactive" as const }) };
    const result = await state.service.status(input, actor, deleted);
    const audit = state.values.get(`auditLogs/inventory-${input.requestId}`)!;
    expect(audit).toMatchObject({ changeReason: reason, actorUid: actor.uid, actorEmployeeId: actor.employeeId });
    expect((audit.changeReason as string).endsWith("\n끝까지보존")).toBe(true);
    const beforeReplay = new Map(state.values);
    expect(await state.service.status(input, actor, deleted)).toEqual(result);
    expect(state.values).toEqual(beforeReplay);
  });
  it("rejects an oversized internal audit reason rather than silently truncating or partly committing it", async () => {
    const state = await stocked(); const before = new Map(state.values);
    await expect(state.service.status({ requestId: randomUUID(), productId: state.product.productId,
      expectedRevision: state.product.revision, reason: "가".repeat(2_001) }, actor, true)).rejects.toBeDefined();
    expect(state.values).toEqual(before);
  });
  it("keeps already committed legacy deletion receipts replayable after the lifecycle permission update", async () => {
    const state = fixture(); const product = await state.service.save(createInput(), actor);
    const input = { requestId: randomUUID(), productId: product.productId, expectedRevision: product.revision, reason: "중복 등록" };
    const removed = await state.service.status(input, admin, true);
    // Model a tombstone/receipt committed by the previous server, which allowed
    // deletion after historical stock had been exhausted. Never rewrite it.
    const historical = { ...removed, hasHistory: true };
    state.values.set(`${INVENTORY_PRODUCT_PATH}/${product.productId}`, { ...state.values.get(`${INVENTORY_PRODUCT_PATH}/${product.productId}`)!, hasHistory: true });
    state.values.get(`companies/onnuri/inventoryRequests/${input.requestId}`)!.result = historical;
    const before = new Map(state.values);
    expect(await state.service.status(input, admin, true)).toEqual(historical);
    expect(await state.service.status({ ...input, refreshOnReplay: true }, admin, true)).toEqual(historical);
    expect(state.values).toEqual(before);
  });
  it("rejects a first stock entry calculated using units changed while its form was open", async () => {
    const state = fixture();
    const product = await state.service.save(createInput(), actor);
    // A colleague changes an unused product from 8 units/box to 12 units/box
    // after another employee has already calculated their first receipt.
    const obsoleteReceipt = receive(product, 8);
    const updated = await state.service.save({ ...createInput(), productId: product.productId,
      expectedRevision: product.revision, draft: { ...draft, unitsPerBox: 12 } }, actor);
    await expect(state.service.move(obsoleteReceipt, actor)).rejects.toMatchObject({ code: "aborted" });
    expect((await state.service.detail(product.productId, actor)).product.quantityByLocation.freezer1).toBe(0);
    const received = await state.service.move(receive(updated, inventoryQuantityFromPackages(1, 0, updated.unitsPerBox)), actor);
    expect(received.product.quantityByLocation.freezer1).toBe(12);
  });
  it("propagates a corrected expiration date across both locations of the same transferred batch", async () => {
    const state = await stocked();
    const moved = await state.service.move({ requestId: randomUUID(), productId: state.product.productId, expectedStockRevision: state.product.stockRevision,
      kind: "transfer", locationId: "freezer1", toLocationId: "sample", lotId: state.lotId, quantity: 2, reason: "샘플" }, actor);
    const corrected = await state.service.updateLot({ requestId: randomUUID(), productId: state.product.productId, lotId: state.lotId,
      expectedStockRevision: moved.product.stockRevision, draft: { label: "정정", expiryState: "dated", expiryDate: "2026-09-25" }, reason: "인쇄된 날짜 재확인" }, actor);
    expect(corrected.product.nearestExpiryByLocation).toMatchObject({ freezer1: "2026-09-25", sample: "2026-09-25" });
    expect(corrected.product.quantityByLocation).toEqual(moved.product.quantityByLocation);
    expect((await state.service.detail(state.product.productId, actor)).lots.every((lot) => lot.expiryDate === "2026-09-25")).toBe(true);
  });
  it("allows viewer reads but denies viewer writes, staff settings changes, and revoked replay requests", async () => {
    const state = fixture(); const input = createInput(); const product = await state.service.save(input, actor);
    expect((await state.service.detail(product.productId, viewer)).product.productId).toBe(product.productId);
    await expect(state.service.save(createInput(), viewer)).rejects.toMatchObject({ code: "permission-denied" });
    await expect(state.service.status({ requestId: randomUUID(), productId: product.productId, expectedRevision: product.revision, status: "inactive", reason: "" }, viewer)).rejects.toMatchObject({ code: "permission-denied" });
    await expect(state.service.updateSettings({ requestId: randomUUID(), expectedRevision: 0, weekday: 2, urgentDays: 10 }, actor)).rejects.toMatchObject({ code: "permission-denied" });
    state.values.get(`employees/${actor.employeeId}`)!.roleScopes = ["viewer"];
    await expect(state.service.save(input, actor)).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("rechecks disabled employees and permission/session versions inside every mutation", async () => {
    for (const [path, change] of [
      [`authz/${actor.uid}`, { active: false }], [`authz/${actor.uid}`, { permissionsVersion: 2 }],
      [`authz/${actor.uid}`, { sessionVersion: 2 }], [`employees/${actor.employeeId}`, { status: "disabled" }],
      [`employees/${actor.employeeId}`, { firebaseUid: "other" }],
    ] as Array<[string, RecordValue]>) {
      const state = fixture(); Object.assign(state.values.get(path)!, change);
      await expect(state.service.save(createInput(), actor)).rejects.toMatchObject({ code: "permission-denied" });
      expect([...state.values.keys()].some((key) => key.startsWith("companies/"))).toBe(false);
    }
  });
  it("changes count settings with administrator revision checks and records an audit event", async () => {
    const state = fixture();
    const updated = await state.service.updateSettings({ requestId: randomUUID(), expectedRevision: 0, weekday: 1, urgentDays: 14 }, admin);
    expect(updated).toMatchObject({ revision: 1, pendingWeekday: 1, effectiveDate: "2026-09-21", urgentDays: 14 });
    expect(state.values.get(INVENTORY_SETTINGS_PATH)?.updatedAt).toBeInstanceOf(Timestamp);
    await expect(state.service.updateSettings({ requestId: randomUUID(), expectedRevision: 0, weekday: 2, urgentDays: 3 }, admin)).rejects.toMatchObject({ code: "aborted" });
    expect((await state.service.context()).cycle.cycleId).toBe("week-2026-09-11");
  });
});
