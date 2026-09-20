import type { CallableRequest } from "firebase-functions/v2/https";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  getAuthz: vi.fn(), employeeData: vi.fn(), verifiedAdmin: vi.fn(),
}));
vi.mock("../src/auth/login-repository.js", () => ({ LoginRepository: class { getAuthz = fixture.getAuthz; } }));
vi.mock("../src/admin/admin-authorization.js", () => ({ requireVerifiedAdmin: fixture.verifiedAdmin }));
vi.mock("../src/shared/firebase-admin.js", () => ({ getAdminFirestore: () => ({ doc: () => ({ get: async () => ({ data: fixture.employeeData }) }) }) }));

import { requireCustomerActor } from "../src/customer/customer-authorization.js";

const authorization = { uid: "uid-staff", employeeId: "EMP-STAFF", active: true, sessionVersion: 2, permissionsVersion: 3, roleScopes: ["delivery"] };
const employee = { employeeId: "EMP-STAFF", firebaseUid: "uid-staff", status: "active", roleScopes: ["delivery"] };
function request(claims: Record<string, unknown> = {}, data: unknown = {}) {
  return { auth: { uid: "uid-staff", token: { ...authorization, ...claims } }, data } as unknown as CallableRequest<unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.getAuthz.mockResolvedValue({ ...authorization });
  fixture.employeeData.mockReturnValue({ ...employee });
  fixture.verifiedAdmin.mockResolvedValue({ uid: "uid-staff", employeeId: "EMP-STAFF" });
});

describe("customer employee capability", () => {
  it.each(["delivery", "sales", "viewer"])("accepts active %s staff without granting administrator access", async (role) => {
    fixture.getAuthz.mockResolvedValue({ ...authorization, roleScopes: [role] });
    fixture.employeeData.mockReturnValue({ ...employee, roleScopes: [role] });
    expect(await requireCustomerActor(request({ roleScopes: [role] }))).toEqual({
      uid: "uid-staff", employeeId: "EMP-STAFF", sessionVersion: 2, permissionsVersion: 3, roleScopes: [role], isAdmin: false,
    });
    expect(fixture.verifiedAdmin).not.toHaveBeenCalled();
  });
  it("retains verified Google admin enforcement for admin-role accounts", async () => {
    fixture.getAuthz.mockResolvedValue({ ...authorization, roleScopes: ["admin"] });
    fixture.employeeData.mockReturnValue({ ...employee, roleScopes: ["admin"] });
    await requireCustomerActor(request({ roleScopes: ["admin"] }));
    expect(fixture.verifiedAdmin).toHaveBeenCalledOnce();
    fixture.verifiedAdmin.mockRejectedValue(Object.assign(new Error("Google admin required"), { code: "permission-denied" }));
    await expect(requireCustomerActor(request({ roleScopes: ["admin"] }))).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("rejects anonymous and unregistered identities", async () => {
    await expect(requireCustomerActor({ data: {} } as CallableRequest<unknown>)).rejects.toMatchObject({ code: "unauthenticated" });
    expect(fixture.getAuthz).not.toHaveBeenCalled();
    fixture.getAuthz.mockResolvedValue(null);
    await expect(requireCustomerActor(request())).rejects.toMatchObject({ code: "failed-precondition" });
  });
  it.each([{ employeeId: "EMP-OTHER" }, { sessionVersion: 1 }, { permissionsVersion: 2 }, { roleScopes: ["admin"] }, { uid: "another-uid" }])
    ("rejects stale or forged claims: %j", async (claims) => {
      await expect(requireCustomerActor(request(claims))).rejects.toMatchObject({ code: "failed-precondition" });
    });
  it.each([undefined, { ...employee, status: "disabled" }, { ...employee, firebaseUid: "another" }, { ...employee, employeeId: "other" }, { ...employee, roleScopes: [] }, { ...employee, roleScopes: ["sales"] }])
    ("rechecks active employee binding after the authorization read: %j", async (current) => {
      fixture.employeeData.mockReturnValue(current);
      await expect(requireCustomerActor(request())).rejects.toMatchObject({ code: "permission-denied" });
    });
  it("derives audit identity from server membership instead of fields in the request body", async () => {
    expect(await requireCustomerActor(request({}, { actorEmployeeId: "EMP-ADMIN", actorUid: "admin", isAdmin: true })))
      .toMatchObject({ employeeId: "EMP-STAFF", uid: "uid-staff", isAdmin: false });
  });
});
