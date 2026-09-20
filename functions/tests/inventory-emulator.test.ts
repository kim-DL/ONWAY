import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { InventoryActor } from "../src/inventory/inventory-authorization.js";
import { INVENTORY_PRODUCT_PATH, inventoryProductDraftSchema, type InventoryMovementInput, type SaveInventoryProductInput } from "../src/inventory/inventory-contract.js";
import {
  INVENTORY_MANUFACTURER_NAME_PATH, INVENTORY_MANUFACTURER_PATH, type SaveInventoryProductWithManufacturerInput,
} from "../src/inventory/inventory-manufacturer-contract.js";
import { InventoryManufacturerService } from "../src/inventory/inventory-manufacturer-service.js";
import { InventoryService } from "../src/inventory/inventory-service.js";
import { backfillInventoryLotSummary } from "../../scripts/backfill-inventory-lot-summary.js";

// Opt-in only. The hard host/project boundary below runs before creating any
// client, so an accidentally inherited production credential cannot be used.
const enabled = process.env.INVENTORY_EMULATOR_TESTS === "true";
const projectId = `demo-inventory-${randomUUID().slice(0, 8)}`;
const member: InventoryActor = { uid: "inventory-emulator-staff", employeeId: "INV-STAFF", roleScopes: ["delivery"], isAdmin: false, sessionVersion: 1, permissionsVersion: 1 };
const admin: InventoryActor = { ...member, uid: "inventory-emulator-admin", employeeId: "INV-ADMIN", roleScopes: ["admin"], isAdmin: true };
const viewer: InventoryActor = { ...member, uid: "inventory-emulator-viewer", employeeId: "INV-VIEWER", roleScopes: ["viewer"] };
let app: App;
let db: Firestore;
let environment: RulesTestEnvironment;
let service: InventoryService;
let manufacturerService: InventoryManufacturerService;

