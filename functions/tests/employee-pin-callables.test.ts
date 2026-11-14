import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ change: vi.fn(), error: vi.fn() }));
vi.mock("../src/auth/employee-pin-service.js", () => ({ EmployeePinService: class { changePin = fixture.change; } }));
vi.mock("../src/shared/firebase-admin.js", () => ({ getAdminFirestore: () => ({}) }));
vi.mock("../src/auth/callables.js", () => ({
  pinLookupSecret: { value: () => "synthetic-only-unit-lookup-secret-long-enough" },
  pinPepper: { value: () => "synthetic-only-unit-pepper-secret-long-enough" },
}));
vi.mock("firebase-functions", () => ({ logger: { error: fixture.error } }));

import { changeEmployeePin } from "../src/auth/employee-pin-callables.js";
import { changeEmployeePinInputSchema } from "../src/auth/employee-pin-contract.js";

const data = { currentPin: "482915", newPin: "012804", requestId: "b324b320-7c13-4145-a79a-b7e29af7bf6c", appVersion: "pin-unit" };
const auth = { uid: "unit-staff", token: { uid: "unit-staff", employeeId: "EMP-UNIT" } };
function request(overrides: Record<string, unknown> = {}) {
  return { data, auth, rawRequest: { ip: "192.0.2.1" }, app: { appId: "unit-app" }, ...overrides } as unknown as CallableRequest<unknown>;
}

beforeEach(() => { vi.clearAllMocks(); fixture.change.mockResolvedValue({ changed: true, pinVersion: 2 }); });

describe("employee PIN boundary", () => {
  it("preserves leading zeroes and excludes caller-selected employee IDs", () => {
    expect(changeEmployeePinInputSchema.parse(data).newPin).toBe("012804");
    expect(changeEmployeePinInputSchema.safeParse({ ...data, employeeId: "EMP-OTHER" }).success).toBe(false);
  });
  it.each(["12345", "1234567", "１２３４５６", 12804])("rejects an invalid six-digit value", (newPin) => {
    expect(changeEmployeePinInputSchema.safeParse({ ...data, newPin }).success).toBe(false);
  });
  it("requires authentication before processing a PIN", async () => {
    await expect(changeEmployeePin.run(request({ auth: undefined }))).rejects.toMatchObject({ code: "unauthenticated" });
    expect(fixture.change).not.toHaveBeenCalled();
  });
  it("rejects unknown fields before reaching the mutation", async () => {
    await expect(changeEmployeePin.run(request({ data: { ...data, sessionVersion: 8 } }))).rejects.toMatchObject({ code: "invalid-argument" });
    expect(fixture.change).not.toHaveBeenCalled();
  });
  it("uses only the authenticated identity and server-observed source", async () => {
    await expect(changeEmployeePin.run(request())).resolves.toEqual({ changed: true, pinVersion: 2 });
    expect(fixture.change).toHaveBeenCalledWith(data, auth, "unit-app|192.0.2.1");
  });
  it("returns an actionable duplicate error without leaking its owner", async () => {
    fixture.change.mockRejectedValue(new HttpsError("already-exists", "이미 사용 중인 PIN입니다. 다른 번호를 입력해주세요.", { reason: "pin-in-use" }));
    await expect(changeEmployeePin.run(request())).rejects.toMatchObject({ code: "already-exists", details: { reason: "pin-in-use" } });
    expect(fixture.error).not.toHaveBeenCalled();
  });
  it("never logs unexpected exception text or PIN inputs", async () => {
    fixture.change.mockRejectedValue(new Error(`synthetic sensitive input ${data.currentPin} ${data.newPin}`));
    await expect(changeEmployeePin.run(request())).rejects.toMatchObject({ code: "internal" });
    expect(fixture.error).toHaveBeenCalledWith("Employee PIN change failed.", { requestId: data.requestId });
    const logged = JSON.stringify(fixture.error.mock.calls);
    expect(logged).not.toContain(data.currentPin);
    expect(logged).not.toContain(data.newPin);
  });
});
