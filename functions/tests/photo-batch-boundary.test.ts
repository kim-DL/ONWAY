import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

const f = vi.hoisted(() => ({ authorize: vi.fn(), analyze: vi.fn(), confirm: vi.fn(), aliases: vi.fn(), update: vi.fn() }));
vi.mock("../src/customer/customer-authorization.js", () => ({ requireCustomerActor: f.authorize }));
vi.mock("../src/delivery-planning/planning-service.js", () => ({ PlanningService: class {
  analyzePhotoBatch = f.analyze; confirmPhotoBatch = f.confirm; photoAliases = f.aliases; updatePhotoAlias = f.update;
} }));
let api: typeof import("../src/delivery-planning/planning-callables.js");
beforeAll(async () => { vi.stubEnv("FUNCTIONS_EMULATOR", "true"); api = await import("../src/delivery-planning/planning-callables.js"); });
afterAll(() => vi.unstubAllEnvs());
const actor = { uid: "test", employeeId: "staff", roleScopes: ["delivery"], sessionVersion: 1, permissionsVersion: 1, isAdmin: false };
beforeEach(() => { vi.clearAllMocks(); f.authorize.mockResolvedValue(actor); });
const request = (data: unknown) => {
  const headers = vi.fn();
  return { headers, value: { data, rawRequest: { res: { setHeader: headers } } } as unknown as CallableRequest<unknown> };
};
const analysis = () => ({ requestId: randomUUID(), deliveryDateKey: "2026-11-08", contentType: "image/jpeg", fileBase64: "/9j/" });
const confirmation = () => ({ requestId: randomUUID(), scanId: randomUUID(), deliveryDateKey: "2026-11-08",
  expectedScanRevision: 1, dateConfirmed: false,
  decisions: [{ rowId: "row-1", action: "connect", customerId: "target", rememberAlias: true, aliasText: "줄임말", expectedAliasRevision: null }],
});

describe("photo batch callable authorization boundary", () => {
  it("uses only the authenticated employee and disables response caching", async () => {
    const input = analysis(); const call = request(input);
    await api.analyzeDeliveryPhotoBatch.run(call.value);
    expect(f.analyze).toHaveBeenCalledWith(input, actor);
    expect(call.headers).toHaveBeenCalledWith("Cache-Control", "private, no-store, max-age=0");
    await expect(api.analyzeDeliveryPhotoBatch.run(request({ ...input, employeeId: "another" }).value)).rejects.toMatchObject({ code: "invalid-argument" });
    expect(f.analyze).toHaveBeenCalledTimes(1);
  });
  it("validates row decisions and rejects duplicate or injected fields before service writes", async () => {
    const input = confirmation();
    await api.confirmDeliveryPhotoBatch.run(request(input).value);
    expect(f.confirm).toHaveBeenCalledWith(input, actor);
    for (const changed of [
      { ...input, decisions: [input.decisions[0], input.decisions[0]] },
      { ...input, decisions: [] },
      { ...input, expectedScanRevision: 0 },
      { ...input, decisions: [{ ...input.decisions[0], normalizedName: "injected" }] },
    ]) await expect(api.confirmDeliveryPhotoBatch.run(request(changed).value)).rejects.toMatchObject({ code: "invalid-argument" });
    expect(f.confirm).toHaveBeenCalledTimes(1);
  });
  it("does not let callers list or change another employee's aliases", async () => {
    await api.getDeliveryPhotoAliases.run(request({}).value);
    expect(f.aliases).toHaveBeenCalledWith(actor);
    await expect(api.getDeliveryPhotoAliases.run(request({ employeeId: "another" }).value)).rejects.toMatchObject({ code: "invalid-argument" });
    const input = { requestId: randomUUID(), aliasKey: "a".repeat(64), expectedRevision: 1, customerId: null };
    await api.updateDeliveryPhotoAlias.run(request(input).value);
    expect(f.update).toHaveBeenCalledWith(input, actor);
    await expect(api.updateDeliveryPhotoAlias.run(request({ ...input, employeeId: "another" }).value)).rejects.toMatchObject({ code: "invalid-argument" });
  });
  it("blocks every new callable before service access after authorization failure", async () => {
    f.authorize.mockRejectedValue(new HttpsError("unauthenticated", "세션 만료"));
    for (const [callable, input] of [
      [api.analyzeDeliveryPhotoBatch, analysis()], [api.confirmDeliveryPhotoBatch, confirmation()],
      [api.getDeliveryPhotoAliases, {}], [api.updateDeliveryPhotoAlias, {}],
    ] as const) await expect(callable.run(request(input).value)).rejects.toMatchObject({ code: "unauthenticated" });
    for (const spy of [f.analyze, f.confirm, f.aliases, f.update]) expect(spy).not.toHaveBeenCalled();
  });
  it("does not expose raw images or secrets in an unexpected provider failure", async () => {
    f.analyze.mockRejectedValue(new Error("PRIVATE_IMAGE_AND_SECRET"));
    await expect(api.analyzeDeliveryPhotoBatch.run(request(analysis()).value)).rejects.toMatchObject({ code: "unavailable", message: "납품 준비 요청을 완료하지 못했습니다. 목록을 새로 확인해주세요." });
  });
});
