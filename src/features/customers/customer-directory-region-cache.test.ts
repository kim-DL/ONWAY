import { afterEach, expect, it } from "vitest";
import type { CustomerRegion } from "@/domain/customer";
import { clearCustomerDirectoryRegionCache, customerDirectoryRegionSession, subscribeCustomerDirectoryRegions } from "./customer-directory-region-cache";

afterEach(() => clearCustomerDirectoryRegionCache());

it("delivers the current region when a lookup completes before a new subscriber attaches", async () => {
  const session = customerDirectoryRegionSession("EMP:1:1");
  const candidates = [{ key: "customer-A", point: { latitude: 36.35, longitude: 127.38 } }];
  let resolve!: (region: CustomerRegion) => void;
  const response = new Promise<CustomerRegion>((done) => { resolve = done; });
  const lookup = () => response;
  const unsubscribe = subscribeCustomerDirectoryRegions(session, candidates, lookup, () => undefined);
  await Promise.resolve();
  unsubscribe();
  expect(session.results.size).toBe(0);
  resolve({ district: "서구", administrativeDong: "둔산2동", address: "합성 주소" });
  for (let index = 0; index < 8; index++) await Promise.resolve();
  const received: string[] = [];
  const stop = subscribeCustomerDirectoryRegions(session, candidates, lookup, () => {
    received.push(session.results.get("customer-A")?.region?.administrativeDong ?? "");
  });
  expect(received).toEqual(["둔산2동"]);
  stop();
});
