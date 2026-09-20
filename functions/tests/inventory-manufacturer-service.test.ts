import { randomUUID } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import type { InventoryActor } from "../src/inventory/inventory-authorization.js";
import {
  INVENTORY_MANUFACTURER_NAME_PATH, INVENTORY_MANUFACTURER_PATH,
  normalizeInventoryManufacturerName,
} from "../src/inventory/inventory-manufacturer-contract.js";
import { InventoryManufacturerService } from "../src/inventory/inventory-manufacturer-service.js";

const delivery: InventoryActor = { uid: "uid-delivery", employeeId: "EMP-DELIVERY", roleScopes: ["delivery"],
  sessionVersion: 1, permissionsVersion: 1, isAdmin: false };
const sales: InventoryActor = { uid: "uid-sales", employeeId: "EMP-SALES", roleScopes: ["sales"],
  sessionVersion: 1, permissionsVersion: 1, isAdmin: false };
const viewer: InventoryActor = { uid: "uid-viewer", employeeId: "EMP-VIEWER", roleScopes: ["viewer"],
  sessionVersion: 1, permissionsVersion: 1, isAdmin: false };
const admin: InventoryActor = { uid: "uid-admin", employeeId: "EMP-ADMIN", roleScopes: ["admin"],
  sessionVersion: 1, permissionsVersion: 1, isAdmin: true };

type Value = Record<string, unknown>;
function fixture() {
  const values = new Map<string, Value>();
  for (const actor of [delivery, sales, viewer, admin]) {
    values.set(`authz/${actor.uid}`, { employeeId: actor.employeeId, active: true,
      sessionVersion: actor.sessionVersion, permissionsVersion: actor.permissionsVersion });
    values.set(`employees/${actor.employeeId}`, { employeeId: actor.employeeId, firebaseUid: actor.uid,
      roleScopes: actor.roleScopes, status: "active", sessionVersion: actor.sessionVersion });
  }
  const ref = (path: string) => ({ path, id: path.split("/").at(-1)! });
  const snapshot = (path: string) => ({ id: path.split("/").at(-1)!, ref: ref(path), exists: values.has(path),
    data: () => values.get(path), get: (field: string) => values.get(path)?.[field] });
  let serial = Promise.resolve();
  const db = {
    doc: ref,
    collection: (path: string) => ({
      limit: (maximum: number) => ({
        get: async () => ({ docs: [...values.entries()]
          .filter(([key]) => key.startsWith(`${path}/`) && key.split("/").length === path.split("/").length + 1)
          .slice(0, maximum).map(([key]) => snapshot(key)) }),
      }),
    }),
    async runTransaction<T>(action: (transaction: unknown) => Promise<T>) {
      const preceding = serial;
      let release!: () => void;
      serial = new Promise<void>((resolve) => { release = resolve; });
      await preceding;
      const writes: Array<{ kind: "set" | "create"; path: string; data: Value }> = [];
      const beforeRead = () => { if (writes.length) throw new Error("Firestore transaction read after write"); };
      try {
        const transaction = {
          get: async (target: { path: string }) => { beforeRead(); return snapshot(target.path); },
          getAll: async (...targets: Array<{ path: string }>) => { beforeRead(); return targets.map((target) => snapshot(target.path)); },
          set: (target: { path: string }, data: Value) => writes.push({ kind: "set", path: target.path, data }),
          create: (target: { path: string }, data: Value) => writes.push({ kind: "create", path: target.path, data }),
        };
        const result = await action(transaction);
        const created = new Set<string>();
        for (const write of writes) if (write.kind === "create") {
          if (values.has(write.path) || created.has(write.path)) throw new Error("Duplicate create");
          created.add(write.path);
        }
        for (const write of writes) values.set(write.path, write.data);
        return result;
      } finally { release(); }
    },
  } as unknown as Firestore;
  return { values, service: new InventoryManufacturerService(db, () => new Date("2026-09-21T01:00:00Z")) };
}
function create(name: string) { return { requestId: randomUUID(), name }; }

