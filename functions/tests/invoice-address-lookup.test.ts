import { describe, expect, it, vi } from "vitest";
import { createInvoiceAddressResolver, prepareInvoiceAddressEvidence } from "../src/delivery-planning/invoice-address-lookup.js";
import { invoiceAddressKey, type AddressIdentity } from "../src/delivery-planning/invoice-address.js";
import { matchInvoice } from "../src/delivery-planning/invoice-matching.js";

const road = "대전 유성구 예시중앙로 96", lot = "대전 유성구 예시동 606-3";
const found: AddressIdentity = { status: "found", addresses: [lot, road] };
const result = (count = 1, documents: unknown[] = [{ address_type: "ROAD_ADDR", address: { address_name: lot }, road_address: { address_name: road } }]) => ({ meta: { total_count: count }, documents });
const response = (value: unknown) => ({ ok: true, status: 200, json: async () => value });
const customer = { customerId: "one", name: "한빛식품", officialAddress: road, deliveryAddress: "" };
const fields = { recipientName: customer.name, recipientAddress: "대전 유성구 예시동 606-3", invoiceDate: "2026-11-09", uncertain: false };
const row = { rawName: fields.recipientName, address: fields.recipientAddress, date: fields.invoiceDate, dateUncertain: false, uncertain: false };

