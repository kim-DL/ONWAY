import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import { disableGoogleAdminAccessInputSchema, registerGoogleAdminAccessInputSchema } from "../src/admin/google-admin-access-contract.js";
import { GoogleAdminAccessService, type GoogleAdminAccessActor } from "../src/admin/google-admin-access-service.js";

type Value = Record<string, unknown>;
type Reference = { path: string } | { collection: string; field: string; value: unknown; limit: number };
const owner: GoogleAdminAccessActor = { uid: "uid-owner", employeeId: "EMP-OWNER", email: "owner@example.test", sessionVersion: 2, permissionsVersion: 3 };
const requestId = "553dfe93-6b62-4ed7-8395-e3246397eaa5";
const registerInput = { email: "manager@example.test", displayName: "회사 책임자", expectedRevision: 0, requestId, appVersion: "test" };

function fixture() {
  const values = new Map<string, Value>([
    ["secureSettings/adminAccess", { entries: [{ email: owner.email, employeeId: owner.employeeId, active: true }] }],
    ["employees/EMP-OWNER", { employeeId: owner.employeeId, firebaseUid: owner.uid, displayName: "운영 책임자", roleScopes: ["admin"], status: "active", sessionVersion: 2 }],
    ["authz/uid-owner", { employeeId: owner.employeeId, active: true, sessionVersion: 2, permissionsVersion: 3 }],
    ["authz/uid-staff", { employeeId: "EMP-STAFF", active: true, sessionVersion: 4, permissionsVersion: 5 }],
  ]);
  const auth = { setCustomUserClaims: vi.fn().mockResolvedValue(undefined), updateUser: vi.fn().mockResolvedValue(undefined), revokeRefreshTokens: vi.fn().mockResolvedValue(undefined) };
  const snapshot = (path: string) => ({ exists: values.has(path), data: () => values.get(path), id: path.split("/").at(-1) });
  const db = {
    doc: (path: string) => ({ path }),
    collection: (collection: string) => ({ where: (field: string, _operator: string, value: unknown) => ({ limit: (limit: number) => ({ collection, field, value, limit }) }) }),
    runTransaction: async <T>(operation: (transaction: unknown) => Promise<T>) => {
      const writes: Array<() => void> = [];
      const get = async (reference: Reference) => {
        if (writes.length) throw new Error("Firestore reads must precede writes.");
        if ("collection" in reference) return { docs: [...values.entries()]
          .filter(([path, value]) => path.startsWith(`${reference.collection}/`) && value[reference.field] === reference.value)
          .slice(0, reference.limit).map(([path]) => snapshot(path)) };
        return snapshot(reference.path);
      };
      const transaction = {
        get, getAll: (...references: Array<{ path: string }>) => Promise.all(references.map(get)),
        create: ({ path }: { path: string }, value: Value) => {
          if (values.has(path)) throw new Error("Document already exists.");
          writes.push(() => values.set(path, value));
        },
        set: ({ path }: { path: string }, value: Value, options?: { merge: boolean }) => writes.push(() => values.set(path, options?.merge ? { ...values.get(path), ...value } : value)),
        update: ({ path }: { path: string }, value: Value) => writes.push(() => values.set(path, { ...values.get(path), ...value })),
        delete: ({ path }: { path: string }) => writes.push(() => { values.delete(path); }),
      };
      const result = await operation(transaction);
      writes.forEach((write) => write());
      return result;
    },
  };
  const service = new GoogleAdminAccessService({ db: db as unknown as Firestore, auth: auth as unknown as Auth, now: () => new Date("2026-11-14T10:00:00Z") });
  const auditCount = () => [...values.keys()].filter((path) => path.startsWith("auditLogs/")).length;
  return { values, auth, service, auditCount };
}

