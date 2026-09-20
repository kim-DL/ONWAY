import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import { customerEmployeeIsActive, type CustomerActor } from "../src/customer/customer-authorization.js";
import { customerDraftSchema, saveCustomerInputSchema, type SaveCustomerInput } from "../src/customer/customer-contract.js";
import { CustomerRequestCollision, CustomerRevisionConflict, CustomerService, customerChangedFields, customerCoreInformationChanged, nextCustomer } from "../src/customer/customer-service.js";

const now = "2026-09-06T00:00:00.000Z";
const draft = customerDraftSchema.parse({
  name: "강은 유통", district: "서구", administrativeDong: "탄방동", officialAddress: "남선로 17", deliveryAddress: "남선로 17 후면 창고",
  accessPassword: "001234*", accessPasswordState: "registered", deliveryLocationDescription: "왼쪽 셔터",
  deliveryPoint: { latitude: 36.35, longitude: 127.38 },
  contacts: [{ id: "first", name: "김담당", role: "현장", phoneNumber: "01012345678", isPrimary: true }],
  status: "active", noticeType: "none", changeNote: "첫 등록",
});
const input: SaveCustomerInput = { requestId: "720da64e-c6e1-4a47-81c2-1fcba7dd4524", customerId: null, expectedRevision: null, draft, clearNotice: false };
const actor: CustomerActor = { uid: "uid-admin", employeeId: "EMP-ADMIN", sessionVersion: 1, permissionsVersion: 1, isAdmin: true, roleScopes: ["admin"] };

function database(member: CustomerActor = actor) {
  const values = new Map<string, Record<string, unknown>>([
    [`authz/${member.uid}`, { employeeId: member.employeeId, active: true, sessionVersion: 1, permissionsVersion: 1 }],
    [`employees/${member.employeeId}`, { employeeId: member.employeeId, firebaseUid: member.uid, status: "active", roleScopes: member.roleScopes }],
  ]);
  const doc = (path: string) => ({ path, id: path.split("/").at(-1) });
  const snapshot = (ref: { path: string }) => ({ exists: values.has(ref.path), data: () => values.get(ref.path) });
  const transaction = {
    get: async (ref: { path: string }) => snapshot(ref),
    getAll: async (...refs: Array<{ path: string }>) => refs.map(snapshot),
    set: (ref: { path: string }, value: Record<string, unknown>) => { values.set(ref.path, value); },
    create: (ref: { path: string }, value: Record<string, unknown>) => { if (values.has(ref.path)) throw new Error("already exists"); values.set(ref.path, value); },
  };
  const db = { doc, collection: (path: string) => ({ doc: () => doc(`${path}/created-customer`) }), runTransaction: async (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction) };
  return { values, db: db as unknown as Firestore };
}