describe("inventory manufacturer master transactions", () => {
  it("lets delivery and sales employees create while a viewer remains read-only", async () => {
    const state = fixture();
    await expect(state.service.create(create("온누리 식품"), delivery)).resolves.toMatchObject({ name: "온누리 식품", revision: 1, active: true });
    await expect(state.service.create(create("새봄푸드"), sales)).resolves.toMatchObject({ createdBy: sales.employeeId });
    await expect(state.service.create(create("관리자 식품"), admin)).resolves.toMatchObject({ createdBy: admin.employeeId });
    await expect(state.service.create(create("조회 전용"), viewer)).rejects.toMatchObject({ code: "permission-denied" });
    expect(await state.service.list()).toHaveLength(3);
  });

  it("allows only administrators to rename or deactivate and hides inactive entries from the bounded list", async () => {
    const state = fixture(); const manufacturer = await state.service.create(create("주식회사 온누리"), delivery);
    const rename = { requestId: randomUUID(), manufacturerId: manufacturer.manufacturerId,
      expectedRevision: manufacturer.revision, name: "온누리 식품" };
    await expect(state.service.update(rename, delivery)).rejects.toMatchObject({ code: "permission-denied" });
    const renamed = await state.service.update(rename, admin);
    expect(renamed).toMatchObject({ name: "온누리 식품", revision: 2, active: true });
    expect(state.values.get(`auditLogs/inventory-${rename.requestId}`)).toMatchObject({
      eventType: "INVENTORY_MANUFACTURER_UPDATED", actorUid: admin.uid, actorEmployeeId: admin.employeeId,
      targetId: manufacturer.manufacturerId, changedFields: ["name"],
    });
    await expect(state.service.update({ requestId: randomUUID(), manufacturerId: renamed.manufacturerId,
      expectedRevision: renamed.revision, active: false }, sales)).rejects.toMatchObject({ code: "permission-denied" });
    const inactive = await state.service.update({ requestId: randomUUID(), manufacturerId: renamed.manufacturerId,
      expectedRevision: renamed.revision, active: false }, admin);
    expect(inactive).toMatchObject({ active: false, revision: 3 });
    expect(await state.service.list()).toEqual([]);
  });

  it("normalizes NFC, case, whitespace and punctuation and authoritatively rejects exact duplicates", async () => {
    const state = fixture();
    expect(normalizeInventoryManufacturerName("  On-NuRi  식품(주) ")).toBe("onnuri식품주");
    await state.service.create(create("On-NuRi 식품(주)"), delivery);
    await expect(state.service.create(create("onnuri식품주"), sales)).rejects.toMatchObject({
      code: "already-exists", details: { reason: "inventory-manufacturer-duplicate" },
    });
  });

  it("commits only one of two concurrent normalized duplicates", async () => {
    const state = fixture();
    const results = await Promise.allSettled([
      state.service.create(create("동시 식품"), delivery),
      state.service.create(create("동시-식품"), sales),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(await state.service.list()).toHaveLength(1);
  });

  it("replays the same request, rejects request collisions, and enforces revision conflicts", async () => {
    const state = fixture(); const input = create("재시도 식품");
    const first = await state.service.create(input, delivery);
    expect(await state.service.create(input, delivery)).toEqual(first);
    await expect(state.service.create({ ...input, name: "다른 식품" }, delivery)).rejects.toMatchObject({
      code: "already-exists", details: { reason: "inventory-request-collision" },
    });
    await expect(state.service.update({ requestId: randomUUID(), manufacturerId: first.manufacturerId,
      expectedRevision: 0, name: "수정 식품" }, admin)).rejects.toMatchObject({
      code: "aborted", details: { reason: "inventory-manufacturer-revision", revision: 1 },
    });
  });

  it("revalidates employee, role and session state inside the transaction", async () => {
    const state = fixture();
    state.values.set(`authz/${delivery.uid}`, { employeeId: delivery.employeeId, active: true,
      sessionVersion: 2, permissionsVersion: 1 });
    await expect(state.service.create(create("세션 만료"), delivery)).rejects.toMatchObject({ code: "permission-denied" });
    state.values.set(`authz/${delivery.uid}`, { employeeId: delivery.employeeId, active: true,
      sessionVersion: 1, permissionsVersion: 1 });
    state.values.set(`employees/${delivery.employeeId}`, { employeeId: delivery.employeeId, firebaseUid: delivery.uid,
      roleScopes: ["viewer"], status: "active" });
    await expect(state.service.create(create("권한 변경"), delivery)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("rolls back the master and reservation when append-only audit creation fails", async () => {
    const state = fixture(); const input = create("원자적 식품");
    state.values.set(`auditLogs/inventory-${input.requestId}`, { occupied: true });
    await expect(state.service.create(input, delivery)).rejects.toThrow("Duplicate create");
    expect(state.values.has(`${INVENTORY_MANUFACTURER_PATH}/${input.requestId}`)).toBe(false);
    expect([...state.values.keys()].some((path) => path.startsWith(`${INVENTORY_MANUFACTURER_NAME_PATH}/`))).toBe(false);
    expect(state.values.has(`companies/onnuri/inventoryRequests/${input.requestId}`)).toBe(false);
  });

  it("records the actor and changed fields in the existing append-only audit structure", async () => {
    const state = fixture(); const input = create("감사 식품");
    const created = await state.service.create(input, delivery);
    expect(state.values.get(`auditLogs/inventory-${input.requestId}`)).toMatchObject({
      eventType: "INVENTORY_MANUFACTURER_CREATED", actorUid: delivery.uid, actorEmployeeId: delivery.employeeId,
      targetType: "inventoryManufacturer", targetId: created.manufacturerId, changedFields: ["name", "active"],
      requestId: input.requestId, createdAt: expect.any(Timestamp),
    });
  });
});
