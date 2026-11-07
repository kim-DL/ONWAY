import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import type { CallableRequest } from "firebase-functions/v2/https";
const f = vi.hoisted(() => ({ authorize: vi.fn(), resolve: vi.fn() }));
vi.mock("../src/customer/customer-authorization.js", () => ({ requireCustomerActor: f.authorize, verifyCustomerTransactionActor: vi.fn() }));
vi.mock("../src/delivery-planning/registered-address.js", () => ({ createRegisteredAddressResolver: () => f.resolve }));
let api: typeof import("../src/customer/callables.js");
beforeAll(async () => { vi.stubEnv("FUNCTIONS_EMULATOR", "true"); api = await import("../src/customer/callables.js"); });
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => { vi.clearAllMocks(); f.authorize.mockResolvedValue({ uid: "test" }); });
const request = (data: unknown) => ({ data, rawRequest: { res: { setHeader: vi.fn() } } }) as unknown as CallableRequest;
describe("exact displayed-address lookup", () => {
  it("returns only exact coordinates and rechecks authorization without writes", async () => {
    f.resolve.mockResolvedValue({ latitude: 36.4, longitude: 127.5 });
    expect(await api.searchCustomerLocations.run(request({ query: "대전 대덕구 예시로 38", addressOnly: true }))).toEqual([{ id: "address", name: "대전 대덕구 예시로 38", address: "대전 대덕구 예시로 38", point: { latitude: 36.4, longitude: 127.5 } }]);
    expect(f.resolve).toHaveBeenCalledWith("대전 대덕구 예시로 38"); expect(f.authorize).toHaveBeenCalledTimes(2);
  });
  it("does not fall back to similarly named places", async () => {
    f.resolve.mockResolvedValue(null); expect(await api.searchCustomerLocations.run(request({ query: "예시동", addressOnly: true }))).toEqual([]);
  });
  it("rejects unexpected input and unauthenticated requests before provider calls", async () => {
    await expect(api.searchCustomerLocations.run(request({ query: "예시동", addressOnly: true, point: {} }))).rejects.toMatchObject({ code: "invalid-argument" });
    f.authorize.mockRejectedValue(new Error("not authorized"));
    await expect(api.searchCustomerLocations.run(request({ query: "예시동", addressOnly: true }))).rejects.toThrow();
    expect(f.resolve).not.toHaveBeenCalled();
  });
});
