import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ services: vi.fn(), call: vi.fn() }));
vi.mock("client-only", () => ({}));
vi.mock("@/lib/firebase/client", () => ({ getFirebaseClientServices: f.services }));
vi.mock("firebase/functions", () => ({ httpsCallable: (_functions: unknown, name: string) => (input: unknown) => f.call(name, input) }));
import { resolveDirectionsPoint } from "./customer-directions-repository";
const data = [{ id: "address", name: "예시 주소", address: "예시 주소", point: { latitude: 36.4, longitude: 127.5 } }];
const token = vi.fn();
let auth: { currentUser: { getIdTokenResult: typeof token } | null };
beforeEach(() => { vi.clearAllMocks(); token.mockResolvedValue({ claims: { sessionVersion: 1, permissionsVersion: 1 } }); auth = { currentUser: { getIdTokenResult: token } }; f.services.mockReturnValue({ auth, functions: {} }); f.call.mockResolvedValue({ data }); vi.stubGlobal("navigator", { onLine: true }); });
afterEach(() => vi.unstubAllGlobals());
describe("directions repository", () => {
  it("requests exact address coordinates", async () => { expect(await resolveDirectionsPoint("예시 주소")).toEqual(data[0]!.point); expect(f.call).toHaveBeenCalledWith("searchCustomerLocations", { query: "예시 주소", addressOnly: true }); });
  it("rejects results after logout", async () => { f.call.mockImplementationOnce(async () => { auth.currentUser = null; return { data }; }); await expect(resolveDirectionsPoint("예시 주소")).rejects.toThrow("session changed"); });
  it("rejects a changed permission generation", async () => { token.mockResolvedValueOnce({ claims: { sessionVersion: 1, permissionsVersion: 1 } }).mockResolvedValueOnce({ claims: { sessionVersion: 1, permissionsVersion: 2 } }); await expect(resolveDirectionsPoint("예시 주소")).rejects.toThrow("session changed"); });
  it("refuses ambiguous results", async () => { f.call.mockResolvedValueOnce({ data: [data[0], data[0]] }); await expect(resolveDirectionsPoint("예시 주소")).rejects.toThrow(); });
});