describe("customer trusted mutation contract", () => {
  it("creates name-only search fields and respects no-notice selection", () => {
    const created = nextCustomer(null, input, "one", "EMP-ADMIN", now);
    expect(created).toMatchObject({ normalizedName: "강은유통", choseongName: "ㄱㅇㅇㅌ", noticeType: "none", revision: 1, accessPassword: "001234*", companyId: "onnuri" });
    expect(created.contacts[0]?.phoneNumber).toBe("010-1234-5678");
  });
  it("formats all contacts at the storage boundary without mutating the input", () => {
    const contacts = [
      { ...draft.contacts[0]!, phoneNumber: "0421234567" },
      { ...draft.contacts[0]!, id: "second", phoneNumber: "+82 10-1234-5678", isPrimary: false },
      { ...draft.contacts[0]!, id: "third", phoneNumber: "", isPrimary: false },
    ];
    const created = nextCustomer(null, { ...input, draft: { ...draft, contacts } }, "one", "EMP-ADMIN", now);
    expect(created.contacts.map((contact) => contact.phoneNumber)).toEqual(["042-123-4567", "+82 10-1234-5678", ""]);
    expect(contacts[0]!.phoneNumber).toBe("0421234567");
  });
  it.each(["none", "new", "changed"] as const)("respects explicitly selected %s notice on new registration", (noticeType) => {
    expect(nextCustomer(null, { ...input, draft: { ...draft, noticeType } }, "one", "EMP-ADMIN", now).noticeType).toBe(noticeType);
  });
  it("accepts new customers without separate region metadata", () => {
    const addressOnly = { ...input, draft: { ...draft, district: "", administrativeDong: "" } };
    expect(saveCustomerInputSchema.safeParse(addressOnly).success).toBe(true);
    expect(nextCustomer(null, addressOnly, "one", "EMP-ADMIN", now)).toMatchObject({ district: "", administrativeDong: "", deliveryAddress: draft.deliveryAddress, deliveryPoint: draft.deliveryPoint });
  });
  it("retains existing region metadata when only address and delivery point change", () => {
    const current = nextCustomer(null, input, "one", "EMP-ADMIN", now);
    const next = nextCustomer(current, { ...input, draft: { ...draft, deliveryAddress: "새 창고 주소", deliveryPoint: { latitude: 36.4, longitude: 127.4 } } }, "one", "EMP-ADMIN", now);
    expect(next).toMatchObject({ district: "서구", administrativeDong: "탄방동", deliveryAddress: "새 창고 주소", deliveryPoint: { latitude: 36.4, longitude: 127.4 }, noticeType: "changed" });
  });
  it.each([
    { accessPassword: "00000#" }, { accessPassword: "", accessPasswordState: "none" as const },
    { deliveryAddress: "건물 후면" }, { deliveryLocationDescription: "오른쪽 창고" },
    { deliveryPoint: { latitude: 36.36, longitude: 127.38 } },
    { contacts: [{ ...draft.contacts[0]!, phoneNumber: "0421234567" }] },
  ])("automatically marks changes to core delivery information", (change) => {
    const current = nextCustomer(null, input, "one", "EMP-ADMIN", now);
    const next = nextCustomer(current, { ...input, draft: { ...draft, ...change } }, "one", "EMP-B", now);
    expect(next.noticeType).toBe("changed");
    expect(next.createdBy).toBe("EMP-ADMIN");
    expect(next.updatedBy).toBe("EMP-B");
  });
  it("permits explicit badge clearing and retains closed customers", () => {
    const current = nextCustomer(null, input, "one", "EMP-ADMIN", now);
    expect(nextCustomer(current, { ...input, clearNotice: true, draft: { ...draft, status: "closed" } }, "one", "EMP-ADMIN", now)).toMatchObject({ status: "closed", noticeType: "none", revision: 2 });
    expect(customerCoreInformationChanged(current, { ...draft, contacts: [{ ...draft.contacts[0]!, phoneNumber: "010-1234-5678" }] })).toBe(false);
  });
  it("does not mark a legacy digits-only contact as changed just because spacing is normalized", () => {
    const current = nextCustomer(null, input, "one", "EMP-ADMIN", now);
    current.contacts[0]!.phoneNumber = "01012345678";
    const next = nextCustomer(current, { ...input, draft: { ...draft, changeNote: "안내 업데이트" } }, "one", "EMP-ADMIN", now);
    expect(next.contacts[0]!.phoneNumber).toBe("010-1234-5678");
    expect(next.noticeType).toBe("none");
  });
  it.each([
    { accessPassword: 1234 }, { accessPasswordState: "unknown" }, { contacts: [{ ...draft.contacts[0]!, phoneNumber: 101234 }] },
    { contacts: [{ ...draft.contacts[0]!, isPrimary: false }] }, { deliveryPoint: { latitude: 91, longitude: 127 } },
    { deliveryPoint: { latitude: "36.35", longitude: "127.38" } }, { companyId: "other" },
    { name: "*" }, { deliveryAddress: "x".repeat(501) }, { contacts: Array.from({ length: 11 }, (_, index) => ({ ...draft.contacts[0], id: String(index) })) },
  ])("rejects malformed, unbounded and caller-owned authority fields", (change) => {
    expect(customerDraftSchema.safeParse({ ...draft, ...change }).success).toBe(false);
  });
  it("rejects traversing customer IDs, mismatched revisions and undefined fields", () => {
    expect(saveCustomerInputSchema.safeParse({ ...input, customerId: "../other" }).success).toBe(false);
    expect(saveCustomerInputSchema.safeParse({ ...input, expectedRevision: 1 }).success).toBe(false);
    expect(saveCustomerInputSchema.safeParse({ ...input, companyId: "other" }).success).toBe(false);
  });
  it("verifies active membership and role snapshot independent from caller fields", () => {
    expect(customerEmployeeIsActive({ employeeId: actor.employeeId, firebaseUid: actor.uid, status: "disabled", roleScopes: ["admin"] }, actor)).toBe(false);
    expect(customerEmployeeIsActive({ employeeId: actor.employeeId, firebaseUid: "other", status: "active", roleScopes: ["admin"] }, actor)).toBe(false);
    expect(customerEmployeeIsActive({ employeeId: actor.employeeId, firebaseUid: actor.uid, status: "active", roleScopes: ["sales"] }, { ...actor, isAdmin: false })).toBe(false);
    expect(customerEmployeeIsActive({ employeeId: actor.employeeId, firebaseUid: actor.uid, status: "active", roleScopes: ["sales"] }, { ...actor, isAdmin: false, roleScopes: ["sales"] })).toBe(true);
  });
  it("records only changed field names, including server-derived notice changes", () => {
    const current = nextCustomer(null, input, "one", "EMP-ADMIN", now);
    const next = nextCustomer(current, { ...input, draft: { ...draft, accessPassword: "00000#" } }, "one", "EMP-B", now);
    expect(customerChangedFields(current, next)).toEqual(["accessPassword", "noticeType"]);
  });
});

