import { describe, expect, it, vi } from "vitest";
import { createRegisteredAddressResolver, registeredAddressQuery, registeredCustomerAddress, resolveRegisteredStops } from "../src/delivery-planning/registered-address.js";

const address = "대전 대덕구 우암동로17번길 10, 1층(비래동)";
const document = { address_type: "ROAD_ADDR", x: "127.4518", y: "36.3598" };
const payload = (documents = [document], count = documents.length) => ({ meta: { total_count: count }, documents });
const response = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
describe("registered address routing", () => {
  it("uses the saved district only to supplement abbreviated addresses", () => {
    expect(registeredCustomerAddress("오정동 69-1", "대덕구")).toBe("대덕구 오정동 69-1");
    expect(registeredCustomerAddress("대전 대덕구 오정동 69-1", "서구")).toBe("대전 대덕구 오정동 69-1");
    expect(registeredCustomerAddress("", "대덕구")).toBe("");
    expect(registeredCustomerAddress("오정동 69-1", "")).toBe("오정동 69-1");
  });
  it("uses exact address search, strips floor details, and reuses successful results", async () => {
    const fetcher = vi.fn(async () => response(payload()));
    const resolve = createRegisteredAddressResolver(() => "example-key", fetcher);
    expect(registeredAddressQuery(address)).toBe("대전 대덕구 우암동로17번길 10");
    expect(registeredAddressQuery("대전 중구 안영동 659-4 2층")).toBe("대전 중구 안영동 659-4");
    const point = await resolve(address);
    expect(point).toEqual({ latitude: 36.3598, longitude: 127.4518 });
    expect(await resolve("대전 대덕구 우암동로17번길 10")).toEqual(point);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = (fetcher.mock.calls as unknown as [string, RequestInit][])[0]!;
    expect(new URL(url).searchParams.get("query")).toBe("대전 대덕구 우암동로17번길 10");
    expect(new URL(url).searchParams.get("analyze_type")).toBe("exact");
    expect(init.method).toBe("GET");
    await resolve("대전 대덕구 우암동로17번길 11");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([payload([]), payload([document, document]), payload([document], 2), payload([{ ...document, address_type: "REGION" }]), payload([{ ...document, address_type: "ROAD" }])])("rejects unresolved or ambiguous destinations", async (raw) => {
    const resolve = createRegisteredAddressResolver(() => "example-key", async () => response(raw));
    expect(await resolve(address)).toBeNull();
  });
  it("rejects invalid coordinates and sanitizes provider errors", async () => {
    for (const raw of [payload([{ ...document, x: "" }]), payload([{ ...document, y: "NaN" }])]) {
      await expect(createRegisteredAddressResolver(() => "key", async () => response(raw))(address)).rejects.toThrow("주소 검색 응답");
    }
    const fetcher = vi.fn(async () => { throw new Error("PRIVATE_URL_AND_KEY"); });
    await expect(createRegisteredAddressResolver(() => "key", fetcher)(address)).rejects.toThrow("주소 검색 응답");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(createRegisteredAddressResolver(() => "key", async () => ({ ...response({}), ok: false, status: 429 }))(address)).rejects.toMatchObject({ code: "resource-exhausted" });
  });
  it("deduplicates address lookups while preserving all customers and stop order", async () => {
    const resolve = vi.fn(async () => ({ latitude: 36.3, longitude: 127.4 }));
    const destinations = ["one", "two"].map((customerId) => ({ customerId, name: customerId, address }));
    expect((await resolveRegisteredStops(destinations, resolve)).map((s) => s.customerId)).toEqual(["one", "two"]);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
  it("names the customer needing address review without silently skipping it", async () => {
    await expect(resolveRegisteredStops([{ customerId: "one", name: "예시푸드", address }], async () => null)).rejects.toThrow("등록 주소를 확인해주세요: 예시푸드");
  });
  it("limits geocoding concurrency for a full route", async () => {
    let active = 0, maximum = 0;
    const resolve = async () => { active++; maximum = Math.max(maximum, active); await new Promise((r) => setTimeout(r, 1)); active--; return { latitude: 36.3, longitude: 127.4 }; };
    expect(await resolveRegisteredStops(Array.from({ length: 20 }, (_, i) => ({ customerId: `${i}`, name: `${i}`, address: `예시로 ${i}` })), resolve)).toHaveLength(20);
    expect(maximum).toBeLessThanOrEqual(4);
  });
});
