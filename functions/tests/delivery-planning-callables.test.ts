import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
const f = vi.hoisted(() => ({ authorize: vi.fn(), analyze: vi.fn(), context: vi.fn(), confirm: vi.fn(), recommend: vi.fn(), apply: vi.fn(), saveSettings: vi.fn() }));
vi.mock("../src/customer/customer-authorization.js", () => ({ requireCustomerActor: f.authorize }));
vi.mock("../src/delivery-planning/planning-service.js", () => ({ PlanningService: class { analyze = f.analyze; context = f.context; confirm = f.confirm; recommend = f.recommend; apply = f.apply; saveSettings = f.saveSettings; } }));
let api: typeof import("../src/delivery-planning/planning-callables.js");
beforeAll(async () => { vi.stubEnv("FUNCTIONS_EMULATOR", "true"); api = await import("../src/delivery-planning/planning-callables.js"); });
afterAll(() => vi.unstubAllEnvs());
const actor = { uid: "test", employeeId: "test", roleScopes: ["delivery"], sessionVersion: 1, permissionsVersion: 1, isAdmin: false };
beforeEach(() => { vi.clearAllMocks(); f.authorize.mockResolvedValue(actor); });
const request = (data: unknown) => { const headers = vi.fn(); return { headers, value: { data, rawRequest: { res: { setHeader: headers } } } as unknown as CallableRequest<unknown> }; };
describe("planning callable boundary", () => {
  it("strictly validates image payload and disables response caching", async () => {
    const input = { requestId: randomUUID(), deliveryDateKey: "2026-11-07", contentType: "image/jpeg", fileBase64: "/9j/" }; const call = request(input);
    f.analyze.mockResolvedValue({ result: "test" });
    await api.analyzeDeliveryInvoice.run(call.value); expect(f.analyze).toHaveBeenCalledWith(input, actor);
    expect(call.headers).toHaveBeenCalledWith("Cache-Control", "private, no-store, max-age=0");
    await expect(api.analyzeDeliveryInvoice.run(request({ ...input, objectPath: "unwanted" }).value)).rejects.toMatchObject({ code: "invalid-argument" });
    expect(f.analyze).toHaveBeenCalledTimes(1);
  });
  it("never reaches providers/service after authorization failure", async () => {
    f.authorize.mockRejectedValue(new HttpsError("unauthenticated", "세션 만료"));
    await expect(api.getDeliveryPlanningContext.run(request({}).value)).rejects.toMatchObject({ code: "unauthenticated" }); expect(f.context).not.toHaveBeenCalled();
  });
  it("accepts company or customer departure and rejects identical endpoints before the service", async () => {
    const company = { requestId: randomUUID(), deliveryDateKey: "2026-11-08", expectedDayRevision: 1, lastCustomerId: "last" };
    f.recommend.mockResolvedValue({ result: "test" });
    await api.recommendDeliveryRoute.run(request(company).value);
    expect(f.recommend).toHaveBeenLastCalledWith(company, actor);
    const customer = { ...company, requestId: randomUUID(), firstCustomerId: "first" };
    await api.recommendDeliveryRoute.run(request(customer).value);
    expect(f.recommend).toHaveBeenLastCalledWith(customer, actor);
    await expect(api.recommendDeliveryRoute.run(request({ ...customer, firstCustomerId: "last" }).value)).rejects.toMatchObject({ code: "invalid-argument" });
    expect(f.recommend).toHaveBeenCalledTimes(2);
  });
  it("sanitizes arbitrary upstream errors rather than leaking image/key data", async () => {
    f.context.mockRejectedValue(new Error("secret-base64-and-key"));
    await expect(api.getDeliveryPlanningContext.run(request({}).value)).rejects.toMatchObject({ code: "unavailable", message: "납품 준비 요청을 완료하지 못했습니다. 목록을 새로 확인해주세요." });
  });
});
