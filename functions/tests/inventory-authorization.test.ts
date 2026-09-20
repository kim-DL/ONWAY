import type { CallableRequest } from "firebase-functions/v2/https";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ values: new Map<string, Record<string, unknown>>(), reads: [] as string[][] }));
vi.mock("../src/shared/firebase-admin.js", () => ({ getAdminFirestore: () => ({
  doc: (path: string) => ({ path }),
  getAll: async (...references: Array<{ path: string }>) => {
    fixture.reads.push(references.map((reference) => reference.path));
    return references.map(({ path }) => ({ exists: fixture.values.has(path), data: () => fixture.values.get(path) }));
  },
}) }));

// Use the actual batched authorization, shared token comparison and employee
// binding policy. Only Firestore I/O is substituted with scoped documents.
import { requireInventoryActor } from "../src/inventory/inventory-authorization.js";

const uid = "inventory-auth-uid";
const employeeId = "INV-AUTH";
function provision(role: "viewer" | "delivery" | "sales" | "admin") {
  fixture.values.set(`authz/${uid}`, { employeeId, active: true, sessionVersion: 2, permissionsVersion: 3 });
  fixture.values.set(`employees/${employeeId}`, { employeeId, firebaseUid: uid, roleScopes: [role], status: "active", sessionVersion: 2 });
  return { auth: { uid, token: { uid, employeeId, sessionVersion: 2, permissionsVersion: 3, roleScopes: [role],
    ...(role === "admin" ? { adminApproved: true } : {}), firebase: { sign_in_provider: role === "admin" ? "google.com" : "custom" } } },
  data: {} } as unknown as CallableRequest<unknown>;
}
beforeEach(() => { fixture.values.clear(); fixture.reads.length = 0; });

describe("inventory callable authorization", () => {
  it("allows viewers to read but denies stock or administrative changes", async () => {
    const request = provision("viewer");
    await expect(requireInventoryActor(request, "read")).resolves.toMatchObject({ employeeId, roleScopes: ["viewer"], isAdmin: false });
    await expect(requireInventoryActor(request, "write")).rejects.toMatchObject({ code: "permission-denied" });
    await expect(requireInventoryActor(request, "admin")).rejects.toMatchObject({ code: "permission-denied" });
  });
  it.each(["delivery", "sales"] as const)("permits active %s stock and lifecycle work without granting administrator settings", async (role) => {
    const request = provision(role);
    await expect(requireInventoryActor(request, "read")).resolves.toMatchObject({ employeeId });
    await expect(requireInventoryActor(request, "write")).resolves.toMatchObject({ employeeId, isAdmin: false });
    await expect(requireInventoryActor(request, "admin")).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("requires both approved claims and Google sign-in for administrators", async () => {
    const request = provision("admin");
    await expect(requireInventoryActor(request, "admin")).resolves.toMatchObject({ isAdmin: true });
    await expect(requireInventoryActor(request, "write")).resolves.toMatchObject({ isAdmin: true });
    for (const token of [
      { ...request.auth!.token, adminApproved: false },
      { ...request.auth!.token, firebase: { sign_in_provider: "custom" } },
    ]) {
      const forged = { ...request, auth: { uid, token } } as unknown as CallableRequest<unknown>;
      await expect(requireInventoryActor(forged, "read")).rejects.toMatchObject({ code: "permission-denied" });
      await expect(requireInventoryActor(forged, "admin")).rejects.toMatchObject({ code: "permission-denied" });
    }
  });
  it.each(["delivery", "admin"] as const)("uses one two-document request for %s without caching the next authorization check", async (role) => {
    const request = provision(role);
    await requireInventoryActor(request, "write");
    expect(fixture.reads).toEqual([[`authz/${uid}`, `employees/${employeeId}`]]);
    fixture.values.get(`authz/${uid}`)!.active = false;
    await expect(requireInventoryActor(request, "write")).rejects.toMatchObject({ code: "failed-precondition" });
    expect(fixture.reads).toEqual([[`authz/${uid}`, `employees/${employeeId}`], [`authz/${uid}`, `employees/${employeeId}`]]);
  });
  it.each([undefined, "", "other/employee", 12])("rejects unusable employee claim lookup keys without reading documents: %j", async (employeeClaim) => {
    const request = provision("delivery");
    request.auth!.token.employeeId = employeeClaim;
    await expect(requireInventoryActor(request, "read")).rejects.toMatchObject({ code: "failed-precondition" });
    expect(fixture.reads).toHaveLength(0);
  });
  it.each([
    ["firebaseUid", "another-uid"], ["employeeId", "another-employee"], ["sessionVersion", 0],
    ["roleScopes", []], ["roleScopes", ["invented-role"]], ["status", "deleted"],
  ])("rejects malformed or rebound canonical employee %s", async (field, value) => {
    const request = provision("delivery");
    fixture.values.get(`employees/${employeeId}`)![field as string] = value;
    await expect(requireInventoryActor(request, "write")).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("cannot redirect the lookup to a different employee with a forged but valid claim", async () => {
    const request = provision("delivery");
    fixture.values.set("employees/OTHER", { ...fixture.values.get(`employees/${employeeId}`), employeeId: "OTHER" });
    request.auth!.token.employeeId = "OTHER";
    await expect(requireInventoryActor(request, "read")).rejects.toMatchObject({ code: "failed-precondition" });
  });
  it.each([
    ["active", false], ["sessionVersion", 3], ["permissionsVersion", 4], ["employeeId", "another-employee"],
  ])("rejects revoked or rebound authorization %s", async (field, value) => {
    const request = provision("delivery");
    fixture.values.get(`authz/${uid}`)![field as string] = value;
    await expect(requireInventoryActor(request, "read")).rejects.toBeInstanceOf(Error);
    await expect(requireInventoryActor(request, "write")).rejects.toBeInstanceOf(Error);
  });
  it("rejects disabled identities and canonical role changes even without a version bump", async () => {
    const request = provision("delivery");
    fixture.values.get(`employees/${employeeId}`)!.status = "disabled";
    await expect(requireInventoryActor(request, "write")).rejects.toMatchObject({ code: "permission-denied" });
    fixture.values.get(`employees/${employeeId}`)!.status = "active";
    fixture.values.get(`employees/${employeeId}`)!.roleScopes = ["viewer"];
    await expect(requireInventoryActor(request, "read")).rejects.toMatchObject({ code: "failed-precondition" });
  });
  it("does not accept anonymous access or privilege claims from the request body", async () => {
    await expect(requireInventoryActor({ data: {} } as CallableRequest<unknown>)).rejects.toMatchObject({ code: "unauthenticated" });
    const request = provision("viewer");
    request.data = { actorUid: "administrator", actorEmployeeId: "ADMIN", isAdmin: true, roleScopes: ["admin"] };
    await expect(requireInventoryActor(request, "write")).rejects.toMatchObject({ code: "permission-denied" });
    await expect(requireInventoryActor(request, "read")).resolves.toMatchObject({ uid, employeeId, isAdmin: false });
  });
});