describe("customer atomic storage", () => {
  it("uses canonical employee roles with a version-only authz document and rejects role changes without a version bump", async () => {
    const staff: CustomerActor = { ...actor, uid: "uid-staff", employeeId: "EMP-STAFF", isAdmin: false, roleScopes: ["delivery"] };
    const fixture = database(staff); const service = new CustomerService(fixture.db);
    expect(fixture.values.get("authz/uid-staff")).not.toHaveProperty("roleScopes");
    await service.save(input, staff);
    fixture.values.get("employees/EMP-STAFF")!.roleScopes = ["sales"];
    expect(fixture.values.get("authz/uid-staff")).toMatchObject({ sessionVersion: 1, permissionsVersion: 1 });
    await expect(service.save(input, staff)).rejects.toMatchObject({ code: "permission-denied" });
  });
  it.each(["delivery", "sales", "viewer"])("permits active %s employees to create/edit with server-owned audit identity", async (role) => {
    const staff: CustomerActor = { ...actor, uid: "uid-staff", employeeId: "EMP-STAFF", isAdmin: false, roleScopes: [role] };
    const fixture = database(staff); const service = new CustomerService(fixture.db);
    const created = await service.save(input, staff);
    const saved = await service.save({ ...input, requestId: "d1af5f25-a023-4ec0-a01f-0a416c7f08cf", customerId: created.customerId, expectedRevision: 1,
      draft: { ...draft, deliveryLocationDescription: "직원이 확인한 창고" } }, staff);
    expect(saved).toMatchObject({ createdBy: staff.employeeId, updatedBy: staff.employeeId, revision: 2 });
    const logs = [...fixture.values.entries()].filter(([path]) => path.startsWith("auditLogs/")).map(([, value]) => value);
    expect(logs).toHaveLength(2);
    expect(logs[1]).toMatchObject({ actorUid: staff.uid, actorEmployeeId: staff.employeeId, changedFields: ["deliveryLocationDescription", "noticeType"] });
    expect(JSON.stringify(logs)).not.toContain("직원이 확인한 창고");
  });
  it("saves once and replays identical requests without a second customer or audit event", async () => {
    const fixture = database();
    const service = new CustomerService(fixture.db);
    const first = await service.save(input, actor);
    const repeated = await service.save(input, actor);
    expect(repeated).toEqual(first);
    expect([...fixture.values.keys()].filter((path) => path.startsWith("companies/"))).toHaveLength(1);
    expect([...fixture.values.keys()].filter((path) => path.startsWith("auditLogs/"))).toHaveLength(1);
    expect(fixture.values.get("companies/onnuri/customers/created-customer")?.createdAt).toBeInstanceOf(Timestamp);
    expect(fixture.values.get("companies/onnuri/customers/created-customer")?.contacts).toEqual([{ ...draft.contacts[0]!, phoneNumber: "010-1234-5678" }]);
    const log = [...fixture.values.entries()].find(([path]) => path.startsWith("auditLogs/"))?.[1];
    for (const value of [draft.accessPassword, draft.contacts[0]!.phoneNumber, draft.deliveryAddress, draft.changeNote]) expect(JSON.stringify(log)).not.toContain(value);
  });
  it("rejects request collisions and stale revisions without overwriting current data", async () => {
    const fixture = database(); const service = new CustomerService(fixture.db);
    const created = await service.save(input, actor);
    await expect(service.save({ ...input, draft: { ...draft, name: "가온유통" } }, actor)).rejects.toBeInstanceOf(CustomerRequestCollision);
    await expect(service.save({ ...input, requestId: "d1af5f25-a023-4ec0-a01f-0a416c7f08cf", customerId: created.customerId, expectedRevision: 5 }, actor)).rejects.toBeInstanceOf(CustomerRevisionConflict);
    expect(fixture.values.get(`companies/onnuri/customers/${created.customerId}`)?.revision).toBe(1);
  });
  it("rechecks revocation and disabled status within the transaction", async () => {
    const fixture = database(); const service = new CustomerService(fixture.db);
    fixture.values.get("authz/uid-admin")!.sessionVersion = 2;
    await expect(service.save(input, actor)).rejects.toMatchObject({ code: "permission-denied" });
    fixture.values.get("authz/uid-admin")!.sessionVersion = 1;
    fixture.values.get("employees/EMP-ADMIN")!.status = "disabled";
    await expect(service.save(input, actor)).rejects.toMatchObject({ code: "permission-denied" });
    expect([...fixture.values.keys()].filter((path) => path.startsWith("companies/"))).toHaveLength(0);
  });
  it.each([
    ["authz", { active: false }], ["authz", { permissionsVersion: 2 }], ["authz", { employeeId: "someone-else" }],
    ["employee", { firebaseUid: "someone-else" }], ["employee", { employeeId: "someone-else" }],
    ["employee", { roleScopes: [] }], ["employee", { roleScopes: ["sales"] }],
  ])("rejects revoked/forged membership before even replaying a saved request: %s %j", async (kind, change) => {
    const fixture = database(); const service = new CustomerService(fixture.db);
    await service.save(input, actor);
    Object.assign(fixture.values.get(kind === "authz" ? "authz/uid-admin" : "employees/EMP-ADMIN")!, change);
    await expect(service.save(input, actor)).rejects.toMatchObject({ code: "permission-denied" });
    expect([...fixture.values.keys()].filter((path) => path.startsWith("auditLogs/"))).toHaveLength(1);
  });
});