describe.skipIf(!enabled)("inventory isolated Firestore emulator integration", () => {
  beforeAll(async () => {
    const host = process.env.FIRESTORE_EMULATOR_HOST ?? "";
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host) || !projectId.startsWith("demo-")) {
      throw new Error("Inventory integration tests require a loopback Firestore emulator and an isolated demo project.");
    }
    app = initializeApp({ projectId }, projectId);
    db = getFirestore(app);
    service = new InventoryService(db, () => new Date("2026-09-11T01:00:00Z"));
    manufacturerService = new InventoryManufacturerService(db, () => new Date("2026-09-11T01:00:00Z"));
    const [hostname, port] = host.split(":");
    environment = await initializeTestEnvironment({ projectId, firestore: { host: hostname!, port: Number(port), rules: readFileSync("firestore.rules", "utf8") } });
    for (const actor of [member, admin, viewer]) {
      await db.doc(`authz/${actor.uid}`).create({ employeeId: actor.employeeId, active: true, sessionVersion: 1, permissionsVersion: 1 });
      await db.doc(`employees/${actor.employeeId}`).create({ employeeId: actor.employeeId, firebaseUid: actor.uid, status: "active", roleScopes: actor.roleScopes });
    }
  }, 30_000);
  afterAll(async () => {
    await environment?.cleanup();
    await db?.terminate();
    if (app) await deleteApp(app);
    // Do not clear/import/delete emulator datasets. Every run has its own
    // randomly named demo project, preserving any existing test data.
  });

  it("atomically confirms individual scheduled-day lots, rejects changed match-only counts, and safely backfills a concurrent legacy summary", async () => {
    const input: SaveInventoryProductInput = { requestId: randomUUID(), productId: null, expectedRevision: null,
      draft: inventoryProductDraftSchema.parse({ name: "날짜별 확인 통합검증", unitLabel: "봉", unitsPerBox: 8,
        defaultLocationId: "freezer1", manufacturer: "", specification: "", origin: "", note: "", urgent: false }),
      initialStock: { quantity: 9, lot: { label: "첫 날짜", expiryState: "dated", expiryDate: "2027-01-01" } } };
    const first = await service.save(input, member);
    const lotId = `${first.productId}-freezer1`;
    const second = await service.move({ requestId: randomUUID(), productId: first.productId, expectedStockRevision: first.stockRevision,
      kind: "receive", locationId: "freezer1", lotId: null, quantity: 3, reason: "", includeDetail: true,
      newLot: { label: "다음 날짜", expiryState: "dated", expiryDate: "2027-02-01" } }, member);
    expect(second.product.lastCountByLocation.freezer1).toBeNull();
    const adjusted = await service.move({ requestId: randomUUID(), productId: first.productId, expectedStockRevision: second.product.stockRevision,
      kind: "adjust", locationId: "freezer1", lotId, quantity: 9, reason: "", includeDetail: true }, member);
    expect(adjusted.product.lastCountByLocation.freezer1).toMatchObject({ cycleId: "week-2026-09-11", stockChangedSinceCount: false });
    const count = { requestId: randomUUID(), productId: first.productId, expectedStockRevision: adjusted.product.stockRevision,
      locationId: "freezer1" as const, cycleId: "week-2026-09-11", matchOnly: true, reason: "",
      counts: adjusted.detail!.lots.map((lot) => ({ lotId: lot.lotId, quantity: lot.quantity })) };
    await expect(service.count({ ...count, counts: count.counts.map((lot) => ({ ...lot, quantity: lot.quantity + 1 })) }, member)).rejects.toMatchObject({ code: "aborted" });
    expect((await db.doc(`companies/onnuri/inventoryRequests/${count.requestId}`).get()).exists).toBe(false);
    const matched = await service.count(count, member);
    expect(matched.event.kind).toBe("count_match");
    expect(matched.product.stockRevision).toBe(adjusted.product.stockRevision);
    const ref = db.doc(`${INVENTORY_PRODUCT_PATH}/${first.productId}`);
    await ref.update({ lotSummary: FieldValue.delete() });
    const before = (await ref.get()).data()!;
    const dryRun = await backfillInventoryLotSummary(db, { apply: false, maxProducts: 100 });
    expect(dryRun.results.find((item) => item.productId === first.productId)?.status).toBe("would-update");
    expect((await ref.get()).data()).toEqual(before);
    const [backfill, moved] = await Promise.all([
      backfillInventoryLotSummary(db, { apply: true, maxProducts: 100 }),
      service.move({ requestId: randomUUID(), productId: first.productId, expectedStockRevision: matched.product.stockRevision,
        kind: "transfer", locationId: "freezer1", toLocationId: "sample", lotId, quantity: 1, reason: "" }, member),
    ]);
    expect(["updated", "already-summarized"]).toContain(backfill.results.find((item) => item.productId === first.productId)?.status);
    const detail = await service.detail(first.productId, member);
    expect(detail.product.lotSummary).toEqual(moved.product.lotSummary);
    expect(detail.product.lotSummary?.all).toEqual({ lotCount: 3, expiryCount: 2 });
    expect(detail.product.quantityByLocation).toMatchObject({ freezer1: 11, sample: 1 });
    expect((await ref.get()).data()!.stockRevision).toBe(moved.product.stockRevision);
    expect(detail.product).not.toHaveProperty("inspectionByLot");
  }, 40_000);

  it("atomically registers the product, first expiry stock, photo claim and a single receipt under concurrent retries", async () => {
    const requestId = randomUUID(); const uploadId = randomUUID();
    const now = new Date("2026-09-11T01:00:00Z");
    await db.doc(`inventoryPhotoUploads/${uploadId}`).create({ uploadId, actorUid: member.uid, actorEmployeeId: member.employeeId,
      inputHash: "a".repeat(64), contentType: "image/jpeg", state: "uploaded", width: 1280, height: 960,
      createdAt: Timestamp.fromDate(now), expiresAt: Timestamp.fromMillis(now.valueOf() + 86_400_000) });
    const input: SaveInventoryProductInput = { requestId, productId: null, expectedRevision: null,
      draft: inventoryProductDraftSchema.parse({ name: "한 번 등록 통합검증", unitLabel: "봉", unitsPerBox: 8,
        defaultLocationId: "refrigerated", manufacturer: "온누리", specification: "1kg", origin: "대한민국", note: "", urgent: false }),
      photoChange: { action: "replace", uploadId },
      initialStock: { quantity: 19, lot: { label: "", expiryState: "dated", expiryDate: "2026-12-20" } } };
    const [first, retry] = await Promise.all([service.save(input, member), service.save(input, member)]);
    expect(first).toEqual(retry);
    expect(first).toMatchObject({ revision: 1, stockRevision: 1, hasHistory: true,
      quantityByLocation: { refrigerated: 19 }, nearestExpiryByLocation: { refrigerated: "2026-12-20" },
      photo: { photoId: uploadId, width: 1280, height: 960 } });
    const detail = await service.detail(first.productId, member);
    expect(detail.product).toEqual(first);
    expect(detail.lots).toHaveLength(1);
    expect(detail.lots[0]).toMatchObject({ lotId: `${requestId}-refrigerated`, originLotId: requestId, quantity: 19 });
    const events = await service.history(first.productId, null);
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({ eventId: requestId, kind: "receive", stockRevision: 1,
      lines: [{ locationId: "refrigerated", before: 0, after: 19, delta: 19 }] });
    const stage = (await db.doc(`inventoryPhotoUploads/${uploadId}`).get()).data()!;
    expect(stage).toMatchObject({ state: "attached", productId: requestId, attachedRequestId: requestId });
    expect(stage).not.toHaveProperty("expiresAt");
    expect((await db.doc(`auditLogs/inventory-${requestId}`).get()).data()).toMatchObject({ eventType: "INVENTORY_PRODUCT_CREATED",
      changedFields: expect.arrayContaining(["photo", "quantity", "lots"]) });
    const receipt = (await db.doc(`companies/onnuri/inventoryRequests/${requestId}`).get()).data()!;
    expect(receipt).toMatchObject({ operation: "saveInventoryProduct", result: first });
    expect(receipt).not.toHaveProperty("expiresAt");
    await expect(service.save({ ...input, initialStock: { ...input.initialStock!, quantity: 20 } }, member)).rejects.toMatchObject({ code: "already-exists" });
    await expect(service.save({ ...input, requestId: randomUUID(), productId: requestId, expectedRevision: first.revision }, member)).rejects.toMatchObject({ code: "invalid-argument" });
    const moved = await service.move({ requestId: randomUUID(), productId: requestId, expectedStockRevision: first.stockRevision,
      kind: "transfer", locationId: "refrigerated", toLocationId: "sample", lotId: detail.lots[0]!.lotId, quantity: 3, reason: "샘플 분리" }, member);
    expect(moved.product.quantityByLocation).toMatchObject({ refrigerated: 16, sample: 3 });
    // A delayed retry returns the original receipt, but cannot overwrite later stock.
    expect(await service.save(input, member)).toEqual(first);
    expect((await service.detail(requestId, member)).product.quantityByLocation).toMatchObject({ refrigerated: 16, sample: 3 });
  }, 30_000);

  it("rolls back product, first lot, photo claim and receipt together if an event write precondition fails", async () => {
    const requestId = randomUUID(); const uploadId = randomUUID();
    const now = new Date("2026-09-11T01:00:00Z");
    await db.doc(`inventoryPhotoUploads/${uploadId}`).create({ uploadId, actorUid: member.uid, actorEmployeeId: member.employeeId,
      inputHash: "b".repeat(64), contentType: "image/jpeg", state: "uploaded", width: 1280, height: 960,
      createdAt: Timestamp.fromDate(now), expiresAt: Timestamp.fromMillis(now.valueOf() + 86_400_000) });
    // Deliberately occupy only the final append-only event document in this
    // isolated demo project; Firestore must reject the entire transaction.
    await db.doc(`${INVENTORY_PRODUCT_PATH}/${requestId}/events/${requestId}`).create({ occupied: true });
    const input: SaveInventoryProductInput = { requestId, productId: null, expectedRevision: null,
      draft: inventoryProductDraftSchema.parse({ name: "등록 롤백 통합검증", unitLabel: "봉", unitsPerBox: 8,
        defaultLocationId: "freezer1", manufacturer: "", specification: "", origin: "", note: "", urgent: false }),
      photoChange: { action: "replace", uploadId }, initialStock: { quantity: 19, lot: { label: "", expiryState: "unknown", expiryDate: null } } };
    await expect(service.save(input, member)).rejects.toBeDefined();
    expect((await db.doc(`${INVENTORY_PRODUCT_PATH}/${requestId}`).get()).exists).toBe(false);
    expect((await db.doc(`${INVENTORY_PRODUCT_PATH}/${requestId}/lots/${requestId}-freezer1`).get()).exists).toBe(false);
    expect((await db.doc(`companies/onnuri/inventoryRequests/${requestId}`).get()).exists).toBe(false);
    expect((await db.doc(`auditLogs/inventory-${requestId}`).get()).exists).toBe(false);
    const stage = (await db.doc(`inventoryPhotoUploads/${uploadId}`).get()).data()!;
    expect(stage).toMatchObject({ state: "uploaded" });
    expect(stage).toHaveProperty("expiresAt");
    expect(stage).not.toHaveProperty("productId");
  }, 30_000);

  it("commits lots, competing withdrawals, counts, expiry correction, transfer and permanent retry receipts", async () => {
    const draft = inventoryProductDraftSchema.parse({ name: "통합검증 만두", manufacturer: "온누리", specification: "8봉/박스", origin: "대한민국",
      unitLabel: "봉", unitsPerBox: 8, defaultLocationId: "freezer1", note: "", urgent: false });
    const product = await service.save({ requestId: randomUUID(), productId: null, expectedRevision: null, draft }, member);
    const request: InventoryMovementInput = { requestId: randomUUID(), productId: product.productId, expectedStockRevision: 0,
      kind: "receive", locationId: "freezer1", lotId: null, quantity: 10, reason: "입고",
      newLot: { label: "A", expiryState: "dated", expiryDate: "2026-10-01" } };
    const received = await service.move(request, member);
    expect((await service.move(request, member)).replayed).toBe(true);
    const lotId = received.event.lines[0]!.lotId;
    const withdrawal = { requestId: randomUUID(), productId: product.productId, expectedStockRevision: received.product.stockRevision,
      kind: "issue" as const, locationId: "freezer1" as const, lotId, quantity: 7, reason: "동시 출고" };
    const competing = await Promise.allSettled([service.move(withdrawal, member), service.move({ ...withdrawal, requestId: randomUUID() }, admin)]);
    expect(competing.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(competing.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "aborted" } });
    const detail = await service.detail(product.productId, member);
    expect(detail.product.quantityByLocation.freezer1).toBe(3);
    await expect(service.count({ requestId: randomUUID(), productId: product.productId, locationId: "freezer1", cycleId: "week-2026-09-11",
      expectedStockRevision: received.product.stockRevision, counts: [{ lotId, quantity: 10 }], reason: "" }, member)).rejects.toMatchObject({ code: "aborted" });
    const confirmed = await service.count({ requestId: randomUUID(), productId: product.productId, locationId: "freezer1", cycleId: "week-2026-09-11",
      expectedStockRevision: detail.product.stockRevision, counts: [{ lotId, quantity: 3 }], reason: "" }, member);
    expect(confirmed.event.kind).toBe("count_match");
    const moved = await service.move({ requestId: randomUUID(), productId: product.productId, expectedStockRevision: confirmed.product.stockRevision,
      kind: "transfer", locationId: "freezer1", toLocationId: "sample", lotId, quantity: 1, reason: "샘플 분리" }, member);
    expect(moved.product.quantityByLocation).toMatchObject({ freezer1: 2, sample: 1 });
    const corrected = await service.updateLot({ requestId: randomUUID(), productId: product.productId, lotId, expectedStockRevision: moved.product.stockRevision,
      draft: { label: "A", expiryState: "dated", expiryDate: "2026-09-25" }, reason: "표기일 정정" }, member);
    expect(corrected.product.nearestExpiryByLocation).toMatchObject({ freezer1: "2026-09-25", sample: "2026-09-25" });
    expect((await service.history(product.productId, null)).events).toHaveLength(5);
    await db.doc(`authz/${member.uid}`).update({ sessionVersion: 2 });
    await expect(service.move(request, member)).rejects.toMatchObject({ code: "permission-denied" });
    await db.doc(`authz/${member.uid}`).update({ sessionVersion: 1 });
  }, 40_000);

  it("serializes exact manufacturer duplicates and preserves canonical snapshots after deactivation", async () => {
    const firstInput = { requestId: randomUUID(), name: "온누리 식품(주)" };
    const secondInput = { requestId: randomUUID(), name: "온누리-식품 주" };
    const results = await Promise.allSettled([
      manufacturerService.create(firstInput, member), manufacturerService.create(secondInput, member),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    const successful = results.find((result) => result.status === "fulfilled");
    if (!successful || successful.status !== "fulfilled") throw new Error("One manufacturer create must succeed.");
    const manufacturer = successful.value;
    const listed = await manufacturerService.list();
    expect(listed).toEqual([manufacturer]);
    expect((await db.doc(`auditLogs/inventory-${manufacturer.manufacturerId}`).get()).data()).toMatchObject({
      eventType: "INVENTORY_MANUFACTURER_CREATED", targetType: "inventoryManufacturer", targetId: manufacturer.manufacturerId,
    });

    const productInput: SaveInventoryProductWithManufacturerInput = { requestId: randomUUID(), productId: null, expectedRevision: null,
      draft: { ...inventoryProductDraftSchema.parse({ name: "제조사 연결 통합검증", unitLabel: "봉", unitsPerBox: 8,
        defaultLocationId: "freezer1", manufacturer: "직원 오타", specification: "1kg", origin: "대한민국", note: "", urgent: false }),
        manufacturerId: manufacturer.manufacturerId } };
    const product = await service.save(productInput, member);
    expect(product).toMatchObject({ manufacturerId: manufacturer.manufacturerId, manufacturer: manufacturer.name });
    const inactive = await manufacturerService.update({ requestId: randomUUID(), manufacturerId: manufacturer.manufacturerId,
      expectedRevision: manufacturer.revision, active: false }, admin);
    expect(inactive.active).toBe(false);
    const preserved = await service.save({ requestId: randomUUID(), productId: product.productId, expectedRevision: product.revision,
      draft: { ...productInput.draft, manufacturerId: undefined, name: "비활성 기존 연결 표시" } }, member);
    expect(preserved).toMatchObject({ manufacturerId: manufacturer.manufacturerId, manufacturer: manufacturer.name });
    const rejectedId = randomUUID();
    await expect(service.save({ ...productInput, requestId: rejectedId, draft: { ...productInput.draft, name: "비활성 신규 연결" } }, member))
      .rejects.toMatchObject({ code: "failed-precondition", details: { reason: "inventory-manufacturer-inactive" } });
    expect((await db.doc(`${INVENTORY_PRODUCT_PATH}/${rejectedId}`).get()).exists).toBe(false);
  }, 40_000);

  it("keeps all inventory documents behind Callables for both anonymous and authenticated clients", async () => {
    const unauthenticated = environment.unauthenticatedContext().firestore();
    const authenticated = environment.authenticatedContext(member.uid, { employeeId: member.employeeId, roleScopes: member.roleScopes,
      sessionVersion: 1, permissionsVersion: 1 }).firestore();
    for (const client of [unauthenticated, authenticated]) {
      await assertFails(getDoc(doc(client, `${INVENTORY_PRODUCT_PATH}/arbitrary`)));
      await assertFails(setDoc(doc(client, `${INVENTORY_PRODUCT_PATH}/arbitrary`), { quantity: 1 }));
      await assertFails(getDoc(doc(client, `${INVENTORY_MANUFACTURER_PATH}/arbitrary`)));
      await assertFails(setDoc(doc(client, `${INVENTORY_MANUFACTURER_PATH}/arbitrary`), { name: "직접 쓰기" }));
      await assertFails(getDoc(doc(client, `${INVENTORY_MANUFACTURER_NAME_PATH}/arbitrary`)));
      await assertFails(setDoc(doc(client, `${INVENTORY_MANUFACTURER_NAME_PATH}/arbitrary`), { active: true }));
      await assertFails(getDoc(doc(client, "companies/onnuri/inventoryRequests/arbitrary")));
      await assertFails(getDoc(doc(client, "inventoryPhotoUploads/arbitrary")));
    }
  }, 20_000);

  it("returns the transaction's confirmed active lots without a stale working set on delayed retries", async () => {
    const draft = inventoryProductDraftSchema.parse({ name: "저장 응답 통합검증", unitLabel: "봉", unitsPerBox: 8,
      defaultLocationId: "freezer1", manufacturer: "", specification: "", origin: "", note: "", urgent: false });
    const product = await service.save({ requestId: randomUUID(), productId: null, expectedRevision: null, draft,
      initialStock: { quantity: 10, lot: { label: "A", expiryState: "dated", expiryDate: "2026-12-20" } } }, member);
    const before = await service.detail(product.productId, member);
    const lotId = before.lots[0]!.lotId;
    const count = { requestId: randomUUID(), productId: product.productId, locationId: "freezer1" as const,
      cycleId: "week-2026-09-11", expectedStockRevision: product.stockRevision,
      counts: [{ lotId, quantity: 9 }], reason: "실물 수량 확인", includeDetail: true };
    const confirmed = await service.count(count, member);
    expect(confirmed.detail).toEqual(await service.detail(product.productId, member));
    expect(confirmed.detail!.lots[0]).toMatchObject({ lotId, quantity: 9, revision: 2 });
    expect(confirmed.detail!.product.lastCountByLocation.freezer1).toMatchObject({ changed: true, stockChangedSinceCount: false });
    const transfer = await service.move({ requestId: randomUUID(), productId: product.productId,
      expectedStockRevision: confirmed.product.stockRevision, kind: "transfer", locationId: "freezer1", toLocationId: "sample",
      lotId, quantity: 3, reason: "샘플 분리", includeDetail: true }, member);
    expect(transfer.detail).toEqual(await service.detail(product.productId, member));
    expect(transfer.detail!.lots.map((lot) => lot.quantity)).toEqual([6, 3]);
    const corrected = await service.updateLot({ requestId: randomUUID(), productId: product.productId,
      expectedStockRevision: transfer.product.stockRevision, lotId, draft: { label: "A 확인", expiryState: "dated", expiryDate: "2026-11-20" },
      reason: "표기 정정", includeDetail: true }, member);
    expect(corrected.detail).toEqual(await service.detail(product.productId, member));
    expect(corrected.detail!.lots.every((lot) => lot.expiryDate === "2026-11-20")).toBe(true);
    const replay = await service.count({ ...count, includeDetail: false }, member);
    expect(replay).toEqual({ product: confirmed.product, event: confirmed.event, replayed: true });
    const receipt = (await db.doc(`companies/onnuri/inventoryRequests/${count.requestId}`).get()).data()!;
    expect(receipt.result).not.toHaveProperty("detail");
    expect((await service.detail(product.productId, member)).product).toEqual(corrected.product);
  }, 40_000);

  it("refreshes only delayed product/status responses while preserving the original receipt and later stock", async () => {
    const draft = inventoryProductDraftSchema.parse({ name: "등록 재시도 최신 상태", unitLabel: "봉", unitsPerBox: 8,
      defaultLocationId: "freezer1", manufacturer: "", specification: "", origin: "", note: "", urgent: false });
    const input: SaveInventoryProductInput = { requestId: randomUUID(), productId: null, expectedRevision: null, draft,
      initialStock: { quantity: 10, lot: { label: "", expiryState: "unknown", expiryDate: null } } };
    const created = await service.save(input, member);
    const lotId = `${input.requestId}-freezer1`;
    const issued = await service.move({ requestId: randomUUID(), productId: created.productId,
      expectedStockRevision: created.stockRevision, kind: "issue", locationId: "freezer1", lotId,
      quantity: 2, reason: "나중 납품" }, member);
    const edit: SaveInventoryProductInput = { requestId: randomUUID(), productId: created.productId,
      expectedRevision: created.revision, draft: { ...draft, name: "최신 이름" }, refreshOnReplay: true };
    const edited = await service.save(edit, member);
    expect(edited.stockRevision).toBe(issued.product.stockRevision);
    expect(await service.save({ ...input, refreshOnReplay: true }, member)).toEqual(edited);
    expect(await service.save(input, member)).toEqual(created);
    expect((await db.doc(`companies/onnuri/inventoryRequests/${input.requestId}`).get()).data()!.result).toEqual(created);
    const empty = await service.move({ requestId: randomUUID(), productId: created.productId,
      expectedStockRevision: edited.stockRevision, kind: "issue", locationId: "freezer1", lotId,
      quantity: 8, reason: "남은 재고 납품" }, member);
    expect(await service.save(edit, member)).toEqual(empty.product);
    const deactivate = { requestId: randomUUID(), productId: created.productId, expectedRevision: edited.revision,
      status: "inactive" as const, reason: "일시 중단", refreshOnReplay: true };
    const inactive = await service.status(deactivate, admin);
    const active = await service.status({ requestId: randomUUID(), productId: created.productId,
      expectedRevision: inactive.revision, status: "active", reason: "다시 사용" }, admin);
    expect(await service.status(deactivate, admin)).toEqual(active);
    const deletion = { requestId: randomUUID(), productId: created.productId, expectedRevision: active.revision,
      reason: "중복 상품 정리", refreshOnReplay: true };
    const historicalDeleted = await service.status(deletion, member, true);
    expect(historicalDeleted).toMatchObject({ status: "deleted", hasHistory: true });
    expect(await service.status(deactivate, admin)).toEqual(historicalDeleted);
    expect(await service.status(deletion, member, true)).toEqual(historicalDeleted);
    await expect(service.save({ ...input, refreshOnReplay: true }, member)).rejects.toMatchObject({ code: "not-found" });
    expect((await service.history(created.productId, null)).events).toHaveLength(3);

    // Existing unused-product deletion receipts retain their wire behavior too.
    const unusedInput: SaveInventoryProductInput = { requestId: randomUUID(), productId: null, expectedRevision: null,
      draft: { ...draft, name: "무이력 삭제 재시도" } };
    const unused = await service.save(unusedInput, member);
    const unusedDeletion = { ...deletion, requestId: randomUUID(), productId: unused.productId, expectedRevision: unused.revision };
    const deleted = await service.status(unusedDeletion, admin, true);
    expect(deleted).toMatchObject({ status: "deleted", hasHistory: false });
    expect(await service.status(unusedDeletion, admin, true)).toEqual(deleted);
    expect(await service.status({ ...unusedDeletion, refreshOnReplay: false }, admin, true)).toEqual(deleted);
    await expect(service.save({ ...unusedInput, refreshOnReplay: true }, member)).rejects.toMatchObject({ code: "not-found" });
  }, 40_000);

  it("allows staff lifecycle changes with positive stock and blank-reason expiry edits while preserving audit evidence", async () => {
    const requestId = randomUUID(); const uploadId = randomUUID();
    const now = new Date("2026-09-11T01:00:00Z");
    await db.doc(`inventoryPhotoUploads/${uploadId}`).create({ uploadId, actorUid: member.uid, actorEmployeeId: member.employeeId,
      inputHash: "c".repeat(64), contentType: "image/jpeg", state: "uploaded", width: 80, height: 60,
      createdAt: Timestamp.fromDate(now), expiresAt: Timestamp.fromMillis(now.valueOf() + 86_400_000) });
    const draft = inventoryProductDraftSchema.parse({ name: "직원 상태 관리 통합검증", unitLabel: "봉", unitsPerBox: 8,
      defaultLocationId: "freezer1", manufacturer: "", specification: "", origin: "", note: "", urgent: false });
    const created = await service.save({ requestId, productId: null, expectedRevision: null, draft,
      initialStock: { quantity: 9, lot: { label: "최초 입고", expiryState: "dated", expiryDate: "2026-12-20" } },
      photoChange: { action: "replace", uploadId } }, member);
    const lotId = `${requestId}-freezer1`;
    const correction = { requestId: randomUUID(), productId: created.productId, lotId,
      expectedStockRevision: created.stockRevision, draft: { label: "날짜 정정", expiryState: "dated" as const, expiryDate: "2027-01-31" },
      reason: "", includeDetail: true };
    const corrected = await service.updateLot(correction, member);
    expect(corrected.event).toMatchObject({ reason: "", actorEmployeeId: member.employeeId,
      lotMetadataChange: { before: { label: "최초 입고", expiryDate: "2026-12-20" }, after: correction.draft } });
    expect((await db.doc(`auditLogs/inventory-${correction.requestId}`).get()).data()).toMatchObject({
      actorUid: member.uid, actorEmployeeId: member.employeeId, changeReason: null,
      inventoryLotChange: { productName: draft.name, unitLabel: "봉", before: { expiryDate: "2026-12-20" }, after: correction.draft },
    });
    const deactivate = { requestId: randomUUID(), productId: created.productId, expectedRevision: corrected.product.revision,
      status: "inactive" as const, reason: "일시 중단" };
    await expect(service.status(deactivate, viewer)).rejects.toMatchObject({ code: "permission-denied" });
    const inactive = await service.status(deactivate, member);
    expect(inactive.quantityByLocation.freezer1).toBe(9);
    expect((await service.detail(created.productId, member)).lots).toEqual(corrected.detail!.lots);
    const active = await service.status({ ...deactivate, requestId: randomUUID(), expectedRevision: inactive.revision,
      status: "active", reason: "재개" }, member);
    const deletion = { requestId: randomUUID(), productId: active.productId, expectedRevision: active.revision,
      reason: "중복 품목", refreshOnReplay: true };
    const deleted = await service.status(deletion, member, true);
    expect(deleted).toMatchObject({ status: "deleted", hasHistory: true, photo: created.photo,
      quantityByLocation: corrected.product.quantityByLocation, stockRevision: corrected.product.stockRevision });
    expect((await db.doc(`${INVENTORY_PRODUCT_PATH}/${created.productId}/lots/${lotId}`).get()).data()).toMatchObject({ quantity: 9, expiryDate: "2027-01-31" });
    expect((await db.doc(`inventoryPhotoUploads/${uploadId}`).get()).data()).toMatchObject({ state: "attached", productId: created.productId });
    expect((await db.doc(`inventoryPhotoUploads/${uploadId}`).get()).data()).not.toHaveProperty("expiresAt");
    expect((await db.doc(`auditLogs/inventory-${deletion.requestId}`).get()).data()).toMatchObject({
      actorUid: member.uid, actorEmployeeId: member.employeeId, eventType: "INVENTORY_PRODUCT_DELETED",
      inventoryStatusChange: { productName: draft.name, unitLabel: "봉",
        before: { status: "active", quantityByLocation: corrected.product.quantityByLocation },
        after: { status: "deleted", quantityByLocation: corrected.product.quantityByLocation } },
    });
    expect(await service.status(deletion, member, true)).toEqual(deleted);
    expect((await service.history(created.productId, null)).events).toHaveLength(2);
    await expect(service.status(deletion, viewer, true)).rejects.toMatchObject({ code: "permission-denied" });
    await expect(service.detail(created.productId, member)).rejects.toMatchObject({ code: "not-found" });
    await expect(service.move({ requestId: randomUUID(), productId: created.productId, expectedStockRevision: deleted.stockRevision,
      kind: "issue", locationId: "freezer1", lotId, quantity: 1, reason: "삭제 후 변경" }, member)).rejects.toMatchObject({ code: "failed-precondition" });
  }, 40_000);

  it("rejects a stale first receipt when another employee changed the package unit", async () => {
    const draft = inventoryProductDraftSchema.parse({ name: "단위 경합 통합검증", unitLabel: "봉", unitsPerBox: 8,
      defaultLocationId: "freezer1", manufacturer: "", specification: "", origin: "", note: "", urgent: false });
    const created = await service.save({ requestId: randomUUID(), productId: null, expectedRevision: null, draft }, member);
    const edited = await service.save({ requestId: randomUUID(), productId: created.productId, expectedRevision: created.revision,
      draft: { ...draft, unitsPerBox: 12 } }, admin);
    const receipt: InventoryMovementInput = { requestId: randomUUID(), productId: created.productId,
      expectedStockRevision: created.stockRevision, kind: "receive", locationId: "freezer1", lotId: null,
      quantity: 8, reason: "한 박스 입고", newLot: { label: "", expiryState: "unknown", expiryDate: null } };
    expect(edited.stockRevision).toBe(created.stockRevision + 1);
    await expect(service.move(receipt, member)).rejects.toMatchObject({ code: "aborted" });
    const refreshed = await service.move({ ...receipt, expectedStockRevision: edited.stockRevision, quantity: 12 }, member);
    expect(refreshed.product.quantityByLocation.freezer1).toBe(12);
    expect(refreshed.event.unitsPerBox).toBe(12);
  }, 20_000);

  it("keeps an adjusted physical count complete and invalidates only later stock changes at affected locations", async () => {
    // Outside the scheduled day, ordinary movements do not confirm stock.
    const service = new InventoryService(db, () => new Date("2026-09-12T01:00:00Z"));
    const draft = inventoryProductDraftSchema.parse({ name: "장소별 실사 통합검증", unitLabel: "봉", unitsPerBox: 8,
      defaultLocationId: "freezer1", manufacturer: "", specification: "", origin: "", note: "", urgent: false });
    const created = await service.save({ requestId: randomUUID(), productId: null, expectedRevision: null, draft }, member);
    const first = await service.move({ requestId: randomUUID(), productId: created.productId, expectedStockRevision: created.stockRevision,
      kind: "receive", locationId: "freezer1", lotId: null, quantity: 10, reason: "입고",
      newLot: { label: "A", expiryState: "unknown", expiryDate: null } }, member);
    const lotId = first.event.lines[0]!.lotId;
    const sample = await service.move({ requestId: randomUUID(), productId: created.productId, expectedStockRevision: first.product.stockRevision,
      kind: "receive", locationId: "sample", lotId: null, quantity: 5, reason: "샘플 입고",
      newLot: { label: "B", expiryState: "unknown", expiryDate: null } }, member);
    const sampleLotId = sample.event.lines[0]!.lotId;
    const countedSample = await service.count({ requestId: randomUUID(), productId: created.productId, locationId: "sample",
      cycleId: "week-2026-09-11", expectedStockRevision: sample.product.stockRevision, counts: [{ lotId: sampleLotId, quantity: 5 }], reason: "" }, member);
    const counted = await service.count({ requestId: randomUUID(), productId: created.productId, locationId: "freezer1",
      cycleId: "week-2026-09-11", expectedStockRevision: countedSample.product.stockRevision, counts: [{ lotId, quantity: 9 }], reason: "실물 재확인" }, member);
    expect(counted.product.lastCountByLocation.freezer1).toMatchObject({ changed: true, stockChangedSinceCount: false });
    expect(counted.product.lastCountByLocation.sample).toMatchObject({ stockChangedSinceCount: false });
    const corrected = await service.updateLot({ requestId: randomUUID(), productId: created.productId, lotId,
      expectedStockRevision: counted.product.stockRevision, draft: { label: "A 날짜 정정", expiryState: "dated", expiryDate: "2026-10-01" }, reason: "표기일 확인" }, member);
    expect(corrected.product.lastCountByLocation).toEqual(counted.product.lastCountByLocation);
    const renamed = await service.save({ requestId: randomUUID(), productId: created.productId,
      expectedRevision: corrected.product.revision, draft: { ...draft, name: "장소별 실사 이름 정정", note: "수량 변동 없음" } }, member);
    expect(renamed.lastCountByLocation).toEqual(counted.product.lastCountByLocation);
    const issued = await service.move({ requestId: randomUUID(), productId: created.productId, expectedStockRevision: renamed.stockRevision,
      kind: "issue", locationId: "sample", lotId: sampleLotId, quantity: 1, reason: "샘플 출고" }, member);
    expect(issued.product.lastCountByLocation.freezer1).toEqual(counted.product.lastCountByLocation.freezer1);
    expect(issued.product.lastCountByLocation.sample).toMatchObject({ stockChangedSinceCount: true });
    const sampleRecounted = await service.count({ requestId: randomUUID(), productId: created.productId, locationId: "sample",
      cycleId: "week-2026-09-11", expectedStockRevision: issued.product.stockRevision, counts: [{ lotId: sampleLotId, quantity: 4 }], reason: "" }, member);
    const transferred = await service.move({ requestId: randomUUID(), productId: created.productId, expectedStockRevision: sampleRecounted.product.stockRevision,
      kind: "transfer", locationId: "freezer1", toLocationId: "sample", lotId, quantity: 1, reason: "샘플 분리" }, member);
    const persisted = (await service.detail(created.productId, member)).product;
    expect(persisted).toEqual(transferred.product);
    expect(persisted.lastCountByLocation.freezer1).toMatchObject({ changed: true, stockChangedSinceCount: true });
    expect(persisted.lastCountByLocation.sample).toMatchObject({ changed: false, stockChangedSinceCount: true });
    expect(persisted.lastCountByLocation.freezer2).toBeNull();
  }, 40_000);
});