describe("canonical invoice addresses", () => {
  it("requests an exact unique address, caches it in memory and looks up address changes separately", async () => {
    const fetcher = vi.fn(async () => response(result()));
    const resolve = createInvoiceAddressResolver(() => "key", fetcher);
    expect(await resolve(road)).toEqual(found); expect(await resolve(`${road}, 1층`)).toEqual(found);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = (fetcher.mock.calls as unknown as [string, RequestInit][])[0]!;
    expect(new URL(url).searchParams.get("analyze_type")).toBe("exact");
    expect(new URL(url).searchParams.get("query")).toBe(road); expect(init.method).toBe("GET");
    await resolve("대전 유성구 다른중앙로 96"); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("distinguishes a confirmed zero-result address from ambiguous or unavailable searches", async () => {
    expect(await createInvoiceAddressResolver(() => "key", async () => response(result(0, [])))(road)).toEqual({ status: "missing" });
    for (const value of [result(2), result(1, []), result(1, [{ address_type: "REGION", address: { address_name: "대전 유성구" } }]), {}]) {
      expect(await createInvoiceAddressResolver(() => "key", async () => response(value))(road)).toBeNull();
    }
    expect(await createInvoiceAddressResolver(() => "key", async () => { throw Error("PRIVATE_UPSTREAM"); })(road)).toBeNull();
    expect(await createInvoiceAddressResolver(() => "key", async () => ({ ...response({}), ok: false, status: 429 }))(road)).toBeNull();
  });
  it("rejects a returned different building number or region", async () => {
    for (const address_name of ["대전 유성구 예시중앙로 97", "서울 중구 예시중앙로 96"]) {
      expect(await createInvoiceAddressResolver(() => "key", async () => response(result(1, [{ address_type: "ROAD_ADDR", road_address: { address_name } }])))(road)).toBeNull();
    }
  });
  it("does not look up district-only inputs or missing configuration", async () => {
    const fetcher = vi.fn(async () => response(result()));
    expect(await createInvoiceAddressResolver(() => "key", fetcher)("대전 유성구")).toBeNull();
    expect(await createInvoiceAddressResolver(() => "", fetcher)(road)).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("proves the road/lot equivalence using the registered address without choosing an ambiguous short query", async () => {
    const resolve = vi.fn(async () => found);
    const evidence = await prepareInvoiceAddressEvidence([row, row], [customer], [], resolve);
    expect(resolve).toHaveBeenCalledTimes(1); expect(resolve).toHaveBeenCalledWith(road);
    expect(matchInvoice(fields, [customer], fields.invoiceDate, evidence).customerId).toBe("one");
  });
  it("keeps missing, failed and ambiguous address evidence for review", async () => {
    const evidence = await prepareInvoiceAddressEvidence([row], [customer], [], async () => null);
    expect(matchInvoice(fields, [customer], fields.invoiceDate, evidence).customerId).toBeNull();
    expect(matchInvoice(fields, [customer], fields.invoiceDate, new Map([[invoiceAddressKey(road), { status: "missing" }]])).customerId).toBeNull();
  });
  it("never sends guessed company names or unknown shortcuts for address lookup", async () => {
    const resolve = vi.fn(async () => found);
    expect((await prepareInvoiceAddressEvidence([{ ...row, rawName: "한빛" }], [customer], [], resolve)).size).toBe(0);
    expect(resolve).not.toHaveBeenCalled();
  });
  it("bounds lookup count and concurrency for a large invoice set", async () => {
    let active = 0, maximum = 0, calls = 0;
    const resolve = async () => { calls++; active++; maximum = Math.max(maximum, active); await new Promise((r) => setTimeout(r, 1)); active--; return null; };
    const customers = Array.from({ length: 60 }, (_, i) => ({ ...customer, customerId: `${i}`, name: `한빛${i}`, officialAddress: `대전 유성구 등록로 ${i + 1}` }));
    const rows = customers.map((c, i) => ({ ...row, rawName: c.name, address: `대전 유성구 사진동 ${i + 1}` }));
    await prepareInvoiceAddressEvidence(rows, customers, [], resolve);
    expect(calls).toBeLessThanOrEqual(24); expect(maximum).toBeLessThanOrEqual(4);
  });
});

describe("narrow OCR street correction", () => {
  const typo = "대전 유성구 예시중앙길 96(예시동)";
  // One Hangul substitution within the street; the road suffix must stay intact.
  const input = "대전 유성구 예시충앙로 96(예시동)";
  const evidence = new Map<string, AddressIdentity | null>([[invoiceAddressKey(road), found], [invoiceAddressKey(input), { status: "missing" }]]);
  it("accepts a single nonnumeric OCR character only with independent name, region, number, neighborhood and zero-result proof", () => {
    expect(matchInvoice({ ...fields, recipientAddress: input }, [customer], fields.invoiceDate, evidence).customerId).toBe("one");
  });
  it.each([typo, input.replace("96", "97"), input.replace("예시동", "다른동"), input.replace("대전", "서울"), input.replace("대전 ", "")])("retains review for insufficient or conflicting evidence: %s", (recipientAddress) => {
    const proof = new Map(evidence); proof.set(invoiceAddressKey(recipientAddress), { status: "missing" });
    expect(matchInvoice({ ...fields, recipientAddress }, [customer], fields.invoiceDate, proof).customerId).toBeNull();
  });
  it("never corrects a real different street or a failed/ambiguous lookup", () => {
    for (const status of [null, { status: "found", addresses: [input.replace("(예시동)", "")] } as AddressIdentity]) {
      expect(matchInvoice({ ...fields, recipientAddress: input }, [customer], fields.invoiceDate,
        new Map([[invoiceAddressKey(road), found], [invoiceAddressKey(input), status]])).customerId).toBeNull();
    }
    expect(matchInvoice({ ...fields, recipientAddress: input }, [customer, { ...customer, customerId: "two" }], fields.invoiceDate, evidence).customerId).toBeNull();
    expect(matchInvoice({ ...fields, recipientName: "한빛식품(지점)", recipientAddress: input }, [customer], fields.invoiceDate, evidence).customerId).toBeNull();
  });
  it("never corrects a road's numeric segment", () => {
    const original = "대전 유성구 예시로140번길 64", scanned = "대전 유성구 예시로141번길 64(예시동)";
    const proof = new Map<string, AddressIdentity>([[original, { status: "found", addresses: [original, lot] }], [invoiceAddressKey(scanned), { status: "missing" }]]);
    expect(matchInvoice({ ...fields, recipientAddress: scanned }, [{ ...customer, officialAddress: original }], fields.invoiceDate, proof).customerId).toBeNull();
  });
});
