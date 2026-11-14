import type { CallableRequest } from "firebase-functions/v2/https";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ authorize: vi.fn(), list: vi.fn(), register: vi.fn(), disable: vi.fn() }));
vi.mock("../src/admin/admin-authorization.js", async (original) => ({
  ...await original<typeof import("../src/admin/admin-authorization.js")>(), requireVerifiedAdmin: fixture.authorize,
}));
vi.mock("../src/admin/google-admin-access-service.js", async (original) => ({
  ...await original<typeof import("../src/admin/google-admin-access-service.js")>(),
  GoogleAdminAccessService: class { list = fixture.list; register = fixture.register; disable = fixture.disable; },
}));
vi.mock("../src/shared/firebase-admin.js", () => ({ getAdminFirestore: () => ({}), getAdminAuth: () => ({}) }));

import { listGoogleAdminAccess, registerGoogleAdminAccess, disableGoogleAdminAccess } from "../src/admin/google-admin-access-callables.js";
import { GoogleAdminAccessError } from "../src/admin/google-admin-access-service.js";

const actor = { uid: "uid-owner", employeeId: "EMP-OWNER", email: "owner@example.test", sessionVersion: 2, permissionsVersion: 3 };
const input = { email: "manager@example.test", displayName: "회사 책임자", expectedRevision: 0, requestId: "553dfe93-6b62-4ed7-8395-e3246397eaa5", appVersion: "test" };
function request(data: unknown, token: Record<string, unknown> = {}) {
  return { data, auth: { uid: actor.uid, token: {
    email: actor.email, email_verified: true, firebase: { sign_in_provider: "google.com" },
    sessionVersion: 2, permissionsVersion: 3, ...token,
  } } } as unknown as CallableRequest<unknown>;
}
beforeEach(() => {
  vi.clearAllMocks();
  fixture.authorize.mockResolvedValue(actor);
  fixture.register.mockResolvedValue({ employeeId: "EMP-NEW", revision: 1 });
  fixture.list.mockResolvedValue({ entries: [], revision: 0 });
});

describe("Google operator callable identity boundary", () => {
  it.each([
    { firebase: { sign_in_provider: "custom" } }, { firebase: { sign_in_provider: "password" } },
    { email_verified: false }, { email: "" },
  ])("rejects unverified or non-Google identities before the service: %j", async (token) => {
    await expect(registerGoogleAdminAccess.run(request(input, token))).rejects.toMatchObject({ code: "permission-denied" });
    expect(fixture.register).not.toHaveBeenCalled();
  });
  it("requires login and current administrator verification", async () => {
    await expect(listGoogleAdminAccess.run({ data: {} } as CallableRequest<unknown>)).rejects.toMatchObject({ code: "unauthenticated" });
    fixture.authorize.mockRejectedValue(new Error("revoked actor"));
    await expect(registerGoogleAdminAccess.run(request(input))).rejects.toThrow("revoked actor");
    expect(fixture.register).not.toHaveBeenCalled();
  });
  it("passes verified identity and token versions, never body-supplied claims", async () => {
    await registerGoogleAdminAccess.run(request({ ...input, email: " Manager@Example.Test " }));
    expect(fixture.register).toHaveBeenCalledWith({ ...input, email: "manager@example.test" }, actor);
    await expect(registerGoogleAdminAccess.run(request({ ...input, actorUid: "another" }))).rejects.toMatchObject({ code: "invalid-argument" });
  });
  it("maps duplicate and revision errors without exposing stored data", async () => {
    fixture.register.mockRejectedValue(new GoogleAdminAccessError("already-exists", "이미 등록된 Google 계정입니다."));
    await expect(registerGoogleAdminAccess.run(request(input))).rejects.toMatchObject({ code: "already-exists", message: "이미 등록된 Google 계정입니다." });
    fixture.disable.mockRejectedValue(new GoogleAdminAccessError("failed-precondition", "목록을 새로고침해주세요."));
    await expect(disableGoogleAdminAccess.run(request({ employeeId: "EMP-OTHER", reason: "업무 변경", expectedRevision: 0, requestId: input.requestId, appVersion: "test" }))).rejects.toMatchObject({ code: "failed-precondition" });
  });
});