describe("Google operator access", () => {
  it("accepts old allowlists and preserves the current bound UID", async () => {
    const { service, auth, values } = fixture();
    expect(await service.list(owner)).toEqual({ revision: 0, entries: [{ employeeId: owner.employeeId, displayName: "운영 책임자", email: owner.email, status: "active" }] });
    await service.activate({ uid: owner.uid, email: owner.email, appVersion: "test" });
    expect(values.get("employees/EMP-OWNER")?.sessionVersion).toBe(2);
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith(owner.uid, expect.objectContaining({ sessionVersion: 2, permissionsVersion: 3, adminApproved: true }));
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it("registers a pending Google operator without changing staff or owner sessions", async () => {
    const { service, values, auth } = fixture();
    const before = JSON.stringify([values.get("authz/uid-owner"), values.get("authz/uid-staff")]);
    const result = await service.register(registerInput, owner);
    expect(result.revision).toBe(1);
    expect((await service.list(owner)).entries).toContainEqual({ employeeId: result.employeeId, displayName: registerInput.displayName, email: registerInput.email, status: "pending" });
    expect(JSON.stringify([values.get("authz/uid-owner"), values.get("authz/uid-staff")])).toBe(before);
    expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
    expect(auth.revokeRefreshTokens).not.toHaveBeenCalled();
    expect([...values.keys()].some((path) => path.startsWith("authCredentials/") || path.startsWith("pinIndexes/"))).toBe(false);
  });

  it("replays the same registration without creating another employee or audit event", async () => {
    const { service, auditCount } = fixture();
    const first = await service.register(registerInput, owner);
    expect(await service.register(registerInput, owner)).toEqual(first);
    expect(auditCount()).toBe(1);
    expect((await service.list(owner)).entries).toHaveLength(2);
    await expect(service.register({ ...registerInput, email: "changed@example.test" }, owner)).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("rejects duplicate emails and stale list revisions", async () => {
    const { service } = fixture();
    await expect(service.register({ ...registerInput, email: owner.email }, owner)).rejects.toMatchObject({ code: "already-exists" });
    await expect(service.register({ ...registerInput, expectedRevision: 8 }, owner)).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it.each([
    { sessionVersion: 1 }, { permissionsVersion: 2 }, { email: "other@example.test" },
    { sessionVersion: undefined }, { permissionsVersion: undefined },
  ])("rechecks actor authorization inside the mutation transaction: %j", async (patch) => {
    const { service, auditCount } = fixture();
    await expect(service.register(registerInput, { ...owner, ...patch } as GoogleAdminAccessActor)).rejects.toMatchObject({ code: "permission-denied" });
    expect(auditCount()).toBe(0);
  });

  it("rejects a disabled actor even with previously verified claims", async () => {
    const { service, values } = fixture();
    values.get("authz/uid-owner")!.active = false;
    await expect(service.list(owner)).rejects.toMatchObject({ code: "permission-denied" });
    await expect(service.register(registerInput, owner)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("binds a pending operator once and rejects later UID replacement", async () => {
    const { service, values, auth } = fixture();
    const registered = await service.register(registerInput, owner);
    await service.activate({ uid: "uid-manager", email: registerInput.email, appVersion: "test" });
    expect(values.get(`employees/${registered.employeeId}`)?.firebaseUid).toBe("uid-manager");
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith("uid-manager", expect.objectContaining({ employeeId: registered.employeeId, adminApproved: true }));
    await expect(service.activate({ uid: "another-google-uid", email: registerInput.email, appVersion: "test" })).rejects.toMatchObject({ code: "permission-denied" });
    await expect(service.activate({ uid: "another-google-uid", email: owner.email, appVersion: "test" })).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("never takes over a UID that already belongs to another employee", async () => {
    const { service, values } = fixture();
    await service.register(registerInput, owner);
    await expect(service.activate({ uid: "uid-staff", email: registerInput.email, appVersion: "test" })).rejects.toMatchObject({ code: "permission-denied" });
    expect(values.get("authz/uid-staff")?.employeeId).toBe("EMP-STAFF");
  });

  it("rejects an existing employee UID even when its authorization document is missing", async () => {
    const { service, values } = fixture();
    await service.register(registerInput, owner);
    values.delete("authz/uid-staff");
    values.set("employees/EMP-STAFF", { employeeId: "EMP-STAFF", firebaseUid: "uid-staff", displayName: "직원", roleScopes: ["delivery"], status: "active", sessionVersion: 4 });
    await expect(service.activate({ uid: "uid-staff", email: registerInput.email, appVersion: "test" })).rejects.toMatchObject({ code: "permission-denied" });
    expect(values.has("authz/uid-staff")).toBe(false);
  });

  it("revokes only the target operator and rejects new activation after removal", async () => {
    const { service, values, auth } = fixture();
    const registered = await service.register(registerInput, owner);
    await service.activate({ uid: "uid-manager", email: registerInput.email, appVersion: "test" });
    const revision = (await service.list(owner)).revision;
    const result = await service.disable({ employeeId: registered.employeeId, expectedRevision: revision, reason: "업무 변경", requestId: crypto.randomUUID(), appVersion: "test" }, owner);
    expect(result.revision).toBe(revision + 1);
    expect(values.get("authz/uid-manager")).toMatchObject({ active: false, sessionVersion: 2 });
    expect(values.get("authz/uid-owner")).toMatchObject({ active: true, sessionVersion: 2, permissionsVersion: 3 });
    expect(values.get("authz/uid-staff")).toMatchObject({ active: true, sessionVersion: 4 });
    expect(auth.revokeRefreshTokens).toHaveBeenCalledExactlyOnceWith("uid-manager");
    await expect(service.activate({ uid: "uid-manager", email: registerInput.email, appVersion: "test" })).rejects.toMatchObject({ code: "permission-denied" });
    await expect(service.register({ ...registerInput, requestId: crypto.randomUUID(), expectedRevision: result.revision }, owner)).rejects.toMatchObject({ code: "already-exists" });
  });

  it("finishes a failed Auth revocation on retry without another state change", async () => {
    const { service, values, auth, auditCount } = fixture();
    const registered = await service.register(registerInput, owner);
    await service.activate({ uid: "uid-manager", email: registerInput.email, appVersion: "test" });
    const input = { employeeId: registered.employeeId, expectedRevision: (await service.list(owner)).revision, reason: "업무 변경", requestId: crypto.randomUUID(), appVersion: "test" };
    auth.revokeRefreshTokens.mockRejectedValueOnce(new Error("temporary Auth error"));
    await expect(service.disable(input, owner)).rejects.toThrow("temporary Auth error");
    const auditAfterFailure = auditCount();
    const result = await service.disable(input, owner);
    expect(result.revision).toBe(input.expectedRevision + 1);
    expect(values.get("authz/uid-manager")?.sessionVersion).toBe(2);
    expect(auditCount()).toBe(auditAfterFailure);
    expect(auth.revokeRefreshTokens).toHaveBeenCalledTimes(2);
  });

  it("protects the current operator even if a pending operator exists", async () => {
    const { service } = fixture();
    await service.register(registerInput, owner);
    await expect(service.disable({ employeeId: owner.employeeId, expectedRevision: 1, reason: "업무 변경", requestId: crypto.randomUUID(), appVersion: "test" }, owner)).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("rejects ambiguous legacy allowlist data", async () => {
    const { service, values } = fixture();
    const access = values.get("secureSettings/adminAccess")!;
    access.entries = [...access.entries as Value[], { email: owner.email, employeeId: "EMP-DUPLICATE", active: true }];
    await expect(service.list(owner)).rejects.toMatchObject({ code: "failed-precondition" });
  });
});

describe("Google operator request boundary", () => {
  it("normalizes exact email spelling without merging Gmail aliases", () => {
    expect(registerGoogleAdminAccessInputSchema.parse({ ...registerInput, email: "  Person.Name+Work@Gmail.com " }).email).toBe("person.name+work@gmail.com");
  });
  it.each([{ email: "invalid" }, { displayName: "" }, { expectedRevision: -1 }, { requestId: "not-a-uuid" }, { adminApproved: true }])("rejects invalid or injected input: %j", (patch) => {
    expect(registerGoogleAdminAccessInputSchema.safeParse({ ...registerInput, ...patch }).success).toBe(false);
  });
  it("rejects path injection and a missing removal reason", () => {
    const input = { employeeId: "bad/path", reason: "업무 변경", expectedRevision: 1, requestId, appVersion: "test" };
    expect(disableGoogleAdminAccessInputSchema.safeParse(input).success).toBe(false);
    expect(disableGoogleAdminAccessInputSchema.safeParse({ ...input, employeeId: "EMP-OTHER", reason: "" }).success).toBe(false);
  });
});
